-- ============================================================
-- Nolt HR — 0026: revoke a pending employee invitation
--
-- The employee_invitations table has carried a 'REVOKED' status value
-- since 0007, but nothing has ever set it — there was no way to cancel a
-- pending invitation. This migration adds exactly one new object: the
-- atomic bookkeeping half of that operation.
--
-- Revoking an invitation is a two-part operation:
--   1. Invalidate the invite token by deleting the still-unconfirmed
--      auth.users row Supabase Auth created for it. That can only be
--      done with the Auth Admin API (service role), so it happens in
--      the invite-user Edge Function, never in the browser.
--   2. Record that explicitly: mark the invitation row REVOKED and
--      reset the employee back to DRAFT (auth_user_id is already NULL
--      via the existing `on delete set null` FK once step 1 runs) so
--      the employee becomes eligible for a fresh invitation again.
--
-- This RPC is step 2, atomically. It follows the exact SECURITY DEFINER
-- pattern established by finalize_employee_invitation (0007): no grant
-- to authenticated/anon — only the trusted service-role Edge Function
-- calls it, right after it deletes the auth user.
-- ============================================================

begin;

create or replace function public.revoke_employee_invitation(
  p_employee_id uuid,
  p_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.employee_invitations
  set status = 'REVOKED',
      revoked_at = now()
  where id = p_invitation_id
    and employee_id = p_employee_id
    and status = 'PENDING';

  update public.employees
  set auth_user_id = null,
      status = 'DRAFT',
      updated_at = now()
  where id = p_employee_id
    and status = 'INVITED';
end;
$$;

revoke execute on function public.revoke_employee_invitation(uuid, uuid) from public, anon, authenticated;

commit;
