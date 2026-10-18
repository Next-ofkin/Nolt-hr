-- Additive pack assignment records; no existing onboarding records are modified.
BEGIN;
CREATE TABLE public."PackAssignment" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 "packId" UUID NOT NULL REFERENCES public."PackTemplate"(id) ON DELETE RESTRICT,
 "caseId" UUID NOT NULL REFERENCES public."OnboardingCase"(id) ON DELETE RESTRICT,
 "assignedBy" UUID NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
 "dueDate" DATE,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 CONSTRAINT "PackAssignment_pack_case_unique" UNIQUE ("packId","caseId")
);
CREATE TABLE public."PackAssignmentForm" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 "packAssignmentId" UUID NOT NULL REFERENCES public."PackAssignment"(id) ON DELETE RESTRICT,
 "formAssignmentId" UUID NOT NULL UNIQUE REFERENCES public."FormAssignment"(id) ON DELETE RESTRICT,
 "position" INTEGER NOT NULL CHECK ("position" >= 0),
 CONSTRAINT "PackAssignmentForm_position_unique" UNIQUE ("packAssignmentId","position")
);
CREATE INDEX "PackAssignment_caseId_idx" ON public."PackAssignment"("caseId");
ALTER TABLE public."PackAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PackAssignmentForm" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."PackAssignment",public."PackAssignmentForm" FROM PUBLIC;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON public."PackAssignment",public."PackAssignmentForm" FROM anon,authenticated,service_role;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='nolt_app') THEN
  GRANT SELECT,INSERT ON public."PackAssignment",public."PackAssignmentForm" TO nolt_app;
  CREATE POLICY nolt_backend_pack_assignments ON public."PackAssignment"
   FOR ALL TO nolt_app USING (true) WITH CHECK (true);
  CREATE POLICY nolt_backend_pack_assignment_forms ON public."PackAssignmentForm"
   FOR ALL TO nolt_app USING (true) WITH CHECK (true);
 END IF;
END $$;
COMMIT;
