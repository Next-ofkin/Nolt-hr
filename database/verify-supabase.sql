-- Synthetic checks roll back; no test accounts or form responses are retained.
BEGIN;
SET LOCAL search_path = public;
DO $$
DECLARE missing INTEGER;
BEGIN
 SELECT count(*) INTO missing FROM pg_tables
 WHERE schemaname='public'
 AND tablename IN ('User','Session','Form','FormVersion','Identity','OidcAttempt','AuthFlow','AuditEvent','OutboxEvent','Employee','OnboardingCase','FormAssignment','EmployeeInvitation','InvitationDelivery','EmployeeResponse','FormSubmission','SubmissionReview','AssignmentReviewAccess','StoredFile','SignatureEvidence','_prisma_migrations')
 AND NOT rowsecurity;
 IF missing <> 0 THEN RAISE EXCEPTION 'RLS missing'; END IF;
 IF (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 10
 THEN RAISE EXCEPTION 'Migration history incomplete'; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='nolt_app' AND (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole))
 THEN RAISE EXCEPTION 'Runtime role is overprivileged'; END IF;
END $$;
INSERT INTO "User" (id,email,name,role) VALUES ('00000000-0000-4000-8000-000000000091','supabase-check@example.invalid','Synthetic migration check','EMPLOYEE');
UPDATE "User" SET role='HR' WHERE id='00000000-0000-4000-8000-000000000091';
DO $$ BEGIN
 IF (SELECT "authVersion" FROM "User" WHERE id='00000000-0000-4000-8000-000000000091') <> 2
 THEN RAISE EXCEPTION 'Access version trigger failed'; END IF;
END $$;
INSERT INTO "Form" (id,"createdBy") VALUES ('00000000-0000-4000-8000-000000000092','00000000-0000-4000-8000-000000000091');
INSERT INTO "FormVersion" (id,"formId",version,status,title,recipient,"publishedAt","updatedAt")
VALUES ('00000000-0000-4000-8000-000000000093','00000000-0000-4000-8000-000000000092',1,'PUBLISHED','Synthetic check','EMPLOYEE',now(),now());
DO $$ BEGIN
 BEGIN
  UPDATE "FormVersion" SET title='This must fail' WHERE id='00000000-0000-4000-8000-000000000093';
  RAISE EXCEPTION 'Published mutation unexpectedly allowed' USING ERRCODE='XX000';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'Published form versions are immutable' THEN RAISE; END IF;
 END;
END $$;
DO $$ BEGIN
 IF NOT has_table_privilege('nolt_app','public."User"','SELECT')
 OR NOT has_table_privilege('nolt_app','public."AuditEvent"','INSERT')
 OR has_table_privilege('nolt_app','public."User"','UPDATE')
 OR has_table_privilege('nolt_app','public."AuditEvent"','DELETE')
 OR has_table_privilege('nolt_app','public._prisma_migrations','SELECT')
 OR has_schema_privilege('nolt_app','public','CREATE')
 THEN RAISE EXCEPTION 'Backend grants incorrect'; END IF;
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname='nolt_backend' AND roles=ARRAY['nolt_app']::name[]) <> 20
 THEN RAISE EXCEPTION 'Backend policies incomplete'; END IF;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN
  PERFORM 1 FROM public."User";
  RAISE EXCEPTION 'Anonymous HR access unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
  PERFORM 1 FROM public."FormVersion";
  RAISE EXCEPTION 'Authenticated Data API access unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'passed' AS migration_security_and_trigger_checks,
 (SELECT count(*) FROM public."User") AS retained_users,
 (SELECT count(*) FROM public."Form") AS retained_forms;
