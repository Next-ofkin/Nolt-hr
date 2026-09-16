-- ============================================================
-- Nolt HR — 0017: harden forms mutation database security boundary
--
-- Restricts DML on form_definitions and form_definition_versions
-- so browser clients cannot perform direct INSERT, UPDATE, or DELETE
-- table operations. All authoring mutations must go through controlled
-- SECURITY DEFINER RPCs that enforce optimistic concurrency, workflow
-- invariants, authorization checks, and audit logging.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Table Grants & Policy Cleanup
--
-- Direct table DML is revoked from client roles (authenticated, anon, public).
-- Read access (SELECT) remains granted to authenticated users, protected by RLS.
-- ------------------------------------------------------------
revoke insert, update, delete on public.form_definitions from authenticated, anon, public;
revoke insert, update, delete on public.form_definition_versions from authenticated, anon, public;

drop policy if exists form_definitions_insert on public.form_definitions;
drop policy if exists form_definitions_update on public.form_definitions;
drop policy if exists form_definition_versions_insert on public.form_definition_versions;
drop policy if exists form_definition_versions_update on public.form_definition_versions;

-- ------------------------------------------------------------
-- 2. Hardened SECURITY DEFINER RPCs
-- ------------------------------------------------------------

-- RPC: create_form_definition
create or replace function public.create_form_definition(
  p_title text,
  p_description text,
  p_definition jsonb
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
  v_form_id uuid;
  v_version_id uuid;
begin
  v_user_id := auth.uid();
  v_role := public.current_user_role();
  if v_user_id is null or v_role is null or v_role not in ('admin', 'hr') then
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
  values (v_title, nullif(btrim(coalesce(p_description, '')), ''), v_user_id, v_user_id)
  returning id into v_form_id;

  insert into public.form_definition_versions (
    form_definition_id, version_number, state, definition, created_by, updated_by
  ) values (
    v_form_id, 1, 'draft', p_definition, v_user_id, v_user_id
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

-- RPC: save_form_definition_draft
create or replace function public.save_form_definition_draft(
  p_form_definition_id uuid,
  p_definition jsonb,
  p_title text,
  p_description text,
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
  v_form record;
  v_draft record;
  v_new_revision integer;
begin
  v_user_id := auth.uid();
  v_role := public.current_user_role();
  if v_user_id is null or v_role is null or v_role not in ('admin', 'hr') then
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
      updated_by = v_user_id,
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
      updated_by = v_user_id,
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

-- RPC: publish_form_definition_draft
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

-- RPC: create_form_definition_draft
create or replace function public.create_form_definition_draft(
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
  v_existing_draft record;
  v_latest_published record;
  v_next_version integer;
  v_new_version_id uuid;
begin
  v_user_id := auth.uid();
  v_role := public.current_user_role();
  if v_user_id is null or v_role is null or v_role not in ('admin', 'hr') then
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
    p_form_definition_id, v_next_version, 'draft', v_latest_published.definition, v_latest_published.schema_version, v_user_id, v_user_id
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

-- ------------------------------------------------------------
-- 3. Function Grants
-- ------------------------------------------------------------
revoke all on function public.create_form_definition(text, text, jsonb) from public, anon;
revoke all on function public.save_form_definition_draft(uuid, jsonb, text, text, integer) from public, anon;
revoke all on function public.publish_form_definition_draft(uuid) from public, anon;
revoke all on function public.create_form_definition_draft(uuid) from public, anon;

grant execute on function public.create_form_definition(text, text, jsonb) to authenticated;
grant execute on function public.save_form_definition_draft(uuid, jsonb, text, text, integer) to authenticated;
grant execute on function public.publish_form_definition_draft(uuid) to authenticated;
grant execute on function public.create_form_definition_draft(uuid) to authenticated;

commit;
