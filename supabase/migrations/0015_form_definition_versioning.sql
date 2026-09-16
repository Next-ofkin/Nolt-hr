-- ============================================================
-- Nolt HR — 0015: form definition + draft/published versioning
--
-- Clean "Forms V2" persistence model. This is NOT a restoration of the
-- Forms V1 architecture dropped in 0014 (form_templates, form_fields,
-- form_import_jobs, AI import infra) — new tables, new names, new RPCs.
--
-- Persists the approved TypeScript FormSchema
-- (src/features/shadcn-form-poc/domain/form-schema.ts) as JSONB. This
-- migration intentionally does not re-implement every structural rule
-- of that schema in Postgres — the TypeScript type remains the primary
-- structural contract; the database only enforces the invariants that
-- protect data integrity (non-empty title, definition is a JSON object
-- with a steps array, one draft per form, published immutability).
--
-- Scope: form definitions only. No assignments, no submissions, no
-- onboarding packages — those are later phases.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- form_definitions: the parent form record
-- ------------------------------------------------------------
create table public.form_definitions (
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

comment on table public.form_definitions is
  'Parent record for a Nolt HR form. Never hard-deleted; archive instead.';

create index form_definitions_archived_at_idx on public.form_definitions (archived_at);

create trigger form_definitions_set_updated_at
  before update on public.form_definitions
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- form_definition_versions: draft / published snapshots
-- ------------------------------------------------------------
create table public.form_definition_versions (
  id                 uuid primary key default gen_random_uuid(),
  form_definition_id uuid not null references public.form_definitions(id),
  version_number     integer not null check (version_number > 0),
  state              text not null check (state in ('draft', 'published')),
  definition         jsonb not null,
  schema_version     integer not null default 1,
  revision           integer not null default 1 check (revision > 0),
  created_by         uuid not null references auth.users(id),
  updated_by         uuid not null references auth.users(id),
  published_by       uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  published_at       timestamptz,

  constraint form_definition_versions_unique_version
    unique (form_definition_id, version_number),

  constraint form_definition_versions_definition_is_object
    check (jsonb_typeof(definition) = 'object'),

  constraint form_definition_versions_has_steps
    check (definition ? 'steps' and jsonb_typeof(definition -> 'steps') = 'array'),

  -- published_at/published_by are set together, exactly when state = 'published'
  constraint form_definition_versions_published_fields
    check (
      (state = 'published' and published_at is not null and published_by is not null)
      or (state = 'draft' and published_at is null and published_by is null)
    )
);

comment on table public.form_definition_versions is
  'Draft or published snapshot of a form_definitions row. Published rows are immutable (see check_form_definition_version_immutability).';

create index form_definition_versions_form_id_idx on public.form_definition_versions (form_definition_id);
create index form_definition_versions_state_idx on public.form_definition_versions (state);

-- At most one DRAFT version per form. Published versions are unlimited
-- (full immutable history is kept — see 0011 for why the Forms V1
-- predecessor of this table settled on that semantics).
create unique index form_definition_versions_one_draft_per_form
  on public.form_definition_versions (form_definition_id)
  where state = 'draft';

create trigger form_definition_versions_set_updated_at
  before update on public.form_definition_versions
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Published version immutability (database-level, not just RLS/RPC)
-- ------------------------------------------------------------
create or replace function public.enforce_form_definition_version_immutability()
returns trigger
language plpgsql
security definer
set search_path = public
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

create trigger check_form_definition_version_immutability
  before update or delete on public.form_definition_versions
  for each row execute function public.enforce_form_definition_version_immutability();

-- ------------------------------------------------------------
-- RLS
--
-- admin/hr: full authoring access to both tables (no delete policy on
-- either table — there is no hard-delete workflow for production forms).
-- employee: no access yet; that comes later via assignment/package
-- authorization, not blanket SELECT on all published forms.
-- Role source: public.current_user_role() (0003's RLS-safe helper over
-- profiles.role, which itself is only ever written from the protected
-- auth.users.app_metadata role claim — never client-editable data).
-- ------------------------------------------------------------
alter table public.form_definitions enable row level security;
alter table public.form_definition_versions enable row level security;

create policy form_definitions_select
  on public.form_definitions for select
  to authenticated
  using ((select public.current_user_role()) in ('admin', 'hr'));

create policy form_definitions_insert
  on public.form_definitions for insert
  to authenticated
  with check ((select public.current_user_role()) in ('admin', 'hr'));

create policy form_definitions_update
  on public.form_definitions for update
  to authenticated
  using ((select public.current_user_role()) in ('admin', 'hr'))
  with check ((select public.current_user_role()) in ('admin', 'hr'));

create policy form_definition_versions_select
  on public.form_definition_versions for select
  to authenticated
  using ((select public.current_user_role()) in ('admin', 'hr'));

create policy form_definition_versions_insert
  on public.form_definition_versions for insert
  to authenticated
  with check ((select public.current_user_role()) in ('admin', 'hr'));

create policy form_definition_versions_update
  on public.form_definition_versions for update
  to authenticated
  using ((select public.current_user_role()) in ('admin', 'hr'))
  with check ((select public.current_user_role()) in ('admin', 'hr'));

revoke all on public.form_definitions, public.form_definition_versions from anon;
revoke all on public.form_definitions, public.form_definition_versions from authenticated;
-- No delete grant: hard delete is unreachable through the API even for admin/hr.
grant select, insert, update on public.form_definitions, public.form_definition_versions to authenticated;

-- ------------------------------------------------------------
-- RPC: create_form_definition
-- Atomically creates a form and its version 1 draft.
-- SECURITY INVOKER: runs as the caller, gated by the RLS policies above
-- plus an explicit role check; audit fields always come from auth.uid(),
-- never from the browser.
-- ------------------------------------------------------------
create or replace function public.create_form_definition(
  p_title text,
  p_description text,
  p_definition jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_role public.user_role;
  v_title text := btrim(coalesce(p_title, ''));
  v_form_id uuid;
  v_version_id uuid;
begin
  v_role := public.current_user_role();
  if v_role is null or v_role not in ('admin', 'hr') then
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHORIZED', 'error', 'Only admin or HR can create forms.');
  end if;

  if v_title = '' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_TITLE', 'error', 'Form title cannot be empty.');
  end if;

  if p_definition is null or jsonb_typeof(p_definition) <> 'object'
     or not (p_definition ? 'steps') or jsonb_typeof(p_definition -> 'steps') <> 'array' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_DEFINITION', 'error', 'Form definition must be a JSON object with a steps array.');
  end if;

  insert into public.form_definitions (title, description, created_by, updated_by)
  values (v_title, nullif(btrim(coalesce(p_description, '')), ''), auth.uid(), auth.uid())
  returning id into v_form_id;

  insert into public.form_definition_versions (
    form_definition_id, version_number, state, definition, created_by, updated_by
  ) values (
    v_form_id, 1, 'draft', p_definition, auth.uid(), auth.uid()
  )
  returning id into v_version_id;

  return jsonb_build_object(
    'ok', true,
    'form_definition_id', v_form_id,
    'version_id', v_version_id,
    'version_number', 1,
    'revision', 1
  );
end;
$$;

revoke all on function public.create_form_definition(text, text, jsonb) from public, anon;
grant execute on function public.create_form_definition(text, text, jsonb) to authenticated;

-- ------------------------------------------------------------
-- RPC: save_form_definition_draft
-- Optimistic-concurrency draft save. p_expected_revision must match the
-- draft's current revision or the call returns FORM_DRAFT_CONFLICT
-- without writing anything.
-- ------------------------------------------------------------
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
set search_path = public
as $$
declare
  v_role public.user_role;
  v_title text := btrim(coalesce(p_title, ''));
  v_form record;
  v_draft record;
begin
  v_role := public.current_user_role();
  if v_role is null or v_role not in ('admin', 'hr') then
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHORIZED', 'error', 'Only admin or HR can edit forms.');
  end if;

  select * into v_form from public.form_definitions where id = p_form_definition_id;
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

  if v_draft.revision <> p_expected_revision then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'FORM_DRAFT_CONFLICT',
      'error', 'This draft was changed elsewhere. Refresh before saving again.',
      'current_revision', v_draft.revision
    );
  end if;

  update public.form_definition_versions
  set definition = p_definition,
      revision = revision + 1,
      updated_by = auth.uid(),
      updated_at = now()
  where id = v_draft.id;

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
    'revision', v_draft.revision + 1
  );
end;
$$;

revoke all on function public.save_form_definition_draft(uuid, jsonb, text, text, integer) from public, anon;
grant execute on function public.save_form_definition_draft(uuid, jsonb, text, text, integer) to authenticated;

-- ------------------------------------------------------------
-- RPC: publish_form_definition_draft
-- draft -> published. No new draft is auto-created; a form may have no
-- editable draft immediately after publishing (by design).
-- ------------------------------------------------------------
create or replace function public.publish_form_definition_draft(
  p_form_definition_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_role public.user_role;
  v_form record;
  v_draft record;
begin
  v_role := public.current_user_role();
  if v_role is null or v_role not in ('admin', 'hr') then
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHORIZED', 'error', 'Only admin or HR can publish forms.');
  end if;

  select * into v_form from public.form_definitions where id = p_form_definition_id for update;
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

  update public.form_definition_versions
  set state = 'published',
      published_at = now(),
      published_by = auth.uid(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = v_draft.id;

  return jsonb_build_object(
    'ok', true,
    'version_id', v_draft.id,
    'version_number', v_draft.version_number
  );
end;
$$;

revoke all on function public.publish_form_definition_draft(uuid) from public, anon;
grant execute on function public.publish_form_definition_draft(uuid) to authenticated;

-- ------------------------------------------------------------
-- RPC: create_form_definition_draft
-- Branches a new draft from the latest published version. Returns the
-- existing draft unchanged if one is already open (never creates a
-- second draft for the same form).
-- ------------------------------------------------------------
create or replace function public.create_form_definition_draft(
  p_form_definition_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
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

  select * into v_form from public.form_definitions where id = p_form_definition_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'FORM_NOT_FOUND', 'error', 'Form not found.');
  end if;

  if v_form.archived_at is not null then
    return jsonb_build_object('ok', false, 'error_code', 'FORM_ARCHIVED', 'error', 'This form is archived and cannot be edited.');
  end if;

  select * into v_existing_draft
  from public.form_definition_versions
  where form_definition_id = p_form_definition_id and state = 'draft';

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

  select coalesce(max(version_number), 0) + 1
  into v_next_version
  from public.form_definition_versions
  where form_definition_id = p_form_definition_id;

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

revoke all on function public.create_form_definition_draft(uuid) from public, anon;
grant execute on function public.create_form_definition_draft(uuid) to authenticated;

commit;
