# HR review and versioned corrections

Updated 14 October 2026. Unit checks, isolated database acceptance, production compilation and hosted migrations/security checks pass. The real-Auth HR dialog and employee correction/resubmission browser journey passed in 5.1 minutes; mobile evidence was reviewed. See the tracker and test report.

The workflow is employee submits -> assigned reviewer requests changes with a mandatory reason -> employee corrects/resubmits -> reviewer approves. Each submission and decision remains immutable. Decisions target an exact submission/response revision. Competing decisions serialize on the case lock; stale/repeated attempts fail with 409. Database guards require the latest pending submission in an active case, reject reuse of earlier review evidence and prevent HR from changing employee answers.

## Access

The reviews.assigned permission is separate from form management. HR and HR_REVIEWER have that module permission; employees and technical administrators do not. Every read/decision also requires an AssignmentReviewAccess record for the exact actor/assignment. The API checks current database membership and sensitivity permissions.

The HR account that opened the case explicitly selects one reviewer and classifies the whole form as GENERAL, HEALTH, FINANCIAL or HEALTH_FINANCIAL. Existing assignments remain inaccessible for review until configured. Health/financial forms additionally require health.read and/or finance.read. Assignment cannot grant these extra permissions. Database guards enforce the same boundary for review writes.

Initial reviewer/classification setup is immutable. Account deactivation or permission removal blocks access. Administrative reassignment/revocation and the final organisational matrix remain release gates. Classification is a trusted HR responsibility, not label inference or proof that arbitrary answer text contains no sensitive information. Per-field sensitivity remains pending. The full UI journey currently uses HR in the employee directory; a dedicated HR_REVIEWER workspace is pending.

## API and screens

- GET /api/v1/assignments/{id}/review-access returns permitted setup metadata without answers.
- POST on that path accepts reviewerEmail and sensitivity; only the active case owner can configure access. Identical retries are idempotent; changing an existing setup fails with 409.
- GET /api/v1/assignments/{id}/review returns the exact form, permitted employee context and immutable submission/review history for the assigned reviewer.
- POST /api/v1/submissions/{id}/decisions accepts decision, reason, expectedSubmissionVersion and expectedResponseRevision. CHANGES_REQUIRED requires a nonblank reason.

The HR dialog supports setup, submitted answers, historical versions, correction requests and approval confirmation. Employees see correction reasons, save updated answers and resubmit a new version. Approved responses are locked. Audit/outbox commits with domain changes; audit metadata excludes free-text correction reasons. Changes appear in the portal; review email delivery is not implemented by this slice.

## Database and evidence

Migration 008 adds SubmissionReview and review/resubmission states. Migration 009 adds AssignmentReviewAccess, actor foreign keys, backend-only RLS/grants and exact-current-submission guards. Nine hosted checksums match. Security advisors report only the previously recorded leaked-password-protection warning.

Local acceptance covers explicit scope, case-owner grants, separate health/financial permissions, permission removal, technical-admin denial, concurrent decisions (one success/one 409), mandatory reasons, immutable decisions, versioned corrections, rejected reuse of old review evidence and approved-answer locking. Fourteen unit checks and workspace type checks passed.

The browser spec uses disposable real accounts/MFA and the actual HR dialog: setup, correction reason, historical/current versions, employee resubmission, approval, record/employee denial and six widths. It sends no emails and preserves the approved real invitation account. The complete journey passed. See TEST_REPORT.md and the tracker for evidence and remaining release gates.

Production release, paid services, employee imports, role/classification administration, full browser/zoom/touch coverage, private files/signatures and external respondents remain separate gates.
