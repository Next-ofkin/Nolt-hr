-- When a Developer makes a new form version live, employees who have not finished that
-- form should see the new version. Assignments stay protected: the only change allowed is
-- moving an assignment forward to a newer published version of the SAME form, and only
-- through advance_waiting_assignments(), which refuses anything that has been submitted,
-- signed or sent to a guarantor. No table permission is widened for the app.
BEGIN;
CREATE OR REPLACE FUNCTION public.protect_form_assignment() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND current_setting('nolt.advance_assignment', true) = OLD.id::text
    AND NEW.id=OLD.id AND NEW."caseId"=OLD."caseId" AND NEW."formId"=OLD."formId"
    AND NEW.required=OLD.required AND NEW."dueDate" IS NOT DISTINCT FROM OLD."dueDate"
    AND NEW."assignedBy"=OLD."assignedBy" AND NEW."createdAt"=OLD."createdAt"
    AND NEW."formVersionId"<>OLD."formVersionId"
    AND EXISTS(SELECT 1 FROM public."FormVersion" n JOIN public."FormVersion" o ON o.id=OLD."formVersionId"
               WHERE n.id=NEW."formVersionId" AND n."formId"=NEW."formId" AND n.status='PUBLISHED' AND n.version>o.version)
 THEN RETURN NEW; END IF;
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Assigned form versions and requirements are immutable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public."FormVersion" WHERE id=NEW."formVersionId" AND "formId"=NEW."formId" AND status='PUBLISHED')
 THEN RAISE EXCEPTION 'Only published form versions can be assigned'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public."OnboardingCase" WHERE id=NEW."caseId" AND status='ACTIVE')
 THEN RAISE EXCEPTION 'The onboarding case is not active'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.advance_waiting_assignments(p_form_id uuid, p_version_id uuid)
RETURNS TABLE(assignment_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v record; a record;
BEGIN
 SELECT * INTO v FROM public."FormVersion" WHERE id=p_version_id AND "formId"=p_form_id AND status='PUBLISHED';
 IF NOT FOUND THEN RAISE EXCEPTION 'Only a published version of this form can be rolled out'; END IF;
 IF EXISTS(SELECT 1 FROM public."FormVersion" WHERE "formId"=p_form_id AND status='PUBLISHED' AND version>v.version)
 THEN RAISE EXCEPTION 'A newer published version exists'; END IF;
 FOR a IN
  SELECT fa.id FROM public."FormAssignment" fa
  JOIN public."FormVersion" ov ON ov.id=fa."formVersionId"
  JOIN public."OnboardingCase" oc ON oc.id=fa."caseId" AND oc.status='ACTIVE'
  LEFT JOIN public."EmployeeResponse" r ON r."assignmentId"=fa.id
  WHERE fa."formId"=p_form_id AND fa."formVersionId"<>p_version_id
    AND ov.version<v.version AND ov.recipient=v.recipient
    AND (r."assignmentId" IS NULL OR r.status='DRAFT')
    AND NOT EXISTS(SELECT 1 FROM public."FormSubmission" s WHERE s."assignmentId"=fa.id)
    AND NOT EXISTS(SELECT 1 FROM public."SignatureEvidence" g WHERE g."assignmentId"=fa.id)
    AND NOT EXISTS(SELECT 1 FROM public."ExternalRequest" x WHERE x."assignmentId"=fa.id)
  ORDER BY fa.id
  FOR UPDATE OF fa
 LOOP
  PERFORM set_config('nolt.advance_assignment', a.id::text, true);
  UPDATE public."FormAssignment" SET "formVersionId"=p_version_id WHERE id=a.id;
  assignment_id := a.id; RETURN NEXT;
 END LOOP;
 PERFORM set_config('nolt.advance_assignment', '', true);
END $$;
REVOKE ALL ON FUNCTION public.advance_waiting_assignments(uuid,uuid) FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON FUNCTION public.advance_waiting_assignments(uuid,uuid) FROM anon,authenticated,service_role;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nolt_app') THEN
  GRANT EXECUTE ON FUNCTION public.advance_waiting_assignments(uuid,uuid) TO nolt_app;
 END IF;
END $$;
COMMIT;
