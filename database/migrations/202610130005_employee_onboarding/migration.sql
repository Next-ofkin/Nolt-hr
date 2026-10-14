BEGIN;
CREATE TABLE public."Employee" (
 "id" UUID PRIMARY KEY,
 "userId" UUID UNIQUE REFERENCES public."User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "employeeNumber" TEXT UNIQUE,
 "fullName" TEXT NOT NULL CHECK(length(trim("fullName")) BETWEEN 1 AND 160),
 "email" TEXT NOT NULL UNIQUE CHECK(email=lower(trim(email))),
 "jobTitle" TEXT NOT NULL CHECK(length(trim("jobTitle")) BETWEEN 1 AND 120),
 "department" TEXT NOT NULL CHECK(length(trim(department)) BETWEEN 1 AND 120),
 "employmentType" TEXT NOT NULL CHECK(length(trim("employmentType")) BETWEEN 1 AND 80),
 "startDate" DATE NOT NULL,
 "revision" INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 "createdBy" UUID NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX "Employee_department_startDate_idx" ON public."Employee"(department,"startDate");
CREATE INDEX "Employee_createdAt_id_idx" ON public."Employee"("createdAt",id);
CREATE TABLE public."OnboardingCase" (
 "id" UUID PRIMARY KEY,
 "employeeId" UUID NOT NULL REFERENCES public."Employee"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "status" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CLOSED')),
 "stage" TEXT NOT NULL DEFAULT 'PRE_ONBOARDING' CHECK(stage IN ('PRE_ONBOARDING','ONBOARDING','COMPLETE')),
 "revision" INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 "createdBy" UUID NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "OnboardingCase_one_active_per_employee" ON public."OnboardingCase"("employeeId") WHERE status='ACTIVE';
CREATE INDEX "OnboardingCase_employeeId_createdAt_idx" ON public."OnboardingCase"("employeeId","createdAt");
CREATE UNIQUE INDEX "FormVersion_id_formId_key" ON public."FormVersion"(id,"formId");
CREATE TABLE public."FormAssignment" (
 "id" UUID PRIMARY KEY,
 "caseId" UUID NOT NULL REFERENCES public."OnboardingCase"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "formId" UUID NOT NULL REFERENCES public."Form"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "formVersionId" UUID NOT NULL,
 "required" BOOLEAN NOT NULL DEFAULT true,
 "dueDate" DATE,
 "assignedBy" UUID NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 FOREIGN KEY("formVersionId","formId") REFERENCES public."FormVersion"(id,"formId") ON DELETE RESTRICT ON UPDATE CASCADE,
 UNIQUE("caseId","formId")
);
CREATE INDEX "FormAssignment_formVersionId_formId_idx" ON public."FormAssignment"("formVersionId","formId");
CREATE INDEX "FormAssignment_formId_idx" ON public."FormAssignment"("formId");
CREATE FUNCTION public.protect_form_assignment() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Assigned form versions and requirements are immutable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public."FormVersion" WHERE id=NEW."formVersionId" AND "formId"=NEW."formId" AND status='PUBLISHED')
 THEN RAISE EXCEPTION 'Only published form versions can be assigned'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public."OnboardingCase" WHERE id=NEW."caseId" AND status='ACTIVE')
 THEN RAISE EXCEPTION 'The onboarding case is not active'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_form_assignment() FROM PUBLIC;
CREATE TRIGGER form_assignment_guard BEFORE INSERT OR UPDATE OR DELETE ON public."FormAssignment" FOR EACH ROW EXECUTE FUNCTION public.protect_form_assignment();
ALTER TABLE public."Employee" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."OnboardingCase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FormAssignment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."Employee",public."OnboardingCase",public."FormAssignment" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON public."Employee",public."OnboardingCase",public."FormAssignment" FROM anon,authenticated,service_role;
  REVOKE ALL ON FUNCTION public.protect_form_assignment() FROM anon,authenticated,service_role;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nolt_app') THEN
  GRANT SELECT,INSERT,UPDATE ON public."Employee",public."OnboardingCase" TO nolt_app;
  GRANT SELECT,INSERT ON public."FormAssignment" TO nolt_app;
  CREATE POLICY nolt_backend ON public."Employee" TO nolt_app USING(true) WITH CHECK(true);
  CREATE POLICY nolt_backend ON public."OnboardingCase" TO nolt_app USING(true) WITH CHECK(true);
  CREATE POLICY nolt_backend ON public."FormAssignment" TO nolt_app USING(true) WITH CHECK(true);
 END IF;
END $$;
COMMIT;
