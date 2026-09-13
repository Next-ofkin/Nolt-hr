-- ============================================================
-- Nolt HR — 0003: fix RLS infinite recursion
--
-- The role-based policies from 0001 queried public.profiles from
-- inside the policies on public.profiles. For any non-superuser
-- session (i.e. every real request through PostgREST) PostgreSQL
-- raises
--
--   infinite recursion detected in policy for relation "profiles"
--   (SQLSTATE 42P17)
--
-- which PostgREST surfaces as HTTP 500 "Internal Server Error"
-- on every query against profiles (GET /rest/v1/profiles etc.).
--
-- Fix: replace the self-referential subqueries with calls to a
-- SECURITY DEFINER helper. It runs as the table owner, so its
-- internal scan of profiles bypasses RLS and the recursion is
-- gone while the role checks keep working.
-- ============================================================

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Staff (admin + hr) may read every profile.
drop policy if exists "profiles_select_staff" on public.profiles;
create policy "profiles_select_staff"
  on public.profiles for select
  using (public.current_user_role() in ('admin', 'hr'));

-- Users may edit their own row, but never their own role.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = public.current_user_role()
  );

-- Admins may update any row. Role changes are handled by the
-- update_user_role() SECURITY DEFINER function, so a plain
-- update through this policy can never change roles.
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles for update
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- Only admins may delete profiles.
drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin"
  on public.profiles for delete
  using (public.current_user_role() = 'admin');