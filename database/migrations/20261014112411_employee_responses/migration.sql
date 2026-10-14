BEGIN;
CREATE UNIQUE INDEX "FormAssignment_id_formVersionId_key" ON public."FormAssignment"(id,"formVersionId");
CREATE TABLE public."EmployeeResponse" (
 "assignmentId" UUID PRIMARY KEY REFERENCES public."FormAssignment"(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SUBMITTED')),
 answers JSONB NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(answers)='object' AND octet_length(answers::text)<=110000),
 "updatedBy" UUID NOT NULL,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE TABLE public."FormSubmission" (
 id UUID PRIMARY KEY,
 "assignmentId" UUID NOT NULL,
 "formVersionId" UUID NOT NULL,
 version INTEGER NOT NULL CHECK(version>0),
 "sourceRevision" INTEGER NOT NULL CHECK("sourceRevision">=0),
 "requestKey" UUID NOT NULL,
 answers JSONB NOT NULL CHECK(jsonb_typeof(answers)='object' AND octet_length(answers::text)<=110000),
 "submittedBy" UUID NOT NULL,
 "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 FOREIGN KEY("assignmentId","formVersionId") REFERENCES public."FormAssignment"(id,"formVersionId") ON DELETE RESTRICT,
 UNIQUE("assignmentId",version), UNIQUE("assignmentId","requestKey")
);
CREATE FUNCTION public.protect_form_submission() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Submitted responses are immutable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public."FormAssignment" a
 JOIN public."OnboardingCase" c ON c.id=a."caseId"
 JOIN public."Employee" e ON e.id=c."employeeId"
 JOIN public."FormVersion" v ON v.id=a."formVersionId"
 WHERE a.id=NEW."assignmentId" AND e."userId"=NEW."submittedBy" AND c.status='ACTIVE' AND v.recipient='EMPLOYEE')
 THEN RAISE EXCEPTION 'Submission actor or assignment is invalid'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER submission_guard BEFORE INSERT OR UPDATE OR DELETE ON public."FormSubmission" FOR EACH ROW EXECUTE FUNCTION public.protect_form_submission();
CREATE FUNCTION public.protect_employee_response() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Response history cannot be deleted'; END IF;
 IF TG_OP='UPDATE' AND (OLD.status='SUBMITTED' OR NEW."assignmentId"<>OLD."assignmentId" OR NEW.revision<>OLD.revision+1)
 THEN RAISE EXCEPTION 'Response changed or has been submitted'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public."FormAssignment" a
 JOIN public."OnboardingCase" c ON c.id=a."caseId"
 JOIN public."Employee" e ON e.id=c."employeeId"
 JOIN public."FormVersion" v ON v.id=a."formVersionId"
 WHERE a.id=NEW."assignmentId" AND e."userId"=NEW."updatedBy" AND c.status='ACTIVE' AND v.recipient='EMPLOYEE')
 THEN RAISE EXCEPTION 'Response actor or assignment is invalid'; END IF;
 IF NEW.status='SUBMITTED' AND NOT EXISTS(SELECT 1 FROM public."FormSubmission" s WHERE s."assignmentId"=NEW."assignmentId" AND s.answers=NEW.answers AND s."submittedBy"=NEW."updatedBy" AND s."sourceRevision"=NEW.revision-1)
 THEN RAISE EXCEPTION 'Submitted response requires immutable evidence'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER response_guard BEFORE INSERT OR UPDATE OR DELETE ON public."EmployeeResponse" FOR EACH ROW EXECUTE FUNCTION public.protect_employee_response();
REVOKE ALL ON FUNCTION public.protect_form_submission(), public.protect_employee_response() FROM PUBLIC;
ALTER TABLE public."EmployeeResponse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FormSubmission" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."EmployeeResponse", public."FormSubmission" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON public."EmployeeResponse",public."FormSubmission" FROM anon,authenticated,service_role;
  REVOKE ALL ON FUNCTION public.protect_form_submission(), public.protect_employee_response() FROM anon,authenticated,service_role;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nolt_app') THEN
  GRANT SELECT,INSERT,UPDATE ON public."EmployeeResponse" TO nolt_app;
  GRANT SELECT,INSERT ON public."FormSubmission" TO nolt_app;
  CREATE POLICY nolt_backend ON public."EmployeeResponse" TO nolt_app USING(true) WITH CHECK(true);
  CREATE POLICY nolt_backend ON public."FormSubmission" TO nolt_app USING(true) WITH CHECK(true);
 END IF;
END $$;
COMMIT;
