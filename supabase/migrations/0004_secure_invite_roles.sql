-- ============================================================
-- Nolt HR — 0004: secure invite role assignment
--
-- raw_user_meta_data is editable by the user and must never be
-- used to grant authorization. The invite Edge Function writes
-- approved roles to app_metadata and profiles with service-role
-- credentials after enforcing the caller's HR/admin permission.
-- ============================================================

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
    coalesce(new.raw_app_meta_data ->> 'role', 'employee')::public.user_role
  );
  return new;
end;
$$;
