-- Pack templates and immutable published form version references.
-- Additive only: no existing employee/form/auth rows are rewritten.
BEGIN;
CREATE TABLE public."PackTemplate" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 "name" VARCHAR(160) NOT NULL,
 "description" TEXT NOT NULL DEFAULT '',
 "employmentType" VARCHAR(80) NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT','PUBLISHED','WITHDRAWN')),
 "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
 "createdBy" UUID NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 "publishedAt" TIMESTAMPTZ(3)
);
CREATE TABLE public."PackItem" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 "packId" UUID NOT NULL REFERENCES public."PackTemplate"(id) ON DELETE RESTRICT,
 "formId" UUID NOT NULL REFERENCES public."Form"(id) ON DELETE RESTRICT,
 "formVersionId" UUID NOT NULL,
 "required" BOOLEAN NOT NULL DEFAULT true,
 "position" INTEGER NOT NULL CHECK ("position" >= 0),
 CONSTRAINT "PackItem_version_form_fkey" FOREIGN KEY ("formVersionId","formId")
 REFERENCES public."FormVersion"("id","formId") ON DELETE RESTRICT,
 CONSTRAINT "PackItem_pack_form_key" UNIQUE ("packId","formId"),
 CONSTRAINT "PackItem_pack_version_key" UNIQUE ("packId","formVersionId"),
 CONSTRAINT "PackItem_pack_position_key" UNIQUE ("packId","position")
);
CREATE INDEX "PackTemplate_status_employmentType_idx" ON public."PackTemplate"("status","employmentType");
CREATE INDEX "PackTemplate_createdAt_idx" ON public."PackTemplate"("createdAt");
CREATE INDEX "PackItem_formVersionId_idx" ON public."PackItem"("formVersionId");
ALTER TABLE public."PackTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PackItem" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."PackTemplate",public."PackItem" FROM PUBLIC;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON public."PackTemplate",public."PackItem" FROM anon,authenticated,service_role;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='nolt_app') THEN
  GRANT SELECT,INSERT,UPDATE ON public."PackTemplate" TO nolt_app;
  GRANT SELECT,INSERT ON public."PackItem" TO nolt_app;
  CREATE POLICY nolt_backend_pack_templates ON public."PackTemplate"
    FOR ALL TO nolt_app USING (true) WITH CHECK (true);
  CREATE POLICY nolt_backend_pack_items ON public."PackItem"
    FOR ALL TO nolt_app USING (true) WITH CHECK (true);
 END IF;
END $$;
COMMIT;
