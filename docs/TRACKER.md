# NOLT HR implementation tracker

## At-a-glance status: updated 21 October 2026

**Live:** the portal runs on a VPS at `https://hr.dastings.name.ng` (Docker Compose + Caddy). Supabase `Nolthr` holds data and login. See [DEPLOYMENT.md](DEPLOYMENT.md).

**Verified locally on the latest `main`:** Prisma generation, clean typecheck and build, **150/150** unit and domain tests, phone-size screenshot review of the employee home, employee form and guarantor form (no sideways overflow). **Not verified:** GitHub Actions (every run fails to start because of a GitHub account billing lock, not because of the code), real-device checks of camera/photo upload and signature drawing, a restorable database backup, secret rotation after the Railway period.

**Database:** production has 32 applied Prisma migrations, none incomplete, the latest `20261021100000_form_and_pack_lifecycle`. All Pack migrations are applied. Active accounts: 1 DEVELOPER, 4 HR, 6 EMPLOYEE. The earlier "17 migrations / Pack migrations not applied" status is obsolete.

### Delivered since the 18 October snapshot
- [x] Packs: create, version, publish, unpublish, assign, approve, extend deadlines (verified in production).
- [x] Form and pack lifecycle rules: unpublish before delete; forms inside packs change only by new version; new assignments use the newest published form version ([rules](development/FORM_AND_PACK_RULES.md); 4 rule tests).
- [x] AXA HMO enrolment form and a spreadsheet export (4 tests). The export button was removed from the HR screen on owner request; the code stays.
- [x] PDF export text-encoding fixes (curly quotes, line breaks, orphan headings).
- [x] Phone-first interface: floating bottom navigation, bottom-sheet dialogs, employee panel as a floating sheet, larger touch targets, sticky form actions, branded progress bars.
- [x] Site icon (`icon.svg`, `apple-icon.png`).
- [x] Hosting moved from Railway/Vercel to one VPS; Docker images, Compose, Caddy and setup/update scripts under `deploy/vps/`.
- [x] Three roles only (DEVELOPER, HR, EMPLOYEE); every active HR user can review.
- [x] Documentation refresh (this update).

### Open items
- [ ] NOLT logo PNG (`apps/web/public/branding/`, `NEXT_PUBLIC_BRAND_LOGO_PATH`) and brand-font confirmation (Lexend is a working choice).
- [ ] Verified, restorable database backup and a restore rehearsal.
- [ ] Rotate secrets that were stored on Railway (Supabase secret key, Resend key, Cloudmersive key); change the server's initial root password and use key-only SSH.
- [ ] Fix GitHub billing so CI can run; then consider a required status check.
- [ ] Re-run `npm audit` and triage before onboarding real employees.
- [ ] Update the outdated HR-activation fixture in `scripts/test-onboarding-db.mjs`.
- [ ] Dates print as ISO strings in exported PDFs.
- [ ] End-to-end test of assigning a form that is inside a pack.
- [ ] Remaining roadmap: policies, agreements, induction, assets, reminders, reports, offboarding.
- [ ] Optional: delete the old `develop` branch; make the repository private (the server's `git clone` would then need a token).

Older sections below are dated snapshots and keep their original context. Where they mention Railway, Vercel, "Pack migrations not applied", or "GitHub Actions retired", the status above supersedes them.

---

## Owner-approved simplified delivery approach — 18 October 2026

Owner direction: **prioritise implementing NOLT HR Forms, Packs and HR workflows now**, without requiring CircleCI, GitHub Actions or a separate Supabase Auth sandbox as milestones for every feature. A separate NOLT development team will take responsibility for final deployment. All prior technical/release checklists remain reference material, not permission to change Production.

### Implementation-first workflow
- [x] Confirm simplified approach: build on feature branches, maintain application schema as versioned Prisma migration files, review each change and merge to `develop` as appropriate. Keep `main` as the stable handoff/release branch.
- [ ] Deliver HR Pack CRUD and versioned Pack Items referencing immutable published FormVersion rows, API guards and HR interface, reusing the existing Forms/employee/onboarding code.
- [ ] Deliver pack assignment, employee checklist, due dates/extensions, required-form progress, HR review and guarantor integration in small working slices.
- [x] Run practical local checks: Node 24 checkout passed Prisma generation, 99/99 Pack-inclusive unit tests (prior commit), full typecheck/build on feature commit `06a3827`, plus handover preflight/typecheck/build on `7a2a7c7`. This is **local verification**, not live integration or a completed merge.
- [ ] Maintain one documented, ordered Prisma migration history; do not drop/recreate live tables or clear `_prisma_migrations` in an attempt to repair consistency.
- [ ] Preserve the six active Production users and their dependent data. Deletion of inactive users or their records is **not** authorised; require an impact list, backup and separate final approval.
- [ ] For NOLT developer handoff: provide reviewed source, ordered migration files/checksums, setup and environment documentation, seed/test-data separation, technical limitations, security checks, operations/deployment notes and an acceptance checklist.
- [ ] NOLT developers should deploy to an appropriately isolated/empty target after verifying migrations on a disposable database, rather than reset the existing hosted database as a shortcut. Any use of the current Production for testing requires a separate risk/impact decision.

### Working priorities
1. Resume actual Forms & Packs feature implementation and UI; avoid additional CI-provider setup.
2. Keep pack APIs, schema and frontend consistent through reviewed Prisma migrations.
3. Produce a deployable handoff package for the NOLT development team after features and minimal local acceptance are complete.

---

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
- [x] Run new Pack tests and typecheck locally: user supplied evidence of **99/99 tests passing**, including 11 Pack tests, followed by clean typecheck/build on fixed feature commit `06a3827`.
- [x] Integrate Pack contracts into authenticated API, Prisma schema, six versioned migration files and HR frontend screens. **Production Pack tables do not exist yet**; migrations are unapplied.
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

### CI implementation checkpoint — 16 October 2026

- [x] Inspected commit `4a5d229`: it removed the prior `.github/workflows/checks.yml`, which included synthetic PostgreSQL and browser tests; the commit message alone does not establish the rationale for removal.
- [x] Added `.github/workflows/pr-checks.yml` to `feat/developer-hr-employee-auth` (commit `33ec38d`): `npm ci`, Prisma client generation, typecheck, unit/security tests including Packs, and production build. Triggers on PRs to `develop`/`main`, pushes to `develop`, and manual dispatch. No hosted credentials, deployments, or migrations.
- [ ] **CI startup blocker discovered:** GitHub Actions recorded two `startup_failure` runs for head `33ec38d` (run IDs `38959500319`, `38959492070`); each had **zero jobs**. This is not a failing test result. Inspect GitHub Actions workflow validation, repository Actions permissions/billing and startup event logs before adjusting code. No test-pass claim.
- [ ] Confirm a successful actual GitHub Actions run; immediately after commit no workflow run was returned. Do not label tests as passed without run evidence.
- [ ] Add vetted isolated PostgreSQL/domain and browser test jobs; prior workflow used local synthetic services, and must not acquire real Supabase secrets.
- [ ] Protect `develop`/`main` using required checks only after workflow reliability is proven.

### Owner-supplied GitHub Actions diagnostics — 16 October 2026

- [x] Owner supplied external diagnostic findings for failed run [38959500319](https://github.com/Next-ofkin/Nolt-hr/actions/runs/38959500319): `startup_failure`, synthetic `BuildFailed` path, empty name, workflow ID `383222104` reported deleted, **zero jobs**, no runner or test output; a second run `38959492070` showed the same pattern. These are pre-job failures, **not** application-test failures.
- [x] External review reported `.github/workflows/pr-checks.yml` is syntactically valid and PR #6 still targets `develop`. These checks were reported by a separate coding assistant, not independently reproduced with an executed local test suite.
- [ ] Owner to inspect GitHub account billing/payment status, actual Actions budgets/limits and repo Actions policy. **No billing lock has been confirmed.** Avoid raising spending limits without evidence.
- [ ] If policy/billing looks normal, request GitHub Support investigate the reported deleted `BuildFailed` workflow registration (`383222104`). Do not assume orphaned registry is the proven cause.
- [ ] Trigger a new Actions run only after platform settings diagnosis; record workflow name, jobs, run URL and results.
- [x] Owner's local Node 24 checkout ran `npm ci`, `db:generate`, `typecheck`, `npm test` (**99/99 Pack-inclusive tests**), and after JSX fix a successful full `build`. This was not a clean CI runner; subsequent branding changes passed typecheck/build but did not rerun all tests.
- [ ] Keep PR #6 in draft pending real CI/test evidence, migration parity and sandbox checks. No Production deployments, migrations or inactive-user deletions authorised.

### Public-repo CI retry — 16 October 2026

- [x] Repository visibility was confirmed public. Opened isolated draft PR [#8](https://github.com/Next-ofkin/Nolt-hr/pull/8) adding only `.github/workflows/pr-checks.yml` from branch `ci/restore-pr-checks` into `develop`. This is not the major feature PR.
- [x] GitHub recognised the actual workflow for [run 38961492955](https://github.com/Next-ofkin/Nolt-hr/actions/runs/38961492955): named `NOLT HR PR checks`, with job `Typecheck, unit tests and build`. Previous synthetic `BuildFailed` path no longer describes this run.
- [ ] Real job `117177403255` ended `failure` with **no returned step records**; job log download returned BlobNotFound/404. Unit/typecheck/build tests were **not established as executed**. Inspect GitHub run UI annotations, account Actions restrictions and runner setup. Do not infer an application test failure.
- [ ] Keep draft PR #8 and PR #6 unmerged pending successful real checks; keep Production unchanged.

### Free local verification alternative — 18 October 2026

- [x] Added `.vscode/tasks.json` on `feat/developer-hr-employee-auth` (commit `7b12f68`) with tasks for `npm ci`, isolated code checks (`db:generate`, `typecheck`, `test`, `build`) and focused Pack tests. The tasks themselves are verified in GitHub; **their execution results are not yet available**.
- [x] Run tasks using local Node 24 VS Code checkout; owner provided exact terminal output in conversation (99 passing tests, typecheck and build). **PR #6 attachment/review remains separate**, no CI vendor or card required.
- [ ] Distinguish local unit/build gate from future local PostgreSQL/domain tests, real sandbox Auth/MFA checks and browser regression.
- [ ] Keep GitHub Actions/CircleCI optional until free hosted runners work. Do not bypass review, security testing or explicit Production approval.

### Forms & Packs implementation progress — 18 October 2026

- [x] Added **additive, not yet applied** Prisma migration `20261018100000_pack_templates` on `feat/developer-hr-employee-auth`: `PackTemplate` and `PackItem` schema, indexed immutable form/version references, restricted grants and RLS.
- [x] Updated `database/schema.prisma` with Pack models and relations. Added guarded HR `GET /packs`, `GET /packs/:id` and `POST /packs` controller/service wiring.
- [x] Pack creation validates names, unique items and order, locks selected form/version rows, verifies each selected version is **PUBLISHED** and belongs to the expected form, and atomically writes pack, items, audit and outbox records. Creation is draft-only; it does **not** publish or assign a pack.
- [ ] Execute Prisma validation, typecheck, Pack tests, migration on disposable PostgreSQL and API integration checks. Repository edits have been committed but are **not yet verified as passing**.
- [x] Build HR Pack Builder frontend with published-form selection, ordering, draft create/edit and publish/new-version actions. API revision guards implemented. **Pack withdrawal UI and database integration remain pending**, tracked separately.
- [x] Implement pack-to-case assignment, configurable due date and audited extensions, employee checklist/progress, HR approval; relevant Pack rule tests passed locally. **Full authenticated/DB regression remains pending**.
- [ ] Never deploy the new migration to existing Production without separate migration review and release approval.

### Pack Builder UI progress — 18 October 2026

- [x] Added `/packs` authenticated HR page and reusable `PacksWorkspace` frontend on feature branch. HR can compose draft name/description/employment type, search published forms, add/remove/reorder them, set required/optional, save with session CSRF and view saved pack drafts.
- [x] Added role-scoped Packs navigation; developer-only technical-admin workspace does not gain HR Packs access.
- [x] Added HR `GET /forms/published` endpoint, selecting published form versions regardless of which form version is latest. Pack Builder uses that endpoint rather than latest-only `GET /forms`.
- [ ] Run `npm run db:generate`, `npm run typecheck`, targeted Pack tests and `npm run build` in a Node 24 checkout; this environment cannot clone the repository because GitHub DNS is unavailable. **No test pass is asserted.**
- [ ] Apply migration and verify full HTTP/DB journey **on a disposable local database** before live deployment. Production remains unchanged. Drafts cannot be saved on hosted database until migration is intentionally applied.
- [ ] Next slices: edit drafts, pack versioning/publishing/withdrawal, assignment, five-day deadline policy, employee checklist and HR progress/review.

### Pack draft editing and publishing — 18 October 2026

- [x] Added revision-checked `PUT /packs/:id` draft editing. Updates use optimistic `expectedRevision` checks, transactional version validation, pack-item replacement and audit/outbox records; non-draft packs reject edits.
- [x] Added explicit `POST /packs/:id/publish`. Publishing row-locks the pack, rejects stale revisions/empty packs, verifies selected versions are still published, marks pack `PUBLISHED` and audits event. No employee assignment or email is implied.
- [x] Updated Pack Builder UI with **Edit draft**, **Save changes**, and **Publish pack** actions; published packs no longer display edit controls.
- [x] Updated unapplied Pack migration so the restricted `nolt_app` role can delete draft pack items within authorised server transactions; fixed refined Zod schema extension using `safeExtend`. Added focused revision/publish contract tests.
- [ ] Validate Prisma generation, TS/build, focused tests and PostgreSQL draft-edit/publish concurrency integration. **The commits are untested; no hosted migration has been run.**
- [ ] Implement immutable versioned revisions/new versions for **published** packs before future republishing; current published packs remain locked.
- [ ] Complete pack assignment and due dates, employee checklist/progress, HR review integration and UI acceptance.

### Published Pack assignment to employee onboarding — 18 October 2026

- [x] Added **unapplied**, additive Prisma migration `20261018110000_pack_assignments`, `PackAssignment` and `PackAssignmentForm` linking published packs, existing active onboarding cases and their individual `FormAssignment` records; full Prisma model relations added.
- [x] Added HR `POST /packs/:id/assign` requiring `forms.manage` and `employees.manage`, a matching employee employment type, a published nonempty pack, an active case and its expected revision. Transaction checks duplicate existing case forms, validates published versions, assigns all required/optional forms, increments the case revision, and records audit/outbox events.
- [x] Added HR `GET /packs/cases/:caseId` with employee-management permission for pack progress by individual form response status.
- [x] Embedded `PackAssignmentPanel` in the employee HR workspace, choosing a matching published pack, explicit optional due date, showing assigned packs and current per-form statuses. Employee's existing onboarding checklist receives the individual form assignments; no separate employee Packs view yet.
- [x] Added Pack assignment request-contract test, matching published pack ID filtering and HR progress access check.
- [ ] Run Prisma generation/schema validation and typecheck/build, contract tests, database migration and end-to-end workflow on a disposable/local database. **Committed ≠ tested.**
- [ ] Decide five-day deadline policy (calendar/business days, timezone and start trigger); current API intentionally requires HR to select a date or leave blank.
- [ ] Next: improve employee pack-level progress/completion status, HR approvals, versioned pack upgrades and due-date extensions. Never run new migrations against Production without approval.

### Pack readiness, explicit HR approval and own-progress UI — 18 October 2026

- [x] Added a third **unapplied**, additive Prisma migration `20261018120000_pack_approval`: optional approval timestamp/actor, a pair-consistency check, index and restricted backend role update grant. Updated Prisma user/pack approval relations.
- [x] Implemented derived pack readiness from existing form response statuses. Only packs with at least one required form and **all required forms `APPROVED`** are ready for separate HR approval; `SUBMITTED` never counts as approved. Optional items are displayed but do not block readiness.
- [x] Implemented audited `POST /packs/assignments/:id/approve` with HR employee-management permission, active onboarding case lock, duplicate-approval prevention, readiness re-check and audit/outbox recording.
- [x] Added `GET /me/packs` scoped to the authenticated employee's **own active onboarding case** and `MyPackProgress` component on employee onboarding home, showing required-form approvals, due date, per-form status and final HR decision. HR case panel now shows readiness and an Approve action.
- [ ] Verify Prisma schema/code generation, frontend/API typecheck/build, unit and PostgreSQL integration tests, including reviewer decision/pack approval concurrency and role-isolation paths. **No tests passed or migrations deployed in this turn**; local clone failed due to container GitHub DNS resolution.
- [ ] Remaining: optional-only pack policy, reviewer permissions and decision evidence for guarantor/reference forms, deadline extensions/overdue logic, pack version upgrades and developer handover. Reconcile migration checksums before any future hosted deployment.

### Pack deadlines and audited extensions — 18 October 2026

- [x] Added **unapplied**, additive migration `20261018130000_pack_deadline_history` with immutable `PackDeadlineChange` records, restricted backend grants for due-date updates and audited actor/reason/old/new due dates.
- [x] Added HR-only `POST /packs/assignments/:id/extend-deadline`; requires employee management permission, active unapproved pack, future date later than the current due date (when set), reason of at least 10 characters; updates Pack and linked FormAssignment due dates transactionally and records audit/outbox event.
- [x] Server-derived overdue indicator for HR/employee pack progress (based on UTC calendar date and no final approval). Added HR deadline extension form and overdue warnings in both workspaces. **No overdue form-locking or automatic five-day deadline is enabled.**
- [x] Added deadline-contract and overdue helper tests (authored, not yet executed).
- [ ] Run Prisma generation/typecheck/build, the actual unit tests and disposable PostgreSQL integration test before merge. No Production deployment, data deletion or migration execution authorised.
- [ ] Next: pack template version-upgrades, deadline policy approval, evidence-based QA/handover.

### Pack template versioning — 18 October 2026

- [x] Added **unapplied additive** Prisma migration `20261018140000_pack_version_lineage`: `rootPackId`, `versionNumber`, version uniqueness and one-open-draft-per-family constraint; corresponding Prisma relations/index.
- [x] Implemented HR `POST /packs/:id/versions`: create a new editable version of a published Pack within a database transaction, lock family root to serialize version allocation, reuse an existing open draft, copy form-version references/required flags/order and record audit/outbox events. Published originals and `PackAssignment.packId` remain unchanged.
- [x] Updated HR Packs screen to display version number and **Create new version**, opening the resulting draft for editing.
- [ ] Verify Prisma generation, typecheck and build, Pack API integration and migration execution against a disposable PostgreSQL database. GitHub access from this container remains DNS-blocked; **no runtime checks passed**, and no hosted migration/deploy occurred.
- [ ] Next: version-group UI/history, sensible handling of withdrawn or superseded pack versions in future assignments, and QA/handoff checklist.

### Pack version history and latest-only assignments — 18 October 2026

- [x] HR Pack Builder now groups Pack templates by root lineage with an expandable version-history list, showing saved versions and preserving older Pack entries.
- [x] HR Pack assignment selector filters to the **highest-numbered published version** per Pack family, while ignoring unpublished drafts. Selected version numbers are visible.
- [x] Server-side Pack assignment independently rejects an older published version if a newer published version exists. Historical `PackAssignment.packId` references and underlying Form assignments are **not changed or migrated**.
- [ ] Validate latest-version filtering after publish/draft transitions, repository TypeScript/Prisma checks, form/pack assignment integration and migrations locally; no claim of passing tests or Production changes.
- [ ] Handover prerequisites: run isolated migrations in order, inspect migration-history checksums, verify HR/employee authorization, test version-update and approval concurrency, and document secrets/deployment rollback.

### Consolidation and NOLT developer handover — 18 October 2026

- [x] Corrected malformed PostgreSQL dollar-quoted `DO` block in **unapplied** Pack approval migration `20261018120000_pack_approval` (valid `DO $tag$ ... $tag$;`). This was a concrete migration syntax blocker.
- [x] Added additive `20261018150000_pack_immutability` migration with PostgreSQL triggers preventing edits/deletions to published/withdrawn Pack content and items. This protects historical employee Pack snapshots against direct SQL mutations. Not applied anywhere.
- [x] Created `docs/NOLT_DEVELOPER_HANDOVER.md` on feature branch with source overview, ordered migrations, build commands, mandatory tests, database/permissions review, known policy decisions and non-destructive release safeguards.
- [ ] Validate every migration in fresh disposable PostgreSQL, Prisma generated schema, TypeScript/build and authentication/Pack integration before merging PR #6.
- [ ] Review implementation for policy/authorization edge cases (external guarantor/references, pack revisions, approval integrity). **No runtime or database test passed here.**
- [ ] No Production migration, reset, deployment, data deletion or automatic merge authorised.

### Local integration verification — 18 October 2026

- [x] User pulled feature branch to commit `1b2ceed` and ran checks on local Windows checkout: `npm run db:generate` succeeded (Prisma 7.10.0), API typecheck/build succeeded, and **99/99 unit tests passed**.
- [x] Web typecheck and `next build` failed due to an **unclosed JSX conditional** in `apps/web/src/components/packs-workspace.tsx`, immediately before the draft Pack actions.
- [x] Patched the JSX closing brace on feature branch in commit `06a3827c`. No schema changes or Production operations.
- [x] User pulled JSX correction at `06a3827` and reported successful `npm run typecheck` and `npm run build`, including Next.js `/packs` route.
- [ ] Review package vulnerability report separately (previous `npm ci` reported 11 high vulnerabilities); avoid unconditional major upgrades.
- [ ] Database migration and end-to-end verification remain pending.

### Full local Forms & Packs build verified — 18 October 2026

- [x] User fast-forwarded local `feat/developer-hr-employee-auth` to `06a3827`.
- [x] `npm run typecheck` passed for API, web, API client and form schemas.
- [x] `npm run build` passed for API and Next.js frontend; 18 routes generated including `/packs`.
- [x] Previous local run on immediately preceding commit passed **99/99** unit tests. The JSX-only correction was followed by passing typecheck/build, but tests were not rerun on this exact commit.
- [ ] Verify full migration sequence on an isolated/disposable PostgreSQL database, including grants and constraints; do not run against Production.
- [ ] Exercise end-to-end HR form → pack → employee assignment → submission/review → final approval with synthetic accounts/data.
- [ ] Triage reported 11 high npm dependency vulnerabilities before handover; do not blindly run breaking `npm audit fix --force`.
- [ ] Keep PR #6 draft and Production untouched until migration/integration/security checks are complete.

### Configurable branding and guided deployment handover — 18 October 2026

- [x] Added `apps/web/src/lib/brand.ts` to read safe, build-time public company name, tagline, product name, description, validated primary colour and restricted same-origin logo path.
- [x] Connected branded header, initial/logo, page metadata and primary theme colour; documented options in `.env.example`.
- [x] Added `docs/BRANDING_AND_DEPLOYMENT.md` with future NOLT developer rebrand/import/setup/migrations/secret-handling instructions. No one-click deploy button is yet implemented; environment credentials, migration approval and domain cutover are explicit operator gates.
- [ ] Branding typecheck/build **passed** at `7a2a7c7`; visual contrast and branding across login, employee and external screens **still need browser review**.
- [ ] Test migrations on isolated PostgreSQL, then evaluate reviewed Production migration plan with backup/rollback. **No live Production changes or merges authorised by this tracker.**

### Read-only handover preparation — 18 October 2026

- [x] Added `scripts/handover-preflight.mjs` and `npm run handover:check` for read-only Node 24 checks of tracked migration files, versioned branding setup, deployment guide, Git state, and logo path. Does not connect to any database, call an external service, deploy or manage secrets.
- [x] Updated `docs/BRANDING_AND_DEPLOYMENT.md` to document this command.
- [ ] After branding changes: **handover preflight, typecheck and build passed** at `7a2a7c7`; **unit tests have not been rerun** on that commit.
- [ ] Production migration review and explicit backup/approval still required; existing Railway backend deploys from `main`; Vercel access currently returned 403. No Production changes made.

### GitHub Actions retired — 18 October 2026

- [x] Removed unused `.github/workflows/pr-checks.yml` from `feat/developer-hr-employee-auth` (commit `7a2a7c77`) and `ci/restore-pr-checks` (commit `242a93d4`). No workflow files were found on `develop` or `main`.
- [x] Closed draft PR #8 without merging. Local `npm run typecheck`, `npm test`, `npm run build`, and the new read-only `npm run handover:check` remain available; they are not GitHub Actions.
- [x] User ran `git fetch origin` and `git merge --ff-only origin/feat/developer-hr-employee-auth` successfully to `7a2a7c7`, then passed handover preflight, typecheck and build. Untracked `.vscode/settings.json` was preserved.
- [ ] No production migration, deployment or release merge implied.

### Branding + handover local build verified — 18 October 2026

- [x] User fast-forward merged feature branch to `7a2a7c7`; obsolete GitHub Actions workflow removed.
- [x] Local `npm run handover:check` **PASS**; warning for untracked `.vscode/settings.json` only.
- [x] Local `npm run typecheck` **PASS** for API, web, API client and shared schema.
- [x] Local `npm run build` **PASS**, including API compilation and Next.js 18 routes with `/packs`.
- [ ] Database migration history, backup and compatibility review against existing Production Supabase are still **unverified**; no live DB mutations made.
- [ ] Authenticated end-to-end workflow, hosting previews/permissions, deployment and handover acceptance still pending.
- [ ] Previous **99/99** unit tests predate branding/handover commits; don't claim rerun on current commit.

### Production Supabase read-only migration inventory — 18 October 2026

- [x] Queried existing Supabase project `llslubzdkdnvhbatmfug` **read-only**, without SQL writes, migration runs, or production deployments.
- [x] Production `public` contains **27 base tables**. Prisma migration history exists: **17 completed, 0 incomplete**. Latest completed migration is `20261016100000_hr_invitation_drafts`.
- [x] None of `PackTemplate`, `PackAssignment`, or `PackDeadlineChange` yet exists. Six Pack migrations `20261018100000`–`20261018150000` remain pending.
- [x] Backend DB role `nolt_app` exists; `FormVersion` has unique index `FormVersion_id_formId_key` satisfying the planned composite PackItem FK (an earlier constraint-only query missed that **index**).
- [x] Supabase security advisor reported informational RLS-with-no-policy notices on private bootstrap tables and public `_prisma_migrations`, plus leaked-password protection disabled warning (review with owner; avoid opening RLS access). Advisor reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.
- [ ] Audit the six SQL migrations against actual database objects, establish verified backup/recovery, then obtain explicit approval before any Production migration. Build success does not equal live DB readiness.
- [ ] Confirm Vercel team access and deployment URLs; existing backend Railway production is on `main`, so feature branch merge would cause deployment before schema readiness.

### Production Packs pre-deployment safety check — 18 October 2026

- [x] Rechecked real Production Supabase `llslubzdkdnvhbatmfug` using **read-only SQL**; project healthy, 17 completed and 0 incomplete Prisma migrations, zero Pack migration entries; base tables, `nolt_app`, `FormVersion_id_formId_key`, `FormAssignment.dueDate` present.
- [x] Added `docs/PRODUCTION_PACKS_RELEASE_GATE.md` on feature branch (commit `2d19bfbc`) with precise backup, migration lineage, privileges, deployment and verification gates.
- [ ] **BLOCKER:** A fresh, restorable Production database backup has not been verified and no restore rehearsal has happened. Do **not** apply Pack migrations or merge into `main` until satisfied.
- [ ] Validate migration SQL on isolated database before using the Prisma migration runner on Production; no Production writes/deployments performed.
- [ ] The six new Pack migrations are additive but **not yet integration-tested**; do not claim live release readiness.

### Owner human-testing and guarantor release checkpoint — 18 October 2026

- [x] Inspected `apps/api/src/external-requests.ts`, `external-email.ts` and `apps/web/src/components/external-requests.tsx` on feature branch: employee-sent guarantor/reference request creation, Resend-queued delivery, request status, revocation/replacement, external proof/session and text submission endpoints are **implemented in source**.
- [ ] **Not yet live-verified:** actual sender configuration, delivery to approved recipient, expiry/revocation browser behaviour, guarantor self-submission and complete HR independent review.
- [x] Reviewed GitHub PR #6: still **draft**, mergeable=false; `main` and feature have diverged (304 commits ahead, 2 behind by comparison).
- [ ] Owner requested merge to `main` for human testing, but Railway Production API tracks `main`, and six Pack migrations remain unapplied; no merge was performed to avoid a premature Production deployment. Resolve branch drift and schema/deployment safety gate before live release.
- [ ] Human acceptance sequence: HR login/forms/packs/assignment, employee own form drafts/submission, external guarantor request and receipt, direct guarantor completion, HR review/approval, cross-user access rejection, deadline extension and rollback checks.

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

## 2026-10-21 — Guarantor files and signature, autosave, tidy list
- [x] Guarantors and references can upload files (JPG/PNG/PDF, 5 MB) and sign through their secure link; migration `20261021120000_external_signature_guard` widens the signature guard to the one active request's respondent. HR sees the files and signature on the evidence review; the employee cannot open a guarantor's files.
- [x] Guarantor link: once opened, valid 7 days; session slides while active (24 h idle window, capped at the request expiry).
- [x] Autosave on employee and guarantor forms: server save about 2 s after typing stops, plus a local backup of typed answers only (never files), restored on request, wiped on submit, logout or after 7 days.
- [x] Employee onboarding list grouped by pack with To do / Waiting for HR / Done (collapsed); changes-requested forms first. `MyPackProgress` replaced by `MyOnboardingList`.

## 2026-10-21 (evening) — Several guarantors per form
- [x] Up to two guarantors per guarantor/reference form. Each has a slot; one open request per slot (`ExternalRequest.slot`, index `ExternalRequest_current_slot`). HR sets how many are needed (1 or 2, default 1) via `AssignmentGuarantorRule`; the form is approved only when every needed slot is approved (`apps/api/src/external-status.ts`).
- [x] One-step sending: the request carries the name and email; the saved contact draft is no longer used by the screens. Change guarantor, send a new link and cancel are available until the guarantor submits. Duplicate emails across slots and self-guarantee are refused.
- [x] Migration `20261021180000_multi_guarantor`: also fixes the 7-day extension, which the old trigger blocked (expiry may now move later only when the recipient opens the link, capped at 8 days).
- [x] Visible status per guarantor (queued, sending, sent, opened, submitted, approved), with polling while an email is on its way.

## 2026-10-21 (night) — Guarantor link fix and trusted email
- [x] Fixed: opening a guarantor link failed (database capped the session at 30 minutes; the app asked for 24 hours). Migration `20261021210000_external_session_window` allows up to 24 h, sliding, never past the request expiry. The used-link page now explains what to do.
- [x] Guarantor email now names the employee who asked (name, job title, department), shows an "Is this email real?" box (link host, no passwords or payments, how to check) and an optional HR contact line (`HR_CONTACT_LINE`). Subject: "<Employee> named you as a guarantor - NOLT Finance". Only applies when email is sent through Resend; Supabase's own mail template cannot be customised here.
- [x] Employee sees "Tell <guarantor> to expect it" with Send on WhatsApp / Copy the message.

