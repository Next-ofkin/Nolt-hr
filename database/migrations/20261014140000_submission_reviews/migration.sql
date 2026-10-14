BEGIN;

-- 1. Create SubmissionReview table
CREATE TABLE public."SubmissionReview" (
  id UUID PRIMARY KEY,
  "submissionId" UUID NOT NULL UNIQUE REFERENCES public."FormSubmission"(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK(decision IN ('APPROVED','CHANGES_REQUIRED')),
  reason TEXT CHECK(decision='APPROVED' OR (reason IS NOT NULL AND length(trim(reason)) > 0 AND length(reason) <= 2000)),
  "reviewedBy" UUID NOT NULL,
  "reviewedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX "SubmissionReview_reviewedBy_reviewedAt_idx" ON public."SubmissionReview"("reviewedBy","reviewedAt");

-- 2. Update EmployeeResponse status check constraint
ALTER TABLE public."EmployeeResponse" DROP CONSTRAINT IF EXISTS "EmployeeResponse_status_check";
ALTER TABLE public."EmployeeResponse" ADD CONSTRAINT "EmployeeResponse_status_check" CHECK(status IN ('DRAFT','SUBMITTED','CHANGES_REQUIRED','APPROVED'));

-- 3. Review immutability and actor guard
CREATE FUNCTION public.protect_submission_review() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Review decisions are immutable'; END IF;
 IF NOT EXISTS(
   SELECT 1 FROM public."User" u
   WHERE u.id = NEW."reviewedBy" AND u.active AND u.role IN ('HR', 'SYSTEM_ADMIN')
 ) THEN
   RAISE EXCEPTION 'Reviewer is not authorized';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER submission_review_guard BEFORE INSERT OR UPDATE OR DELETE ON public."SubmissionReview" FOR EACH ROW EXECUTE FUNCTION public.protect_submission_review();

-- 4. Update protect_employee_response trigger
CREATE OR REPLACE FUNCTION public.protect_employee_response() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
 is_hr BOOLEAN;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Response history cannot be deleted'; END IF;

 IF OLD.status='APPROVED' THEN
  RAISE EXCEPTION 'Approved responses are locked and cannot be modified';
 END IF;

 IF NEW."assignmentId"<>OLD."assignmentId" OR NEW.revision<>OLD.revision+1 THEN
  RAISE EXCEPTION 'Response changed or has invalid revision sequence';
 END IF;

 -- Check whether actor is authorized HR
 SELECT EXISTS(SELECT 1 FROM public."User" u WHERE u.id=NEW."updatedBy" AND u.active AND u.role IN ('HR','SYSTEM_ADMIN')) INTO is_hr;

 IF is_hr THEN
  -- HR can only transition SUBMITTED -> APPROVED or SUBMITTED -> CHANGES_REQUIRED
  IF OLD.status<>'SUBMITTED' OR (NEW.status<>'APPROVED' AND NEW.status<>'CHANGES_REQUIRED') THEN
   RAISE EXCEPTION 'Invalid HR response transition';
  END IF;
  -- Answers cannot be altered by HR
  IF NEW.answers<>OLD.answers THEN
   RAISE EXCEPTION 'HR cannot modify employee answers';
  END IF;
  -- Review decision evidence must exist
  IF NEW.status='APPROVED' AND NOT EXISTS(
   SELECT 1 FROM public."SubmissionReview" r
   JOIN public."FormSubmission" s ON s.id=r."submissionId"
   WHERE s."assignmentId"=NEW."assignmentId" AND r.decision='APPROVED' AND r."reviewedBy"=NEW."updatedBy"
  ) THEN
   RAISE EXCEPTION 'Approved response requires review decision evidence';
  END IF;
  IF NEW.status='CHANGES_REQUIRED' AND NOT EXISTS(
   SELECT 1 FROM public."SubmissionReview" r
   JOIN public."FormSubmission" s ON s.id=r."submissionId"
   WHERE s."assignmentId"=NEW."assignmentId" AND r.decision='CHANGES_REQUIRED' AND r."reviewedBy"=NEW."updatedBy"
  ) THEN
   RAISE EXCEPTION 'Changes-required response requires review decision evidence';
  END IF;
 ELSE
  -- Employee transitions:
  IF OLD.status='SUBMITTED' THEN
   RAISE EXCEPTION 'Submitted responses are awaiting HR review and cannot be edited';
  END IF;

  -- Verify employee ownership and active assignment
  IF NOT EXISTS(
   SELECT 1 FROM public."FormAssignment" a
   JOIN public."OnboardingCase" c ON c.id=a."caseId"
   JOIN public."Employee" e ON e.id=c."employeeId"
   JOIN public."FormVersion" v ON v.id=a."formVersionId"
   WHERE a.id=NEW."assignmentId" AND e."userId"=NEW."updatedBy" AND c.status='ACTIVE' AND v.recipient='EMPLOYEE'
  ) THEN
   RAISE EXCEPTION 'Response actor or assignment is invalid';
  END IF;

  IF NEW.status='SUBMITTED' THEN
   IF NOT EXISTS(
    SELECT 1 FROM public."FormSubmission" s
    WHERE s."assignmentId"=NEW."assignmentId" AND s.answers=NEW.answers AND s."submittedBy"=NEW."updatedBy" AND s."sourceRevision"=NEW.revision-1
   ) THEN
    RAISE EXCEPTION 'Submitted response requires immutable evidence';
   END IF;
  ELSIF NEW.status<>'DRAFT' AND NEW.status<>'CHANGES_REQUIRED' THEN
   RAISE EXCEPTION 'Invalid employee response status';
  END IF;
 END IF;

 RETURN NEW;
END $$;

-- 5. Update protect_form_submission trigger
CREATE OR REPLACE FUNCTION public.protect_form_submission() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Submitted responses are immutable'; END IF;
 IF NOT EXISTS(
   SELECT 1 FROM public."FormAssignment" a
   JOIN public."OnboardingCase" c ON c.id=a."caseId"
   JOIN public."Employee" e ON e.id=c."employeeId"
   JOIN public."FormVersion" v ON v.id=a."formVersionId"
   WHERE a.id=NEW."assignmentId" AND e."userId"=NEW."submittedBy" AND c.status='ACTIVE' AND v.recipient='EMPLOYEE'
 ) THEN
   RAISE EXCEPTION 'Submission actor or assignment is invalid';
 END IF;
 IF NEW.version > 1 THEN
  IF NOT EXISTS(
   SELECT 1 FROM public."FormSubmission" prev
   JOIN public."SubmissionReview" r ON r."submissionId"=prev.id
   WHERE prev."assignmentId"=NEW."assignmentId" AND prev.version=NEW.version-1 AND r.decision='CHANGES_REQUIRED'
  ) THEN
   RAISE EXCEPTION 'Resubmission requires preceding submission with changes-required decision';
  END IF;
 END IF;
 RETURN NEW;
END $$;

-- 6. Permissions and RLS
REVOKE ALL ON FUNCTION public.protect_submission_review() FROM PUBLIC;
ALTER TABLE public."SubmissionReview" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."SubmissionReview" FROM PUBLIC;

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON public."SubmissionReview" FROM anon,authenticated,service_role;
  REVOKE ALL ON FUNCTION public.protect_submission_review() FROM anon,authenticated,service_role;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nolt_app') THEN
  GRANT SELECT,INSERT ON public."SubmissionReview" TO nolt_app;
  CREATE POLICY nolt_backend ON public."SubmissionReview" TO nolt_app USING(true) WITH CHECK(true);
 END IF;
END $$;

COMMIT;
