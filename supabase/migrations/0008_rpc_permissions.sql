-- ============================================================
-- Nolt HR — 0008: explicit RPC permission hardening
--
-- Ensures finalize_employee_invitation is strictly revoked from public/anon/authenticated
-- (service-role / SECURITY DEFINER internal use only) and activate_my_employee_account
-- is revoked from public/anon and granted only to authenticated.
-- ============================================================

revoke execute on function public.finalize_employee_invitation(uuid, uuid, uuid, uuid) from public, anon, authenticated;

revoke execute on function public.activate_my_employee_account() from public, anon;
grant execute on function public.activate_my_employee_account() to authenticated;
