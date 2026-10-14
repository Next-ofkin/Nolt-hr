BEGIN;
ALTER TABLE public."Session" ADD COLUMN "providerSession" TEXT;
ALTER TABLE public."Session" DROP CONSTRAINT "Session_authMethod_check";
ALTER TABLE public."Session" ADD CONSTRAINT "Session_authMethod_check" CHECK ("authMethod" IN ('LOCAL','OIDC','SUPABASE'));
CREATE TABLE public."AuthFlow" (
 "id" UUID PRIMARY KEY,
 "tokenHash" TEXT NOT NULL UNIQUE,
 "csrfHash" TEXT NOT NULL,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('EMAIL_SIGNUP','EMAIL_RECOVERY','MFA','RECOVERY')),
 "encryptedState" TEXT NOT NULL,
 "expiresAt" TIMESTAMPTZ(3) NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuthFlow_expiresAt_idx" ON public."AuthFlow"("expiresAt");
ALTER TABLE public."AuthFlow" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON TABLE public."AuthFlow" FROM PUBLIC, anon, authenticated, service_role;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='nolt_app') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON public."AuthFlow" TO nolt_app;
  CREATE POLICY nolt_backend ON public."AuthFlow" TO nolt_app USING (true) WITH CHECK (true);
 END IF;
END $$;
-- Retire shortcut/provider fixtures without removing historical evidence.
UPDATE public."Session" SET "revokedAt"=now() WHERE "authMethod" IN ('LOCAL','OIDC') AND "revokedAt" IS NULL;
UPDATE public."User" SET active=false WHERE id IN (
 SELECT "userId" FROM public."Identity" WHERE issuer='http://127.0.0.1:4100'
);
UPDATE public."OidcAttempt" SET "consumedAt"=now(),verifier=NULL WHERE "consumedAt" IS NULL;
COMMIT;
