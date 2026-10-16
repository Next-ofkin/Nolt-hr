# NOLT HR implementation tracker

Owner approved local implementation on 13 October 2026. This file is the working checklist; checked items require implementation and verification evidence. A phase is not complete simply because its UI exists.

## Master delivery plan — 16 October 2026

Owner direction: continue NOLT HR Forms & Packs as the main product; use isolated sandbox first and promote reviewed application code/configuration/Prisma migrations to Production. **Do not mirror test records, password hashes, MFA enrolments, Auth UUIDs or sessions between environments.** The six active existing application users and their records remain protected. Owner changed the earlier full-reset request to **selective cleanup of inactive users and exclusively owned disposable records**. No data deletion is authorised by this tracker update.

### Environment contract and verified audit baseline

- Production Supabase project: `Nolthr` (`llslubzdkdnvhbatmfug`); 27 NOLT public application tables plus `_prisma_migrations`. Sandbox: `NOLT HR Auth Sandbox` (`wyoeaiowdvzjtcnzhktv`); no application public tables at audit time; one confirmed sandbox Auth user. Recheck before changes.
- Production `public."User"`: 130 rows, **six active (1 DEVELOPER, 1 HR, 4 EMPLOYEE)** and **124 inactive**. Production `auth.users`: seven, correctly joined by `Identity.issuer = 'https://llslubzdkdnvhbatmfug.supabase.co/auth/v1'` and `Identity.subject = auth.users.id::text`: six correspond to active application users, one to inactive. Never infer inactivity from sign-in age alone.
- Production currently has 17 recorded completed Prisma migrations, but `main/database/migrations` listed 15 directories. Investigate unmerged `20261015170000_one_time_developer_bootstrap` and `20261016100000_hr_invitation_drafts` before schema promotion.
- Production has 65 foreign-key constraints (36 RESTRICT), one private bucket `nolt-private-documents` and zero currently listed objects. Preserve system `auth`/`storage` schemas, RLS, grants, indexes, triggers, extension config and migration history.
- Historical checks in this tracker are evidence of the specific previously tested code/environment; **not** proof that the newest deployment, sandbox or every module is production-ready. Re-verify affected features after promotion.

### P0 — Safety and selective production hygiene (no delete approval yet)

- [x] Read-only inventory of production app-user activity, Auth identity linkage, table relationships, migration count and storage.
- [ ] Identify exact six protected user IDs and dependent records, distinguishing ownership, authorship, reviewer access, shared published forms, audit/outbox evidence and historical submissions. Compare all Auth links and identify the one inactive Auth principal for explicit review.
- [ ] Build a complete **row-level dry-run impact report** for the 124 inactive app accounts. Protect shared resources and any records used by active users; do not assume an inactive creator means a shared form can be deleted. Resolve the two unclassified employee-profile relationships.
- [ ] Agree retention/privacy obligations for employment, submissions, audit and invitation events. Identify external notifications, job workers and service integrations affected by cleanup.
- [ ] Produce a verified export/backup and rehearse restore in a separate safe environment; cover database, Auth relationships, storage, secrets/config inventory and deployed functions separately. Record recovery and rollback procedure.
- [ ] Prepare a dependency-aware, transactional, idempotent cleanup plan with explicit allowlisted IDs, pre/post counts, error stop, session revocation and restoration checkpoints. Never truncate shared tables or delete all Auth users.
- [ ] **STOP GATE:** present exact accounts/rows/data categories to delete and recoverable backup evidence; obtain separate explicit final owner approval before any deletion.
- [ ] Once approved, execute only the reviewed inactive-user cleanup in Production during a controlled window; verify all six active accounts, their MFA/sign-in, owned and shared records, form assignments, submissions and audit integrity remain intact.

### P1 — GitHub, migrations and sandbox baseline

- [ ] Resolve Prisma migration divergence: find the two missing migration folders on other branches/commits, compare checksums and schema against Production, then bring approved history into GitHub without rewriting applied migrations.
- [ ] Establish versioned configuration for Sandbox and Production, separate database URLs, Auth project refs, secrets, storage buckets, SMTP/Resend and redirect allowlists; no secrets in commits or browser bundles.
- [ ] Recreate the application schema in the sandbox from **approved, reconciled migrations**, with RLS/grants/function hardening and a private test-storage bucket; don't import production personal data.
- [ ] Seed synthetic DEVELOPER/HR/EMPLOYEE/guarantor test fixtures in the sandbox only; map Auth identities to each environment's own UUIDs. Keep production live-data isolation.
- [ ] Add a deploy pipeline/checklist: PR review → migration diff and dry-run → sandbox integration tests, auth/AAL2/RLS/security checks → controlled approved Production schema migration → smoke tests → documented rollback. Only forward-promote schema/code/reference configuration, not test records.

### P2 — Core HR Forms (finish verified remaining work)

- [x] Historical first slice: HR draft/save/reopen, field ordering/required and recipient type, preview, immutable published versions, access/stale edit checks.
- [x] Historical: employee version-bound drafts/submissions, correction/resubmission and HR review; draft-only deletion/published withdrawal safeguards.
- [ ] Audit implementation on current branch and trace UI → typed API → PostgreSQL for authoring, preview, publish/withdraw, assignment, employee submission and HR correction. Refresh browser/accessibility evidence.
- [ ] Add builder sections, multiple choice, conditional required/visibility rules, repeating groups and complete validation/field dictionary.
- [ ] Implement and verify per-field sensitivity, version history/search/duplication/archive, draft deletion/published withdrawal UX, consent/legal policy and granular review authorisation.
- [ ] Finish private uploads, antivirus scan (ClamAV must pass real scanner checks), authorised downloads, signatures/consent version/checksum; keep required file/signature completion blocked until real verification passes.

### P3 — Onboarding Packs, assignment and deadlines

- [ ] Confirm pack definition: named/versioned HR-managed bundle of **specific published form versions**, required vs optional items, employment-type template, order, recipient type and immutable assignment snapshot.
- [ ] Build Pack template creation/edit/preview/publish/withdraw/versioning and audit history with accessible UI and API.
- [ ] Implement employee/case pack assignment, idempotency, conflict checks, own checklist and HR assignment/reassignment rules.
- [ ] Implement the agreed five-day default deadline policy (precise clock/timezone/start trigger to be ratified), due-date reminders, overdue locking, authorised extensions/reopen and full audit history.
- [ ] Calculate trustworthy pack progress/readiness and HR approval gates (required vs optional, corrected/rejected submissions, missing uploads/signatures and guarantor evidence).
- [ ] End-to-end sandbox journey: HR creates pack → assigns real sandbox user → employee saves/submits → guarantor responds if required → HR corrects/approves → completed/overdue cases render correctly, with denial of cross-user access.

### P4 — Invitation, Auth and external requests

- [x] Historical: staff signup/email, password/TOTP MFA/AAL2, invitation acceptance and owner-verified login; simulated newer HR-invitation browser tests passed (88 unit; 5 browser at commit `9d2c55e`), but full sandbox integration has not been proven.
- [ ] Connect developer-controlled HR invitation → MFA → password setup → activation-pending workflow to **real sandbox APIs**; keep production HR activation off until independently accepted.
- [ ] Test password recovery, session revocation, least-privilege HR provisioning, developer technical-admin limits, role changes and high-risk Auth edge cases.
- [x] Historical owner decision D25: guarantor/reference recipients use direct, request-scoped verified-email access, **not staff MFA**.
- [ ] Complete and verify real external email delivery (only to an explicitly approved test recipient), text draft/submission, independent HR review/corrections, multiple slots, expiry/revocation, privacy and replacement.
- [ ] Keep live file/signature validation separately gated on scanner readiness; review retention/export and recipient consent.

### P5 — Wider HR product roadmap (after Forms & Packs acceptance)

- [ ] Versioned policies and acknowledgement; confidentiality/indemnity multi-party execution; beneficiary allocations/guardian authorisation.
- [ ] HMO/dependents and approved AXA export; induction/certification; asset issuance/return; scoped reporting, reminders and exports.
- [ ] Offboarding initiation, handover, clearance, exit interview, guarded closure, deactivation and retained evidence.

### Release and operating acceptance

- [ ] Implement continuous test coverage and hosted staged smoke tests (unit, Prisma/PostgreSQL, auth/AAL2, RLS/access control, API, responsive browser, mobile/accessibility, upload/signature).
- [ ] Approve role/sensitivity matrix, email sender, policy copy, user retention and recovery/incident runbooks. Verify backups and restoration, monitoring/outbox processing and job workers.
- [ ] Ensure deployment respects the selected hosting services and their commercial-plan conditions; independently verify deployment URL, login, core Forms/Packs journeys and all approval gates.
- [ ] Require owner acceptance and explicit production release approval for each launch milestone. A successful sandbox test is **not** permission to migrate data or enable a production workflow.

### Build progress — 16 October 2026 (pack foundation)

- [x] Located missing Production migration files `20261015170000_one_time_developer_bootstrap` and `20261016100000_hr_invitation_drafts` on `feat/developer-hr-employee-auth`, together with an additional unapplied `20261016120000_hr_invitation_lifecycle`. **Finding the files is not checksum verification nor permission to deploy them.**
- [x] Added `apps/api/src/pack-rules.ts` on the feature branch: strict pack-template input contract, unique immutable form/version references and ordered entries, plus an explicit UTC calendar-day helper. Added `tests/pack-rules.test.ts` with six tests covering acceptance, duplicate rejection and date boundaries.
- [ ] Run new pack tests and typecheck on checkout/CI; static GitHub commit alone is not a passing test.
- [ ] Integrate the pack contract into the authenticated API, Prisma schema/migration and HR screens; no pack database tables exist yet.
- [ ] Confirm the exact five-day deadline policy (calendar/business days, timezone, due-time and start trigger) before wiring reminders or access locks.
- [ ] Compare all 17 Production migration checksums to the feature branch and reconcile `main`; no Production or Sandbox migration applied during this step.
- [ ] Maintain the prior cleanup stop gate: six active users preserved; deletion only after impact report, recovery backup and separate explicit approval.

### Git branching setup — 16 October 2026

- [x] Created `develop` from the current `main` commit; initial contents are identical.
- [x] Retargeted draft PR [#6](https://github.com/Next-ofkin/Nolt-hr/pull/6) (`feat/developer-hr-employee-auth`) to `develop`; GitHub currently reports a clean comparison.
- [ ] Execute and review full tests, security/migration checks and sandbox integration before merging PR #6; clean mergeability does not establish readiness.
- [ ] Set repository branch protection / rulesets and required checks for `main` and `develop` where permissions and CI permit.
- [ ] Adopt flow `feature branch → develop → reviewed release PR → main → separately approved Production deployment`; preserve environment-specific data and require explicit approval for Production migrations.

### Verification gate checkpoint — 16 October 2026

- [x] PR #6 head `551fdfa7` checked for CI status: Vercel and CodeRabbit contexts report success, but the GitHub Actions workflow-run list is **empty**. Neither is evidence of passing NOLT unit, domain or browser suites.
- [x] Created [Issue #7](https://github.com/Next-ofkin/Nolt-hr/issues/7) to define CI requirements and re-enable them safely after investigating the prior CI workflow removal.
- [ ] Run the new pack unit tests and full typecheck/build/domain/browser test suite. **Do not merge PR #6 based on the current status checks alone.**
- [ ] Hosted production migration checksum query was not completed because the connection required access not granted; no further attempt was made. Migration parity remains unverified.
- [ ] Review sandbox migrations through an authorised workflow; no schema/data changes were made in either Supabase project.

### Next executable priorities

1. Audit/reconcile production's 17 migration records against GitHub; inspect current Forms/Packs code and mark truly delivered vs documented requirements.
2. Prepare selective-cleanup impact report protecting all six active users; backup and rehearse the recovery. **No destructive change without separate final approval.**
3. Bootstrap matching application schema in the Auth Sandbox from approved Prisma history and synthetic data, then resume Forms/Packs implementation and real sandbox end-to-end tests.

---

## Owner amendment ? simple guarantor invitations, 15 October 2026

- [x] Owner confirmed receipt of the guarantor test email.
- [x] Record D25: guarantors open the invited form directly, without staff signup/password/MFA; staff MFA stays unchanged.
- [x] Replace the external MFA prototype with verified-email, one-request sessions and a simple Resend invitation. API/client/frontend builds, 36 unit/security checks and the revised real-provider direct-form journey passed locally against hosted Supabase (3.0 minutes). Migration 014 and all 14 hosted checksums/RLS/grants passed.
- [x] Verify the revised direct-form journey, privacy, expired/revoked-link denial and replacement. New recipient has no password/MFA; six widths, zoom/keyboard and mobile evidence passed.
- [x] Pass separate real staff password/TOTP/global-logout browser regression (32.5 seconds). Staff MFA remains required; global logout blocks another staff tab.
- [ ] Verify one updated invitation email after explicit resend approval. Earlier inbox receipt does not verify the revised experience.

## Current position - updated 15 October 2026

- [x] Foundation and first HR form-authoring slice completed for local development.
- [x] Real signup, Resend SMTP email delivery and authenticator MFA accepted by the owner.
- [x] Employee records, onboarding cases, published-form assignments and own employee checklist completed and verified against hosted Supabase.
- [x] Employee invitations, real email delivery, authenticator MFA and employee activation verified on 14 October 2026.
- [x] Saved employee form drafts, validated submissions and immutable submission history verified with real Auth against hosted Supabase.
- [x] HR review and corrections verified through the real HR dialog, employee resubmission and final approval, with explicit record scope and sensitive-data permission checks.
- [ ] Next delivery: employee-sent guarantor/reference request workflow. Owner deferred live upload/signature testing on 15 October; scanning remains mandatory before file confirmation.

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
- [x] Owner reports Vercel project nolt-hr deployed commit 4310543 to READY on 15 October. Independently checked the supplied nolt-hr-excel-shogbolas-projects.vercel.app URL: /login, /tracker and proxied readiness each returned a 302 to Vercel authentication. These alias checks were blocked at that time; canonical-domain checks and owner login/MFA acceptance below supersede this limit.
- [x] Independently verify canonical frontend https://nolt-hr.vercel.app on 15 October: /login and /tracker render with HTTP 200; /api/v1/health/ready returns HTTP 200 with ready through the frontend proxy. No Vercel-authentication redirect or bypass was needed. The additional deployment alias remains a separate protection check.
- [x] Owner confirmed Railway PUBLIC_APP_URL/Supabase redirect configuration and real hosted login/MFA working at https://nolt-hr.vercel.app on 15 October. Recorded as owner acceptance, not a new automated browser run.

## Next delivery - private files and signatures

Security fixes in progress (14 October): private Supabase storage adapter with no overwrite; fail-closed ClamAV scanning; actual image decoding/normalisation; save-before-sign and content-change invalidation; server signing-method/confirmation validation; checksum-checked authorised attachment downloads. Required fields no longer permanently disable Submit. Full delivery remains unchecked: live scanner configuration, hosted storage/browser acceptance, orphan/expiry cleanup, final consent policy and keyboard accommodation for draw-only forms are still pending. Isolated storage/scanner test doubles do not establish hosted acceptance.

- [x] Install and verify official project-local ClamAV LTS binaries and add localhost configuration/start-stop-update commands.
- [x] Verify scanner fail-closed handling for malware, error, truncated and unexpected replies; all seven focused file/security tests passed on 15 October. These protocol fixtures do not establish real scanner readiness.
- [x] Record owner scanner decision, 15 October: retain ClamAV and defer live upload/signature testing. Cloudmersive is not selected; no new provider is connected. This completes the decision only, not scanner readiness.
- [ ] Download official definitions and verify real clean/EICAR scanning. Blocked by updater DNS failure; direct endpoint diagnostic returned 403. See [local scanner setup](development/CLAMAV_LOCAL.md).
- [ ] Run the new real-Auth upload/drawn-signature browser journey after scanner readiness; the test is written but has not passed yet.

- [ ] Build private uploads/signatures and employee-sent guarantor/reference requests, completed by the actual recipient.

Next executable scope: employee enters recipient details for an HR-designated guarantor/reference assignment; request-scoped access, expiry/revocation and employee status-only visibility. Verify text-only responses independently first. Required attachments/signatures must continue to block final submission until real scanner acceptance is verified. External email delivery requires its own explicit test-recipient approval; the earlier employee invitation approval does not authorise guarantor emails.

## Guarantor/reference requests - in progress (15 October 2026)

- [x] Verify employee recipient-detail preparation from screen through typed API to database/audit. Real Supabase login/MFA browser journey passed on 15 October (1.7 minutes), including save/reopen, six viewport widths, stale/self-nomination rejection, cross-employee denial and employee proxy-response denial. Saved details are explicitly Not sent.
- [x] Pass isolated PostgreSQL checks for contact ownership, employee-form/self-nomination rejection, concurrent edits, immutable assignment binding, restricted grants and atomic audit/outbox. Existing domain regressions passed.
- [x] Apply additive migration 011 to approved hosted development Supabase; all 11 checksums, restricted TLS, schema/RLS/grants and immutable-form checks passed. All 27 unit/security checks and API/frontend builds passed. Browser testing uncovered and verified a bounded sign-in flow storage timeout fix; no authentication/MFA bypass added.
- [ ] Implement actual secure request delivery, recipient-scoped access, text-only drafts/submission and HR review with independent respondent evidence.
- [x] Implement and pass isolated database checks for request snapshots/idempotency, competing creation/delivery claims, respondent revisions, exactly-once immutable text submission and session-scope integrity. Email transport fixtures are explicitly isolated; no real delivery is inferred.
- [x] Pass 32 unit/security checks, including expired/revoked links rejected before provider proof, strict request/proof validation, rejection of scoped cookies by legacy APIs, and safe form-storage failure handling.
- [x] Historical MFA prototype: pass real-auth request creation, recipient email proof/MFA, replacement of an open request, text draft/reopen/submission and locked submitted fields. Final focused journey passed in 4.3 minutes on 15 October; six viewport widths, 200% CSS zoom, keyboard focus and mobile evidence checked. Supabase-generated verification links were used without sending emails to QA addresses; real inbox acceptance remains separate.
- [x] Apply migrations 012/013; verify all 13 hosted checksums, restricted TLS, RLS/grants and immutable-form checks. The AuthFlow constraint omission found in the first browser run is fixed in migration 013, preserving migration 012 unchanged.
- [x] Pass contact-preparation browser regression (2.5 minutes). The subsequent recipient journey exposed the submitted-control UI issue and a default transaction-acquisition timeout; fixes and final passing evidence are recorded in the test report.
- [x] Supabase accepted the single approved test email to exceldistrings@gmail.com (SENT, one attempt), and the owner confirmed receipt. The owner rejected staff-style MFA for guarantors; activation/submission is not accepted. D25 supersedes that experience; revised verification remains pending.
- [ ] Deliver independent HR review/corrections and configurable multiple guarantor/reference slots.
- [ ] Verify real delivery to an explicitly approved test recipient; no external-request emails sent by contact preparation.

Scope and limits: [external requests](development/EXTERNAL_REQUESTS.md). Full third-party completion remains unchecked.

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


## Owner redesign workstream — 15 October 2026 (branch: feat/secure-hr-lifecycle-packs-20261015)

- [x] Create an isolated feature branch (main untouched).
- [ ] Verify draft-form deletion against a real database, UI flow, revision/race checks and authorisation.
- [ ] Verify unpublish against active historical assignments; no new assignments allowed.
- [ ] Replace hardcoded/email-derived HR and employee provisioning with one-time developer bootstrap and invitation-based role activation.
- [ ] Maintain mandatory TOTP AAL2, secure recovery, revocation and audited permissions.
- [ ] Build reusable, permanent pack templates, pack versioning, individual employee assignments and approval-based progress.
- [ ] Implement default five-calendar-day pack/form assignment deadlines, override, lock on expiry, audited extension/reopening and reminders.
- [ ] Build employee-sent guarantor/referee form links and external-only responses; enforce confidentiality at the API and storage layers.
- [ ] Implement mandatory HR review comments, resends and immutable evidence across external correction cycles.
- [ ] Standardise shadcn-style toast notifications; accessible mobile-first layouts and keyboard support.
- [ ] Profile API/session/database latency, avoid redundant requests, introduce pagination and test loading/performance targets.
- [ ] Generate OpenAPI client, run typecheck/build/unit/browser/database/security checks and record results before PR merge.

**Checkpoint:** Form authoring backend API and editor confirmation controls have been committed on this branch; their integration and automated verification are not yet complete. Existing published evidence is never eligible for deletion. Production deployment and real employee imports remain out of scope.


### Checkpoint — 15 October 2026, after draft PR #3
- [x] Added Sonner UI provider and replaced Form Library inline banner with toast events (code committed, browser verification pending).
- [x] Added narrow migration to permit published→unpublished transition without content changes and allow guarded deletion of never-published drafts (migration NOT applied).
- [x] Added unit-test cases for never-published draft deletion policy and isolated DEVELOPER permissions (tests NOT executed successfully yet).
- [x] Added DEVELOPER role grants and DeveloperGuard only; no provisioning endpoints or role migration.
- [ ] CI: latest observed workflow concluded `startup_failure` with zero jobs. Build, npm ci, generated OpenAPI drift, migrations, unit/domain/e2e all remain unverified.
- [ ] Do not merge PR #3; verify actual Supabase/PostgreSQL integration and account migration with synthetic users first.
