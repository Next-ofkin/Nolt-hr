-- ============================================================
-- Nolt HR — 0016: harden form definition versioning
--
-- Forward-only repair for 0015_form_definition_versioning.sql.
-- 0015 has already been applied to the linked project, so its migration
-- history must remain unchanged.
--
-- This migration:
-- 1. Gives every form mutation RPC the same parent-then-version lock order.
-- 2. Makes the expected revision part of the draft UPDATE predicate, so a
--    NULL or stale revision cannot overwrite the current draft.
-- 3. Derives a new version number directly from the latest published row
--    while the parent form is locked.
-- 4. Removes unnecessary SECURITY DEFINER rights from the immutability
--    trigger and pins all form-function search paths to an empty path.
-- 5. Adds the missing indexes for auth.users foreign-key audit columns.
-- ============================================================

begin;

-- PostgreSQL does not create indexes for referencing foreign-key columns.
-- These keep auth-user deletion checks and audit lookups from scanning the
-- form tables. The form_definition_id FK is already covered by 0015's
-- (form_definition_id, version_number) unique index.
create index if not exists form_definitions_created_by_idx
  on public.form_definitions (created_by);
create index if not exists form_definitions_updated_by_idx
  on public.form_definitions (updated_by);
create index if not exists form_definitions_archived_by_idx
  on public.form_definitions (archived_by)
  where archived_by is not null;

create index if not exists form_definition_versions_created_by_idx
  on public.form_definition_versions (created_by);
create index if not exists form_definition_versions_updated_by_idx
  on public.form_definition_versions (updated_by);
create index if not exists form_definition_versions_published_by_idx
  on public.form_definition_versions (published_by)
  where published_by is not null;

-- The trigger only inspects OLD/NEW and does not need owner privileges.
-- An empty search_path prevents later name-resolution changes from affecting
-- this database-level immutability guard.
create or replace function public.enforce_form_definition_version_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if TG_OP = 'UPDATE' then
    if OLD.state = 'published' then
      raise exception 'Published form versions are immutable and cannot be modified.'
        using errcode = 'P0001';
    end if;
    return NEW;
  elsif TG_OP = 'DELETE' then
    if OLD.state = 'published' then
      raise exception 'Published form versions cannot be deleted.'
        using errcode = 'P0001';
    end if;
    return OLD;
  end if;
  return NEW;
end;
$$;

-- Optimistic-concurrency draft save.
--
-- Lock order is always parent form first, then its draft version. Publishing
-- and draft creation already take the locks in this order. Keeping save in
-- the same order removes the save-vs-publish deadlock possible in 0015.
-- The revision comparison lives in the UPDATE itself; SQL equality does not
-- match NULL, so NULL and stale expected revisions both produce the same
-- recognizable FORM_DRAFT_CONFLICT response without writing anything.
create or replace function public.save_form_definition_draft(
  p_form_definition_id uuid,
  p_definition jsonb,
  p_title text,
  p_description text,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_role public.user_role;
  v_title text := btrim(coalesce(p_title, ''));
  v_form record;
  v_draft record;
  v_new_revision integer;
begin
  v_role := public.current_user_role();
  if v_role is null or v_role not in ('admin', 'hr') then
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHORIZED', 'error', 'Only admin or HR can edit forms.');
  end if;

  select * into v_form
  from public.form_definitions
  where id = p_form_definition_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'FORM_NOT_FOUND', 'error', 'Form not found.');
  end if;

  if v_form.archived_at is not null then
    return jsonb_build_object('ok', false, 'error_code', 'FORM_ARCHIVED', 'error', 'This form is archived and cannot be edited.');
  end if;

  if v_title = '' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_TITLE', 'error', 'Form title cannot be empty.');
  end if;

  if p_definition is null or jsonb_typeof(p_definition) <> 'object'
     or not (p_definition ? 'steps') or jsonb_typeof(p_definition -> 'steps') <> 'array' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_DEFINITION', 'error', 'Form definition must be a JSON object with a steps array.');
  end if;

  select * into v_draft
  from public.form_definition_versions
  where form_definition_id = p_form_definition_id and state = 'draft'
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'NO_DRAFT', 'error', 'This form has no editable draft. Create a new draft first.');
  end if;

  update public.form_definition_versions
  set definition = p_definition,
      revision = revision + 1,
      updated_by = auth.uid(),
      updated_at = now()
  where id = v_draft.id
    and state = 'draft'
    and revision = p_expected_revision
  returning revision into v_new_revision;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'FORM_DRAFT_CONFLICT',
      'error', 'This draft was changed elsewhere. Refresh before saving again.',
      'current_revision', v_draft.revision
    );
  end if;

  update public.form_definitions
  set title = v_title,
      description = nullif(btrim(coalesce(p_description, '')), ''),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_form_definition_id;

  return jsonb_build_object(
    'ok', true,
    'version_id', v_draft.id,
    'version_number', v_draft.version_number,
    'revision', v_new_revision
  );
end;
$$;

-- Branch a new draft from the latest published snapshot. The parent lock is
-- the per-form serialization point, so concurrent calls either create one
-- draft or return that same draft. Published JSON is copied exactly.
create or replace function public.create_form_definition_draft(
  p_form_definition_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_role public.user_role;
  v_form record;
  v_existing_draft record;
  v_latest_published record;
  v_next_version integer;
  v_new_version_id uuid;
begin
  v_role := public.current_user_role();
  if v_role is null or v_role not in ('admin', 'hr') then
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHORIZED', 'error', 'Only admin or HR can edit forms.');
  end if;

  select * into v_form
  from public.form_definitions
  where id = p_form_definition_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'FORM_NOT_FOUND', 'error', 'Form not found.');
  end if;

  if v_form.archived_at is not null then
    return jsonb_build_object('ok', false, 'error_code', 'FORM_ARCHIVED', 'error', 'This form is archived and cannot be edited.');
  end if;

  select * into v_existing_draft
  from public.form_definition_versions
  where form_definition_id = p_form_definition_id and state = 'draft'
  for update;

  if found then
    return jsonb_build_object(
      'ok', true,
      'version_id', v_existing_draft.id,
      'version_number', v_existing_draft.version_number,
      'revision', v_existing_draft.revision,
      'created_new', false
    );
  end if;

  select * into v_latest_published
  from public.form_definition_versions
  where form_definition_id = p_form_definition_id and state = 'published'
  order by version_number desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'NO_PUBLISHED_VERSION', 'error', 'This form has no published version to branch a new draft from.');
  end if;

  v_next_version := v_latest_published.version_number + 1;

  insert into public.form_definition_versions (
    form_definition_id, version_number, state, definition, schema_version, created_by, updated_by
  ) values (
    p_form_definition_id, v_next_version, 'draft', v_latest_published.definition, v_latest_published.schema_version, auth.uid(), auth.uid()
  )
  returning id into v_new_version_id;

  return jsonb_build_object(
    'ok', true,
    'version_id', v_new_version_id,
    'version_number', v_next_version,
    'revision', 1,
    'created_new', true
  );
end;
$$;

-- The remaining RPC bodies from 0015 are already race-safe. Pin their
-- search paths as defense in depth while retaining SECURITY INVOKER/RLS.
alter function public.create_form_definition(text, text, jsonb)
  security invoker;
alter function public.create_form_definition(text, text, jsonb)
  set search_path to '';

alter function public.publish_form_definition_draft(uuid)
  security invoker;
alter function public.publish_form_definition_draft(uuid)
  set search_path to '';

-- CREATE OR REPLACE preserves existing grants, but restate the intended RPC
-- boundary explicitly: authenticated callers only; each function also checks
-- public.current_user_role() and RLS limits rows to admin/hr.
revoke all on function public.create_form_definition(text, text, jsonb) from public, anon;
revoke all on function public.save_form_definition_draft(uuid, jsonb, text, text, integer) from public, anon;
revoke all on function public.publish_form_definition_draft(uuid) from public, anon;
revoke all on function public.create_form_definition_draft(uuid) from public, anon;

grant execute on function public.create_form_definition(text, text, jsonb) to authenticated;
grant execute on function public.save_form_definition_draft(uuid, jsonb, text, text, integer) to authenticated;
grant execute on function public.publish_form_definition_draft(uuid) to authenticated;
grant execute on function public.create_form_definition_draft(uuid) to authenticated;

commit;
