-- HR invitations begin as developer-owned drafts, never as automatic role promotion.
-- No mail dispatch or account mutation is performed by this migration.
BEGIN;
CREATE TABLE public."HrInvitation" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 "email" TEXT NOT NULL,
 "name" TEXT NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("state" IN ('DRAFT','REVOKED')),
 "createdBy" UUID NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 "revokedAt" TIMESTAMPTZ(3),
 CONSTRAINT "HrInvitation_email_normalized" CHECK ("email" = lower(btrim("email"))),
 CONSTRAINT "HrInvitation_revocation_consistency" CHECK ((state='DRAFT' AND "revokedAt" IS NULL) OR (state='REVOKED' AND "revokedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "HrInvitation_one_active_draft_per_email" ON public."HrInvitation"(email) WHERE state='DRAFT';
CREATE INDEX "HrInvitation_createdAt_id_idx" ON public."HrInvitation"("createdAt" DESC,id DESC);
ALTER TABLE public."HrInvitation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."HrInvitation" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
   REVOKE ALL ON public."HrInvitation" FROM anon,authenticated,service_role;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='nolt_app') THEN
   GRANT SELECT,INSERT,UPDATE ON public."HrInvitation" TO nolt_app;
   CREATE POLICY nolt_backend_hr_drafts ON public."HrInvitation"
     TO nolt_app USING (true) WITH CHECK (true);
 END IF;
END $$;
COMMIT;
