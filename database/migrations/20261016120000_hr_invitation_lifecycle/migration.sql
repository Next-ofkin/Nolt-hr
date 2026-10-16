-- Prepare delivery and one-time MFA-verified acceptance without enabling either action.
-- Additive migration. Existing drafts and all User roles are left unchanged.
BEGIN;
ALTER TABLE public."AuthFlow" DROP CONSTRAINT "AuthFlow_kind_check";
ALTER TABLE public."AuthFlow" ADD CONSTRAINT "AuthFlow_kind_check"
 CHECK(kind IN ('EMAIL_SIGNUP','EMAIL_RECOVERY','MFA','RECOVERY','INVITATION','EXTERNAL','HR_INVITATION'));
ALTER TABLE public."AuthFlow" ADD COLUMN "hrPasswordConfirmedAt" TIMESTAMPTZ(3), ADD COLUMN "hrInvitationId" UUID, ADD COLUMN "hrSubject" UUID;
ALTER TABLE public."AuthFlow" ADD CONSTRAINT "AuthFlow_hr_password_binding_check"
 CHECK ("hrPasswordConfirmedAt" IS NULL OR (kind = 'HR_INVITATION' AND "hrInvitationId" IS NOT NULL AND "hrSubject" IS NOT NULL));
ALTER TABLE public."HrInvitation"
  ADD COLUMN "requestKey" UUID,
  ADD COLUMN "expiresAt" TIMESTAMPTZ(3),
  ADD COLUMN "sentAt" TIMESTAMPTZ(3),
  ADD COLUMN "acceptedAt" TIMESTAMPTZ(3),
  ADD COLUMN "acceptedBy" UUID REFERENCES public."User"(id) ON DELETE RESTRICT,
  ADD COLUMN "providerSubject" UUID,
  ADD COLUMN "creationSecretHash" TEXT,
  ADD COLUMN "creationSubject" UUID,
  ADD COLUMN "deliveryAttempts" INTEGER NOT NULL DEFAULT 0 CHECK ("deliveryAttempts" >= 0 AND "deliveryAttempts" <= 5),
  ADD COLUMN "deliveryError" TEXT;
ALTER TABLE public."HrInvitation" DROP CONSTRAINT "HrInvitation_state_check";
ALTER TABLE public."HrInvitation"
  ADD CONSTRAINT "HrInvitation_state_check"
    CHECK ("state" IN ('DRAFT','QUEUED','SENDING','SENT','UNCERTAIN','FAILED','EXPIRED','ACCEPTED','REVOKED'));
ALTER TABLE public."HrInvitation" DROP CONSTRAINT "HrInvitation_revocation_consistency";
ALTER TABLE public."HrInvitation"
  ADD CONSTRAINT "HrInvitation_revocation_consistency"
    CHECK (("state"='REVOKED') = ("revokedAt" IS NOT NULL));
ALTER TABLE public."HrInvitation"
  ADD CONSTRAINT "HrInvitation_acceptance_consistency"
    CHECK (("state"='ACCEPTED') = ("acceptedAt" IS NOT NULL)
      AND ("state"='ACCEPTED') = ("acceptedBy" IS NOT NULL)
      AND ("state"<>'ACCEPTED' OR "providerSubject" IS NOT NULL));
ALTER TABLE public."HrInvitation"
  ADD CONSTRAINT "HrInvitation_send_requires_expiry"
    CHECK ("state" IN ('DRAFT','REVOKED') OR "expiresAt" IS NOT NULL);
DROP INDEX public."HrInvitation_one_active_draft_per_email";
CREATE UNIQUE INDEX "HrInvitation_one_active_pending_per_email" ON public."HrInvitation"(email) WHERE state IN ('DRAFT','QUEUED','SENDING','SENT','UNCERTAIN');
CREATE UNIQUE INDEX "HrInvitation_requestKey_unique" ON public."HrInvitation"("requestKey") WHERE "requestKey" IS NOT NULL;
CREATE UNIQUE INDEX "HrInvitation_creationSubject_unique" ON public."HrInvitation"("creationSubject") WHERE "creationSubject" IS NOT NULL;
CREATE UNIQUE INDEX "HrInvitation_providerSubject_unique" ON public."HrInvitation"("providerSubject") WHERE "providerSubject" IS NOT NULL;
ALTER TABLE public."HrInvitation" ADD CONSTRAINT "HrInvitation_creation_proof_consistency"
  CHECK ("creationSubject" IS NULL OR "creationSecretHash" IS NOT NULL);
CREATE INDEX "HrInvitation_state_expiresAt_idx" ON public."HrInvitation"("state","expiresAt");
-- Revoked and accepted invitations may never be reactivated.
CREATE OR REPLACE FUNCTION nolt_private.prevent_hr_invitation_reactivation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF OLD.state IN ('REVOKED','ACCEPTED') AND NEW.state <> OLD.state THEN
    RAISE EXCEPTION 'Terminal HR invitation state cannot be changed';
  END IF;
  IF OLD."createdBy" IS DISTINCT FROM NEW."createdBy"
     OR OLD.email IS DISTINCT FROM NEW.email
     OR OLD.name IS DISTINCT FROM NEW.name
     OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'HR invitation identity fields are immutable';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION nolt_private.prevent_hr_invitation_reactivation() FROM PUBLIC;
CREATE TRIGGER nolt_hr_invitation_terminal_state
BEFORE UPDATE ON public."HrInvitation" FOR EACH ROW
EXECUTE FUNCTION nolt_private.prevent_hr_invitation_reactivation();
-- Internal activation boundary. Do not expose as a PostgREST RPC or GRANT EXECUTE
-- until the API acceptance handler completes independent provider MFA verification.
CREATE OR REPLACE FUNCTION nolt_private.accept_hr_invitation(
  p_invitation UUID, p_subject UUID, p_flow UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $hr_accept$
DECLARE invited public."HrInvitation"%ROWTYPE;
DECLARE linked_count INT;
DECLARE flow_count INT;
BEGIN
  SELECT * INTO invited FROM public."HrInvitation"
    WHERE id=p_invitation FOR UPDATE;
  IF NOT FOUND OR invited.state NOT IN ('SENT','UNCERTAIN')
     OR invited."expiresAt" IS NULL OR invited."expiresAt" <= now()
     OR invited."revokedAt" IS NOT NULL
     OR invited."creationSubject" IS DISTINCT FROM p_subject
     OR invited."providerSubject" IS DISTINCT FROM p_subject
     OR invited."creationSecretHash" IS NULL THEN
    RETURN FALSE;
  END IF;
  -- Auth, identity, email and employee checks are re-read inside the same transaction.
  SELECT count(*) INTO linked_count
  FROM public."User" u
  JOIN public."Identity" i ON i."userId"=u.id
  JOIN auth.users au ON au.id=u.id
  WHERE u.id=p_subject AND u.email=invited.email AND u.role='EMPLOYEE'
    AND u.active AND u.permissions=ARRAY[]::text[]
    AND u."authVersion"=1
    AND i.subject=p_subject::text
    AND i.issuer='https://llslubzdkdnvhbatmfug.supabase.co/auth/v1'
    AND au.email_confirmed_at IS NOT NULL AND lower(au.email)=invited.email
    AND NOT EXISTS(SELECT 1 FROM public."Employee" e WHERE e."userId"=u.id OR e.email=u.email);
  IF linked_count <> 1 THEN RETURN FALSE; END IF;
  -- Only a database-confirmed password step for this exact unexpired HR flow
  -- may unlock the owner-only activation operation. Browser claims are irrelevant.
  SELECT count(*) INTO flow_count FROM public."AuthFlow" af
    WHERE af.id=p_flow AND af.kind='HR_INVITATION'
      AND af."hrInvitationId"=p_invitation AND af."hrSubject"=p_subject
      AND af."expiresAt" > now() AND af."hrPasswordConfirmedAt" IS NOT NULL;
  IF flow_count <> 1 THEN RETURN FALSE; END IF;
  -- Confirmation must follow identity creation and precede invitation expiry.
  IF NOT EXISTS (
    SELECT 1 FROM public."AuthFlow" af
    WHERE af.id=p_flow AND af."hrPasswordConfirmedAt" >= af."createdAt"
      AND af."hrPasswordConfirmedAt" < af."expiresAt"
      AND af."hrPasswordConfirmedAt" <= now()
  ) THEN RETURN FALSE; END IF;
  -- Existing sessions for the pre-activation role must not survive promotion.
  DELETE FROM public."AuthFlow" WHERE id=p_flow AND kind='HR_INVITATION'
    AND "hrInvitationId"=p_invitation AND "hrSubject"=p_subject
    AND "hrPasswordConfirmedAt" IS NOT NULL;
  UPDATE public."User" SET role='HR' WHERE id=p_subject AND role='EMPLOYEE';
  UPDATE public."Session" SET "revokedAt"=now()
    WHERE "userId"=p_subject AND "revokedAt" IS NULL;
  UPDATE public."HrInvitation" SET state='ACCEPTED', "acceptedAt"=now(),
    "acceptedBy"=p_subject WHERE id=p_invitation;
  INSERT INTO public."AuditEvent"(id,"actorId",action,"targetId",metadata)
    VALUES(gen_random_uuid(),p_subject,'HR_INVITATION_ACCEPTED',p_invitation,
      jsonb_build_object('source','verified_hr_invitation'));
  INSERT INTO public."OutboxEvent"(id,type,"targetId")
    VALUES(gen_random_uuid(),'HR_INVITATION_ACCEPTED',p_invitation);
  RETURN TRUE;
END $hr_accept$;
REVOKE ALL ON FUNCTION nolt_private.accept_hr_invitation(UUID,UUID,UUID)
  FROM PUBLIC,anon,authenticated,service_role,nolt_app;
-- No runtime grant yet: a public caller must never substitute unverified MFA claims.
COMMIT;
