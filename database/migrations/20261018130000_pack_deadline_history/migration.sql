-- Additive, immutable history for HR Pack deadline changes.
BEGIN;
CREATE TABLE public."PackDeadlineChange" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "packAssignmentId" UUID NOT NULL REFERENCES public."PackAssignment"(id) ON DELETE RESTRICT,
  "changedBy" UUID NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
  "previousDueDate" DATE,
  "newDueDate" DATE NOT NULL,
  "reason" VARCHAR(1000) NOT NULL CHECK (length(btrim("reason")) >= 10),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX "PackDeadlineChange_packAssignmentId_createdAt_idx"
  ON public."PackDeadlineChange"("packAssignmentId","createdAt");
ALTER TABLE public."PackDeadlineChange" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."PackDeadlineChange" FROM PUBLIC;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON public."PackDeadlineChange" FROM anon,authenticated,service_role;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='nolt_app') THEN
  GRANT SELECT, INSERT ON public."PackDeadlineChange" TO nolt_app;
  GRANT UPDATE ("dueDate") ON public."PackAssignment" TO nolt_app;
  GRANT UPDATE ("dueDate") ON public."FormAssignment" TO nolt_app;
  CREATE POLICY nolt_backend_pack_deadline_history ON public."PackDeadlineChange"
    FOR ALL TO nolt_app USING (true) WITH CHECK (true);
 END IF;
END $$;
COMMIT;
