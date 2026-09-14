-- ============================================================
-- Nolt HR — 0007: employee invitations & account linking
--
-- Adds invitation tracking table, employee lifecycle account fields,
-- atomic finalization RPC, and user account activation RPC.
-- ============================================================

create type public.employee_invitation_status as enum (
  'CREATING',
  'PENDING',
  'ACCEPTED',
  'FAILED',
  'REVOKED'
);

-- Add lifecycle/account fields to public.employees if not present
alter table public.employees
  add column if not exists invited_at timestamptz,
  add column if not exists invited_by uuid references auth.users(id) on delete set null,
  add column if not exists account_activated_at timestamptz;

-- Invitation tracking table
create table public.employee_invitations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  email text not null check (
    email = lower(btrim(email))
    and position('@' in email) > 1
  ),
  status public.employee_invitation_status not null,
  invited_by uuid references auth.users(id) on delete set null,
  failure_code text check (failure_code is null or btrim(failure_code) <> ''),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  accepted_at timestamptz,
  failed_at timestamptz,
  revoked_at timestamptz
);

-- Partial unique index to enforce only one active invitation per employee at a time
create unique index active_employee_invitation_unique
  on public.employee_invitations (employee_id)
  where status in ('CREATING', 'PENDING');

create index employee_invitations_employee_id_idx
  on public.employee_invitations (employee_id);

create index employee_invitations_auth_user_id_idx
  on public.employee_invitations (auth_user_id);

-- RLS setup for employee_invitations
alter table public.employee_invitations enable row level security;

create policy employee_invitations_select
  on public.employee_invitations for select
  to authenticated
  using (
    (select public.current_user_role()) in ('admin', 'hr')
    or auth_user_id = (select auth.uid())
  );

revoke all on public.employee_invitations from anon;
revoke all on public.employee_invitations from authenticated;
grant select on public.employee_invitations to authenticated;

-- Atomic invitation finalization (service role / Edge Function usage)
create or replace function public.finalize_employee_invitation(
  p_employee_id uuid,
  p_invitation_id uuid,
  p_auth_user_id uuid,
  p_invited_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.employees
  set auth_user_id = p_auth_user_id,
      status = 'INVITED',
      invited_at = now(),
      invited_by = p_invited_by,
      updated_at = now()
  where id = p_employee_id;

  update public.employee_invitations
  set auth_user_id = p_auth_user_id,
      status = 'PENDING',
      sent_at = now(),
      invited_by = p_invited_by
  where id = p_invitation_id;
end;
$$;

revoke execute on function public.finalize_employee_invitation(uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- Idempotent employee account activation RPC (called by authenticated employee on login)
create or replace function public.activate_my_employee_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_emp record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized');
  end if;

  select id, status into v_emp
  from public.employees
  where auth_user_id = v_uid;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Employee record not linked');
  end if;

  -- Update employee account_activated_at and status if INVITED
  update public.employees
  set account_activated_at = coalesce(account_activated_at, now()),
      status = case when status = 'INVITED' then 'PRE_ONBOARDING'::public.employee_status else status end,
      updated_at = now()
  where id = v_emp.id;

  -- Mark matching PENDING invitation as ACCEPTED
  update public.employee_invitations
  set status = 'ACCEPTED',
      accepted_at = coalesce(accepted_at, now())
  where employee_id = v_emp.id
    and status = 'PENDING';

  return jsonb_build_object(
    'ok', true,
    'employee_id', v_emp.id,
    'status', case when v_emp.status = 'INVITED' then 'PRE_ONBOARDING' else v_emp.status end
  );
end;
$$;

grant execute on function public.activate_my_employee_account() to authenticated;
