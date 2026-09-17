-- ============================================================
-- Nolt HR — 0021: only one "published" version at a time
--
-- Previous behaviour (0011/0015-0018, deliberate at the time): every
-- published version stayed 'published' forever, so an Onboarding
-- Package could safely pin to an old one. Product decision now:
-- only the newest version should ever read as "Published" - publishing
-- a new version automatically moves whichever version WAS 'published'
-- for that same form/package into a new 'superseded' state instead.
--
-- Superseded versions are NOT deleted and NOT unlocked for editing -
-- they remain exactly as immutable as 'published' versions, just no
-- longer "the current one". A package that already finished publishing
-- and pinned to a since-superseded form version keeps working (that
-- package version is its own frozen snapshot, never re-validated).
-- The one real behaviour change: if someone opens a NEW draft of that
-- package later and tries to publish it while still referencing the
-- superseded form version, that publish is correctly rejected -
-- exactly like today's UNPUBLISHED_FORM_ITEM check already does for a
-- draft form version, just now also covering "used to be published".
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Allow the new state value
--
-- The original `state text not null check (state in ('draft',
-- 'published'))` column constraints from 0015/0018 were never given an
-- explicit name, so Postgres auto-named them. Rather than guess that
-- name, find and drop whatever check constraint(s) actually exist on
-- the `state` column, then add a single, explicitly-named replacement -
-- this can't silently leave the old, more restrictive constraint in
-- place alongside a new one.
-- ------------------------------------------------------------
do $$
declare
  con record;
begin
  for con in
    select conname
    from pg_constraint
    where conrelid = 'public.form_definition_versions'::regclass
      and contype = 'c'
      and conname <> 'form_definition_versions_published_fields'
      and pg_get_constraintdef(oid) ilike '%state%'
  loop
    execute format('alter table public.form_definition_versions drop constraint %I', con.conname);
  end loop;

  for con in
    select conname
    from pg_constraint
    where conrelid = 'public.onboarding_package_versions'::regclass
      and contype = 'c'
      and conname <> 'onboarding_package_versions_published_fields'
      and pg_get_constraintdef(oid) ilike '%state%'
  loop
    execute format('alter table public.onboarding_package_versions drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.form_definition_versions
  add constraint form_definition_versions_state_check
  check (state in ('draft', 'published', 'superseded'));

alter table public.onboarding_package_versions
  add constraint onboarding_package_versions_state_check
  check (state in ('draft', 'published', 'superseded'));

-- A superseded version keeps its original publish record (it WAS
-- published) - only the 'draft' branch requires those fields to be null.
alter table public.form_definition_versions
  drop constraint if exists form_definition_versions_published_fields;
alter table public.form_definition_versions
  add constraint form_definition_versions_published_fields
  check (
    (state in ('published', 'superseded') and published_at is not null and published_by is not null)
    or (state = 'draft' and published_at is null and published_by is null)
  );

alter table public.onboarding_package_versions
  drop constraint if exists onboarding_package_versions_published_fields;
alter table public.onboarding_package_versions
  add constraint onboarding_package_versions_published_fields
  check (
    (state in ('published', 'superseded') and published_at is not null and published_by is not null)
    or (state = 'draft' and published_at is null and published_by is null)
  );

-- ------------------------------------------------------------
-- 2. Immutability triggers: allow exactly one new transition
--    (published -> superseded, touching only state/updated_at/updated_by),
--    otherwise unchanged - published AND superseded rows both stay locked.
-- ------------------------------------------------------------
create or replace function public.enforce_form_definition_version_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if TG_OP = 'UPDATE' then
    if OLD.state = 'published' and NEW.state = 'superseded'
       and NEW.definition = OLD.definition
       and NEW.version_number = OLD.version_number
       and NEW.form_definition_id = OLD.form_definition_id
       and NEW.created_by = OLD.created_by
       and NEW.created_at = OLD.created_at
       and NEW.published_at = OLD.published_at
       and NEW.published_by = OLD.published_by
       and NEW.revision = OLD.revision
       and NEW.schema_version = OLD.schema_version
    then
      return NEW;
    end if;
    if OLD.state in ('published', 'superseded') then
      raise exception 'Published form versions are immutable and cannot be modified.'
        using errcode = 'P0001';
    end if;
    return NEW;
  elsif TG_OP = 'DELETE' then
    if OLD.state in ('published', 'superseded') then
      raise exception 'Published form versions cannot be deleted.'
        using errcode = 'P0001';
    end if;
    return OLD;
  end if;
  return NEW;
end;
$$;

create or replace function public.enforce_onboarding_package_version_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if TG_OP = 'UPDATE' then
    if OLD.state = 'published' and NEW.state = 'superseded'
       and NEW.version_number = OLD.version_number
       and NEW.onboarding_package_id = OLD.onboarding_package_id
       and NEW.created_by = OLD.created_by
       and NEW.created_at = OLD.created_at
       and NEW.published_at = OLD.published_at
       and NEW.published_by = OLD.published_by
       and NEW.revision = OLD.revision
    then
      return NEW;
    end if;
    if OLD.state in ('published', 'superseded') then
      raise exception 'Published onboarding package versions are immutable and cannot be modified.'
        using errcode = 'P0001';
    end if;
    return NEW;
  elsif TG_OP = 'DELETE' then
    if OLD.state in ('published', 'superseded') then
      raise exception 'Published onboarding package versions cannot be deleted.'
        using errcode = 'P0001';
    end if;
    return OLD;
  end if;
  return NEW;
end;
$$;

-- Items of a superseded package version are just as locked as a published one.
create or replace function public.enforce_onboarding_package_item_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_parent_state text;
  v_pkg_ver_id uuid;
begin
  if TG_OP = 'DELETE' then
    v_pkg_ver_id := OLD.package_version_id;
  else
    v_pkg_ver_id := NEW.package_version_id;
  end if;

  select state into v_parent_state
  from public.onboarding_package_versions
  where id = v_pkg_ver_id;

  if v_parent_state in ('published', 'superseded') then
    raise exception 'Items of published onboarding package versions are immutable and cannot be modified or deleted.'
      using errcode = 'P0001';
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  else
    return NEW;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 3. Publish RPCs: supersede the previous published version, if any,
--    in the same transaction as promoting the new one.
-- ------------------------------------------------------------
create or replace function public.publish_form_definition_draft(
  p_form_definition_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_role public.user_role;
  v_form record;
  v_draft record;
begin
  v_user_id := auth.uid();
  v_role := public.current_user_role();
  if v_user_id is null or v_role is null or v_role not in ('admin', 'hr') then
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHORIZED', 'error', 'Only admin or HR can publish forms.');
  end if;

  select * into v_form
  from public.form_definitions
  where id = p_form_definition_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'FORM_NOT_FOUND', 'error', 'Form not found.');
  end if;

  if v_form.archived_at is not null then
    return jsonb_build_object('ok', false, 'error_code', 'FORM_ARCHIVED', 'error', 'This form is archived and cannot be published.');
  end if;

  if btrim(v_form.title) = '' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_TITLE', 'error', 'Form title cannot be empty.');
  end if;

  select * into v_draft
  from public.form_definition_versions
  where form_definition_id = p_form_definition_id and state = 'draft'
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'NO_DRAFT', 'error', 'This form has no draft to publish.');
  end if;

  if v_draft.definition is null or jsonb_typeof(v_draft.definition) <> 'object'
     or not (v_draft.definition ? 'steps') or jsonb_typeof(v_draft.definition -> 'steps') <> 'array' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_DEFINITION', 'error', 'Draft definition is invalid.');
  end if;

  if jsonb_array_length(v_draft.definition -> 'steps') = 0 then
    return jsonb_build_object('ok', false, 'error_code', 'NO_STEPS', 'error', 'Form must contain at least one step before publishing.');
  end if;

  -- Retire whichever version currently holds "published" for this form.
  update public.form_definition_versions
  set state = 'superseded',
      updated_by = v_user_id,
      updated_at = now()
  where form_definition_id = p_form_definition_id
    and state = 'published'
    and id <> v_draft.id;

  update public.form_definition_versions
  set state = 'published',
      published_at = now(),
      published_by = v_user_id,
      updated_by = v_user_id,
      updated_at = now()
  where id = v_draft.id;

  return jsonb_build_object(
    'ok', true,
    'version_id', v_draft.id,
    'version_number', v_draft.version_number
  );
end;
$$;

create or replace function public.publish_onboarding_package_draft(
  p_onboarding_package_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_role public.user_role;
  v_package record;
  v_draft record;
  v_item_count integer;
  v_invalid_forms integer;
begin
  v_user_id := auth.uid();
  v_role := public.current_user_role();
  if v_user_id is null or v_role is null or v_role not in ('admin', 'hr') then
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHORIZED', 'error', 'Only admin or HR can publish onboarding packages.');
  end if;

  select * into v_package
  from public.onboarding_packages
  where id = p_onboarding_package_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'PACKAGE_NOT_FOUND', 'error', 'Onboarding package not found.');
  end if;

  if v_package.archived_at is not null then
    return jsonb_build_object('ok', false, 'error_code', 'PACKAGE_ARCHIVED', 'error', 'This onboarding package is archived and cannot be published.');
  end if;

  if btrim(v_package.title) = '' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_TITLE', 'error', 'Package title cannot be empty.');
  end if;

  select * into v_draft
  from public.onboarding_package_versions
  where onboarding_package_id = p_onboarding_package_id and state = 'draft'
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'NO_DRAFT', 'error', 'This package has no draft to publish.');
  end if;

  select count(*) into v_item_count
  from public.onboarding_package_items
  where package_version_id = v_draft.id;

  if v_item_count = 0 then
    return jsonb_build_object('ok', false, 'error_code', 'NO_ITEMS', 'error', 'Onboarding package must contain at least one form or document requirement before publishing.');
  end if;

  select count(*) into v_invalid_forms
  from public.onboarding_package_items item
  join public.form_definition_versions form_ver on item.form_version_id = form_ver.id
  where item.package_version_id = v_draft.id
    and item.item_type = 'form'
    and form_ver.state <> 'published';

  if v_invalid_forms > 0 then
    return jsonb_build_object('ok', false, 'error_code', 'UNPUBLISHED_FORM_ITEM', 'error', 'Package contains a form version that is no longer the current published version (it may have been superseded by a newer one). Update the package to use the current version.');
  end if;

  -- Retire whichever version currently holds "published" for this package.
  update public.onboarding_package_versions
  set state = 'superseded',
      updated_by = v_user_id,
      updated_at = now()
  where onboarding_package_id = p_onboarding_package_id
    and state = 'published'
    and id <> v_draft.id;

  update public.onboarding_package_versions
  set state = 'published',
      published_at = now(),
      published_by = v_user_id,
      updated_by = v_user_id,
      updated_at = now()
  where id = v_draft.id;

  return jsonb_build_object(
    'ok', true,
    'version_id', v_draft.id,
    'version_number', v_draft.version_number
  );
end;
$$;

-- ------------------------------------------------------------
-- 4. One-time data fix: for any form/package that already has more
--    than one 'published' row (allowed under the old rules), keep only
--    the highest version_number as 'published' and supersede the rest.
-- ------------------------------------------------------------
with ranked_forms as (
  select id, form_definition_id,
         row_number() over (partition by form_definition_id order by version_number desc) as rn
  from public.form_definition_versions
  where state = 'published'
)
update public.form_definition_versions v
set state = 'superseded',
    updated_at = now()
from ranked_forms r
where v.id = r.id and r.rn > 1;

with ranked_packages as (
  select id, onboarding_package_id,
         row_number() over (partition by onboarding_package_id order by version_number desc) as rn
  from public.onboarding_package_versions
  where state = 'published'
)
update public.onboarding_package_versions v
set state = 'superseded',
    updated_at = now()
from ranked_packages r
where v.id = r.id and r.rn > 1;

commit;
