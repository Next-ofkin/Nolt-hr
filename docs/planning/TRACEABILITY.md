# PRD coverage and acceptance register

Status: requirement-to-milestone baseline. Local implementation has started; verified completion and evidence are maintained in [the tracker](../TRACKER.md). Rows below describe required acceptance, not a claim that every feature is complete. Source is the 29-page supplied PRD; PDF page references make each planned item reviewable.

## Core requirements

Verified development evidence for FR-006 and the current structured-field portion of FR-007: [employee responses](../development/RESPONSES.md), accepted 14 October 2026. Drafts, final validation and immutable first submissions are delivered. Conditional/repeating rules, files/signatures, domain-specific forms and review-driven resubmission remain open; this does not mark those wider requirements complete.

| PRD ID | PDF page | Milestone | Acceptance evidence required |
|---|---:|---|---|
| FR-001 | 7 | M1 | Email login/recovery, active-account check and HR MFA; wrong/expired identity denied |
| FR-002 | 7 | M2 | Create employee with employment fields/template; snapshot assigned requirements |
| FR-003 | 7 | M2 | Send/resend expiring invite; old token revoked; no duplicate employee; audit event |
| FR-004 | 7 | M2 | Own assigned checklist contains every requirement and current actionable status |
| FR-005 | 7 | M2/M4 | Mandatory-only progress recalculates from authoritative completion; waiver/NA edge cases |
| FR-006 | 7 | M3 | Incomplete draft saves/reopens for every structured form |
| FR-007 | 7 | M3 | Final submit enforces schema and conditional validation; immutable version created |
| FR-008 | 7 | M4 | Authorised reviewer opens exact submission and permitted clean attachments |
| FR-009 | 7 | M4 | Approve records actor/time/version; stale/concurrent decisions rejected |
| FR-010 | 7 | M4 | Changes Required fails without reason; reason visible on correct item |
| FR-011 | 7 | M4 | Correct/resubmit preserves prior submission/file/decision history |
| FR-012 | 7 | M2–M4 | Invite/outcome/action emails from committed events; retries do not duplicate operations |
| FR-013 | 7 | M1 onward | Lifecycle, administrative, review and acknowledgement events attributable and protected |
| FR-014 | 7 | M2/M6 | HR directory filters department/status/start date/type within scope |
| FR-015 | 7 | M2/M3 | HR-owned form/template builder and versioned publishing in core; new versions do not rewrite existing cases |
| FR-016 | 7–8 | M4/M6 | Basic status export then provider formats with permission and download checks |

FR-014–016 are P1; the remaining listed core requirements are P0. M4 basic exports are a proposed convenience; provider exports remain M6.

## Domain modules and business rules

| PRD section/rule | Page | Milestone | Acceptance evidence required |
|---|---:|---|---|
| 7.1 Biodata | 9 | M3 | Prefill HR identity; contact/address, education, employment, next of kin, emergency, bank/pension/tax and health fields; sensitive DTO isolation |
| 7.2 Background | 9 | M3 | Any Yes requires explanation; truth/verification consent and accepted declaration version retained |
| 7.3 Supporting evidence | 9 | M3/M4 | Configurable passport/medical/reference/birth/secondary/degree/NYSC/postgraduate/other slots; independent review; reasoned waiver/NA |
| 7.4 Respondents | 9 | M5 | Default configurable two-guarantor/two-reference slots; secure own-response access; evidence; independent review and replacement |
| 7.5 Policy manual | 10 | M5 | Publish version/effective date; employee/date-read/resumption evidence; new publication preserves old acknowledgement |
| 7.6 Confidentiality | 10 | M5 | Approved text/version; employee execution; configured witness/NOLT steps; immutable completed copy |
| 7.7 Indemnity | 10 | M5 | Employee → surety → NOLT staged execution; actors/times locked and completion rendered |
| 7.8 Beneficiaries | 10 | M5 | Repeating allocations total 100% unless approved rule overrides; under-18 guardian; authorisation and export |
| 7.9 HMO | 10 | M6 | Approved AXA consent; all member/dependent/provider fields; exact workbook column/order mapping |
| 7.10 Work tools | 11 | M6 | Type/quantity/serial/issue condition/notes/date/issuer, employee acknowledgement/issues and later return linkage |
| 7.11 Induction | 11 | M6 | Source sections and mandatory tasks; facilitator completion; employee sign-off plus HR/Operations certification |
| BR-01 / BR-08 | 17 | M1/M3 | Cross-employee access denied; health/finance separate from general reviewer rights |
| BR-02 | 17 | M4 | Mandatory/optional/waived/NA supported; exceptions require reason and authorised actor |
| BR-03 / BR-04 | 17 | M4 | Approved data cannot be overwritten; new review version; correction reason mandatory |
| BR-05 / BR-06 | 17 | M2/M4 | Progress based on assigned mandatory items; incomplete unwaived mandatory item blocks completion |
| BR-07 | 17 | M5 | Exact beneficiary total validation on final submit, not incomplete draft |
| BR-09 | 17 | M5 | One-request expiring external links; replay/replacement/revocation tests |
| BR-10 | 17 | M5 | Accepted policy/agreement version and evidence immutable |
| BR-11 | 17 | M7 | Every asset return or authorised exception needed before full exit clearance |
| BR-12 | 17 | M5 | Family eligibility configurable; no unapproved conflicting hard-coded rule |

## Offboarding coverage

| PRD ID | Page | Milestone | Acceptance evidence required |
|---|---:|---|---|
| OFF-001 | 12 | M7 | HR creates exit with separation reason/type, last day and notice |
| OFF-002 | 12 | M7 | Employee drafts/uploads and submits handover with retained versions |
| OFF-003 | 12 | M7 | Asset-return tasks generated from actual prior assignments |
| OFF-004 | 12 | M7 | ID/HMO card, phone/SIM and other assigned property tracked |
| OFF-005 | 12 | M7 | Configurable department clearance, scoped reviewer and comments |
| OFF-006 | 12 | M7 | Exit interview responses/notes/date recorded with appropriate scope |
| OFF-007 | 12 | M7 | HR/IT-approved timing deactivates account and revokes active sessions |
| OFF-008 | 12 | M7 | Final record retains audit and returned/outstanding/excepted asset details |

## Stories, nonfunctional work and release acceptance

| PRD area | Page | Coverage |
|---|---:|---|
| US-01 | 15 | M2 invite/create/resend/no duplicates |
| US-02 | 15 | M2/M4 checklist, progress, reason and resubmit |
| US-03 | 15 | M4 reason-required rejection, notification and history |
| US-04 | 15 | M3 incomplete draft restore vs strict submit |
| US-05 | 15 | M5 scoped external workflow and independent HR review |
| US-06 | 15 | M5 policy version evidence |
| Notifications | 18 | M2/M4 invitation/outcomes; M5 external/policy; M6 reminders/completion; M7 exit; sensitive email content excluded |
| Security/privacy | 19 | M1 onward permissions/TLS/MFA/private files; M3 scans; each release retention/legal/backup readiness |
| Usability/accessibility | 20 | Every slice responsive/keyboard/errors; M8 consolidated browser/accessibility review |
| Data-driven scalability | 20 | M2 versioned templates; M3 schemas and HR editor; no hard-coded universal global requirements |
| Dashboard/reports | 21 | M2/M4 core counts; M6 queue ageing, starts-in-7-days, overdue, coverage, induction/assets/HMO; M7 exit |
| Architecture | 22 | Web/API/PostgreSQL/storage/email/jobs separated by contracts and permissions |
| Release plan | 23 | M4 Phase 1; M5 2A; M6 2B; M7 Phase 3 |
| Minimum scenarios | 24 | Core journeys M1–M4; external/policy/beneficiary M5; AXA/induction/assets M6; regression and pilot M8 |
| Open decisions/go-live | 24–25 | Decision log below; owner sign-offs before real-data launch |
| Full product definition | 27 | Full invitation-to-induction lifecycle through M6; asset-to-exit continuity M7; release evidence M8 |
| Form/status inventory | 28–29 | All ten module types covered; status/action vocabulary preserved |

### Pilot checklist

- HR approves templates, mandatory pre-start rules, reviewer scopes and expected status behaviour.
- Synthetic employee invite → activate → draft → submit → correct → resubmit → approve passes with audit and notifications.
- Two distinct employees and all reviewer types pass direct API and file-access isolation tests.
- Source texts, privacy/retention and acknowledgement/signature process approved for features being launched.
- Guarantor conflict resolved before external workflow production use.
- Email sender configured; delivery failure recovery and worker failure alert demonstrated.
- Private storage/scanning and export permissions proven.
- Backup restored; incident/support owners and release rollback documented.
- Representative employees/HR complete an observed pilot and record remaining issues.
- Release evidence identifies what is included, deferred and blocked; full-product completion is never inferred from a core-only pilot.

## Confirmed owner additions ? 13 October 2026

These extend the PRD; see [FORM_BUILDER.md](FORM_BUILDER.md).

| ID | Milestone | Acceptance evidence |
|---|---|---|
| OWNER-01 | M1 onward | shadcn/ui is the shared component foundation, with responsive Tailwind layouts |
| OWNER-02 | M2/M3/M4 | HR creates, previews, publishes and assigns a new form with fields, conditional rules and uploads without developer edits; core pilot covers it |
| OWNER-03 | M3/M4/M5 | HR configures signatures; respondent draws or attaches own signature/signed file; required signature validated and evidence bound to exact immutable content |
| OWNER-04 | M5 | Employee sends guarantor request; guarantor completes/signs directly; direct employee proxy draft/upload/sign/submit attempts denied |
| OWNER-05 | Every milestone | Employee, HR builder and external forms work at narrow/wide widths, zoom and keyboard/touch; no desktop-only required action |
