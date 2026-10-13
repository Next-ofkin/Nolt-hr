# NOLT HR implementation tracker

Owner approved local implementation on 13 October 2026. This file is the working checklist; checked items require implementation and verification evidence. A phase is not complete simply because its UI exists.

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

## Next delivery order

1. Secure identity and permissions: confirm the managed identity provider, implement login/recovery, privileged MFA and complete role/session controls.
2. Employee directory and onboarding cases: HR creates employees and assigns published form versions/templates with the correct recipient and requirement rules.
3. Invitation/activation, employee checklist and response drafts/submissions, followed by review/correction.
4. Private uploads/signatures and external guarantor/reference delivery using the approved storage and actor rules.

Form-builder expansion can proceed alongside these dependencies. Production providers, HR/legal rules and real-data release approval remain separate gates.

## Form builder expansion

- [ ] Sections, multiple-choice questions, conditional visibility/requiredness and repeating groups.
- [ ] Per-field sensitivity, configurable validation/file rules and approved consent text.
- [ ] Form duplication/archiving, version-history browsing and server-side pagination/search.
- [ ] Complete field dictionary and assignment/template rules with HR.

## Secure identity and core onboarding

- [ ] Confirm identity provider and wire managed OIDC login/recovery.
- [ ] Privileged MFA, secure sessions, CSRF and account/session revocation.
- [ ] Approved HR/reviewer/sensitive-data permission matrix.
- [ ] Employee creation, directory, employment details and case/template assignment.
- [ ] Expiring invitation, recipient verification, resend/revoke and activation.
- [ ] Employee home, assigned checklist and authoritative progress/readiness rules.
- [ ] Dynamic response drafts, final validation and immutable submission versions.
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

- [ ] Direct API/file/export isolation and sensitive access tests.
- [ ] All portals and builder verified at 320/375/768/1024/1440/1920 widths and zoom.
- [ ] Keyboard/touch signing, accessible forms and current browser coverage.
- [ ] HR/legal decisions, original source forms, privacy/retention and signing approved.
- [ ] Production provider setup, secrets, scanning, monitoring and incident owners.
- [ ] Backups/restore exercise, measured performance and deployment rollback.
- [ ] Representative pilot accepted and production deployment explicitly authorised.

## Evidence and current limits

Verified first slice on 13 October 2026:

- `npm run db:generate`, `db:migrate`, `db:permissions`, `db:seed`: local PostgreSQL schema, restricted runtime role and synthetic identities prepared.
- `npm run api:generate`: initial OpenAPI specification and frontend types generated from NestJS/Zod.
- `npm run typecheck`: all workspaces pass.
- `npm test`: 4 passing checks, including real PostgreSQL/API authoring, immutable versions, stale writes, concurrent version allocation, HR/employee separation, CSRF and audit permissions.
- `npm run test:e2e`: 2 Chromium checks pass, covering create/save/preview/publish/reopen/new version and no horizontal overflow at 320/375/768/1024/1440/1920 widths.
- `npm run build`: API and frontend production compilation pass. This is not production release approval.
- Desktop/mobile screenshots reviewed locally under ignored `.local/qa/`.
- CI workflow added; remote CI has not been run in this turn.

Current limits: localhost-only synthetic identity; no managed OIDC/MFA, employee assignments, response collection, actual signatures/uploads, notification worker/email or external request delivery. Signature/attachment controls configure requirements and show labelled previews only. Audit/outbox exists for form mutations, not yet every lifecycle module. Full zoom, touch signing, all-browser and release checks remain open.

Run instructions: [local setup](development/LOCAL_SETUP.md). Initial schema: [data model](development/DATA_MODEL.md).
