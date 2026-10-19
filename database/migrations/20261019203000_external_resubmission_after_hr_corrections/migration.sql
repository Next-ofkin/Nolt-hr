-- A completed request remains immutable and auditable. Only open requests
-- compete for the one-current-request slot; the service requires a
-- CHANGES_REQUIRED review before a subsequent request is issued.
DROP INDEX IF EXISTS public."ExternalRequest_current_assignment";
CREATE UNIQUE INDEX "ExternalRequest_current_assignment"
  ON public."ExternalRequest"("assignmentId")
  WHERE state NOT IN ('REVOKED','EXPIRED','FAILED','SUBMITTED');
