-- Hosting-specific defaults, separate from the portable Prisma application schema.
-- Keep the platform's RLS event trigger; it does not need public RPC privileges.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
