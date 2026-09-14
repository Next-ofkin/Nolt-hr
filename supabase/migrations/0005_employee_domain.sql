-- ============================================================
-- Nolt HR — 0005: employee business domain
--
-- Authentication remains in auth.users/public.profiles. Employees are
-- separate HR business records and may exist before an Auth account.
-- ============================================================

create type public.employee_status as enum (
  'DRAFT',
  'INVITED',
  'PRE_ONBOARDING',
  'HR_REVIEW',
  'READY_TO_RESUME',
  'POST_ONBOARDING',
  'COMPLETED',
  'SUSPENDED',
  'ARCHIVED'
);

-- Reuse the existing role-check helper (public.current_user_role(), defined
-- in 0003_fix_rls_recursion.sql) and the existing timestamp trigger
-- (public.set_updated_at(), defined in 0001_init_auth_rbac.sql) as-is.
-- Authentication is frozen: do not redefine either here.

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  code text check (code is null or btrim(code) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index departments_name_unique_ci
  on public.departments (lower(btrim(name)));
create unique index departments_code_unique_ci
  on public.departments (lower(btrim(code)))
  where code is not null;

create table public.employment_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index employment_types_name_unique_ci
  on public.employment_types (lower(btrim(name)));

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  first_name text not null check (btrim(first_name) <> ''),
  middle_name text check (middle_name is null or btrim(middle_name) <> ''),
  last_name text not null check (btrim(last_name) <> ''),
  work_email text not null check (
    work_email = lower(btrim(work_email))
    and position('@' in work_email) > 1
  ),
  phone text check (phone is null or btrim(phone) <> ''),
  staff_id text check (staff_id is null or btrim(staff_id) <> ''),
  job_title text check (job_title is null or btrim(job_title) <> ''),
  department_id uuid not null references public.departments (id),
  employment_type_id uuid not null references public.employment_types (id),
  start_date date,
  status public.employee_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index employees_work_email_unique_ci
  on public.employees (lower(btrim(work_email)));
create unique index employees_staff_id_unique_ci
  on public.employees (lower(btrim(staff_id)))
  where staff_id is not null;
create index employees_department_id_idx on public.employees (department_id);
create index employees_employment_type_id_idx on public.employees (employment_type_id);
create index employees_status_created_at_idx
  on public.employees (status, created_at desc);

create trigger departments_set_updated_at
  before update on public.departments
  for each row execute function public.set_updated_at();

create trigger employment_types_set_updated_at
  before update on public.employment_types
  for each row execute function public.set_updated_at();

create trigger employees_set_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

insert into public.departments (name, code)
select seed.name, seed.code
from (values
  ('Human Resources', 'HR'),
  ('Finance', 'FIN'),
  ('Operations', 'OPS'),
  ('Risk & Compliance', 'RISK'),
  ('Technology', 'TECH')
) as seed(name, code)
where not exists (
  select 1 from public.departments existing
  where lower(btrim(existing.name)) = lower(seed.name)
);

insert into public.employment_types (name)
select seed.name
from (values ('Permanent'), ('Contract'), ('Intern')) as seed(name)
where not exists (
  select 1 from public.employment_types existing
  where lower(btrim(existing.name)) = lower(seed.name)
);

alter table public.departments enable row level security;
alter table public.employment_types enable row level security;
alter table public.employees enable row level security;

create policy departments_select
  on public.departments for select
  to authenticated
  using (
    is_active
    or (select public.current_user_role()) in ('admin', 'hr')
  );

create policy departments_insert_admin
  on public.departments for insert
  to authenticated
  with check ((select public.current_user_role()) = 'admin');

create policy departments_update_admin
  on public.departments for update
  to authenticated
  using ((select public.current_user_role()) = 'admin')
  with check ((select public.current_user_role()) = 'admin');

create policy employment_types_select
  on public.employment_types for select
  to authenticated
  using (
    is_active
    or (select public.current_user_role()) in ('admin', 'hr')
  );

create policy employment_types_insert_admin
  on public.employment_types for insert
  to authenticated
  with check ((select public.current_user_role()) = 'admin');

create policy employment_types_update_admin
  on public.employment_types for update
  to authenticated
  using ((select public.current_user_role()) = 'admin')
  with check ((select public.current_user_role()) = 'admin');

create policy employees_select
  on public.employees for select
  to authenticated
  using (
    (select public.current_user_role()) in ('admin', 'hr')
    or auth_user_id = (select auth.uid())
  );

create policy employees_insert_staff
  on public.employees for insert
  to authenticated
  with check ((select public.current_user_role()) in ('admin', 'hr'));

create policy employees_update_staff
  on public.employees for update
  to authenticated
  using ((select public.current_user_role()) in ('admin', 'hr'))
  with check ((select public.current_user_role()) in ('admin', 'hr'));

-- Explicit grants keep these tables available when automatic Data API
-- exposure is disabled. Column grants prevent this phase from linking Auth
-- accounts or overriding server-managed timestamps through the browser.
revoke all on public.departments, public.employment_types, public.employees from anon;
revoke all on public.departments, public.employment_types, public.employees from authenticated;

grant select on public.departments, public.employment_types, public.employees to authenticated;
grant insert (name, code, is_active), update (name, code, is_active)
  on public.departments to authenticated;
grant insert (name, is_active), update (name, is_active)
  on public.employment_types to authenticated;
grant insert (
  first_name, middle_name, last_name, work_email, phone, staff_id,
  job_title, department_id, employment_type_id, start_date
) on public.employees to authenticated;
grant update (
  first_name, middle_name, last_name, work_email, phone, staff_id,
  job_title, department_id, employment_type_id, start_date, status
) on public.employees to authenticated;
