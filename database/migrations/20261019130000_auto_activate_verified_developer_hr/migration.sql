-- Controlled rollout: allow only the application DB role to invoke the
-- one-time, invitation-bound activation function. The API MUST verify fresh
-- Supabase AAL2 and CSRF-bound AuthFlow before invocation.
-- No existing users, roles, invitations or sessions are modified by migration.
-- Do not set HR_INVITATION_AUTO_ACTIVATION_ENABLED until reviewed and applied.
BEGIN;
DO $$
BEGIN
  IF to_regprocedure('nolt_private.accept_hr_invitation(uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'HR invitation activation procedure is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='nolt_app') THEN
    RAISE EXCEPTION 'Expected restricted application role missing';
  END IF;
END $$;
-- Harden the existing atomic operation with Developer provenance and a
-- verified Supabase authenticator record, not merely a claimed role.
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
  IF NOT FOUND OR invited.state <> 'SENT'
     OR invited."expiresAt" IS NULL OR invited."expiresAt" <= now()
     OR invited."revokedAt" IS NOT NULL
     OR invited."creationSubject" IS DISTINCT FROM p_subject
     OR invited."providerSubject" IS DISTINCT FROM p_subject
     OR invited."creationSecretHash" IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public."User" developer
       WHERE developer.id=invited."createdBy"
         AND developer.role='DEVELOPER' AND developer.active
     ) THEN
    RETURN FALSE;
  END IF;
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
    AND EXISTS(SELECT 1 FROM auth.mfa_factors factor
        WHERE factor.user_id=au.id AND factor.factor_type='totp'
          AND factor.status='verified')
    AND NOT EXISTS(SELECT 1 FROM public."Employee" e
        WHERE e."userId"=u.id OR e.email=u.email);
  IF linked_count <> 1 THEN RETURN FALSE; END IF;
  SELECT count(*) INTO flow_count FROM public."AuthFlow" af
    WHERE af.id=p_flow AND af.kind='HR_INVITATION'
      AND af."hrInvitationId"=p_invitation AND af."hrSubject"=p_subject
      AND af."expiresAt" > now() AND af."hrPasswordConfirmedAt" IS NOT NULL
      AND af."hrPasswordConfirmedAt" >= af."createdAt"
      AND af."hrPasswordConfirmedAt" < af."expiresAt"
      AND af."hrPasswordConfirmedAt" <= clock_timestamp();
  IF flow_count <> 1 THEN RETURN FALSE; END IF;
  -- The one-time record is consumed atomically with role and invitation update.
  DELETE FROM public."AuthFlow" WHERE id=p_flow AND kind='HR_INVITATION'
    AND "hrInvitationId"=p_invitation AND "hrSubject"=p_subject
    AND "hrPasswordConfirmedAt" IS NOT NULL;
  UPDATE public."User" SET role='HR' WHERE id=p_subject AND role='EMPLOYEE';
  UPDATE public."Session" SET "revokedAt"=now()
    WHERE "userId"=p_subject AND "revokedAt" IS NULL;
  UPDATE public."HrInvitation" SET state='ACCEPTED',
    "acceptedAt"=now(), "acceptedBy"=p_subject WHERE id=p_invitation;
  INSERT INTO public."AuditEvent"(id,"actorId",action,"targetId",metadata)
    VALUES(gen_random_uuid(),p_subject,'HR_INVITATION_ACCEPTED',p_invitation,
      jsonb_build_object('source','developer_invitation_verified_mfa'));
  INSERT INTO public."OutboxEvent"(id,type,"targetId")
    VALUES(gen_random_uuid(),'HR_INVITATION_ACCEPTED',p_invitation);
  RETURN TRUE;
END $hr_accept$;
REVOKE ALL ON FUNCTION nolt_private.accept_hr_invitation(UUID,UUID,UUID)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION nolt_private.accept_hr_invitation(UUID,UUID,UUID)
  TO nolt_app;
COMMIT;
