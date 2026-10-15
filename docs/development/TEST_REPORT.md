# Railway frontend preparation - 15 October 2026

Frontend production build passed with API_ORIGIN=https://noltapi-production.up.railway.app and DEPLOYMENT_ENV=staging. The new start:web command bound to the supplied test PORT=3001. Read-only smoke checks returned HTTP 200 for /login (login markup) and /api/v1/health/ready (ready) through the external API rewrite. API_ORIGIN is normalised and staging requires HTTPS with no credentials, paths or query parameters. Existing local start behaviour remains available separately.

This is build/proxy preparation, not hosted frontend or login/MFA acceptance. A generated HTTPS web domain, API PUBLIC_APP_URL update, Supabase redirect configuration and real authenticated browser checks remain pending. See RAILWAY_WEB.md.

# Railway API readiness accepted - 15 October 2026

Owner supplied an inspection from the Railway-connected chat: commit 3c2c947, deployment 37513388-ce4a-4e83-8dfa-a4df6c305e28, service @nolt/api, reached SUCCESS at 06:58:27 UTC (07:58:27 Africa/Lagos). The inspected logs reported healthcheck success, successful application startup and no DATABASE_READINESS_FAILED entries. This confirms the reported staging deployment/database readiness gate; it does not establish full browser Auth/MFA, scanner readiness or production approval. Railway calls its environment production; the application is explicitly configured for staging.

Independent HTTPS checks from the current workspace on 15 October 2026 passed against https://noltapi-production.up.railway.app: liveness returned HTTP 200 with status ok/service nolt-api, readiness returned HTTP 200 with status ready, and /api/docs returned HTTP 200 with Swagger HTML. These read-only checks did not create accounts or mutate application records. Earlier failed-deployment results below remain historical evidence.

# Staging CA asset packaging - 15 October 2026

Owner-supplied Railway diagnostics reported ENOENT during readiness. The CA is tracked and not ignored, so container omission was not established. API builds now fingerprint-check and copy the public trust anchor into dist/certs; staging overrides only sslrootcert with a path anchored to the compiled module. Credentials/host/port and sslmode=verify-full remain unchanged. Missing bundled assets fail explicitly rather than disabling TLS. Local non-staging connection strings are preserved.

API compilation/asset packaging and generated contracts passed. All 25 unit/security checks passed, including compiled asset byte equality, Windows-path replacement, credential/host preservation and rejection of weakened TLS. A read-only Supabase SELECT 1 passed using the bundled staging CA and verified TLS. This local connection does not prove Railway network connectivity or its current credentials; hosted readiness must be rechecked after deployment.

# Railway readiness diagnostics - 15 October 2026

API compilation and contract generation passed; all 24 unit/security checks passed. New diagnostics extract only allowlisted codes and adapter categories from nested Prisma/pg errors, discard messages/stacks/SQL/URLs/arbitrary metadata, handle cyclic causes and retain the original public 503 response. A successful query still returns ready without failure logging. The API contract is unchanged.

Owner-provided Railway results confirm the API starts and URL parsing no longer fails, but database readiness still returns 503. The underlying hosted error is not confirmed yet. This diagnostic patch must be observed in Railway runtime logs before selecting a connection fix. No TLS, database credential, scanner or healthcheck policy changes were made.

# GitHub checkpoint and Railway staging preparation - 14 October 2026

Final checks passed: 22 unit/security checks, workspace type checks, the exact API-only Railway build command including Prisma generation, generated OpenAPI/client, isolated PostgreSQL workflow/concurrency acceptance and the final Next.js production build. Hosted Supabase verification reconfirmed all ten exact migration checksums, restricted runtime verified TLS, denied audit deletion and rollback-only RLS/grant/immutable-form checks. The first frontend build was interrupted by a concurrent dev server rewriting generated type files; the identified project dev tree was stopped and the final build passed.

Explicit staging uses the platform `PORT` and `0.0.0.0`, real Supabase configuration, HTTPS origin and verified restricted database TLS. Unsafe staging configuration and unapproved production startup are rejected by tests. Railway deployment and hosted browser authentication are not verified: the frontend is still local and no Railway service has been provisioned. Scanner definitions remain blocked; uploads/signatures are implemented/domain-tested but not complete live workflows. Prior real-Auth review browser evidence below remains historical, not a new run for this checkpoint. Remote GitHub CI status is reported separately after push.

# Local scanner installation - 14 October 2026

Official ClamAV 1.4.6 LTS portable x64 installation completed in ignored project-local storage. Official release checksum and Cisco Talos detached signature verified. Supported executable options were inspected. Start/stop/update/status commands, loopback-only configuration, private API environment settings, real-scanner clean/EICAR verification script and a real-Auth browser upload/signature test were added.

Official virus-definition download failed with DNS resolution errors from FreshClam; a direct HTTPS diagnostic returned 403. Neither scanner nor updater is running. Real clean/infected acceptance and browser acceptance are pending, not passed. No TLS or antivirus protection was disabled. See [local scanner setup](CLAMAV_LOCAL.md).

# Upload/signature security fixes - 14 October 2026

Private Supabase development bucket setup was run and verified private. The hosted Prisma status check reports all ten migrations applied; no migration SQL was edited or applied during these fixes. Files now use a server-only Supabase Storage adapter with overwrite disabled, permission-checked downloads and stored-checksum verification. ClamAV INSTREAM is fail-closed; PNG/JPEG inputs must decode and are normalised before final-byte checksums. Header detection is explicitly not malware scanning. HR signing methods and the development confirmation version are server-checked; unapproved typed-signature equivalence and legally-binding claims were removed. The screen saves answers before signing, invalidates signatures on content changes and allows submission of required attachment/signature forms.

Twenty unit checks passed, including malformed image rejection, genuine image normalisation, strict payload decoding, missing scanner denial and a test-only ClamAV protocol success response. Workspace type checks, generated API/client, API compilation and the final Next.js production build passed. Final isolated database acceptance passed after adding signing-method/consent denial and idempotent signature replay checks. Domain tests use explicit memory-storage/scanner test doubles and genuine image fixtures; they do not establish real scanning or hosted object acceptance. Earlier nine-migration review acceptance below remains historical evidence.

Remaining delivery gates: configure a real maintained ClamAV service (`CLAMAV_HOST`, `CLAMAV_PORT`), verify live clean/infected files and the real-Auth browser workflow against hosted uploads, implement expired/orphan-object cleanup, approve final consent/retention policies and resolve keyboard accommodation for draw-only forms. No production release, paid scanner service or real employee import is authorised. Upload confirmation returns 503 when scanning is unavailable. No uploaded body or secret is logged.

# HR review and corrections acceptance - 14 October 2026

- Fourteen unit checks passed; workspace and browser-spec type checks passed. API/Next production compilation and generated contract/client passed.
- Isolated PostgreSQL acceptance passed with all nine migrations: explicit record scope, case-owner-only reviewer setup, separate health/financial permission checks and removal, technical-admin denial, competing decisions (one success/one 409), mandatory reasons, immutable reviews/submissions, rejected reuse of prior review evidence, versioned corrections and approved-answer locking. Existing response/onboarding/invitation domain regressions also passed.
- Hosted review migrations 008/009 applied successfully. Nine checksums, trusted restricted-runtime TLS, rollback-only schema/RLS/grant checks and denied public Data API access to review/access tables passed. Security advisors report only the existing leaked-password-protection warning.
- The real Supabase Auth browser journey passed in 5.1 minutes. It uses actual HR/employee MFA sessions, the HR review setup/dialog, required reason controls, employee correction/resubmission, historical/current submission navigation, approval confirmation and locked approved answers. Employee and unrelated HR reads/decisions were denied. The HR dialog fit all six target viewport widths; mobile evidence was reviewed.

No synthetic Auth shortcut, email delivery, production release or real employee import was used. Disposable provider accounts were retired after the run; synthetic application/audit evidence remains. A pg driver deprecation notice occurred under concurrent queries with the pinned dependency version; the assertions and shutdown passed. Functional acceptance does not establish production performance targets.

Access/classification is provisional development policy: explicit single-reviewer assignments, classification by the HR case owner and separate sensitive-data permissions. Dedicated HR_REVIEWER UI, reassignment/revocation administration, per-field sensitivity and final production role/classification policy remain pending. Correction reasons appear in the portal; review email delivery is not implemented. See [review behavior and limits](REVIEWS.md).

## Previous employee response acceptance - 14 October 2026

- Workspace type checks, generated OpenAPI/client and API/Next production compilation passed.
- All 14 unit/live backend checks passed in the final authentication regression run, including response validation/type/size/decimal precision, real MFA, permissions, revocation and idle expiry. A deliberate unavailable transport with a real session returned 503 without granting access or changing encrypted session/last-seen evidence; normal access recovered after transport restoration.
- The complete isolated PostgreSQL suite passed with exit zero: response ownership, competing saves, concurrent submission replay, exact assigned version and immutable evidence, plus existing onboarding/invitation regressions. Windows shutdown now uses bounded graceful PostgreSQL shutdown and no longer hangs.
- Migration 007 applied to the approved Supabase development project. All seven checksums match. Expanded rollback-only hosted checks verify RLS/backend grants, public-role denial and existing immutable-form/access-version triggers. Security advisors report only the previously recorded leaked-password-protection warning.
- All three affected browser journeys passed across focused runs: shared renderer responsiveness, existing onboarding and the final employee response journey (6.5 minutes). The response journey covers incomplete draft saving/reopening, invalid final answers, stale concurrent saves, immutable assigned versions, successful UI submission, committed retry, locked answers/history, cross-employee and third-party denial, required-signature rejection, closed-case denial, public API denial and single audit/outbox evidence. Employee entry fits all six target widths; submitted mobile evidence reviewed.

An initial response browser run was interrupted by a watch-triggered API restart (ECONNRESET). A later denial request exposed session validation exceeding its old 20-second transaction deadline. Provider proof calls now have a total transport deadline, session transactions have a bounded 30-second deadline, and transient failures fail closed with retryable 503. The final authentication regression and full response journey passed against compiled local services without concurrent rebuilds. These functional checks do not establish production performance targets. No emails or real employee imports were part of these tests; disposable provider identities were retired and application/audit histories retained.

See [response behavior and boundaries](RESPONSES.md). HR review/corrections, private file/signature capture and external respondents remain subsequent slices. Native browser zoom/touch and wider browser/release checks remain separate gates.

## Previous invitation acceptance - 14 October 2026

The invitation browser journey passed against real Supabase Auth: one-time proof verification, revoked/replaced link denial, real TOTP, password setup, atomic activation and own-record access. The separate approved SMTP invitation was accepted by Supabase; the owner confirmed receipt and successful activation. Hosted records confirm ACCEPTED, the intended employee identity and one verified MFA factor.

All six migration checksums, restricted grants/RLS and denied public access to invitation tables were verified. Workspace type checks and final API/Next production compilation passed. The backend/unit/security run passed all 11 checks. All six browser journeys passed across the focused invitation run, four existing Auth/forms/responsive regressions and the final onboarding rerun (4.3 minutes). Earlier runs encountered a transient form-version 500 and an unhealthy local server; the final onboarding rerun passed without a form-domain code change. These functional checks do not establish production performance targets.

Isolated PostgreSQL invitation assertions passed for competing resends, idempotency, expiry/revocation, exclusive worker claims, recipient restrictions, five-attempt backoff/exhaustion and uncertain-delivery recovery. Native Windows test-database shutdown hung afterward and required stopping the test process; the overall isolated test command did not exit successfully. This cleanup limitation remains recorded separately from assertion results.

No additional emails, production deployment or employee imports are authorised by these results. Saved employee responses are the next feature slice. See [invitation evidence and operation](INVITATIONS.md).

## Previous onboarding acceptance - 14 October 2026

The employee directory, onboarding cases, fixed published-form assignments and own employee checklist passed hosted development acceptance. Migration 005 and private account-linking SQL are installed; all five Prisma checksums match. Restricted runtime TLS, RLS/grants, public Data API denial and the approved HR bootstrap are verified.

- All 11 backend/unit/security checks passed in the final run (npm run test:hosted).
- All five Chromium journeys passed: the focused real onboarding journey, then four Auth/form/responsive regression journeys. The new journey covers verified-account linking after HR profile creation, employment edits, active-case duplication, draft denial, fixed version assignment, concurrent edit conflict, own-record/third-party API isolation, immutable assignments and audit/outbox.
- Employee screens fit all six target widths; mobile screenshots reviewed. Provider round trips made the onboarding journey about four minutes; no production performance target is claimed.
- Workspace type checks passed. Production compilation passed for the delivered runtime code in the preceding slice; this verification changed tests/launcher/documentation and applied the existing migration, not application runtime code.
- Initial runs were interrupted by stale development services/concurrent compilation or test selector/timing issues. Final runs passed without concurrent builds. A fresh authenticator code is generated immediately before verification to avoid test-boundary expiry.
- Completed fixtures were cleaned up; two strictly identified disposable accounts from interrupted runs were also deactivated/revoked and deleted from Auth. Synthetic employee/form/audit histories remain as development evidence.

Remaining: invitations/activation, template bundles, responses/review, uploads/signatures, external delivery, production operations and independent password recovery acceptance. Security advisors still report only the previously documented leaked-password-protection warning. No paid upgrade, production deployment or real employee import was performed.

See [onboarding details](ONBOARDING_SLICE.md) and [tracker](../TRACKER.md).

## Previous authentication acceptance - historical record

﻿# Current implementation test report

Date: 13 October 2026 (Africa/Lagos). The current implementation uses real Supabase Auth. The earlier synthetic-provider results are superseded for authentication acceptance.

| Check | Result |
| --- | --- |
| Generated OpenAPI contract and frontend API types | Passed |
| All workspace type checks | Passed |
| API and Next production compilation | Passed |
| Unit plus live Supabase Auth/backend/security tests | 11 passed, zero failures |
| Chromium live Auth/forms and responsive screens | 4 passed, zero failures |
| Hosted migration history | Four applied migrations; exact local checksums match |
| Restricted runtime PostgreSQL connection | Trusted CA/hostname verified; audit deletion denied |
| Workflow syntax | actionlint passed; remote GitHub CI still unverified |

## Current acceptance evidence

Live tests use real Supabase password sign-in, authenticator enrolment and six-digit TOTP verification. They exercise missing/incorrect-code denial, CSRF checks, metadata that attempts to grant HR permissions, EMPLOYEE/HR access separation, provider-side global revocation and idle expiry. HR tests save/reopen/publish forms, reject stale/published edits, verify audit evidence and concurrent new-version allocation, and reject access after a role change.

Browser checks cover real password/TOTP login, verified account information, global logout across tabs, HR form authoring/publishing/versioning, builder/preview layouts and login/signup/recovery screens at 320/375/768/1024/1440/1920 CSS pixels. No synthetic shortcut appears. Screenshots are ignored evidence under `.local/qa/`.

The tests create disposable accounts in the real Auth provider with administrative email confirmation. They delete those provider accounts and deactivate the corresponding application identities after each test. Historical forms/audit records remain. They never change the owner's account and do not send email to disposable addresses. These tests prove password/MFA/session behaviour, not SMTP delivery or the browser email-link exchange.

## Remaining gates

The owner is connecting Resend directly to Supabase SMTP. Actual signup confirmation, recovery email delivery/link exchange, and the approved first HR mailbox's bootstrap remain to be verified through `/signup` and `/recovery`. Password recovery code is implemented and requires MFA; lost-factor administration/recovery codes are not implemented. These email/account acceptance items remain unchecked in the tracker.

Supabase security advisors report leaked-password protection disabled; the documented feature requires a Pro plan. No plan upgrade was made. Public tables retain RLS/backend-only grants; private provisioning/session functions are unavailable to public API roles.

Real employee records/assignments, responses, actual signatures/uploads, external delivery, full browser/zoom/touch coverage, performance/load targets, backup restore, successful remote CI and production deployment remain outside completed acceptance. No new push or merge was performed.

## Reproduce

With private `.env` / `.env.supabase` configured, `npm run dev` starts the actual hosted API/web integration. Use `http://127.0.0.1:3000/signup` for your own account and password after SMTP is ready. Open email links in the browser that requested them, then enrol an authenticator. The approved first email receives HR only after confirmation; other signups receive EMPLOYEE access.

```powershell
npm run db:hosted:verify
npm run db:hosted:status
npm run typecheck
npm run build
npm test
npm run test:hosted
npm run test:e2e:hosted
```

The last two commands require the real API/web to be running and a private server-only Auth administration key. They are development-only and write disposable QA records. See [setup](LOCAL_SETUP.md) and [identity details](IDENTITY.md).


Owner acceptance, 13 October 2026: Resend SMTP email delivery, real signup/email confirmation and authenticator MFA are confirmed working by the owner. Password recovery and first HR bootstrap verification remain separate checks.
