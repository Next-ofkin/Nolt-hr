BEGIN;
CREATE TABLE public."ExternalEmailSession" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 "tokenHash" text NOT NULL UNIQUE CHECK("tokenHash" ~ '^[a-f0-9]{64}$'),
 "requestId" uuid NOT NULL REFERENCES public."ExternalRequest"(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
 "userId" uuid NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
 "authVersion" integer NOT NULL CHECK("authVersion">0),
 "expiresAt" timestamptz(3) NOT NULL,
 "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
 "revokedAt" timestamptz(3),
 CHECK("expiresAt">"createdAt" AND "expiresAt"<="createdAt"+interval '30 minutes')
);
CREATE INDEX "ExternalEmailSession_requestId_idx" ON public."ExternalEmailSession"("requestId");
CREATE INDEX "ExternalEmailSession_userId_idx" ON public."ExternalEmailSession"("userId");
CREATE INDEX "ExternalEmailSession_expiresAt_idx" ON public."ExternalEmailSession"("expiresAt");
CREATE FUNCTION public.protect_external_email_session() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.id,NEW."tokenHash",NEW."requestId",NEW."userId",NEW."authVersion",NEW."expiresAt",NEW."createdAt") IS DISTINCT FROM (OLD.id,OLD."tokenHash",OLD."requestId",OLD."userId",OLD."authVersion",OLD."expiresAt",OLD."createdAt")
 THEN RAISE EXCEPTION 'External email session identity is immutable'; END IF;
 IF TG_OP='UPDATE' AND OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt"
 THEN RAISE EXCEPTION 'External email session revocation is irreversible'; END IF;
 IF TG_OP='INSERT' AND NOT EXISTS (
 SELECT 1 FROM public."ExternalRequest" r JOIN public."User" u ON u.id=r."respondentId"
 JOIN public."FormAssignment" a ON a.id=r."assignmentId" JOIN public."OnboardingCase" c ON c.id=a."caseId"
 WHERE r.id=NEW."requestId" AND r.state='ACTIVE' AND r."respondentId"=NEW."userId" AND r."createdBy"<>NEW."userId"
 AND r.email=lower(u.email) AND u.active AND u."authVersion"=NEW."authVersion" AND c.status='ACTIVE'
 AND NEW."expiresAt"<=r."expiresAt" AND r."expiresAt">now())
 THEN RAISE EXCEPTION 'Invalid external email session scope'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER external_email_session_guard BEFORE INSERT OR UPDATE ON public."ExternalEmailSession" FOR EACH ROW EXECUTE FUNCTION public.protect_external_email_session();
REVOKE ALL ON FUNCTION public.protect_external_email_session() FROM PUBLIC;
ALTER TABLE public."ExternalEmailSession" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."ExternalEmailSession" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON public."ExternalEmailSession" FROM anon,authenticated,service_role;
  REVOKE ALL ON FUNCTION public.protect_external_email_session() FROM anon,authenticated,service_role;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nolt_app') THEN
  GRANT SELECT,INSERT,UPDATE ON public."ExternalEmailSession" TO nolt_app;
  CREATE POLICY nolt_backend ON public."ExternalEmailSession" TO nolt_app USING(true) WITH CHECK(true);
 END IF;
END $$;
COMMIT;
