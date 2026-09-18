-- ============================================================
-- Nolt HR — 0027: employee onboarding form responses
--
-- Closes the gap left open at the end of the previous two phases: an
-- employee could see their onboarding checklist and start it, but had no
-- way to actually fill in an assigned form — employees had no read access
-- to form_definition_versions (the JSON schema) at all, and there was no
-- write path for their answers.
--
-- This migration:
-- 1. Adds response storage to employee_onboarding_items (form items only).
-- 2. Grants employees a narrowly-scoped, assignment-aware SELECT policy on
--    form_definition_versions — exactly the "controlled path" flagged as
--    future work in 0025's comments. It does NOT open the table generally;
--    an employee can only read the exact version pinned to one of their
--    own checklist items.
-- 3. Adds one SECURITY DEFINER RPC, submit_onboarding_form_response, so
--    the employee can submit their answers for a not_started/in_progress
--    form item. Still explicitly out of scope: HR review (approve/
--    reject/changes_requested), document upload, and editing a response
--    after submission — those remain future phases.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Response storage
-- ------------------------------------------------------------
alter table public.employee_onboarding_items
  add column response_data jsonb,
  add column submitted_at timestamptz;

alter table public.employee_onboarding_items
  add constraint employee_onboarding_items_response_only_on_forms
    check (item_type = 'form' or response_data is null);

comment on column public.employee_onboarding_items.response_data is
  'Employee-submitted answers for a form item, captured atomically by submit_onboarding_form_response. Null until submitted; never populated for document items.';

-- ------------------------------------------------------------
-- 2. Assignment-aware read access to the form schema
--
-- Additive: this is a second SELECT policy on the same table, alongside
-- the existing admin/hr policy from 0015 (RLS policies for the same
-- command are OR'd together) — it does not change admin/hr access at all.
-- ------------------------------------------------------------
create policy form_definition_versions_select_assigned_employee
  on public.form_definition_versions for select
  to authenticated
  using (
    state = 'published'
    and exists (
      select 1
      from public.employee_onboarding_items item
      join public.employee_onboarding_assignments a on a.id = item.assignment_id
      join public.employees e on e.id = a.employee_id
      where item.form_version_id = form_definition_versions.id
        and e.auth_user_id = (select auth.uid())
    )
  );

-- ------------------------------------------------------------
-- 3. RPC: submit_onboarding_form_response
--
-- Employee-only. Ownership is resolved through the same
-- employees.auth_user_id = auth.uid() linkage used everywhere else — no
-- email matching, no second linkage mechanism.
-- ------------------------------------------------------------
create or replace function public.submit_onboarding_form_response(
  p_item_id uuid,
  p_response_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_item record;
  v_assignment record;
  v_employee record;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHORIZED', 'error', 'You must be signed in to submit this form.');
  end if;

  select * into v_item from public.employee_onboarding_items where id = p_item_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'ITEM_NOT_FOUND', 'error', 'Checklist item not found.');
  end if;

  select * into v_assignment from public.employee_onboarding_assignments where id = v_item.assignment_id;
  select * into v_employee from public.employees where id = v_assignment.employee_id;

  if v_employee.auth_user_id is null or v_employee.auth_user_id <> v_user_id then
    -- Same generic not-found response as a missing item, so ownership is
    -- never distinguishable from non-existence to a non-owning caller.
    return jsonb_build_object('ok', false, 'error_code', 'ITEM_NOT_FOUND', 'error', 'Checklist item not found.');
  end if;

  if v_item.item_type <> 'form' then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_A_FORM_ITEM', 'error', 'This checklist item does not accept a form response.');
  end if;

  if v_assignment.state <> 'in_progress' then
    return jsonb_build_object('ok', false, 'error_code', 'ASSIGNMENT_NOT_ACTIVE', 'error', 'Start your onboarding before submitting this form.');
  end if;

  if v_item.state not in ('not_started', 'in_progress') then
    return jsonb_build_object('ok', false, 'error_code', 'ALREADY_SUBMITTED', 'error', 'This form has already been submitted.');
  end if;

  if p_response_data is null or jsonb_typeof(p_response_data) <> 'object' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_RESPONSE', 'error', 'Form response must be a JSON object.');
  end if;

  update public.employee_onboarding_items
  set state = 'submitted',
      response_data = p_response_data,
      submitted_at = now()
  where id = p_item_id;

  return jsonb_build_object('ok', true, 'item_id', p_item_id, 'state', 'submitted', 'submitted_at', now());
end;
$$;

revoke all on function public.submit_onboarding_form_response(uuid, jsonb) from public, anon;
grant execute on function public.submit_onboarding_form_response(uuid, jsonb) to authenticated;

commit;
