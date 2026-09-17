-- ============================================================
-- Nolt HR — 0022: Delete Onboarding Package & Delete Form Definition RPCs
--
-- Enables HR and Admin users to delete packages and forms.
-- Smart Delete Logic:
-- 1. If a package/form has ZERO published versions (draft-only),
--    performing a delete HARD DELETES the draft rows from the database.
-- 2. If a package/form has PUBLISHED version history,
--    performing a delete SOFT DELETES (archives) the parent record to
--    preserve immutable published version contracts.
--
-- RPCs:
-- 1. public.delete_onboarding_package(p_onboarding_package_id uuid)
-- 2. public.delete_form_definition(p_form_definition_id uuid)
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. RPC: delete_onboarding_package
-- ------------------------------------------------------------
create or replace function public.delete_onboarding_package(
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
  v_published_count integer;
begin
  v_user_id := auth.uid();
  v_role := public.current_user_role();
  if v_user_id is null or v_role is null or v_role not in ('admin', 'hr') then
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHORIZED', 'error', 'Only admin or HR can delete onboarding packages.');
  end if;

  select * into v_package
  from public.onboarding_packages
  where id = p_onboarding_package_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'PACKAGE_NOT_FOUND', 'error', 'Onboarding package not found.');
  end if;

  select count(*) into v_published_count
  from public.onboarding_package_versions
  where onboarding_package_id = p_onboarding_package_id
    and state = 'published';

  if v_published_count = 0 then
    -- Draft-only package: hard delete draft items, draft versions, and package header
    delete from public.onboarding_package_items
    where package_version_id in (
      select id from public.onboarding_package_versions where onboarding_package_id = p_onboarding_package_id
    );

    delete from public.onboarding_package_versions
    where onboarding_package_id = p_onboarding_package_id;

    delete from public.onboarding_packages
    where id = p_onboarding_package_id;

    return jsonb_build_object('ok', true, 'deleted', true, 'mode', 'hard_delete');
  else
    -- Package with published version history: soft delete / archive
    update public.onboarding_packages
    set archived_at = now(),
        archived_by = v_user_id,
        updated_by = v_user_id,
        updated_at = now()
    where id = p_onboarding_package_id;

    return jsonb_build_object('ok', true, 'deleted', true, 'mode', 'archived');
  end if;
end;
$$;

revoke all on function public.delete_onboarding_package(uuid) from public, anon;
grant execute on function public.delete_onboarding_package(uuid) to authenticated;

-- ------------------------------------------------------------
-- 2. RPC: delete_form_definition
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
  v_published_count integer;
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

  select count(*) into v_published_count
  from public.form_definition_versions
  where form_definition_id = p_form_definition_id
    and state = 'published';

  if v_published_count = 0 then
    -- Draft-only form: hard delete draft versions and form definition header
    delete from public.form_definition_versions
    where form_definition_id = p_form_definition_id;

    delete from public.form_definitions
    where id = p_form_definition_id;

    return jsonb_build_object('ok', true, 'deleted', true, 'mode', 'hard_delete');
  else
    -- Form with published version history: soft delete / archive
    update public.form_definitions
    set archived_at = now(),
        archived_by = v_user_id,
        updated_by = v_user_id,
        updated_at = now()
    where id = p_form_definition_id;

    return jsonb_build_object('ok', true, 'deleted', true, 'mode', 'archived');
  end if;
end;
$$;

revoke all on function public.delete_form_definition(uuid) from public, anon;
grant execute on function public.delete_form_definition(uuid) to authenticated;

commit;
