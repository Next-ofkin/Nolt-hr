-- ============================================================
-- Nolt HR — 0024: Form Unarchive & Hard Delete RPCs
--
-- Mirrors 0023's onboarding-package lifecycle for forms:
-- 1. Unarchive / restore an archived form back to the active library.
-- 2. Permanently hard-delete an archived (or draft) form definition.
--
-- delete_form_definition here supersedes the "smart" (archive-or-delete)
-- version from 0022: the UI now only ever offers Delete after a form has
-- already been archived, so delete always hard-deletes.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. RPC: unarchive_form_definition
-- ------------------------------------------------------------
create or replace function public.unarchive_form_definition(
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
begin
  v_user_id := auth.uid();
  v_role := public.current_user_role();
  if v_user_id is null or v_role is null or v_role not in ('admin', 'hr') then
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHORIZED', 'error', 'Only admin or HR can restore forms.');
  end if;

  select * into v_form
  from public.form_definitions
  where id = p_form_definition_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'FORM_NOT_FOUND', 'error', 'Form not found.');
  end if;

  if v_form.archived_at is null then
    return jsonb_build_object('ok', true, 'already_active', true);
  end if;

  update public.form_definitions
  set archived_at = null,
      archived_by = null,
      updated_by = v_user_id,
      updated_at = now()
  where id = p_form_definition_id;

  return jsonb_build_object('ok', true, 'already_active', false);
end;
$$;

revoke all on function public.unarchive_form_definition(uuid) from public, anon;
grant execute on function public.unarchive_form_definition(uuid) to authenticated;

-- ------------------------------------------------------------
-- 2. RPC: delete_form_definition (now always hard-deletes)
-- ------------------------------------------------------------
create or replace function public.delete_form_definition(
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
begin
  v_user_id := auth.uid();
  v_role := public.current_user_role();
  if v_user_id is null or v_role is null or v_role not in ('admin', 'hr') then
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHORIZED', 'error', 'Only admin or HR can delete forms.');
  end if;

  select * into v_form
  from public.form_definitions
  where id = p_form_definition_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'FORM_NOT_FOUND', 'error', 'Form not found.');
  end if;

  -- Published/superseded versions are protected by an immutability trigger.
  -- A hard delete is an explicit admin override of that protection, so the
  -- trigger is disabled for the duration of this statement only. DDL is
  -- transactional in Postgres, so if anything below raises, the ALTER TABLE
  -- call rolls back with everything else and the trigger is never left off.
  alter table public.form_definition_versions disable trigger check_form_definition_version_immutability;

  delete from public.form_definition_versions
  where form_definition_id = p_form_definition_id;

  alter table public.form_definition_versions enable trigger check_form_definition_version_immutability;

  delete from public.form_definitions
  where id = p_form_definition_id;

  return jsonb_build_object('ok', true, 'deleted', true);
end;
$$;

revoke all on function public.delete_form_definition(uuid) from public, anon;
grant execute on function public.delete_form_definition(uuid) to authenticated;

commit;
