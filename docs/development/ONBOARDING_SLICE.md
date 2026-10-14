# Employee records and onboarding assignments

Implemented 13 October 2026; hosted onboarding acceptance passed 14 October 2026.

HR uses `/employees` to create/search employee profiles, edit employment details, open one active onboarding case and assign an exact published form version with required/optional and due-date metadata. Search supports department, employment type, case status and start-date range, with pagination. Published-version selection includes older published versions even when a newer draft exists.

The employee home shows only the profile linked to that user's verified Supabase account and its active assigned checklist. Employee-owned forms have a read-only preview. Guarantor/reference forms cannot be opened through the employee form endpoint; their eventual sending and completion flows remain separate.

Email is normalised at creation and cannot be changed through employment edits. Private database functions link a verified EMPLOYEE account, either when HR creates the record or when the account subsequently confirms its email. An already linked profile is never automatically transferred to another account. Signup does not grant HR permissions. Account linking and domain changes write audit/outbox evidence in the same transaction.

Employee edits use revision checks. Cases and assignments use row locks and revision checks; concurrent stale operations fail. Database constraints enforce one active case and one assignment per form/case. Assignments and published form definitions are immutable. A new form version does not change an existing assignment.

Verified locally:

- Workspace type checks and API/web production compilation.
- Seven existing unit/security checks.
- `node scripts/test-onboarding-db.mjs` after API compilation: all five migrations, actual provisioning/linking SQL and onboarding service transactions against isolated PostgreSQL using a restricted runtime login. Covers verified/unverified linking in both creation orders, filtering, concurrent employee/case/assignment changes, published-only assignment, fixed versions, own-record and third-party denials, immutable assignments, audit/outbox and grants. This tests database integration; its minimal local Auth tables do not constitute a live Supabase Auth test or a login provider.

Hosted acceptance, 14 October 2026:

- Pooler connectivity recovered; migration 005 and verified-account linking integration installed. All five Prisma checksums match, with trusted restricted-runtime TLS.
- Actual hosted RLS/grant checks and public Data API denial passed for Employee, OnboardingCase and FormAssignment. The approved first HR bootstrap membership is verified.
- The new real-account Chromium journey passed: HR creates and edits a profile, a subsequent verified Supabase account claims it, HR opens a case and assigns employee/guarantor forms, and a newer draft leaves the published assignment unchanged.
- Direct APIs reject draft assignment, duplicate active cases, third-party proxy form access and cross-employee access. Concurrent employment edits yield one success and one conflict. Assigned evidence is immutable in the hosted database; audit/outbox records match committed changes.
- HR directory and employee checklist/preview fit 320/375/768/1024/1440/1920 widths. Mobile screenshots reviewed under ignored .local/qa/. Full accessibility, zoom, touch signing and all-browser acceptance remain separate gates.
- Real QA provider users are disposable; application profiles, forms and audit histories remain as synthetic development evidence. No real employees were imported or invited.

Reproduce with the authorized development configuration: npm run db:hosted:verify, then npm run dev and npm run test:e2e:hosted -- onboarding.live.spec.ts. Run tests without concurrent builds: compilation restarts the watched API and can reset in-flight login connections. The onboarding journey allows six minutes for hosted provider round trips; this is functional acceptance, not a performance target.

Remaining scope: employment-type template bundles, separate personal email, expiring invitations and activation/resend/revoke, response drafts/submissions, authoritative progress/readiness rules, review/corrections, private uploads/signatures, external respondent delivery and outbox workers. No invitation emails are sent by this slice; no submit/sign/send buttons imply completed workflows. Production deployment and real employee imports remain unapproved.
