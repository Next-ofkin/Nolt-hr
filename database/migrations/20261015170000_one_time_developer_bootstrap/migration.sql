-- One-time offline Developer/System Owner bootstrap. No web or nolt_app role can claim it.
-- This migration creates safeguards only; it does NOT promote a user.
BEGIN;
CREATE SCHEMA IF NOT EXISTS nolt_private;
REVOKE ALL ON SCHEMA nolt_private FROM PUBLIC;

-- Extend the existing role whitelist before any approved one-time promotion.
-- Preserve every previously supported role; no existing User row is rewritten.
ALTER TABLE public."User" DROP CONSTRAINT "User_role_check";
ALTER TABLE public."User" ADD CONSTRAINT "User_role_check"
  CHECK (role IN ('HR','HR_REVIEWER','EMPLOYEE','SYSTEM_ADMIN','DEVELOPER'));

-- A Developer is a single technical owner, not an HR data reviewer.
-- This also detects any pre-existing duplicate Developer records at migration time.
CREATE UNIQUE INDEX "User_one_developer_role" ON public."User" (role)
  WHERE role = 'DEVELOPER';

CREATE TABLE nolt_private.developer_bootstrap (
  slot SMALLINT PRIMARY KEY DEFAULT 1 CHECK (slot = 1),
  "userId" UUID NOT NULL UNIQUE REFERENCES public."User"(id) ON DELETE RESTRICT,
  "providerSubject" UUID NOT NULL UNIQUE,
  "approvedEmail" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ("approvedEmail" = lower(btrim("approvedEmail")))
);
ALTER TABLE nolt_private.developer_bootstrap ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE nolt_private.developer_bootstrap FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nolt_app') THEN
    REVOKE ALL ON TABLE nolt_private.developer_bootstrap FROM nolt_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE nolt_private.developer_bootstrap FROM anon, authenticated, service_role;
  END IF;
END $$;
COMMIT;
