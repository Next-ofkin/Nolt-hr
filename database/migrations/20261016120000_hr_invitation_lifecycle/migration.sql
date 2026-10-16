-- Prepare delivery and one-time MFA-verified acceptance without enabling either action.
-- Additive migration. Existing drafts and all User roles are left unchanged.
BEGIN;
ALTER TABLE public."HrInvitation"
  ADD COLUMN "requestKey" UUID,
  ADD COLUMN "expiresAt" TIMESTAMPTZ(3),
  ADD COLUMN "sentAt" TIMESTAMPTZ(3),
  ADD COLUMN "acceptedAt" TIMESTAMPTZ(3),
  ADD COLUMN "acceptedBy" UUID REFERENCES public."User"(id) ON DELETE RESTRICT,
  ADD COLUMN "providerSubject" UUID,
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
CREATE UNIQUE INDEX "HrInvitation_providerSubject_unique" ON public."HrInvitation"("providerSubject") WHERE "providerSubject" IS NOT NULL;
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
COMMIT;
