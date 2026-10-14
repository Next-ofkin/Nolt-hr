BEGIN;
ALTER TABLE public."SubmissionReview" ADD CONSTRAINT "SubmissionReview_reviewedBy_fkey" FOREIGN KEY("reviewedBy") REFERENCES public."User"(id) ON DELETE RESTRICT;
CREATE TABLE public."AssignmentReviewAccess" (
 "assignmentId" UUID PRIMARY KEY REFERENCES public."FormAssignment"(id) ON DELETE RESTRICT,
 "reviewerId" UUID NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
 sensitivity TEXT NOT NULL CHECK(sensitivity IN ('GENERAL','HEALTH','FINANCIAL','HEALTH_FINANCIAL')),
 "grantedBy" UUID NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX "AssignmentReviewAccess_reviewerId_createdAt_idx" ON public."AssignmentReviewAccess"("reviewerId","createdAt");
CREATE INDEX "AssignmentReviewAccess_grantedBy_idx" ON public."AssignmentReviewAccess"("grantedBy");
CREATE FUNCTION public.protect_review_access() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Review assignments are immutable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public."FormAssignment" a JOIN public."OnboardingCase" c ON c.id=a."caseId"
 JOIN public."FormVersion" v ON v.id=a."formVersionId" JOIN public."User" g ON g.id=NEW."grantedBy"
 WHERE a.id=NEW."assignmentId" AND c."createdBy"=g.id AND g.role='HR' AND g.active AND c.status='ACTIVE' AND v.recipient='EMPLOYEE')
 THEN RAISE EXCEPTION 'Only the active case owner may assign review access'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public."User" u WHERE u.id=NEW."reviewerId" AND u.active AND u.role IN ('HR','HR_REVIEWER'))
 THEN RAISE EXCEPTION 'A review-capable account is required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER review_access_guard BEFORE INSERT OR UPDATE OR DELETE ON public."AssignmentReviewAccess" FOR EACH ROW EXECUTE FUNCTION public.protect_review_access();
-- Invoker-only helper: runtime already has SELECT; this confers no additional privileges.
CREATE FUNCTION public.can_review_assignment(p_user UUID,p_assignment UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public."AssignmentReviewAccess" r JOIN public."User" u ON u.id=r."reviewerId"
 WHERE r."assignmentId"=p_assignment AND u.id=p_user AND u.active AND u.role IN ('HR','HR_REVIEWER')
 AND (r.sensitivity NOT IN ('HEALTH','HEALTH_FINANCIAL') OR 'health.read'=ANY(u.permissions))
 AND (r.sensitivity NOT IN ('FINANCIAL','HEALTH_FINANCIAL') OR 'finance.read'=ANY(u.permissions)))
$$;
CREATE OR REPLACE FUNCTION public.protect_submission_review() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a_id UUID; latest_id UUID;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Review decisions are immutable'; END IF;
 SELECT s."assignmentId" INTO a_id FROM public."FormSubmission" s WHERE s.id=NEW."submissionId";
 -- Match the service's case -> response lock order, and serialize closure/review.
 PERFORM c.id FROM public."OnboardingCase" c JOIN public."FormAssignment" a ON a."caseId"=c.id WHERE a.id=a_id FOR UPDATE OF c;
 IF NOT public.can_review_assignment(NEW."reviewedBy",a_id) THEN RAISE EXCEPTION 'Reviewer is not authorized'; END IF;
 SELECT s.id INTO latest_id FROM public."FormSubmission" s WHERE s."assignmentId"=a_id ORDER BY s.version DESC LIMIT 1;
 IF latest_id IS DISTINCT FROM NEW."submissionId" OR NOT EXISTS(
 SELECT 1 FROM public."FormAssignment" a JOIN public."OnboardingCase" c ON c.id=a."caseId" JOIN public."EmployeeResponse" e ON e."assignmentId"=a.id
 WHERE a.id=a_id AND c.status='ACTIVE' AND e.status='SUBMITTED')
 THEN RAISE EXCEPTION 'Only the latest pending submission in an active case can be reviewed'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.protect_employee_response() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE employee_actor BOOLEAN; latest_id UUID;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Response history cannot be deleted'; END IF;
 IF TG_OP='UPDATE' AND (OLD.status='APPROVED' OR NEW."assignmentId"<>OLD."assignmentId" OR NEW.revision<>OLD.revision+1)
 THEN RAISE EXCEPTION 'Response changed, was approved, or has an invalid revision'; END IF;
 IF TG_OP='INSERT' AND (NEW.revision<>1 OR NEW.status NOT IN ('DRAFT','SUBMITTED'))
 THEN RAISE EXCEPTION 'Invalid initial response'; END IF;
 SELECT EXISTS(SELECT 1 FROM public."FormAssignment" a JOIN public."OnboardingCase" c ON c.id=a."caseId"
 JOIN public."Employee" e ON e.id=c."employeeId" JOIN public."FormVersion" v ON v.id=a."formVersionId"
 WHERE a.id=NEW."assignmentId" AND e."userId"=NEW."updatedBy" AND c.status='ACTIVE' AND v.recipient='EMPLOYEE') INTO employee_actor;
 IF employee_actor THEN
  IF TG_OP='UPDATE' AND OLD.status IN ('SUBMITTED','APPROVED') THEN RAISE EXCEPTION 'Submitted responses are locked awaiting review'; END IF;
  IF NEW.status='SUBMITTED' THEN
   SELECT s.id INTO latest_id FROM public."FormSubmission" s WHERE s."assignmentId"=NEW."assignmentId" ORDER BY s.version DESC LIMIT 1;
   IF NOT EXISTS(SELECT 1 FROM public."FormSubmission" s WHERE s.id=latest_id AND s.answers=NEW.answers AND s."submittedBy"=NEW."updatedBy" AND s."sourceRevision"=NEW.revision-1)
   THEN RAISE EXCEPTION 'Submitted response requires immutable evidence'; END IF;
  ELSIF NEW.status NOT IN ('DRAFT','CHANGES_REQUIRED') OR (NEW.status='CHANGES_REQUIRED' AND (TG_OP='INSERT' OR OLD.status<>'CHANGES_REQUIRED'))
  THEN RAISE EXCEPTION 'Invalid employee response transition'; END IF;
 ELSE
  IF TG_OP<>'UPDATE' OR NOT public.can_review_assignment(NEW."updatedBy",NEW."assignmentId")
  THEN RAISE EXCEPTION 'Response actor or assignment is invalid'; END IF;
  IF OLD.status<>'SUBMITTED' OR NEW.status NOT IN ('APPROVED','CHANGES_REQUIRED') OR NEW.answers IS DISTINCT FROM OLD.answers
  THEN RAISE EXCEPTION 'Invalid reviewer response transition'; END IF;
  SELECT s.id INTO latest_id FROM public."FormSubmission" s WHERE s."assignmentId"=NEW."assignmentId" ORDER BY s.version DESC LIMIT 1;
  IF NOT EXISTS(SELECT 1 FROM public."SubmissionReview" r JOIN public."FormAssignment" a ON a.id=NEW."assignmentId"
  JOIN public."OnboardingCase" c ON c.id=a."caseId" WHERE r."submissionId"=latest_id AND r."reviewedBy"=NEW."updatedBy" AND r.decision=NEW.status AND c.status='ACTIVE')
  THEN RAISE EXCEPTION 'Response transition requires review of the exact latest submission'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_review_access(),public.can_review_assignment(UUID,UUID) FROM PUBLIC;
ALTER TABLE public."AssignmentReviewAccess" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."AssignmentReviewAccess" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON public."AssignmentReviewAccess" FROM anon,authenticated,service_role;
  REVOKE ALL ON FUNCTION public.protect_review_access(),public.can_review_assignment(UUID,UUID) FROM anon,authenticated,service_role;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nolt_app') THEN
  GRANT SELECT,INSERT ON public."AssignmentReviewAccess" TO nolt_app;
  GRANT EXECUTE ON FUNCTION public.can_review_assignment(UUID,UUID) TO nolt_app;
  CREATE POLICY nolt_backend ON public."AssignmentReviewAccess" TO nolt_app USING(true) WITH CHECK(true);
 END IF;
END $$;
COMMIT;
