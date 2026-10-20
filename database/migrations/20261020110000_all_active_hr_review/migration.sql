CREATE OR REPLACE FUNCTION public.can_review_assignment(p_user uuid, p_assignment uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."User" u
    JOIN public."FormAssignment" a ON a.id = p_assignment
    JOIN public."OnboardingCase" c ON c.id = a."caseId"
    JOIN public."FormVersion" v ON v.id = a."formVersionId"
    LEFT JOIN public."AssignmentReviewAccess" r ON r."assignmentId" = a.id
    WHERE u.id = p_user
      AND u.active
      AND c.status = 'ACTIVE'
      AND v.recipient = 'EMPLOYEE'
      AND (
        u.role = 'HR'
        OR (u.role = 'HR_REVIEWER' AND r."reviewerId" = u.id
            AND (r.sensitivity NOT IN ('HEALTH','HEALTH_FINANCIAL') OR 'health.read' = ANY(u.permissions))
            AND (r.sensitivity NOT IN ('FINANCIAL','HEALTH_FINANCIAL') OR 'finance.read' = ANY(u.permissions)))
      )
  )
$$;