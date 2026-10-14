# Employee form responses

Implemented and verified 14 October 2026 against the approved hosted development project. All 14 unit/live backend checks, isolated persistence checks and three affected browser journeys passed across focused runs. Seven migration checksums, hosted permissions/RLS and denied public API access were verified. See the [test report](TEST_REPORT.md) for initial interruptions, the session-timeout correction and remaining release gates.

Employees open their exact assigned employee form from My onboarding. Save draft retains incomplete answers; reopening loads the saved database state. Final submission validates the published definition on the API, creates immutable submission evidence and locks the response. Submitted means awaiting HR review; it does not mean approved, complete or ready for employment. HR review and correction cycles follow in the next slice.

## Contract and persistence

- `GET /api/v1/me/assignments/{id}/response` returns the exact form, saved answers/revision, status and own submission history.
- `PUT` on the same path saves `{expectedRevision, answers}`. An unsaved response starts at revision zero. Stale saves fail with 409; there is no silent merge or overwrite.
- `POST .../response/submit` takes `{expectedRevision, requestKey}` and submits only the stored revision. The UI saves changed answers first. Repeating the same key/revision returns the committed submission; conflicting key reuse or a second independent submission fails.

Migration `20261014112411_employee_responses` adds EmployeeResponse and FormSubmission. Responses are keyed by assignment, and submissions have a composite foreign key to the assignment's exact form version. Mutation transactions lock the case, recheck ownership/active state, validate and commit the response, audit and outbox together. Reads use a consistent transaction snapshot. Database triggers reject submitted-response changes and submission updates/deletes. Runtime grants allow response SELECT/INSERT/UPDATE and submission SELECT/INSERT only; RLS and revoked public/API grants protect both tables. The trusted API remains responsible for actor-scoped access; browser clients cannot query these tables directly.

Actors come from the authenticated AAL2 session. Employee access is own-record only. Guarantor/reference response reads, drafts and submissions are forbidden to employees. Closed cases reject changes. Audit/outbox metadata contains identifiers/revisions, never answer bodies.

## Validation and limits

The renderer supports the builder's current text, long text, email, phone, decimal number, date, select and checkbox fields. Drafts can be incomplete and contain unfinished email/number strings. Unknown questions, incorrect answer types and oversized payloads are rejected. Final validation checks required answers, email/date/number/phone formats, listed choices and required checkbox confirmations. Numbers remain decimal strings to preserve precision. Current limits are 100 fields, 10,000 characters per string and 100,000 UTF-8 bytes per answer map.

File/signature answers cannot be supplied as strings, Base64 or fabricated references. Required file/signature fields block final submission until the private capture/scan/evidence slice is delivered; the employee can still save ordinary answers. Optional file/signature fields may remain empty. Conditional/repeating fields and domain-specific legal/benefit validation remain pending builder/module work. No signature equivalence or legal wording is invented here.

The current history has one immutable submission per assignment. The model includes versioning for later correction cycles, but reopening submitted answers is deliberately unavailable until authorised HR review is implemented. Submission outbox events are committed evidence; this slice does not add submission email delivery.

## Verification

`npm test` includes validation/type/size/precision cases. `node scripts/test-onboarding-db.mjs` applies all migrations to isolated PostgreSQL and checks competing draft saves, submission replay, ownership, third-party denial and immutable evidence alongside existing domain regressions. Windows QA shutdown now uses PostgreSQL's bounded graceful pg_ctl stop; ignored uniquely named test data directories remain for diagnosis.

`npm run test:e2e:hosted -- tests/e2e/responses.live.spec.ts` uses disposable real Auth accounts, actual TOTP and hosted API/database. It exercises incomplete draft persistence, reopening, final validation, fixed assignment versions, responsive entry, access denial and audit/outbox evidence. It sends no emails and does not modify the approved real invitation test account.

For stable local verification, build once, then run `node scripts/hosted-qa.mjs preview`. This starts the compiled API and Next app with the private development environment, without watch-triggered restarts. It is local preview, not production deployment.
