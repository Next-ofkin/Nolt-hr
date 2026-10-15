# NOLT HR implementation tracker

Owner approved local implementation on 13 October 2026. This file is the working checklist; checked items require implementation and verification evidence. A phase is not complete simply because its UI exists.

## Current position - updated 14 October 2026

- [x] Foundation and first HR form-authoring slice completed for local development.
- [x] Real signup, Resend SMTP email delivery and authenticator MFA accepted by the owner.
- [x] Employee records, onboarding cases, published-form assignments and own employee checklist completed and verified against hosted Supabase.
- [x] Employee invitations, real email delivery, authenticator MFA and employee activation verified on 14 October 2026.
- [x] Saved employee form drafts, validated submissions and immutable submission history verified with real Auth against hosted Supabase.
- [x] HR review and corrections verified through the real HR dialog, employee resubmission and final approval, with explicit record scope and sensitive-data permission checks.
- [ ] Next delivery: private uploads/signatures, followed by employee-sent guarantor/reference requests.

## Employee records and onboarding assignments - complete (hosted development)

- [x] Implement employee directory, creation and revision-checked employment details; local build and database service checks passed.
- [x] Verify one active onboarding case per employee and concurrent-case conflicts in isolated PostgreSQL.
- [x] Verify exact published-version assignments, required/optional/due dates and immutable snapshots in isolated PostgreSQL.
- [x] Implement employee checklist; verify own-record scoping and third-party form access denial at the service/database boundary.
- [x] Apply migration 005 and employee-linking integration to hosted Supabase; verified five matching migration checksums and trusted restricted-runtime TLS on 14 October 2026.
- [x] Verify hosted API isolation, immutable assignments, concurrent employment edits, audit/outbox and the real-account responsive browser journey on 14 October 2026.

Evidence and remaining limits: [onboarding slice](development/ONBOARDING_SLICE.md). Signup/email delivery and MFA are owner-verified; password recovery remains a separate unchecked item. This completes the manual employee/case/assignment slice; template bundles, invitations, responses and progress/readiness rules remain pending.

## Completed hosted onboarding verification - 14 October 2026

- [x] Recheck Supabase pooler connectivity: DNS and verified TLS worked on 14 October 2026.
- [x] Apply migration 005 and install the private verified-account linking integration.
- [x] Verify all five migration checksums, restricted runtime access, RLS and denied public Data API access to Employee/OnboardingCase/FormAssignment.
- [x] Complete the final real Supabase Auth regression rerun without concurrent development rebuilds: all 11 backend/unit/security checks passed.
- [x] Pass all five real/public Auth, form authoring and onboarding browser journeys; mobile evidence reviewed.
- [x] Test the complete HR creates employee -> opens case -> assigns published form -> employee sees only their own checklist journey.
- [x] Check employee screens at all six target widths, and confirm cross-employee and third-party access denial through the API.

## Employee invitations and activation - verified (hosted development)

- [x] Implement persistent expiring invitation requests, idempotent send, explicit resend/revoke, delivery queue and activation screens; workspace type checks and builds pass.
- [x] Apply migration 006 and invitation redirect additions; all six hosted checksums, runtime grants/RLS and public API denial verified.
- [x] Verify idempotency, competing resend, expiry/revocation, exclusive worker claims, five-attempt backoff/exhaustion and uncertain-delivery recovery in isolated PostgreSQL.
- [x] Verify the complete real Supabase invitation proof, TOTP, password setup and own-record activation browser journey.
- [x] Send the single owner-approved test invitation through Supabase/Resend SMTP and record provider acceptance separately from inbox receipt.
- [x] Recipient confirmed inbox receipt and successful activation; database confirms ACCEPTED, the intended employee link and one verified MFA factor.
- [x] Final API/Next production compilation passed; all six browser journeys passed across focused runs, including the final onboarding regression rerun. See the test report for earlier interrupted runs and the isolated database cleanup limitation.

Implementation and boundaries: [employee invitations](development/INVITATIONS.md).

## Employee form responses - complete (hosted development)

- [x] Build employee response drafts, server-validated submissions and immutable submission history for the current structured field types.
- [x] Save and reopen incomplete answers against the exact assigned published form version; stale saves and cross-employee/third-party access denied in isolated database acceptance.
- [x] Validate final answers on the API, preserve immutable submission versions and commit submission audit/outbox evidence atomically; validation unit tests and database replay/immutability checks passed.
- [x] Add responsive employee form entry and clear draft/submitted status; the full real-Auth save/reopen/submit journey passed at six widths. Submitted answers are locked and await a separate HR review.
- [x] Apply migration 007; verify seven checksums, hosted permissions/RLS and public API denial. Final builds, all 14 unit/live backend checks and isolated domain checks passed.
- [x] Pass affected renderer/onboarding browser regressions and the final response journey. Mobile submission evidence reviewed; initial interrupted/timeout runs are recorded in the test report.

Evidence and limits: [employee responses](development/RESPONSES.md). Required files/signatures block final submission until capture is implemented. Conditional/repeating fields and domain-specific validation remain pending. Review-driven correction cycles are verified below.

## HR review and versioned corrections - complete (hosted development)

- [x] Verify HR review, mandatory correction reasons and version-preserving resubmission from screen to database.
- [x] Verify explicit reviewer assignment, sensitivity permissions, cross-record/technical-admin denial and competing-decision conflicts.
- [x] Apply review migrations 008/009 to hosted development Supabase; nine checksums, hosted permissions/RLS and security advisors verified. Only the existing leaked-password-protection warning remains.
- [x] Pass the real-Auth browser journey through the actual HR review dialog, including six viewport widths and mobile evidence review (5.1 minutes on 14 October 2026).

Evidence and limits: [HR reviews](development/REVIEWS.md).

The delivered HR workflow uses an explicit initial reviewer assignment and trusted whole-form classification. Dedicated specialist-reviewer UI, reassignment/revocation administration, per-field sensitivity, production role/classification policy and wider browser/zoom/touch acceptance remain separate gates. Correction requests appear in the portal; no review email delivery is claimed.

## Railway staging preparation - 14 October 2026

- [x] Add an explicit staging startup gate, Railway port binding, API-only build/start commands and deployment guide; configuration security tests passed.
- [x] Add and test sanitised database-readiness error logging on 15 October after hosted readiness returned 503 without a visible cause. API compilation/generated contracts and all 24 unit/security checks passed; the endpoint remains fail-closed.
- [x] Bundle the fingerprint-verified public database CA with the compiled API and resolve it relative to the staging runtime, avoiding manually configured certificate paths. All 25 unit checks and a read-only verified-TLS Supabase query using the bundle passed on 15 October. Hosted readiness after this fix passed, per the owner-supplied Railway inspection below.
- [x] Deploy staging API to Railway and pass its database-readiness deployment gate. Owner supplied Railway-connected inspection: commit 3c2c947, deployment 37513388-ce4a-4e83-8dfa-a4df6c305e28 reached SUCCESS on 15 October 2026 at 07:58:27 Africa/Lagos; healthcheck succeeded and no database-readiness failure entries were found in the inspected logs.
- [x] Independently verify public API endpoints on 15 October 2026: https://noltapi-production.up.railway.app returned HTTP 200 for /api/v1/health/live (ok), /api/v1/health/ready (ready) and /api/docs (Swagger HTML).
- [x] Prepare Railway frontend build/start commands, platform port binding, HTTPS upstream validation and manual service guide on 15 October. Production build passed; compiled login page and same-origin proxy to the live API both returned HTTP 200 in local smoke checks.
- [x] Prepare Vercel frontend configuration and a bundled production tracker snapshot on 15 October. Build and local login/tracker/live-API proxy checks passed. Owner deleted the Railway web service and selected Vercel Hobby after its personal/non-commercial restriction was explained; company-use eligibility is not confirmed.
- [ ] Connect an HTTPS frontend and verify real hosted login/MFA through the same-origin API proxy. Frontend is currently local; Vercel deployment is pending.

## Next delivery - private files and signatures

Security fixes in progress (14 October): private Supabase storage adapter with no overwrite; fail-closed ClamAV scanning; actual image decoding/normalisation; save-before-sign and content-change invalidation; server signing-method/confirmation validation; checksum-checked authorised attachment downloads. Required fields no longer permanently disable Submit. Full delivery remains unchecked: live scanner configuration, hosted storage/browser acceptance, orphan/expiry cleanup, final consent policy and keyboard accommodation for draw-only forms are still pending. Isolated storage/scanner test doubles do not establish hosted acceptance.

- [x] Install and verify official project-local ClamAV LTS binaries and add localhost configuration/start-stop-update commands.
- [ ] Download official definitions and verify real clean/EICAR scanning. Blocked by updater DNS failure; direct endpoint diagnostic returned 403. See [local scanner setup](development/CLAMAV_LOCAL.md).
- [ ] Run the new real-Auth upload/drawn-signature browser journey after scanner readiness; the test is written but has not passed yet.

- [ ] Build private uploads/signatures and employee-sent guarantor/reference requests, completed by the actual recipient.

## Foundation setup and first HR form slice — complete (local development)

- [x] Record implementation approval and confirmed product requirements.
- [x] Create the project checklist and milestone tracking convention.
- [x] Set up npm workspaces, Next.js web, NestJS API and shared form contracts.
- [x] Install shadcn/ui components and responsive application navigation.
- [x] Set up PostgreSQL, Prisma migrations and synthetic local development data.
- [x] Expose and generate the initial OpenAPI contract and typed API client.
- [x] HR can create a form and save/reopen its draft through the API/database.
- [x] HR can configure field order, required fields and employee/guarantor/reference recipient.
- [x] HR can configure signature and attachment fields (capture/storage follows below).
- [x] HR can preview and publish an immutable form version.
- [x] Reject stale edits, edits to published versions and unauthorised authoring requests.
- [x] Verify API integration, database persistence and responsive browser interactions.
- [x] Document runnable commands, checks and limits of the local development identity.

This completes the initial local setup and HR authoring slice, not the production security foundation or the entire form-builder scope.

## Form builder expansion

- [ ] Sections, multiple-choice questions, conditional visibility/requiredness and repeating groups.
- [ ] Per-field sensitivity, configurable validation/file rules and approved consent text.
- [ ] Form duplication/archiving, version-history browsing and server-side pagination/search.
- [ ] Complete field dictionary and assignment/template rules with HR.

## Real Supabase Auth - implemented; signup and MFA owner-verified

- [x] Replace the synthetic provider and shortcut endpoint with real Supabase password login.
- [x] Retire old shortcut sessions and deactivate fixture accounts while preserving historical evidence.
- [x] Enrol and verify real TOTP; require signed AAL2 before issuing workspace access.
- [x] Encrypt provider tokens/flow state server-side; retain HttpOnly cookies, CSRF and session limits.
- [x] Verify private profile provisioning defaults to EMPLOYEE and ignores role metadata.
- [x] Verify provider-side global revocation, runtime permission denial and HR form authoring against real Auth.
- [x] Owner verified Resend SMTP email delivery, real signup/email confirmation and MFA on 13 October 2026. Evidence: owner confirmation in this session.
- [ ] Separately verify password recovery end to end; not inferred from signup/MFA confirmation.
- [x] Verify the approved first HR account claimed the private one-time bootstrap after email confirmation; checked against the hosted private bootstrap/application membership on 14 October 2026.
- [ ] Approve production role administration, lost-factor recovery, shared throttling and operations.

## Secure identity and core onboarding

- [x] Select and integrate Supabase Auth for real login and authenticator MFA.
- [x] Owner verified real signup emails, confirmation and MFA; proceed to the employee/onboarding slice.
- [x] Verify password recovery independently.
- [x] Real authenticator MFA, secure sessions, CSRF and account/provider-session revocation.
- [ ] Approved HR/reviewer/sensitive-data permission matrix.
- [x] Employee creation, directory, employment details, cases and published-form assignment verified with real Supabase Auth.
- [ ] Implement HR-approved employment-type template bundles.
- [x] Expiring invitation, recipient verification, resend/revoke and activation.
- [x] Employee own checklist and read-only assigned-form preview verified with real Auth and across all six target widths.
- [ ] Approve and implement authoritative progress/readiness rules.
- [x] Dynamic response drafts, final validation and immutable first submissions for current structured fields; conditional/repeating rules and review-driven resubmission follow separately.
- [ ] Private upload/quarantine/scanning and authorised download.
- [ ] Drawn/uploaded signatures and signed PDFs stored privately, with database file reference, signer, exact response/consent version, signing timestamp and checksum; validate/compress before confirmation and enforce authorised short-lived retrieval.
- [ ] HR queue, review decisions, correction reasons and resubmission history.
- [ ] Audit and transactional outbox across domain changes.
- [ ] Reliable notification delivery, retry/failure queue and delivery monitoring.
- [ ] Phase 1 integrated pilot and acceptance evidence.

## NOLT workflows — Phase 2A

- [ ] Employee sends HR-designated guarantor/reference forms to recipients.
- [ ] External scoped, expiring sessions; guarantor completes/signs own response.
- [ ] Deny employee proxy completion/signing and cross-request evidence access.
- [ ] Independent external review, correction, resend and replacement.
- [ ] Versioned policy publishing and employee acknowledgement history.
- [ ] Confidentiality/indemnity staged employee/surety/witness/NOLT execution.
- [ ] Beneficiary allocations, guardian checks and authorisation/export.

## Benefits, induction and assets — Phase 2B

- [ ] HMO consent and employee/dependent enrolment.
- [ ] AXA export verified against the actual approved workbook.
- [ ] Induction tasks, employee acknowledgement and HR/Operations certification.
- [ ] Asset inventory, assignment, condition and employee receipt acknowledgement.
- [ ] Template settings, reminders, reports and permission-scoped exports.

## Offboarding — Phase 3

- [ ] Exit initiation, notice/last day and versioned handover.
- [ ] Return tasks generated from assigned assets; approved exception handling.
- [ ] Department clearances, exit interview and guarded HR closure.
- [ ] Access deactivation and retained lifecycle evidence.

## Release readiness

- [x] Supabase development project linked; three migrations applied atomically with matching Prisma checksums, RLS, restricted backend role and denied public API access. Remote trigger/security checks passed with synthetic changes rolled back; zero retained users/forms. Security advisors reported no warnings/errors. See [evidence](development/SUPABASE_SETUP.md).
- [x] Trusted Supabase CA installed; restricted client TLS and hostname verified. At that verification, Prisma reported the hosted schema up to date through migration 004; migration 005 is still pending. Actual app connected to Supabase: 11 automated checks and 5 Chromium journeys passed; public REST access denied. Four synthetic users and three test forms retained; test sessions revoked. See [test report](development/TEST_REPORT.md).

- [ ] Direct API/file/export isolation and sensitive access tests.
- [ ] All portals and builder verified at 320/375/768/1024/1440/1920 widths and zoom.
- [ ] Keyboard/touch signing, accessible forms and current browser coverage.
- [ ] HR/legal decisions, original source forms, privacy/retention and signing approved.
- [ ] Production provider setup, secrets, scanning, monitoring and incident owners.
- [ ] Backups/restore exercise, measured performance and deployment rollback.
- [ ] Representative pilot accepted and production deployment explicitly authorised.

## Verification history and remaining limits

Historical first-slice evidence from 13 October 2026 (retired synthetic commands below are not current setup instructions):

- `npm run db:generate`, `db:migrate`, `db:permissions`, `db:seed`: local PostgreSQL schema, restricted runtime role and synthetic identities prepared.
- `npm run api:generate`: initial OpenAPI specification and frontend types generated from NestJS/Zod.
- `npm run typecheck`: all workspaces pass.
- `npm test`: 4 passing checks, including real PostgreSQL/API authoring, immutable versions, stale writes, concurrent version allocation, HR/employee separation, CSRF and audit permissions.
- `npm run test:e2e`: 2 Chromium checks pass, covering create/save/preview/publish/reopen/new version and no horizontal overflow at 320/375/768/1024/1440/1920 widths.
- `npm run build`: API and frontend production compilation pass. This is not production release approval.
- Desktop/mobile screenshots reviewed locally under ignored `.local/qa/`.
- Pre-merge rerun: type checks, both builds, 4 domain/API/database checks and 2 Chromium tests all passed against compiled applications.
- GitHub Actions attempted [PR #2 run](https://github.com/Next-ofkin/Nolt-hr/actions/runs/38401471685), but reported `startup_failure` with zero jobs/check runs and no test logs. The workflow passes local actionlint validation; remote execution remains unverified and requires follow-up.

Historical limits at the initial Auth slice: response collection, signatures/uploads and delivery workers were pending. The current position and delivery checklist above supersede these earlier limits. Password recovery, full zoom/touch signing, all-browser and release checks remain separate gates.

Before the next merge, investigate the GitHub Actions startup failure and obtain a successful remote run. This does not invalidate the completed local slice, but remote CI is not marked passed.

Run instructions: [local setup](development/LOCAL_SETUP.md). Initial schema: [data model](development/DATA_MODEL.md).

Historical, retired synthetic identity evidence (13 October 2026): migrations 002/003 applied; workspace type checks and builds passed; 11 domain/API/protocol/security tests and 5 Chromium tests passed. Includes PKCE/nonce/browser binding/replay failures, unknown identity and privilege denial, session rotation/idle/absolute expiry, access changes and cross-tab sign-out. Login and existing builder layouts were checked at the six viewport widths. The provider MFA claim is simulated; real second-factor enrolment and recovery are not implemented by the local fixture. See [identity setup](development/IDENTITY.md).

Historical onboarding acceptance: employee directory, cases and exact published-version assignments passed hosted verification. Invitation/activation followed and is now verified above. Production role administration and real-data release remain separate gates.

Real Auth update (13 October 2026): migration 004 applied through Prisma; fake login/provider removed; private Supabase user provisioning and provider-session checks installed. Type checks and builds passed; 11 current backend/security checks passed with real Supabase password/TOTP and disposable provider accounts. Email delivery and signup confirmation were subsequently accepted by the owner; password recovery remains separately unverified. See [identity setup](development/IDENTITY.md).

Current real Auth browser acceptance: 4 Chromium checks passed for actual password/TOTP login and global logout, HR authoring/versioning, responsive builder/preview and login/signup/recovery screens across six widths. All 11 backend/unit/security checks passed. See [current test report](development/TEST_REPORT.md). Signup/email delivery and MFA are now owner-verified; first HR bootstrap was subsequently verified on 14 October; password recovery remains separately unchecked.

Latest acceptance, 14 October 2026: migration 005 and private verified-account linking installed; all five hosted checksums match. All 11 backend/unit/security checks and five Chromium journeys passed (onboarding focused run plus four regression journeys). RLS/runtime grants, denied public API access and the approved HR bootstrap were verified. Disposable provider test accounts retired; synthetic application/audit histories retained. No production release or real employee imports. See [onboarding evidence](development/ONBOARDING_SLICE.md).
