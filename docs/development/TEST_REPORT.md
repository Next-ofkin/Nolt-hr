# Employee response acceptance - 14 October 2026

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
