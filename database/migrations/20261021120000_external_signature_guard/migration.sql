-- Guarantors and references may now sign through their one-request secure link.
-- Replace the signature guard so a non-employee signature is accepted only from
-- the respondent of an active, unexpired, unrevoked request for that assignment.
-- Only this function body changes; no table, row or grant is altered.
CREATE OR REPLACE FUNCTION public.protect_signature_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  f_purpose TEXT;
  f_status TEXT;
  f_scan TEXT;
  f_uploader UUID;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Signature evidence records are immutable';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public."User" u WHERE u.id = NEW."signerId" AND u.active) THEN
    RAISE EXCEPTION 'Signer must be an active user';
  END IF;

  IF NEW."signerRole" = 'EMPLOYEE' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public."FormAssignment" a
      JOIN public."OnboardingCase" c ON c.id = a."caseId"
      JOIN public."Employee" e ON e.id = c."employeeId"
      WHERE a.id = NEW."assignmentId" AND e."userId" = NEW."signerId" AND c.status = 'ACTIVE'
    ) THEN
      RAISE EXCEPTION 'Employee is not authorized to sign this assignment';
    END IF;
  ELSIF NEW."signerRole" IN ('GUARANTOR', 'REFERENCE') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public."ExternalRequest" r
      JOIN public."FormAssignment" a ON a.id = r."assignmentId"
      JOIN public."FormVersion" v ON v.id = a."formVersionId"
      JOIN public."OnboardingCase" c ON c.id = a."caseId"
      WHERE r."assignmentId" = NEW."assignmentId"
        AND r."respondentId" = NEW."signerId"
        AND r.state = 'ACTIVE'
        AND r."revokedAt" IS NULL
        AND r."expiresAt" > now()
        AND c.status = 'ACTIVE'
        AND v.recipient = NEW."signerRole"
    ) THEN
      RAISE EXCEPTION 'Recipient is not authorized to sign this assignment';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown signer role';
  END IF;

  SELECT purpose, status, "scanStatus", "uploadedBy" INTO f_purpose, f_status, f_scan, f_uploader
  FROM public."StoredFile" WHERE id = NEW."fileId";

  IF f_purpose <> 'SIGNATURE_IMAGE' OR f_status <> 'CONFIRMED' OR f_scan <> 'CLEAN' THEN
    RAISE EXCEPTION 'Signature file must be a confirmed and clean signature image';
  END IF;

  IF f_uploader <> NEW."signerId" THEN
    RAISE EXCEPTION 'Signature file must be uploaded by the signer';
  END IF;

  RETURN NEW;
END $$;
