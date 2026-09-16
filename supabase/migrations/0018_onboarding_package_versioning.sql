-- ============================================================
-- Nolt HR — 0018: onboarding package definitions + versioning
--
-- Reusable Onboarding Package persistence layer.
-- Groups exact published form versions (form_definition_versions.id)
-- and document requirements into versioned packages.
--
-- Tables:
-- 1. public.onboarding_packages
-- 2. public.onboarding_package_versions
-- 3. public.onboarding_package_items
--
-- Hardened security boundary:
-- - SELECT: authenticated admin/hr through RLS
-- - INSERT/UPDATE/DELETE: revoked from client roles (writes via RPC only)
-- - RPCs: SECURITY DEFINER with set search_path = ''
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. onboarding_packages (Parent record)
-- ------------------------------------------------------------
create table public.onboarding_packages (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (btrim(title) <> ''),
  description text,
  created_by  uuid not null references auth.users(id),
  updated_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id)
);

comment on table public.onboarding_packages is
  'Parent record for a Nolt HR reusable onboarding package. Never hard-deleted; archive instead.';

create index onboarding_packages_archived_at_idx on public.onboarding_packages (archived_at);
create index onboarding_packages_created_by_idx on public.onboarding_packages (created_by);
create index onboarding_packages_updated_by_idx on public.onboarding_packages (updated_by);
create index onboarding_packages_archived_by_idx on public.onboarding_packages (archived_by) where archived_by is not null;

create trigger onboarding_packages_set_updated_at
  before update on public.onboarding_packages
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 2. onboarding_package_versions (Draft / Published snapshots)
-- ------------------------------------------------------------
create table public.onboarding_package_versions (
  id                    uuid primary key default gen_random_uuid(),
  onboarding_package_id uuid not null references public.onboarding_packages(id),
  version_number        integer not null check (version_number > 0),
  state                 text not null check (state in ('draft', 'published')),
  revision              integer not null default 1 check (revision > 0),
  created_by            uuid not null references auth.users(id),
  updated_by            uuid not null references auth.users(id),
  published_by          uuid references auth.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  published_at          timestamptz,

  constraint onboarding_package_versions_unique_version
    unique (onboarding_package_id, version_number),

  constraint onboarding_package_versions_published_fields
    check (
      (state = 'published' and published_at is not null and published_by is not null)
      or (state = 'draft' and published_at is null and published_by is null)
    )
);

comment on table public.onboarding_package_versions is
  'Draft or published version snapshot of an onboarding_package. Published rows are immutable.';

create index onboarding_package_versions_pkg_id_idx on public.onboarding_package_versions (onboarding_package_id);
create index onboarding_package_versions_state_idx on public.onboarding_package_versions (state);
create index onboarding_package_versions_created_by_idx on public.onboarding_package_versions (created_by);
create index onboarding_package_versions_updated_by_idx on public.onboarding_package_versions (updated_by);
create index onboarding_package_versions_published_by_idx on public.onboarding_package_versions (published_by) where published_by is not null;

-- At most one DRAFT version per onboarding package.
create unique index onboarding_package_versions_one_draft_per_package
  on public.onboarding_package_versions (onboarding_package_id)
  where state = 'draft';

create trigger onboarding_package_versions_set_updated_at
  before update on public.onboarding_package_versions
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 3. onboarding_package_items (Child form & document requirements)
-- ------------------------------------------------------------
create table public.onboarding_package_items (
  id                   uuid primary key default gen_random_uuid(),
  package_version_id   uuid not null references public.onboarding_package_versions(id) on delete cascade,
  item_type            text not null check (item_type in ('form', 'document')),
  sort_order           integer not null check (sort_order >= 0),
  required             boolean not null default true,
  form_version_id      uuid references public.form_definition_versions(id),
  document_title       text,
  document_description text,
  created_at           timestamptz not null default now(),

  constraint onboarding_package_items_type_fields
    check (
      (item_type = 'form' and form_version_id is not null and document_title is null and document_description is null)
      or (item_type = 'document' and form_version_id is null and document_title is not null and btrim(document_title) <> '')
    )
);

comment on table public.onboarding_package_items is
  'Individual form version or document requirement items inside a package version.';

create index onboarding_package_items_pkg_ver_idx on public.onboarding_package_items (package_version_id);
create index onboarding_package_items_form_ver_idx on public.onboarding_package_items (form_version_id) where form_version_id is not null;

-- Prevent duplicate form versions within the same package version
create unique index onboarding_package_items_unique_form_per_version
  on public.onboarding_package_items (package_version_id, form_version_id)
  where form_version_id is not null;

-- ------------------------------------------------------------
-- 4. Database-level Immutability Guards
-- ------------------------------------------------------------
create or replace function public.enforce_onboarding_package_version_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if TG_OP = 'UPDATE' then
    if OLD.state = 'published' then
      raise exception 'Published onboarding package versions are immutable and cannot be modified.'
        using errcode = 'P0001';
    end if;
    return NEW;
  elsif TG_OP = 'DELETE' then
    if OLD.state = 'published' then
      raise exception 'Published onboarding package versions cannot be deleted.'
        using errcode = 'P0001';
    end if;
    return OLD;
  end if;
  return NEW;
end;
$$;

create trigger check_onboarding_package_version_immutability
  before update or delete on public.onboarding_package_versions
  for each row execute function public.enforce_onboarding_package_version_immutability();

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

  if v_parent_state = 'published' then
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

create trigger check_onboarding_package_item_immutability
  before insert or update or delete on public.onboarding_package_items
  for each row execute function public.enforce_onboarding_package_item_immutability();

-- ------------------------------------------------------------
-- 5. RLS & Privileges
-- ------------------------------------------------------------
alter table public.onboarding_packages enable row level security;
alter table public.onboarding_package_versions enable row level security;
alter table public.onboarding_package_items enable row level security;

create policy onboarding_packages_select
  on public.onboarding_packages for select
  to authenticated
  using ((select public.current_user_role()) in ('admin', 'hr'));

create policy onboarding_package_versions_select
  on public.onboarding_package_versions for select
  to authenticated
  using ((select public.current_user_role()) in ('admin', 'hr'));

create policy onboarding_package_items_select
  on public.onboarding_package_items for select
  to authenticated
  using ((select public.current_user_role()) in ('admin', 'hr'));

revoke all on public.onboarding_packages, public.onboarding_package_versions, public.onboarding_package_items from anon, authenticated, public;
grant select on public.onboarding_packages, public.onboarding_package_versions, public.onboarding_package_items to authenticated;

-- ------------------------------------------------------------
-- 6. RPC: create_onboarding_package
-- ------------------------------------------------------------
create or replace function public.create_onboarding_package(
  p_title text,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_role public.user_role;
  v_title text := btrim(coalesce(p_title, ''));
  v_package_id uuid;
  v_version_id uuid;
begin
  v_user_id := auth.uid();
  v_role := public.current_user_role();
  if v_user_id is null or v_role is null or v_role not in ('admin', 'hr') then
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHORIZED', 'error', 'Only admin or HR can create onboarding packages.');
  end if;

  if v_title = '' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_TITLE', 'error', 'Package title cannot be empty.');
  end if;

  insert into public.onboarding_packages (title, description, created_by, updated_by)
  values (v_title, nullif(btrim(coalesce(p_description, '')), ''), v_user_id, v_user_id)
  returning id into v_package_id;

  insert into public.onboarding_package_versions (
    onboarding_package_id, version_number, state, revision, created_by, updated_by
  ) values (
    v_package_id, 1, 'draft', 1, v_user_id, v_user_id
  )
  returning id into v_version_id;

  return jsonb_build_object(
    'ok', true,
    'onboarding_package_id', v_package_id,
    'version_id', v_version_id,
    'version_number', 1,
    'revision', 1
  );
end;
$$;

revoke all on function public.create_onboarding_package(text, text) from public, anon;
grant execute on function public.create_onboarding_package(text, text) to authenticated;

-- ------------------------------------------------------------
-- 7. RPC: save_onboarding_package_draft
-- ------------------------------------------------------------
create or replace function public.save_onboarding_package_draft(
  p_onboarding_package_id uuid,
  p_title text,
  p_description text,
  p_items jsonb,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_role public.user_role;
  v_title text := btrim(coalesce(p_title, ''));
  v_package record;
  v_draft record;
  v_new_revision integer;
  v_item_count integer;
  i integer;
  v_item jsonb;
  v_item_type text;
  v_form_ver_id uuid;
  v_doc_title text;
  v_doc_desc text;
  v_required boolean;
  v_form_state text;
begin
  v_user_id := auth.uid();
  v_role := public.current_user_role();
  if v_user_id is null or v_role is null or v_role not in ('admin', 'hr') then
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHORIZED', 'error', 'Only admin or HR can edit onboarding packages.');
  end if;

  select * into v_package
  from public.onboarding_packages
  where id = p_onboarding_package_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'PACKAGE_NOT_FOUND', 'error', 'Onboarding package not found.');
  end if;

  if v_package.archived_at is not null then
    return jsonb_build_object('ok', false, 'error_code', 'PACKAGE_ARCHIVED', 'error', 'This onboarding package is archived and cannot be edited.');
  end if;

  if v_title = '' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_TITLE', 'error', 'Package title cannot be empty.');
  end if;

  select * into v_draft
  from public.onboarding_package_versions
  where onboarding_package_id = p_onboarding_package_id and state = 'draft'
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'NO_DRAFT', 'error', 'This package has no editable draft. Create a new draft first.');
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_ITEMS', 'error', 'Package items must be a JSON array.');
  end if;

  -- Validate all items first
  v_item_count := jsonb_array_length(p_items);
  for i in 0 .. (v_item_count - 1) loop
    v_item := p_items -> i;
    v_item_type := coalesce(v_item ->> 'item_type', '');

    if v_item_type not in ('form', 'document') then
      return jsonb_build_object('ok', false, 'error_code', 'INVALID_ITEM_TYPE', 'error', 'Invalid package item type.');
    end if;

    if v_item_type = 'form' then
      if (v_item ->> 'form_version_id') is null then
        return jsonb_build_object('ok', false, 'error_code', 'MISSING_FORM_VERSION', 'error', 'Form package item must specify a form version ID.');
      end if;

      v_form_ver_id := (v_item ->> 'form_version_id')::uuid;

      select state into v_form_state
      from public.form_definition_versions
      where id = v_form_ver_id;

      if not found then
        return jsonb_build_object('ok', false, 'error_code', 'FORM_VERSION_NOT_FOUND', 'error', 'Referenced form version does not exist.');
      end if;

      if v_form_state <> 'published' then
        return jsonb_build_object('ok', false, 'error_code', 'INVALID_FORM_VERSION', 'error', 'Only published form versions can be added to an onboarding package.');
      end if;
    elsif v_item_type = 'document' then
      v_doc_title := btrim(coalesce(v_item ->> 'document_title', ''));
      if v_doc_title = '' then
        return jsonb_build_object('ok', false, 'error_code', 'INVALID_DOCUMENT_TITLE', 'error', 'Document requirement title cannot be empty.');
      end if;
    end if;
  end loop;

  -- Verify no duplicate form_version_id in payload
  select count(distinct (v ->> 'form_version_id')) into i
  from jsonb_array_elements(p_items) as v
  where v ->> 'item_type' = 'form';

  select count(*) into v_item_count
  from jsonb_array_elements(p_items) as v
  where v ->> 'item_type' = 'form';

  if i <> v_item_count then
    return jsonb_build_object('ok', false, 'error_code', 'DUPLICATE_FORM_ITEM', 'error', 'A package cannot contain the same form version multiple times.');
  end if;

  -- Optimistic concurrency check
  update public.onboarding_package_versions
  set revision = revision + 1,
      updated_by = v_user_id,
      updated_at = now()
  where id = v_draft.id
    and state = 'draft'
    and revision = p_expected_revision
  returning revision into v_new_revision;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'PACKAGE_DRAFT_CONFLICT',
      'error', 'This package draft was changed elsewhere. Refresh before saving again.',
      'current_revision', v_draft.revision
    );
  end if;

  -- Replace draft items
  delete from public.onboarding_package_items
  where package_version_id = v_draft.id;

  v_item_count := jsonb_array_length(p_items);
  for i in 0 .. (v_item_count - 1) loop
    v_item := p_items -> i;
    v_item_type := v_item ->> 'item_type';
    v_required := coalesce((v_item ->> 'required')::boolean, true);

    if v_item_type = 'form' then
      v_form_ver_id := (v_item ->> 'form_version_id')::uuid;
      v_doc_title := null;
      v_doc_desc := null;
    else
      v_form_ver_id := null;
      v_doc_title := btrim(v_item ->> 'document_title');
      v_doc_desc := nullif(btrim(coalesce(v_item ->> 'document_description', '')), '');
    end if;

    insert into public.onboarding_package_items (
      package_version_id, item_type, sort_order, required, form_version_id, document_title, document_description
    ) values (
      v_draft.id, v_item_type, i, v_required, v_form_ver_id, v_doc_title, v_doc_desc
    );
  end loop;

  -- Update parent package
  update public.onboarding_packages
  set title = v_title,
      description = nullif(btrim(coalesce(p_description, '')), ''),
      updated_by = v_user_id,
      updated_at = now()
  where id = p_onboarding_package_id;

  return jsonb_build_object(
    'ok', true,
    'version_id', v_draft.id,
    'version_number', v_draft.version_number,
    'revision', v_new_revision
  );
end;
$$;

revoke all on function public.save_onboarding_package_draft(uuid, text, text, jsonb, integer) from public, anon;
grant execute on function public.save_onboarding_package_draft(uuid, text, text, jsonb, integer) to authenticated;

-- ------------------------------------------------------------
-- 8. RPC: publish_onboarding_package_draft
-- ------------------------------------------------------------
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
    return jsonb_build_object('ok', false, 'error_code', 'UNPUBLISHED_FORM_ITEM', 'error', 'Package contains an unpublished form version.');
  end if;

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

revoke all on function public.publish_onboarding_package_draft(uuid) from public, anon;
grant execute on function public.publish_onboarding_package_draft(uuid) to authenticated;

-- ------------------------------------------------------------
-- 9. RPC: create_onboarding_package_draft
-- ------------------------------------------------------------
create or replace function public.create_onboarding_package_draft(
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
  v_existing_draft record;
  v_latest_published record;
  v_next_version integer;
  v_new_version_id uuid;
begin
  v_user_id := auth.uid();
  v_role := public.current_user_role();
  if v_user_id is null or v_role is null or v_role not in ('admin', 'hr') then
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHORIZED', 'error', 'Only admin or HR can edit onboarding packages.');
  end if;

  select * into v_package
  from public.onboarding_packages
  where id = p_onboarding_package_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'PACKAGE_NOT_FOUND', 'error', 'Onboarding package not found.');
  end if;

  if v_package.archived_at is not null then
    return jsonb_build_object('ok', false, 'error_code', 'PACKAGE_ARCHIVED', 'error', 'This onboarding package is archived and cannot be edited.');
  end if;

  select * into v_existing_draft
  from public.onboarding_package_versions
  where onboarding_package_id = p_onboarding_package_id and state = 'draft'
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
  from public.onboarding_package_versions
  where onboarding_package_id = p_onboarding_package_id and state = 'published'
  order by version_number desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'NO_PUBLISHED_VERSION', 'error', 'This package has no published version to branch a new draft from.');
  end if;

  v_next_version := v_latest_published.version_number + 1;

  insert into public.onboarding_package_versions (
    onboarding_package_id, version_number, state, revision, created_by, updated_by
  ) values (
    p_onboarding_package_id, v_next_version, 'draft', 1, v_user_id, v_user_id
  )
  returning id into v_new_version_id;

  -- Clone package items preserving exact form_version_id
  insert into public.onboarding_package_items (
    package_version_id, item_type, sort_order, required, form_version_id, document_title, document_description
  )
  select
    v_new_version_id, item_type, sort_order, required, form_version_id, document_title, document_description
  from public.onboarding_package_items
  where package_version_id = v_latest_published.id
  order by sort_order;

  return jsonb_build_object(
    'ok', true,
    'version_id', v_new_version_id,
    'version_number', v_next_version,
    'revision', 1,
    'created_new', true
  );
end;
$$;

revoke all on function public.create_onboarding_package_draft(uuid) from public, anon;
grant execute on function public.create_onboarding_package_draft(uuid) to authenticated;

commit;
