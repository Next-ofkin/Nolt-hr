-- Immutable third-party submission review. Does not modify existing requests or evidence.
CREATE TABLE IF NOT EXISTS public."ExternalEvidenceReview" (
  "requestId" uuid PRIMARY KEY REFERENCES public."ExternalRequest"(id) ON DELETE RESTRICT,
  "decision" text NOT NULL CHECK ("decision" IN ('APPROVED','CHANGES_REQUIRED')),
  "reason" text,
  "reviewedBy" uuid NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
  "reviewedAt" timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT "ExternalEvidenceReview_reason_check" CHECK (
    "decision" <> 'CHANGES_REQUIRED' OR length(trim(coalesce("reason",''))) >= 10
  )
);
CREATE INDEX IF NOT EXISTS "ExternalEvidenceReview_reviewedBy_reviewedAt_idx"
 ON public."ExternalEvidenceReview" ("reviewedBy","reviewedAt");
ALTER TABLE public."ExternalEvidenceReview" ENABLE ROW LEVEL SECURITY;
CREATE POLICY external_evidence_nolt_app ON public."ExternalEvidenceReview"
  FOR ALL TO nolt_app USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public."ExternalEvidenceReview" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public."ExternalEvidenceReview" TO nolt_app;
