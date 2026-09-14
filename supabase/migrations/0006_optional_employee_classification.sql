-- ============================================================
-- Nolt HR — 0006: make employee classification optional
--
-- The employee-management UI no longer collects Department or
-- Employment Type at this stage. Relax the two NOT NULL constraints
-- on public.employees so the UI can leave them unset. This does not
-- drop the columns, the foreign keys, or the departments/
-- employment_types tables/seed data — it is purely additive and
-- reversible.
-- ============================================================

alter table public.employees
  alter column department_id drop not null;

alter table public.employees
  alter column employment_type_id drop not null;
