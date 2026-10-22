-- What the app's restricted database user (nolt_app) may do, and nothing else.
-- Matches the live NOLT database as read on 22 October 2026. Safe to run more than once.
-- Run AFTER the migrations. The first eight tables were granted by a one-off script in the past and
-- some later tables only in production, so the migrations alone do not give a complete setup.
BEGIN;
DO $$
DECLARE
  t text; p record; r text;
  grants jsonb := '{
    "SELECT": ["User","Identity"],
    "SELECT,INSERT": ["AuditEvent","OutboxEvent","AssignmentReviewAccess","ExternalEvidenceReview","ExternalSubmission","FormAssignment","FormSubmission","PackAssignment","PackAssignmentForm","PackDeadlineChange","SignatureEvidence","SubmissionReview"],
    "SELECT,INSERT,UPDATE": ["AssignmentGuarantorRule","Employee","EmployeeInvitation","EmployeeResponse","ExternalContactDraft","ExternalDelivery","ExternalEmailSession","ExternalRequest","HrInvitation","InvitationDelivery","OnboardingCase","StoredFile"],
    "SELECT,INSERT,UPDATE,DELETE": ["AuthFlow","Form","FormVersion","OidcAttempt","PackTemplate","Session"],
    "SELECT,INSERT,DELETE": ["PackItem"]
  }';
  k text; v jsonb;
BEGIN
  GRANT USAGE ON SCHEMA public TO nolt_app;
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
    FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', t, r);
      END IF;
    END LOOP;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM nolt_app', t);
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t AND roles=ARRAY['nolt_app']::name[] LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    IF t <> '_prisma_migrations' THEN
      EXECUTE format('CREATE POLICY nolt_backend ON public.%I TO nolt_app USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
  FOR k, v IN SELECT * FROM jsonb_each(grants) LOOP
    FOR t IN SELECT jsonb_array_elements_text(v) LOOP
      EXECUTE format('GRANT %s ON TABLE public.%I TO nolt_app', k, t);
    END LOOP;
  END LOOP;
END $$;
DO $$ BEGIN
  IF to_regprocedure('public.protect_published_form()') IS NOT NULL THEN
    ALTER FUNCTION public.protect_published_form() SET search_path = public;
    REVOKE ALL ON FUNCTION public.protect_published_form() FROM PUBLIC;
  END IF;
  IF to_regprocedure('public.bump_user_access_version()') IS NOT NULL THEN
    ALTER FUNCTION public.bump_user_access_version() SET search_path = public;
    REVOKE ALL ON FUNCTION public.bump_user_access_version() FROM PUBLIC;
  END IF;
END $$;
COMMIT;
