# Decision log

Prepared 13 October 2026. Local implementation and the architecture baseline are approved; D17-D20 are confirmed owner requirements. Provider, HR and legal decisions remain unresolved where noted. Record owner, date and rationale when resolving them; preserve superseded decisions.

| ID | Decision | Proposal / unresolved input | Owner / deadline |
|---|---|---|---|
| D01 | Architecture | Confirmed implementation baseline: Next.js + shadcn/ui + NestJS + PostgreSQL; storage/worker follow roadmap | Owner approved local build, 13 October 2026 |
| D02 | Release scope | PRD phase table; full induction Phase 2B despite p27 MVP wording | HR/product owner, roadmap approval |
| D03 | Templates/readiness | Employment-type templates, requirement stage/mandatory/optional rules | HR, M0/M2 |
| D04 | Guarantor family | Conflicting source rule; configurable; governing rule not selected | HR/legal, before 2A launch |
| D05 | Identity | Owner selected Supabase Auth with real password login, verified email and authenticator MFA; Resend connects directly via Supabase SMTP. | Owner, 13 October 2026; signup/email delivery and MFA owner-verified; recovery verification pending |
| D06 | Access | Health/finance permissions separate; reviewer record/module scope | HR/security, M0 |
| D07 | Legal execution | Obtain approved policy, confidentiality, indemnity, witness/surety and consent wording | Legal/HR, M5 |
| D08 | Progress/status | Mandatory-only formula, waiver/NA treatment, zero-denominator and status precedence | HR, M2/M4 |
| D09 | Originals | Original forms and AXA workbook not independently supplied; exact fields/text require review | HR, each module |
| D10 | Providers/hosting | Hosting region, costs, identity/email/storage/scanning services and owners | Owner/IT, M0/production gate |
| D11 | File policy | Allowed MIME/extensions, maximum sizes, scanning and failed-scan handling | HR/security, M3 |
| D12 | Reminders | Configurable cadence; no automatic assumption of 7/3/1 schedule | HR, M6 |
| D13 | Privacy/retention | Privacy notice, retention/deletion including backups, access logging | Legal/compliance, real-data launch |
| D14 | AXA export | Confirm workbook version, approved rows, HR export operator | HR/benefits, M6 |
| D15 | Exit | Clearance departments, exceptions, account deactivation timing and access to handover | HR/IT, M7 |
| D16 | Operations | Staff/file volumes, performance, RPO/RTO, backup retention, incident/support owners | Owner/IT, foundation/release |
| D17 | UI components | **Confirmed:** shadcn/ui with Tailwind CSS | Owner, 13 October 2026 |
| D18 | HR authors forms | **Confirmed:** core-release builder for questions, uploads, signatures, recipients and assignments | Owner, 13 October 2026 |
| D19 | Guarantor actor | **Confirmed:** employee sends request; guarantor fills/signs own form; employee proxy submission denied | Owner, 13 October 2026 |
| D20 | Responsive coverage | **Confirmed:** all portals and builder across screen sizes, keyboard/touch signing | Owner, 13 October 2026 |

| D21 | Signature image storage | **Superseded by D22:** earlier Base64 database proposal; no signature storage was implemented under this decision. | Owner, 13 October 2026 |

| D22 | Signature/file storage | **Confirmed:** private object storage for signature images/signed PDFs; PostgreSQL stores stable references, signer, exact form/response version, timestamp and checksum. Authorised short-lived retrieval. Implementation pending. | Owner, 13 October 2026 |

| D23 | Superseded local identity baseline | OIDC/PKCE with explicit subject provisioning; privileged ACR checks; 30-minute idle/eight-hour absolute application sessions; role/permission changes revoke access. Real provider policy and HR role memberships still need approval. | Local implementation, 13 October 2026 |

| D24 | Real authentication | **Confirmed:** replace synthetic login with Supabase Auth; real email/password accounts and authenticator MFA. Bootstrap the owner-approved personal HR email after verification. Resend SMTP is configured directly by the owner in Supabase. | Owner, 13 October 2026 |

## Approval record

Railway frontend staging preparation, 15 October 2026: after the API's public health checks passed, the owner approved proceeding with HTTPS frontend connection and subsequent real login/MFA verification. Prepare and push the web service configuration/guide; continue using Free/Trial resources. Production release, paid upgrades and real employee imports remain unapproved.


Railway staging preparation, 14 October 2026: owner requested a reviewed GitHub checkpoint and guidance for deploying the API to Railway's free/trial environment. Prepare an explicit staging startup/configuration and deployment guide. This authorises repository preparation and the requested GitHub push, not production release, paid services or real employee imports. No Railway resource is provisioned by this checkpoint.


Development review access, 14 October 2026: following the owner's approval to fix the reviewed security/concurrency gaps, require an explicit assignment-level reviewer and an explicit whole-form sensitivity classification by the HR account that opened the case. No legacy answer access is automatically granted. Health/financial classes additionally require the corresponding private account permissions; technical administrators do not inherit review access. The initial assignment is immutable. Production classification authority, reviewer delegation/revocation administration and the final organisational matrix remain D06/release gates. Classification is an explicit trusted HR responsibility, not inferred from question labels or proof that arbitrary answer text contains no sensitive information.

Hosted development database: owner selected project `llslubzdkdnvhbatmfug` on 13 October 2026 and authorised migration and current-feature testing. CLI linking, migrations, trusted TLS and actual hosted application tests are verified. Four synthetic identities and three test forms remain as QA evidence. No real employee imports, paid upgrades or production app deployment are authorised. Render remains a recommendation for later app hosting.

Roadmap approval: owner approved local implementation on 13 October 2026 ("ok now let start building").

Approved scope/stack amendments: D17-D20 confirmed by owner; detailed acceptance in `FORM_BUILDER.md`. Local implementation approved; unresolved HR/legal/provider decisions remain open.

Implementation started: yes; tracked in `../TRACKER.md`.

Production deployment authorised: no.

When the user approves, record the exact approved scope here before implementation. Approval of local implementation does not resolve undecided HR/legal rules or authorise production purchases/data import.
