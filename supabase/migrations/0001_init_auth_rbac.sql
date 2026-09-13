-- ============================================================
-- Nolt HR — Auth + RBAC initial schema
-- Roles: admin > hr > employee
-- The [role] is stored both in profiles (source of the UI) and
-- in auth.users.raw_app_meta_data (drives the JWT role claim).
-- Run this in the Supabase SQL editor, or via `supabase db push`.
-- ============================================================

create type public.user_role as enum ('admin', 'hr', 'employee');

-- ------------------------------------------------------------
-- profiles (central identity/role table)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  role       public.user_role not null default 'employee',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email)
);

-- keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Auto-create a profile when a new auth user is created.
-- Role comes from app_metadata (admin-created users) or defaults
-- to 'employee' (self-registration).
-- ------------------------------------------------------------
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
    coalesce(new.raw_app_meta_data ->> 'role', 'employee')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_select_staff" on public.profiles;
create policy "profiles_select_staff"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'hr')
    )
  );

-- Users may edit their own full name / email, but never their role.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select role from public.profiles where id = auth.uid())
  );

-- Admins may update any profile. Role changes are handled by the
-- update_user_role() function below (definer rights), so direct
-- updates here can never change the id.
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin"
  on public.profiles for delete
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ------------------------------------------------------------
-- Admin-only functions (SECURITY DEFINER, so they can touch auth)
-- ------------------------------------------------------------

-- Create a user with a chosen role. Only an existing admin may call it.
create or replace function public.create_user_with_role(
  p_email     text,
  p_password  text,
  p_full_name text,
  p_role      text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Only admins can create users';
  end if;

  if p_role not in ('admin', 'hr', 'employee') then
    raise exception 'Invalid role';
  end if;

  select id into v_user_id
  from auth.admin_create_user(
    jsonb_build_object(
      'email',          p_email,
      'password',       p_password,
      'email_confirm',  true,
      'user_metadata',  jsonb_build_object('full_name', p_full_name),
      'app_metadata',   jsonb_build_object('role', p_role)
    )
  );

  return v_user_id;
end;
$$;

revoke all on function public.create_user_with_role from public;
grant execute on function public.create_user_with_role to authenticated;

-- Change a user's role. Only an existing admin may call it.
-- Updates both auth app_metadata (JWT role claim) and the profile.
create or replace function public.update_user_role(
  p_user_id uuid,
  p_role    text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Only admins can change roles';
  end if;

  if p_role not in ('admin', 'hr', 'employee') then
    raise exception 'Invalid role';
  end if;

  update auth.users
  set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', p_role)
  where id = p_user_id;

  update public.profiles
  set role = p_role::public.user_role
  where id = p_user_id;
end;
$$;

revoke all on function public.update_user_role from public;
grant execute on function public.update_user_role to authenticated;