-- Version lineage for immutable published Pack templates.
BEGIN;
ALTER TABLE public."PackTemplate"
 ADD COLUMN "rootPackId" UUID REFERENCES public."PackTemplate"(id) ON DELETE RESTRICT,
 ADD COLUMN "versionNumber" INTEGER NOT NULL DEFAULT 1 CHECK ("versionNumber" > 0);
ALTER TABLE public."PackTemplate" ADD CONSTRAINT "PackTemplate_not_own_root"
 CHECK ("rootPackId" IS NULL OR "rootPackId" <> id);
CREATE UNIQUE INDEX "PackTemplate_root_version_unique"
 ON public."PackTemplate"("rootPackId","versionNumber") WHERE "rootPackId" IS NOT NULL;
CREATE UNIQUE INDEX "PackTemplate_one_open_family_draft"
 ON public."PackTemplate"("rootPackId") WHERE "rootPackId" IS NOT NULL AND status = 'DRAFT';
CREATE INDEX "PackTemplate_root_version_idx" ON public."PackTemplate"("rootPackId","versionNumber");
COMMIT;
