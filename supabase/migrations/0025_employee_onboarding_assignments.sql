-- ============================================================
-- Nolt HR — 0025: employee onboarding assignments
--
-- Bridges an actual employee (public.employees) to an actual published
-- onboarding_package_versions row, and snapshots that package's items
-- into a frozen, employee-specific checklist.
--
-- Tables:
-- 1. public.employee_onboarding_assignments
-- 2. public.employee_onboarding_items
--
-- Employee ownership reuses the existing, already-hardened linkage:
-- public.employees.auth_user_id = auth.uid() (see 0005/0007). No email
-- matching, no new linkage mechanism.
--
-- Hardened security boundary (same pattern as Forms/Packages):
-- - SELECT: admin/hr via RLS, employee via the linkage above
-- - INSERT/UPDATE/DELETE: revoked from client roles (writes via RPC only)
-- - RPCs: SECURITY DEFINER with set search_path = ''
--
-- Scope: assignment + snapshot checklist only. No form-answer storage,
-- no document upload, no HR review, no notifications — later phases.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. employee_onboarding_assignments
-- ------------------------------------------------------------
create table public.employee_onboarding_assignments (
  id                             uuid primary key default gen_random_uuid(),
  employee_id                    uuid not null references public.employees(id),
  package_version_id             uuid not null references public.onboarding_package_versions(id),
  package_title_snapshot         text not null check (btrim(package_title_snapshot) <> ''),
  package_description_snapshot   text,
  package_version_number         integer not null check (package_version_number > 0),
  state                          text not null default 'assigned'
    check (state in ('assigned', 'in_progress', 'completed', 'cancelled')),
  due_date                       date,
  assigned_by                    uuid not null references auth.users(id),
  assigned_at                    timestamptz not null default now(),
  started_at                     timestamptz,
  completed_at                   timestamptz,
  cancelled_at                   timestamptz,
  cancelled_by                   uuid references auth.users(id),
  cancellation_reason            text,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now()
);

comment on table public.employee_onboarding_assignments is
  'An actual onboarding_package_versions (published) assigned to an actual employee. Snapshots package title/description/version at assignment time — never dynamically follows later package edits. Never hard-deleted; cancel instead.';

create index employee_onboarding_assignments_employee_id_idx
  on public.employee_onboarding_assignments (employee_id);
create index employee_onboarding_assignments_package_version_id_idx
  on public.employee_onboarding_assignments (package_version_id);
create index employee_onboarding_assignments_state_idx
  on public.employee_onboarding_assignments (state);
create index employee_onboarding_assignments_assigned_by_idx
  on public.employee_onboarding_assignments (assigned_by);

-- Prevent duplicate ACTIVE assignment of the same package version to the
-- same employee. An employee may still hold assignments of *different*
-- packages concurrently, and may be re-assigned the same package version
-- again later once the earlier assignment is completed or cancelled.
create unique index employee_onboarding_assignments_unique_active
  on public.employee_onboarding_assignments (employee_id, package_version_id)
  where cancelled_at is null and completed_at is null;

create trigger employee_onboarding_assignments_set_updated_at
  before update on public.employee_onboarding_assignments
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 2. employee_onboarding_items
-- ------------------------------------------------------------
create table public.employee_onboarding_items (
  id                        uuid primary key default gen_random_uuid(),
  assignment_id             uuid not null references public.employee_onboarding_assignments(id),
  source_package_item_id    uuid not null references public.onboarding_package_items(id),
  item_type                 text not null check (item_type in ('form', 'document')),
  sort_order                integer not null check (sort_order >= 0),
  required                  boolean not null,
  form_version_id           uuid references public.form_definition_versions(id),
  form_title_snapshot       text,
  form_version_number       integer,
  document_title            text,
  document_description      text,
  state                     text not null default 'not_started'
    check (state in (
      'not_started', 'in_progress', 'submitted', 'under_review',
      'changes_requested', 'approved', 'waived'
    )),
  started_at                timestamptz,
  completed_at              timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint employee_onboarding_items_type_fields
    check (
      (
        item_type = 'form'
        and form_version_id is not null
        and form_title_snapshot is not null and btrim(form_title_snapshot) <> ''
        and form_version_number is not null and form_version_number > 0
        and document_title is null
        and document_description is null
      )
      or (
        item_type = 'document'
        and form_version_id is null
        and form_title_snapshot is null
        and form_version_number is null
        and document_title is not null and btrim(document_title) <> ''
      )
    )
);

comment on table public.employee_onboarding_items is
  'Employee-specific checklist item cloned from an onboarding_package_items row at assignment time. Structure (type/order/required/form or document snapshot) is frozen; only state/timestamps change in later phases.';

create index employee_onboarding_items_assignment_id_idx
  on public.employee_onboarding_items (assignment_id);
create index employee_onboarding_items_source_package_item_id_idx
  on public.employee_onboarding_items (source_package_item_id);
create index employee_onboarding_items_form_version_id_idx
  on public.employee_onboarding_items (form_version_id) where form_version_id is not null;
create index employee_onboarding_items_state_idx
  on public.employee_onboarding_items (state);

create trigger employee_onboarding_items_set_updated_at
  before update on public.employee_onboarding_items
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 3. Database-level immutability guards
--
-- Assignment identity/snapshot fields and item snapshot/structure fields
-- must never silently change after creation, even through a privileged
-- SECURITY DEFINER path — only status/timestamp fields may move through
-- the controlled RPCs below.
-- ------------------------------------------------------------
create or replace function public.enforce_employee_onboarding_assignment_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if TG_OP = 'UPDATE' then
    if NEW.employee_id is distinct from OLD.employee_id
       or NEW.package_version_id is distinct from OLD.package_version_id
       or NEW.package_title_snapshot is distinct from OLD.package_title_snapshot
       or NEW.package_description_snapshot is distinct from OLD.package_description_snapshot
       or NEW.package_version_number is distinct from OLD.package_version_number
       or NEW.assigned_by is distinct from OLD.assigned_by
       or NEW.assigned_at is distinct from OLD.assigned_at
    then
      raise exception 'Assignment identity and snapshot fields are immutable and cannot be modified.'
        using errcode = 'P0001';
    end if;
    return NEW;
  end if;
  return NEW;
end;
$$;

create trigger check_employee_onboarding_assignment_immutability
  before update on public.employee_onboarding_assignments
  for each row execute function public.enforce_employee_onboarding_assignment_immutability();

create or replace function public.enforce_employee_onboarding_item_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if TG_OP = 'UPDATE' then
    if NEW.assignment_id is distinct from OLD.assignment_id
       or NEW.source_package_item_id is distinct from OLD.source_package_item_id
       or NEW.item_type is distinct from OLD.item_type
       or NEW.sort_order is distinct from OLD.sort_order
       or NEW.required is distinct from OLD.required
       or NEW.form_version_id is distinct from OLD.form_version_id
       or NEW.form_title_snapshot is distinct from OLD.form_title_snapshot
       or NEW.form_version_number is distinct from OLD.form_version_number
       or NEW.document_title is distinct from OLD.document_title
       or NEW.document_description is distinct from OLD.document_description
    then
      raise exception 'Checklist item snapshot fields are immutable and cannot be modified.'
        using errcode = 'P0001';
    end if;
    return NEW;
  end if;
  return NEW;
end;
$$;

create trigger check_employee_onboarding_item_immutability
  before update on public.employee_onboarding_items
  for each row execute function public.enforce_employee_onboarding_item_immutability();

-- ------------------------------------------------------------
-- 4. RLS & privileges
--
-- admin/hr: full read access to all assignments/items.
-- employee: read access ONLY to their own assignments/items, resolved
-- through employees.auth_user_id = auth.uid() — the same linkage the
-- rest of the app uses. No email matching, no second linkage mechanism.
-- anonymous: no access.
-- ------------------------------------------------------------
alter table public.employee_onboarding_assignments enable row level security;
alter table public.employee_onboarding_items enable row level security;

create policy employee_onboarding_assignments_select
  on public.employee_onboarding_assignments for select
  to authenticated
  using (
    (select public.current_user_role()) in ('admin', 'hr')
    or exists (
      select 1 from public.employees e
      where e.id = employee_onboarding_assignments.employee_id
        and e.auth_user_id = (select auth.uid())
    )
  );

create policy employee_onboarding_items_select
  on public.employee_onboarding_items for select
  to authenticated
  using (
    (select public.current_user_role()) in ('admin', 'hr')
    or exists (
      select 1
      from public.employee_onboarding_assignments a
      join public.employees e on e.id = a.employee_id
      where a.id = employee_onboarding_items.assignment_id
        and e.auth_user_id = (select auth.uid())
    )
  );

revoke all on public.employee_onboarding_assignments, public.employee_onboarding_items
  from anon, authenticated, public;
-- No insert/update/delete grant: every mutation goes through a
-- SECURITY DEFINER RPC below. SELECT is still gated by RLS above.
grant select on public.employee_onboarding_assignments, public.employee_onboarding_items to authenticated;

-- ------------------------------------------------------------
-- 5. RPC: assign_onboarding_package
--
-- Assigns an exact published onboarding_package_versions row to an
-- employee and clones its items into a frozen employee checklist.
-- Atomic: a PL/pgSQL function body without an exception handler runs as
-- part of the caller's statement, so any raised error rolls back every
-- write this function made.
-- ------------------------------------------------------------
create or replace function public.assign_onboarding_package(
  p_employee_id uuid,
  p_package_version_id uuid,
  p_due_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_role public.user_role;
  v_employee record;
  v_version record;
  v_package record;
  v_assignment_id uuid;
  v_item record;
  v_item_count integer := 0;
begin
  v_user_id := auth.uid();
  v_role := public.current_user_role();
  if v_user_id is null or v_role is null or v_role not in ('admin', 'hr') then
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHORIZED', 'error', 'Only admin or HR can assign onboarding packages.');
  end if;

  select * into v_employee from public.employees where id = p_employee_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'EMPLOYEE_NOT_FOUND', 'error', 'Employee not found.');
  end if;

  if v_employee.status = 'ARCHIVED' then
    return jsonb_build_object('ok', false, 'error_code', 'EMPLOYEE_ARCHIVED', 'error', 'This employee is archived and cannot receive a new onboarding assignment.');
  end if;

  select * into v_version
  from public.onboarding_package_versions
  where id = p_package_version_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'PACKAGE_VERSION_NOT_FOUND', 'error', 'Onboarding package version not found.');
  end if;

  if v_version.state <> 'published' then
    return jsonb_build_object('ok', false, 'error_code', 'PACKAGE_NOT_PUBLISHED', 'error', 'Only published onboarding package versions can be assigned.');
  end if;

  select * into v_package
  from public.onboarding_packages
  where id = v_version.onboarding_package_id;

  if v_package.archived_at is not null then
    return jsonb_build_object('ok', false, 'error_code', 'PACKAGE_ARCHIVED', 'error', 'This onboarding package is archived and cannot be assigned.');
  end if;

  if exists (
    select 1 from public.employee_onboarding_assignments
    where employee_id = p_employee_id
      and package_version_id = p_package_version_id
      and cancelled_at is null
      and completed_at is null
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'DUPLICATE_ACTIVE_ASSIGNMENT', 'error', 'This employee already has an active assignment for this exact package version.');
  end if;

  insert into public.employee_onboarding_assignments (
    employee_id, package_version_id, package_title_snapshot, package_description_snapshot,
    package_version_number, due_date, assigned_by
  ) values (
    p_employee_id, p_package_version_id, v_package.title, v_package.description,
    v_version.version_number, p_due_date, v_user_id
  )
  returning id into v_assignment_id;

  for v_item in
    select item.*, fdv.version_number as live_form_version_number, fd.title as live_form_title
    from public.onboarding_package_items item
    left join public.form_definition_versions fdv on fdv.id = item.form_version_id
    left join public.form_definitions fd on fd.id = fdv.form_definition_id
    where item.package_version_id = p_package_version_id
    order by item.sort_order
  loop
    insert into public.employee_onboarding_items (
      assignment_id, source_package_item_id, item_type, sort_order, required,
      form_version_id, form_title_snapshot, form_version_number,
      document_title, document_description
    ) values (
      v_assignment_id, v_item.id, v_item.item_type, v_item.sort_order, v_item.required,
      v_item.form_version_id, v_item.live_form_title, v_item.live_form_version_number,
      v_item.document_title, v_item.document_description
    );
    v_item_count := v_item_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'assignment_id', v_assignment_id,
    'employee_id', p_employee_id,
    'package_version_id', p_package_version_id,
    'package_title_snapshot', v_package.title,
    'package_version_number', v_version.version_number,
    'state', 'assigned',
    'item_count', v_item_count
  );
end;
$$;

revoke all on function public.assign_onboarding_package(uuid, uuid, date) from public, anon;
grant execute on function public.assign_onboarding_package(uuid, uuid, date) to authenticated;

-- ------------------------------------------------------------
-- 6. RPC: start_my_onboarding
--
-- Employee-initiated. Only the linked owner of the assignment's employee
-- record (or admin/hr, for support purposes) may start it. Idempotent:
-- calling it again while already in_progress just returns success.
-- ------------------------------------------------------------
create or replace function public.start_my_onboarding(
  p_assignment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_role public.user_role;
  v_assignment record;
  v_employee record;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHORIZED', 'error', 'You must be signed in to start onboarding.');
  end if;

  v_role := public.current_user_role();

  select * into v_assignment
  from public.employee_onboarding_assignments
  where id = p_assignment_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'ASSIGNMENT_NOT_FOUND', 'error', 'Onboarding assignment not found.');
  end if;

  select * into v_employee from public.employees where id = v_assignment.employee_id;

  if not (v_role in ('admin', 'hr')) and (v_employee.auth_user_id is null or v_employee.auth_user_id <> v_user_id) then
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHORIZED', 'error', 'You can only start your own onboarding assignment.');
  end if;

  if v_assignment.state = 'cancelled' then
    return jsonb_build_object('ok', false, 'error_code', 'ASSIGNMENT_CANCELLED', 'error', 'This onboarding assignment has been cancelled.');
  end if;

  if v_assignment.state = 'completed' then
    return jsonb_build_object('ok', false, 'error_code', 'ASSIGNMENT_COMPLETED', 'error', 'This onboarding assignment is already completed.');
  end if;

  if v_assignment.state = 'in_progress' then
    return jsonb_build_object('ok', true, 'assignment_id', v_assignment.id, 'state', 'in_progress', 'already_started', true);
  end if;

  update public.employee_onboarding_assignments
  set state = 'in_progress',
      started_at = now()
  where id = p_assignment_id;

  return jsonb_build_object('ok', true, 'assignment_id', p_assignment_id, 'state', 'in_progress', 'already_started', false);
end;
$$;

revoke all on function public.start_my_onboarding(uuid) from public, anon;
grant execute on function public.start_my_onboarding(uuid) to authenticated;

-- ------------------------------------------------------------
-- 7. RPC: cancel_onboarding_assignment
--
-- admin/hr only. Soft-cancel — history (assignment row and its items)
-- always remains. Idempotent on an already-cancelled assignment.
-- ------------------------------------------------------------
create or replace function public.cancel_onboarding_assignment(
  p_assignment_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_role public.user_role;
  v_assignment record;
begin
  v_user_id := auth.uid();
  v_role := public.current_user_role();
  if v_user_id is null or v_role is null or v_role not in ('admin', 'hr') then
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHORIZED', 'error', 'Only admin or HR can cancel an onboarding assignment.');
  end if;

  select * into v_assignment
  from public.employee_onboarding_assignments
  where id = p_assignment_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'ASSIGNMENT_NOT_FOUND', 'error', 'Onboarding assignment not found.');
  end if;

  if v_assignment.state = 'cancelled' then
    return jsonb_build_object('ok', true, 'assignment_id', v_assignment.id, 'already_cancelled', true);
  end if;

  if v_assignment.state = 'completed' then
    return jsonb_build_object('ok', false, 'error_code', 'ASSIGNMENT_COMPLETED', 'error', 'A completed onboarding assignment cannot be cancelled.');
  end if;

  update public.employee_onboarding_assignments
  set state = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_user_id,
      cancellation_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_assignment_id;

  return jsonb_build_object('ok', true, 'assignment_id', p_assignment_id, 'already_cancelled', false);
end;
$$;

revoke all on function public.cancel_onboarding_assignment(uuid, text) from public, anon;
grant execute on function public.cancel_onboarding_assignment(uuid, text) to authenticated;

commit;
