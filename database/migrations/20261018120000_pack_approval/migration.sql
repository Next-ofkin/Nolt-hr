-- Approval is a distinct audited decision, never inferred from a submission.
BEGIN;
ALTER TABLE public."PackAssignment"
 ADD COLUMN "approvedAt" TIMESTAMPTZ(3),
 ADD COLUMN "approvedBy" UUID REFERENCES public."User"(id) ON DELETE RESTRICT,
 ADD CONSTRAINT "PackAssignment_approval_pair" CHECK (("approvedAt" IS NULL) = ("approvedBy" IS NULL));
DO $tag$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nolt_app') THEN
  GRANT UPDATE ("approvedAt", "approvedBy") ON public."PackAssignment" TO nolt_app;
 END IF;
END $tag$;
CREATE INDEX "PackAssignment_approvedAt_idx" ON public."PackAssignment"("approvedAt");
COMMIT;
