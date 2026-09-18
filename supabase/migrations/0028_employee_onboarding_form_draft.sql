-- ============================================================
-- Nolt HR — 0028: employee onboarding form draft saves
--
-- Submission already exists (0027, submit_onboarding_form_response) and
-- is unchanged here. The one gap left: an employee filling in a long
-- form had no way to save incomplete progress and resume later — closing
-- the modal before the last step lost everything.
--
-- Adds exactly one new object: save_onboarding_form_draft, a sibling RPC
-- to submit_onboarding_form_response with the identical ownership/guard
-- structure, differing only in what it writes:
--   - submit:  state -> 'submitted', response_data set, submitted_at set
--   - draft:   state -> 'in_progress' (or left as-is), response_data set,
--              submitted_at left untouched (always still null at this
--              point, since a submitted item can no longer accept a
--              draft save at all)
--
-- No new table, no new column, no new RLS policy — this reuses
-- employee_onboarding_items.response_data / .state exactly as 0027 left
-- them, and relies on the same RLS already in place for reading them
-- back.
-- ============================================================

begin;

create or replace function public.save_onboarding_form_draft(
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
  v_next_state text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHORIZED', 'error', 'You must be signed in to save this form.');
  end if;

  select * into v_item from public.employee_onboarding_items where id = p_item_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'ITEM_NOT_FOUND', 'error', 'Checklist item not found.');
  end if;

  select * into v_assignment from public.employee_onboarding_assignments where id = v_item.assignment_id;
  select * into v_employee from public.employees where id = v_assignment.employee_id;

  if v_employee.auth_user_id is null or v_employee.auth_user_id <> v_user_id then
    -- Same generic not-found response as submit_onboarding_form_response,
    -- so ownership is never distinguishable from non-existence.
    return jsonb_build_object('ok', false, 'error_code', 'ITEM_NOT_FOUND', 'error', 'Checklist item not found.');
  end if;

  if v_item.item_type <> 'form' then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_A_FORM_ITEM', 'error', 'This checklist item does not accept a form response.');
  end if;

  if v_assignment.state <> 'in_progress' then
    return jsonb_build_object('ok', false, 'error_code', 'ASSIGNMENT_NOT_ACTIVE', 'error', 'Start your onboarding before saving this form.');
  end if;

  if v_item.state not in ('not_started', 'in_progress') then
    return jsonb_build_object('ok', false, 'error_code', 'ALREADY_SUBMITTED', 'error', 'This form has already been submitted.');
  end if;

  if p_response_data is null or jsonb_typeof(p_response_data) <> 'object' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_RESPONSE', 'error', 'Form response must be a JSON object.');
  end if;

  v_next_state := case when v_item.state = 'not_started' then 'in_progress' else v_item.state end;

  update public.employee_onboarding_items
  set state = v_next_state,
      response_data = p_response_data
  where id = p_item_id;

  return jsonb_build_object('ok', true, 'item_id', p_item_id, 'state', v_next_state);
end;
$$;

revoke all on function public.save_onboarding_form_draft(uuid, jsonb) from public, anon;
grant execute on function public.save_onboarding_form_draft(uuid, jsonb) to authenticated;

commit;
