BEGIN;

-- 1. Create StoredFile table
CREATE TABLE public."StoredFile" (
  id UUID PRIMARY KEY,
  "assignmentId" UUID NOT NULL REFERENCES public."FormAssignment"(id) ON DELETE RESTRICT,
  "fieldId" UUID NOT NULL,
  "uploadedBy" UUID NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
  purpose TEXT NOT NULL CHECK(purpose IN ('SUPPORTING_DOCUMENT','SIGNED_DOCUMENT','SIGNATURE_IMAGE')),
  bucket TEXT NOT NULL DEFAULT 'nolt-private-documents',
  "storageKey" TEXT NOT NULL UNIQUE,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL CHECK("byteSize" > 0 AND "byteSize" <= 10485760),
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  "scanStatus" TEXT NOT NULL DEFAULT 'QUARANTINED' CHECK("scanStatus" IN ('QUARANTINED','CLEAN','REJECTED')),
  "scanReason" TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','CONFIRMED','ABANDONED')),
  "requestKey" UUID NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "confirmedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "StoredFile_assignmentId_requestKey_key" UNIQUE ("assignmentId","requestKey")
);
CREATE INDEX "StoredFile_assignmentId_fieldId_idx" ON public."StoredFile"("assignmentId","fieldId");
CREATE INDEX "StoredFile_uploadedBy_createdAt_idx" ON public."StoredFile"("uploadedBy","createdAt");
CREATE INDEX "StoredFile_status_expiresAt_idx" ON public."StoredFile"(status,"expiresAt");

-- 2. Create SignatureEvidence table
CREATE TABLE public."SignatureEvidence" (
  id UUID PRIMARY KEY,
  "assignmentId" UUID NOT NULL,
  "formVersionId" UUID NOT NULL,
  "fieldId" UUID NOT NULL,
  "signerId" UUID NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
  "signerRole" TEXT NOT NULL CHECK("signerRole" IN ('EMPLOYEE','GUARANTOR','REFERENCE')),
  "signingMethod" TEXT NOT NULL CHECK("signingMethod" IN ('DRAWN','TYPED','UPLOADED')),
  "consentVersion" TEXT NOT NULL,
  "sourceRevision" INTEGER NOT NULL CHECK("sourceRevision" >= 0),
  "contentDigest" TEXT NOT NULL CHECK(length("contentDigest") = 64),
  "fileId" UUID NOT NULL UNIQUE REFERENCES public."StoredFile"(id) ON DELETE RESTRICT,
  "signedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "SignatureEvidence_assignment_form_fkey" FOREIGN KEY ("assignmentId","formVersionId")
    REFERENCES public."FormAssignment"(id,"formVersionId") ON DELETE RESTRICT
);
CREATE INDEX "SignatureEvidence_assignmentId_fieldId_idx" ON public."SignatureEvidence"("assignmentId","fieldId");
CREATE INDEX "SignatureEvidence_signerId_signedAt_idx" ON public."SignatureEvidence"("signerId","signedAt");

-- 3. Trigger for StoredFile protection
CREATE FUNCTION public.protect_stored_file() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Stored files cannot be deleted';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public."FormAssignment" a
      JOIN public."OnboardingCase" c ON c.id = a."caseId"
      WHERE a.id = NEW."assignmentId" AND c.status = 'ACTIVE'
    ) THEN
      RAISE EXCEPTION 'Stored file must belong to an active onboarding case';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id OR NEW."assignmentId" <> OLD."assignmentId" OR NEW."fieldId" <> OLD."fieldId"
       OR NEW."uploadedBy" <> OLD."uploadedBy" OR NEW."storageKey" <> OLD."storageKey"
       OR NEW.purpose <> OLD.purpose THEN
      RAISE EXCEPTION 'Stored file identity and assignment attributes are immutable';
    END IF;

    IF OLD.status = 'CONFIRMED' THEN
      IF NEW.sha256 <> OLD.sha256 OR NEW."byteSize" <> OLD."byteSize" OR NEW."mimeType" <> OLD."mimeType" OR NEW.status <> 'CONFIRMED' THEN
        RAISE EXCEPTION 'Confirmed file records cannot be modified or unconfirmed';
      END IF;
    END IF;

    IF NEW.status = 'CONFIRMED' AND (NEW."scanStatus" <> 'CLEAN' OR NEW."confirmedAt" IS NULL) THEN
      RAISE EXCEPTION 'Confirmation requires successful scanning (CLEAN)';
    END IF;

    RETURN NEW;
  END IF;
END $$;
CREATE TRIGGER stored_file_guard BEFORE INSERT OR UPDATE OR DELETE ON public."StoredFile" FOR EACH ROW EXECUTE FUNCTION public.protect_stored_file();

-- 4. Trigger for SignatureEvidence immutability and actor verification
CREATE FUNCTION public.protect_signature_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
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
CREATE TRIGGER signature_evidence_guard BEFORE INSERT OR UPDATE OR DELETE ON public."SignatureEvidence" FOR EACH ROW EXECUTE FUNCTION public.protect_signature_evidence();

-- 5. RLS and Grants
ALTER TABLE public."StoredFile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SignatureEvidence" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."StoredFile", public."SignatureEvidence" FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_stored_file(), public.protect_signature_evidence() FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public."StoredFile", public."SignatureEvidence" FROM anon, authenticated, service_role;
    REVOKE ALL ON FUNCTION public.protect_stored_file(), public.protect_signature_evidence() FROM anon, authenticated, service_role;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nolt_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public."StoredFile" TO nolt_app;
    GRANT SELECT, INSERT ON public."SignatureEvidence" TO nolt_app;
    CREATE POLICY nolt_backend ON public."StoredFile" TO nolt_app USING(true) WITH CHECK(true);
    CREATE POLICY nolt_backend ON public."SignatureEvidence" TO nolt_app USING(true) WITH CHECK(true);
  END IF;
END $$;

COMMIT;
