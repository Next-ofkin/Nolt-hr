BEGIN;
CREATE TABLE public."ExternalRequest" (
 id UUID PRIMARY KEY,
 "assignmentId" UUID NOT NULL REFERENCES public."FormAssignment"(id) ON DELETE RESTRICT,
 "requestKey" UUID NOT NULL,
 "requestHash" TEXT NOT NULL,
 "contactRevision" INTEGER NOT NULL CHECK("contactRevision">0),
 "fullName" VARCHAR(160) NOT NULL,
 email VARCHAR(254) NOT NULL CHECK(email=lower(btrim(email))),
 "createdBy" UUID NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
 "updatedBy" UUID NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
 "respondentId" UUID REFERENCES public."User"(id) ON DELETE RESTRICT,
 state TEXT NOT NULL DEFAULT 'QUEUED' CHECK(state IN ('QUEUED','SENDING','SENT','UNCERTAIN','FAILED','ACTIVE','SUBMITTED','REVOKED','EXPIRED')),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 answers JSONB NOT NULL DEFAULT '{}',
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 "expiresAt" TIMESTAMPTZ(3) NOT NULL,
 "sentAt" TIMESTAMPTZ(3), "revokedAt" TIMESTAMPTZ(3), "submittedAt" TIMESTAMPTZ(3),
 UNIQUE("assignmentId","requestKey")
);
CREATE UNIQUE INDEX "ExternalRequest_current_assignment" ON public."ExternalRequest"("assignmentId") WHERE state NOT IN ('REVOKED','EXPIRED','FAILED');
CREATE INDEX "ExternalRequest_assignmentId_createdAt_idx" ON public."ExternalRequest"("assignmentId","createdAt");
CREATE INDEX "ExternalRequest_createdBy_idx" ON public."ExternalRequest"("createdBy");
CREATE INDEX "ExternalRequest_updatedBy_idx" ON public."ExternalRequest"("updatedBy");
CREATE INDEX "ExternalRequest_respondentId_idx" ON public."ExternalRequest"("respondentId");
CREATE TABLE public."ExternalDelivery" (
 "requestId" UUID PRIMARY KEY REFERENCES public."ExternalRequest"(id) ON DELETE RESTRICT,
 state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','SENDING','SENT','FAILED','UNCERTAIN','CANCELLED')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(), "leaseUntil" TIMESTAMPTZ(3), "errorCode" TEXT
);
CREATE INDEX "ExternalDelivery_state_availableAt_idx" ON public."ExternalDelivery"(state,"availableAt");
CREATE TABLE public."ExternalSubmission" (
 "requestId" UUID PRIMARY KEY REFERENCES public."ExternalRequest"(id) ON DELETE RESTRICT,
 "sourceRevision" INTEGER NOT NULL,
 "requestKey" UUID NOT NULL,
 answers JSONB NOT NULL,
 "submittedBy" UUID NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
 "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX "ExternalSubmission_submittedBy_idx" ON public."ExternalSubmission"("submittedBy");
ALTER TABLE public."Session" ADD COLUMN "externalRequestId" UUID REFERENCES public."ExternalRequest"(id) ON DELETE RESTRICT;
CREATE INDEX "Session_externalRequestId_idx" ON public."Session"("externalRequestId");

CREATE FUNCTION public.protect_external_request() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'External request history is retained'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'QUEUED' OR NEW."updatedBy"<>NEW."createdBy" OR NEW.revision<>0 OR NEW.answers<>'{}'::jsonb OR NEW."respondentId" IS NOT NULL OR NEW."expiresAt"<=NEW."createdAt"
  THEN RAISE EXCEPTION 'Invalid initial external request'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public."ExternalContactDraft" d JOIN public."FormAssignment" a ON a.id=d."assignmentId"
   JOIN public."OnboardingCase" c ON c.id=a."caseId" JOIN public."Employee" e ON e.id=c."employeeId" JOIN public."User" u ON u.id=e."userId"
   JOIN public."FormVersion" v ON v.id=a."formVersionId"
   WHERE d."assignmentId"=NEW."assignmentId" AND d.revision=NEW."contactRevision" AND d.email=NEW.email AND d."fullName"=NEW."fullName"
    AND u.id=NEW."createdBy" AND u.active AND c.status='ACTIVE' AND v.recipient IN ('GUARANTOR','REFERENCE') AND NEW.email<>lower(u.email) AND NEW.email<>lower(e.email))
  THEN RAISE EXCEPTION 'External request owner or snapshot is invalid'; END IF;
  RETURN NEW;
 END IF;
 IF (NEW.id,NEW."assignmentId",NEW."requestKey",NEW."requestHash",NEW."contactRevision",NEW."fullName",NEW.email,NEW."createdBy",NEW."createdAt",NEW."expiresAt")
  IS DISTINCT FROM (OLD.id,OLD."assignmentId",OLD."requestKey",OLD."requestHash",OLD."contactRevision",OLD."fullName",OLD.email,OLD."createdBy",OLD."createdAt",OLD."expiresAt")
 THEN RAISE EXCEPTION 'External request snapshot is immutable'; END IF;
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
CREATE TRIGGER external_request_guard BEFORE INSERT OR UPDATE OR DELETE ON public."ExternalRequest" FOR EACH ROW EXECUTE FUNCTION public.protect_external_request();
CREATE FUNCTION public.protect_external_submission() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'External submissions are immutable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public."ExternalRequest" r JOIN public."FormAssignment" a ON a.id=r."assignmentId"
  JOIN public."OnboardingCase" c ON c.id=a."caseId" WHERE r.id=NEW."requestId" AND r.state='ACTIVE' AND r."expiresAt">now()
  AND c.status='ACTIVE' AND r."respondentId"=NEW."submittedBy" AND r.revision=NEW."sourceRevision" AND r.answers=NEW.answers)
 THEN RAISE EXCEPTION 'Invalid external submission evidence'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER external_submission_guard BEFORE INSERT OR UPDATE OR DELETE ON public."ExternalSubmission" FOR EACH ROW EXECUTE FUNCTION public.protect_external_submission();
CREATE FUNCTION public.protect_external_delivery() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' OR NEW."requestId"<>OLD."requestId" THEN RAISE EXCEPTION 'External delivery identity is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER external_delivery_guard BEFORE UPDATE OR DELETE ON public."ExternalDelivery" FOR EACH ROW EXECUTE FUNCTION public.protect_external_delivery();
CREATE FUNCTION public.protect_external_session() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW."externalRequestId" IS DISTINCT FROM OLD."externalRequestId" THEN RAISE EXCEPTION 'Session scope is immutable'; END IF;
 IF TG_OP='UPDATE' AND OLD."externalRequestId" IS NOT NULL AND NEW."userId"<>OLD."userId" THEN RAISE EXCEPTION 'Session recipient is immutable'; END IF;
 IF TG_OP='INSERT' AND NEW."externalRequestId" IS NOT NULL AND (NEW."authMethod"<>'SUPABASE' OR NOT NEW."mfaVerified" OR NOT EXISTS(SELECT 1 FROM public."ExternalRequest" r WHERE r.id=NEW."externalRequestId" AND r.state='ACTIVE' AND r."respondentId"=NEW."userId" AND r."expiresAt">now()))
 THEN RAISE EXCEPTION 'Invalid external session scope'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER external_session_guard BEFORE INSERT OR UPDATE ON public."Session" FOR EACH ROW EXECUTE FUNCTION public.protect_external_session();
REVOKE ALL ON FUNCTION public.protect_external_request(),public.protect_external_submission(),public.protect_external_session(),public.protect_external_delivery() FROM PUBLIC;
ALTER TABLE public."ExternalRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ExternalDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ExternalSubmission" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."ExternalRequest",public."ExternalDelivery",public."ExternalSubmission" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON public."ExternalRequest",public."ExternalDelivery",public."ExternalSubmission" FROM anon,authenticated,service_role;
  REVOKE ALL ON FUNCTION public.protect_external_request(),public.protect_external_submission(),public.protect_external_session(),public.protect_external_delivery() FROM anon,authenticated,service_role;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nolt_app') THEN
  GRANT SELECT,INSERT,UPDATE ON public."ExternalRequest",public."ExternalDelivery" TO nolt_app;
  GRANT SELECT,INSERT ON public."ExternalSubmission" TO nolt_app;
  CREATE POLICY nolt_backend ON public."ExternalRequest" TO nolt_app USING(true) WITH CHECK(true);
  CREATE POLICY nolt_backend ON public."ExternalDelivery" TO nolt_app USING(true) WITH CHECK(true);
  CREATE POLICY nolt_backend ON public."ExternalSubmission" TO nolt_app USING(true) WITH CHECK(true);
 END IF;
END $$;
COMMIT;
