-- Approval is a distinct audited decision, never inferred from a submission.
BEGIN;
ALTER TABLE public."PackAssignment"
 ADD COLUMN "approvedAt" TIMESTAMPTZ(3),
 ADD COLUMN "approvedBy" UUID REFERENCES public."User"(id) ON DELETE RESTRICT,
 ADD CONSTRAINT "PackAssignment_approval_pair" CHECK (("approvedAt" IS NULL) = ("approvedBy" IS NULL));
CREATE INDEX "PackAssignment_approvedAt_idx" ON public."PackAssignment"("approvedAt");
COMMIT;
