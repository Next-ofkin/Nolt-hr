-- ============================================================
-- Nolt HR — 0020: archive forms and onboarding packages
--
-- form_definitions.archived_at/archived_by and
-- onboarding_packages.archived_at/archived_by have existed since
-- 0015/0018, but nothing ever set them — there was no way to remove a
-- form or package from the active list. Per the project's explicit
-- no-hard-delete rule, "delete" here means archive: hide it from the
-- active library, block further drafting/publishing, but never
-- destroy the row or any version history (existing onboarding
-- packages that already pinned a specific published form version keep
-- working — archiving only affects the parent record).
--
-- Both RPCs follow the SECURITY DEFINER + explicit role-check pattern
-- established in 0016/0017/0018 (direct table UPDATE is not granted
-- to authenticated on either table).
-- ============================================================

begin;

create or replace function public.archive_form_definition(
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
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHORIZED', 'error', 'Only admin or HR can archive forms.');
  end if;

  select * into v_form from public.form_definitions where id = p_form_definition_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'FORM_NOT_FOUND', 'error', 'Form not found.');
  end if;

  if v_form.archived_at is not null then
    return jsonb_build_object('ok', true, 'already_archived', true);
  end if;

  update public.form_definitions
  set archived_at = now(),
      archived_by = v_user_id,
      updated_by = v_user_id,
      updated_at = now()
  where id = p_form_definition_id;

  return jsonb_build_object('ok', true, 'already_archived', false);
end;
$$;

revoke all on function public.archive_form_definition(uuid) from public, anon;
grant execute on function public.archive_form_definition(uuid) to authenticated;

create or replace function public.archive_onboarding_package(
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
begin
  v_user_id := auth.uid();
  v_role := public.current_user_role();
  if v_user_id is null or v_role is null or v_role not in ('admin', 'hr') then
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHORIZED', 'error', 'Only admin or HR can archive onboarding packages.');
  end if;

  select * into v_package from public.onboarding_packages where id = p_onboarding_package_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'PACKAGE_NOT_FOUND', 'error', 'Onboarding package not found.');
  end if;

  if v_package.archived_at is not null then
    return jsonb_build_object('ok', true, 'already_archived', true);
  end if;

  update public.onboarding_packages
  set archived_at = now(),
      archived_by = v_user_id,
      updated_by = v_user_id,
      updated_at = now()
  where id = p_onboarding_package_id;

  return jsonb_build_object('ok', true, 'already_archived', false);
end;
$$;

revoke all on function public.archive_onboarding_package(uuid) from public, anon;
grant execute on function public.archive_onboarding_package(uuid) to authenticated;

commit;
