-- Only three account roles remain: EMPLOYEE, HR and DEVELOPER.
-- HR_REVIEWER and SYSTEM_ADMIN are removed. Production had 9 such accounts, all inactive,
-- none ever designated as a reviewer and none with a recorded review, so converting them
-- grants no access. Refuse to run if any such account is active, so nobody loses access silently.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."User" WHERE role IN ('HR_REVIEWER','SYSTEM_ADMIN') AND active) THEN
    RAISE EXCEPTION 'Active HR_REVIEWER or SYSTEM_ADMIN accounts exist; resolve them before removing these roles';
  END IF;
  IF EXISTS (SELECT 1 FROM public."AssignmentReviewAccess" a JOIN public."User" u ON u.id=a."reviewerId"
             WHERE u.role IN ('HR_REVIEWER','SYSTEM_ADMIN')) THEN
    RAISE EXCEPTION 'Removed roles are still designated as reviewers';
  END IF;
END $$;

-- Inactive legacy accounts become inactive EMPLOYEE accounts (no HR power if ever reactivated).
UPDATE public."User" SET role='EMPLOYEE' WHERE role IN ('HR_REVIEWER','SYSTEM_ADMIN') AND NOT active;

ALTER TABLE public."User" DROP CONSTRAINT IF EXISTS "User_role_check";
ALTER TABLE public."User" ADD CONSTRAINT "User_role_check" CHECK (role IN ('HR','EMPLOYEE','DEVELOPER'));

CREATE OR REPLACE FUNCTION public.protect_review_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Review assignments are immutable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public."FormAssignment" a JOIN public."OnboardingCase" c ON c.id=a."caseId"
 JOIN public."FormVersion" v ON v.id=a."formVersionId" JOIN public."User" g ON g.id=NEW."grantedBy"
 WHERE a.id=NEW."assignmentId" AND c."createdBy"=g.id AND g.role='HR' AND g.active AND c.status='ACTIVE' AND v.recipient='EMPLOYEE')
 THEN RAISE EXCEPTION 'Only the active case owner may assign review access'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public."User" u WHERE u.id=NEW."reviewerId" AND u.active AND u.role='HR')
 THEN RAISE EXCEPTION 'A review-capable account is required'; END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.can_review_assignment(p_user uuid, p_assignment uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public."User" u
    JOIN public."FormAssignment" a ON a.id = p_assignment
    JOIN public."OnboardingCase" c ON c.id = a."caseId"
    JOIN public."FormVersion" v ON v.id = a."formVersionId"
    WHERE u.id = p_user
      AND u.active
      AND u.role = 'HR'
      AND c.status = 'ACTIVE'
      AND v.recipient = 'EMPLOYEE'
  )
$function$;
