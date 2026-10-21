-- Several guarantors per form, one-step sending, and the 7-day window.
--  * ExternalRequest gets a slot (1 or 2); one open request per slot.
--  * AssignmentGuarantorRule records how many guarantors HR needs (default 1).
--  * Sending no longer needs a saved contact draft; the request carries the name and email.
--  * When a guarantor opens the link the expiry may be extended (up to 8 days from now).
-- Existing requests become slot 1. No rows are deleted or rewritten.
BEGIN;

ALTER TABLE public."ExternalRequest"
  ADD COLUMN slot SMALLINT NOT NULL DEFAULT 1 CHECK (slot BETWEEN 1 AND 2);
DROP INDEX IF EXISTS public."ExternalRequest_current_assignment";
CREATE UNIQUE INDEX "ExternalRequest_current_slot"
  ON public."ExternalRequest"("assignmentId", slot)
  WHERE state NOT IN ('REVOKED','EXPIRED','FAILED','SUBMITTED');

CREATE TABLE public."AssignmentGuarantorRule" (
  "assignmentId" UUID PRIMARY KEY REFERENCES public."FormAssignment"(id) ON DELETE RESTRICT,
  required SMALLINT NOT NULL DEFAULT 1 CHECK (required BETWEEN 1 AND 2),
  "updatedBy" UUID NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX "AssignmentGuarantorRule_updatedBy_idx" ON public."AssignmentGuarantorRule"("updatedBy");
CREATE FUNCTION public.protect_guarantor_rule() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Guarantor rules are retained'; END IF;
  IF TG_OP = 'UPDATE' AND NEW."assignmentId" <> OLD."assignmentId" THEN
    RAISE EXCEPTION 'Guarantor rule assignment is immutable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."FormAssignment" a
    JOIN public."FormVersion" v ON v.id = a."formVersionId"
    JOIN public."OnboardingCase" c ON c.id = a."caseId"
    WHERE a.id = NEW."assignmentId" AND v.recipient IN ('GUARANTOR','REFERENCE') AND c.status = 'ACTIVE'
  ) THEN RAISE EXCEPTION 'Guarantor rule needs an active guarantor or reference assignment'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_guarantor_rule() FROM PUBLIC;
CREATE TRIGGER guarantor_rule_guard BEFORE INSERT OR UPDATE OR DELETE ON public."AssignmentGuarantorRule"
  FOR EACH ROW EXECUTE FUNCTION public.protect_guarantor_rule();
ALTER TABLE public."AssignmentGuarantorRule" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."AssignmentGuarantorRule" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public."AssignmentGuarantorRule" FROM anon,authenticated,service_role;
    REVOKE ALL ON FUNCTION public.protect_guarantor_rule() FROM anon,authenticated,service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='nolt_app') THEN
    GRANT SELECT,INSERT,UPDATE ON public."AssignmentGuarantorRule" TO nolt_app;
    CREATE POLICY nolt_backend ON public."AssignmentGuarantorRule" TO nolt_app USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Same guard as before, with three changes marked (1), (2), (3).
CREATE OR REPLACE FUNCTION public.protect_external_request() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'External request history is retained'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'QUEUED' OR NEW."updatedBy"<>NEW."createdBy" OR NEW.revision<>0 OR NEW.answers<>'{}'::jsonb OR NEW."respondentId" IS NOT NULL OR NEW."expiresAt"<=NEW."createdAt"
  THEN RAISE EXCEPTION 'Invalid initial external request'; END IF;
  -- (1) no saved contact draft needed; the slot must be within what HR asked for
  IF NOT EXISTS(SELECT 1 FROM public."FormAssignment" a
   JOIN public."OnboardingCase" c ON c.id=a."caseId" JOIN public."Employee" e ON e.id=c."employeeId" JOIN public."User" u ON u.id=e."userId"
   JOIN public."FormVersion" v ON v.id=a."formVersionId"
   WHERE a.id=NEW."assignmentId"
    AND u.id=NEW."createdBy" AND u.active AND c.status='ACTIVE' AND v.recipient IN ('GUARANTOR','REFERENCE') AND NEW.email<>lower(u.email) AND NEW.email<>lower(e.email)
    AND NEW.slot <= COALESCE((SELECT r.required FROM public."AssignmentGuarantorRule" r WHERE r."assignmentId"=a.id),1))
  THEN RAISE EXCEPTION 'External request owner or slot is invalid'; END IF;
  RETURN NEW;
 END IF;
 -- (2) the slot is part of the immutable snapshot
 IF (NEW.id,NEW."assignmentId",NEW."requestKey",NEW."requestHash",NEW."contactRevision",NEW."fullName",NEW.email,NEW."createdBy",NEW."createdAt",NEW.slot)
  IS DISTINCT FROM (OLD.id,OLD."assignmentId",OLD."requestKey",OLD."requestHash",OLD."contactRevision",OLD."fullName",OLD.email,OLD."createdBy",OLD."createdAt",OLD.slot)
 THEN RAISE EXCEPTION 'External request snapshot is immutable'; END IF;
 -- (3) expiry may only move later, and only when the recipient opens the link
 IF NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt" AND NOT (
   OLD.state IN ('SENT','UNCERTAIN') AND NEW.state='ACTIVE'
   AND NEW."expiresAt" >= OLD."expiresAt" AND NEW."expiresAt" <= now() + interval '8 days')
 THEN RAISE EXCEPTION 'External request expiry is immutable'; END IF;
 IF OLD.state IN ('SUBMITTED','REVOKED','EXPIRED') THEN RAISE EXCEPTION 'External request is locked'; END IF;
 IF NEW.state IN ('ACTIVE','SUBMITTED') AND NEW."updatedBy" IS DISTINCT FROM NEW."respondentId" THEN RAISE EXCEPTION 'External response actor is invalid'; END IF;
 IF NEW.state NOT IN ('ACTIVE','SUBMITTED') AND NEW."updatedBy"<>NEW."createdBy" THEN RAISE EXCEPTION 'External request operator is invalid'; END IF;
 IF NEW."respondentId" IS DISTINCT FROM OLD."respondentId" AND NOT (OLD."respondentId" IS NULL AND NEW.state='ACTIVE' AND OLD.state IN ('SENT','UNCERTAIN')
  AND EXISTS(SELECT 1 FROM public."User" u WHERE u.id=NEW."respondentId" AND u.active AND u.role='EMPLOYEE' AND lower(u.email)=NEW.email AND u.id<>NEW."createdBy"))
 THEN RAISE EXCEPTION 'External respondent binding is invalid'; END IF;
 IF NEW.state='ACTIVE' OR NEW.state='SUBMITTED' THEN
  IF NEW."expiresAt"<=now() OR NOT EXISTS(SELECT 1 FROM public."FormAssignment" a JOIN public."OnboardingCase" c ON c.id=a."caseId" WHERE a.id=NEW."assignmentId" AND c.status='ACTIVE')
  THEN RAISE EXCEPTION 'External request is unavailable'; END IF;
 END IF;
 IF NEW.answers IS DISTINCT FROM OLD.answers OR NEW.revision<>OLD.revision THEN
  IF OLD.state<>'ACTIVE' OR NEW.state NOT IN ('ACTIVE','SUBMITTED') OR NEW.revision<>OLD.revision+1 OR NEW."respondentId" IS DISTINCT FROM OLD."respondentId"
  THEN RAISE EXCEPTION 'Invalid external response revision'; END IF;
 END IF;
 IF NEW.state='SUBMITTED' AND NOT EXISTS(SELECT 1 FROM public."ExternalSubmission" s WHERE s."requestId"=NEW.id AND s."sourceRevision"=OLD.revision AND s.answers=NEW.answers AND s."submittedBy"=NEW."respondentId")
 THEN RAISE EXCEPTION 'External submission requires immutable evidence'; END IF;
 IF NEW.state<>OLD.state AND NOT (
  NEW.state IN ('REVOKED','EXPIRED') OR
  (OLD.state='QUEUED' AND NEW.state='SENDING') OR
  (OLD.state='SENDING' AND NEW.state IN ('QUEUED','SENT','UNCERTAIN','FAILED')) OR
  (OLD.state IN ('SENT','UNCERTAIN') AND NEW.state='ACTIVE') OR
  (OLD.state='ACTIVE' AND NEW.state='SUBMITTED'))
 THEN RAISE EXCEPTION 'Invalid external request transition'; END IF;
 RETURN NEW;
END $$;
COMMIT;
