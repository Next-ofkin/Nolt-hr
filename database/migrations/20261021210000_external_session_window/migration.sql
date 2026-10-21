-- A guarantor session may last up to 24 hours and slide forward while the person is
-- active, never beyond the request's own expiry. The original 30-minute cap made opening
-- the link fail with a server error (the email link is single-use, so it was then "used").
-- Only the time rule and its guard change; no rows are touched.
BEGIN;
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'public."ExternalEmailSession"'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%expiresAt%createdAt%' AND conname <> 'ExternalEmailSession_window_check'
  LOOP
    EXECUTE format('ALTER TABLE public."ExternalEmailSession" DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public."ExternalEmailSession"
  ADD CONSTRAINT "ExternalEmailSession_window_check"
  CHECK ("expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + interval '8 days');

CREATE OR REPLACE FUNCTION public.protect_external_email_session() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.id,NEW."tokenHash",NEW."requestId",NEW."userId",NEW."authVersion",NEW."createdAt") IS DISTINCT FROM (OLD.id,OLD."tokenHash",OLD."requestId",OLD."userId",OLD."authVersion",OLD."createdAt")
 THEN RAISE EXCEPTION 'External email session identity is immutable'; END IF;
 -- the session may only slide later, within a day from now and within the request's own expiry
 IF TG_OP='UPDATE' AND NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt" AND NOT (
   NEW."expiresAt" > OLD."expiresAt" AND NEW."expiresAt" <= now() + interval '25 hours'
   AND OLD."revokedAt" IS NULL
   AND NEW."expiresAt" <= (SELECT r."expiresAt" FROM public."ExternalRequest" r WHERE r.id=NEW."requestId"))
 THEN RAISE EXCEPTION 'External email session expiry may only be extended'; END IF;
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
COMMIT;
