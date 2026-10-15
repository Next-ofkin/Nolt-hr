BEGIN;
CREATE TABLE public."ExternalContactDraft" (
 "assignmentId" UUID PRIMARY KEY REFERENCES public."FormAssignment"(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
 "fullName" VARCHAR(160) NOT NULL CHECK(length(btrim("fullName"))>0),
 email VARCHAR(254) NOT NULL CHECK(email=lower(btrim(email)) AND length(email)>3),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 "updatedBy" UUID NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX "ExternalContactDraft_updatedBy_idx" ON public."ExternalContactDraft"("updatedBy");
CREATE FUNCTION public.protect_external_contact_draft() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'External contact history cannot be deleted'; END IF;
 IF TG_OP='UPDATE' AND (NEW."assignmentId"<>OLD."assignmentId" OR NEW.revision<>OLD.revision+1)
 THEN RAISE EXCEPTION 'Invalid external contact revision or assignment'; END IF;
 IF TG_OP='INSERT' AND NEW.revision<>1 THEN RAISE EXCEPTION 'Invalid initial revision'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public."FormAssignment" a
  JOIN public."FormVersion" v ON v.id=a."formVersionId"
  JOIN public."OnboardingCase" c ON c.id=a."caseId"
  JOIN public."Employee" e ON e.id=c."employeeId"
  JOIN public."User" u ON u.id=e."userId"
  WHERE a.id=NEW."assignmentId" AND c.status='ACTIVE' AND u.active
   AND v.recipient IN ('GUARANTOR','REFERENCE') AND u.id=NEW."updatedBy"
   AND NEW.email<>lower(e.email) AND NEW.email<>lower(u.email)
 ) THEN RAISE EXCEPTION 'External contact actor or assignment is invalid'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_external_contact_draft() FROM PUBLIC;
CREATE TRIGGER external_contact_guard BEFORE INSERT OR UPDATE OR DELETE ON public."ExternalContactDraft"
 FOR EACH ROW EXECUTE FUNCTION public.protect_external_contact_draft();
ALTER TABLE public."ExternalContactDraft" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."ExternalContactDraft" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON public."ExternalContactDraft" FROM anon,authenticated,service_role;
  REVOKE ALL ON FUNCTION public.protect_external_contact_draft() FROM anon,authenticated,service_role;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nolt_app') THEN
  GRANT SELECT,INSERT,UPDATE ON public."ExternalContactDraft" TO nolt_app;
  CREATE POLICY nolt_backend ON public."ExternalContactDraft" TO nolt_app USING(true) WITH CHECK(true);
 END IF;
END $$;
COMMIT;
