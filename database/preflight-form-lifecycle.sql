-- Read-only preflight for migration 20261015120000_form_draft_deletion_and_unpublish
-- Run using an authorised PostgreSQL administrator BEFORE any schema changes.
-- Does not modify tables, functions, grants or employee records.
SELECT current_database() AS database_name, current_user AS inspecting_role,
       current_setting('server_version') AS postgres_version;
SELECT to_regclass('public."Form"') IS NOT NULL AS forms_present,
       to_regclass('public."FormVersion"') IS NOT NULL AS versions_present,
       to_regclass('public."FormAssignment"') IS NOT NULL AS assignments_present;
SELECT COUNT(*) AS form_count FROM public."Form";
SELECT status, COUNT(*) AS versions FROM public."FormVersion" GROUP BY status ORDER BY status;
SELECT COUNT(*) AS assignment_count FROM public."FormAssignment";
SELECT p.proname, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='protect_published_form';
SELECT has_table_privilege('nolt_app', 'public."Form"', 'DELETE') AS runtime_can_delete_form,
       has_table_privilege('nolt_app', 'public."FormVersion"', 'DELETE') AS runtime_can_delete_version;
SELECT migration_name, finished_at, rolled_back_at
FROM public._prisma_migrations
WHERE migration_name = '20261015120000_form_draft_deletion_and_unpublish';
