-- Forms and packs are soft-deleted: hidden from lists and from new assignments, while
-- everything already sent to or filled in by an employee keeps its form and history.
-- Only two nullable columns are added to each table; no rows are changed.
BEGIN;
ALTER TABLE public."Form" ADD COLUMN IF NOT EXISTS "deletedAt" timestamptz(3), ADD COLUMN IF NOT EXISTS "deletedBy" uuid;
ALTER TABLE public."PackTemplate" ADD COLUMN IF NOT EXISTS "deletedAt" timestamptz(3), ADD COLUMN IF NOT EXISTS "deletedBy" uuid;
CREATE INDEX IF NOT EXISTS "Form_deletedAt_idx" ON public."Form" ("deletedAt");
CREATE INDEX IF NOT EXISTS "PackTemplate_deletedAt_idx" ON public."PackTemplate" ("deletedAt");
COMMIT;
