-- ============================================================
-- Nolt HR — 0002: email invites (admin + hr)
--
-- Replaces password-based user creation (create_user_with_role)
-- with email invites. Invites are sent by the `invite-user`
-- Edge Function, which uses the Auth Admin API
-- (admin.inviteUserByEmail) and enforces that only admins and
-- HR can invite, and that HR can only invite employees.
-- ============================================================

-- The old admin RPC is no longer used (its grant dies with it).
drop function if exists public.create_user_with_role(text, text, text, text);

-- Invited users arrive via the admin API, which stores their
-- chosen role in user_metadata (raw_user_meta_data). Accept the
-- role from either app_metadata (JWT role claim) or user_metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce(
      new.raw_app_meta_data  ->> 'role',
      new.raw_user_meta_data ->> 'role',
      'employee'
    )::public.user_role
  );
  return new;
end;
$$;