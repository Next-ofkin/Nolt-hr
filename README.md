# NOLT HR Employee Lifecycle Portal

A secure portal for NOLT Finance to manage employee pre-onboarding, HR reviews, policy acknowledgements, agreements, benefits, induction, company assets and offboarding.

**Current status:** local implementation approved and started. The first working slice is HR form authoring: create/save/reopen, field configuration, respondent preview, immutable publication and new versions. Supabase PostgreSQL stores the records. Real Supabase Auth now handles password login and authenticator MFA; signup/email delivery and MFA are owner-verified. Password recovery remains a separate check. Employee directory, onboarding cases, fixed published-form assignments and private employee checklists are now verified against hosted Supabase. Employee invitations, real email delivery and activation are also verified. Employee form drafts, validated submissions and immutable submission history are now verified. HR review, mandatory correction reasons and versioned resubmission are now verified with explicitly scoped review access. Next: private uploads and signature capture.

**Track progress:** [implementation checklist](docs/TRACKER.md), also visible at `/tracker` in the local app. Completed boxes require verification evidence.

## Run locally

See [local setup and verification](docs/development/LOCAL_SETUP.md). Node.js 24 is required.

```powershell
npm ci
npm run contracts:build
npm run db:generate
npm run db:hosted:status
npm run dev
```

Keep `.env` and `.env.supabase` configured privately as described in the setup guide. Open **http://127.0.0.1:3000/signup**, choose your own password, confirm your email in the same browser, then set up an authenticator app. The approved bootstrap email receives HR after verification; other signups receive EMPLOYEE access. There is no synthetic shortcut. Resend SMTP is configured by the owner in Supabase; signup and MFA are confirmed working. API docs: **http://127.0.0.1:4000/api/docs**.

See [identity/session setup and limits](docs/development/IDENTITY.md). Production deployment remains gated.

Private Supabase file/signature code is implemented and domain-tested, but live scanning and upload/browser acceptance remain blocked by scanner definition downloads. Third-party sending remains pending. See [Railway API staging setup](docs/development/RAILWAY_STAGING.md) for the prepared API deployment configuration; no hosted API deployment is claimed.

## Languages, frameworks and tools

| Area | Language / technology | Purpose |
|---|---|---|
| Main application language | **TypeScript** | Shared language for frontend, backend, workers and API client |
| Frontend framework | **Next.js App Router + React** | Employee, HR/admin and external respondent web experiences |
| Markup and styling | **HTML via TSX, CSS + Tailwind CSS** | Responsive layouts and accessible UI components |
| UI components | **shadcn/ui** | Shared components for all portals and the responsive HR form builder |
| Forms | **HR-owned schema-driven builder + React Hook Form** | HR creates/publishes forms, conditional fields, attachments and signature requests; versioned server validation |
| Backend framework | **NestJS on Node.js** | REST API, permissions and lifecycle business rules |
| API contract | **REST + OpenAPI** | Versioned `/api/v1` endpoints and generated TypeScript client |
| Database | **PostgreSQL / SQL** | Employee records, requirements, submissions, decisions and audit history |
| Database access | **Prisma** | Typed queries and version-controlled migrations |
| Background processing | **TypeScript worker on Node.js** | Transactional outbox, email, file scanning, exports and reminders |
| Authentication | **Supabase Auth** | Real email/password access, PKCE email flows and authenticator MFA |
| Authentication email | **Resend through Supabase SMTP** | Owner-managed sender configuration; signup delivery owner-verified |
| File storage | **Supabase private Storage** | Protected uploads and signature objects; live scanning/acceptance pending |
| Automated verification | **Unit/integration tests + Playwright** | Domain rules, API permissions and complete browser journeys |
| Local document utilities | **Python + pypdf + PyYAML** | PRD extraction and skill validation only; Python is not the proposed application backend |

Supabase Auth/PostgreSQL and Resend SMTP are selected. App hosting, scanning and the private-file integration remain to be completed. Installed versions are locked in `package-lock.json`; the build currently uses Next.js 16.4, React 19.3, NestJS 12.1 and Prisma 7.10. The table describes the complete target stack; the invitation delivery worker is implemented; private file and remaining managed integrations are pending.

## Confirmed product requirements

- **HR creates and configures forms and requirements:** questions, sections, conditional rules, uploads, signatures, recipients and assignments through a visual builder. This is core scope.
- **Signatures:** HR can request a drawn signature, signature-image attachment or signed-document attachment. Signature images and signed PDFs will be stored privately; PostgreSQL retains the stable file reference, signer, exact form/response version, timestamp and checksum. Access uses authorised short-lived links, never public URLs.
- **Guarantor delivery:** the employee sends a secure request; the guarantor completes and signs their own form directly. Employees cannot complete it on their behalf.
- **Responsive throughout:** employee, HR, builder and guarantor screens work on mobile, tablet, desktop and wide screens with touch and keyboard support.

See [form builder and signing requirements](docs/planning/FORM_BUILDER.md).

## Target application connection

```text
Employee / HR / external respondent
                 |
          Next.js frontend
                 |
       Same-origin NestJS API
                 |
       +---------+------------+
       |                      |
   PostgreSQL          Private file storage
       |
  Outbox + worker --> Email / scanning / exports
```

The implemented slice connects the Next.js frontend to NestJS, PostgreSQL, audit and outbox records. Supabase Auth and invitation background delivery are implemented; private file storage and response submission in the diagram remain pending; see the tracker.

## Current folder structure

```text
Nolt-hr/
  apps/web/                          Next.js frontend and shadcn/ui
  apps/api/                          NestJS API and local session guards
  packages/form-schemas/             Shared versioned form validation
  packages/api-client/               Generated OpenAPI types and fetch client
  database/                          Prisma schema, SQL migrations and seed
  scripts/                           Local database and readiness tooling
  tests/                             Domain, real-DB API and browser checks
  .github/workflows/                 CI check configuration
  docs/TRACKER.md                    Implementation checklist
  docs/development/                  Local setup and initial data model
  docs/api/                          Executable initial OpenAPI contract
  docs/planning/                     Roadmap, connections and requirements
  docs/source/                       Preserved PRD PDF and extracted text
  skills/nolt-hr-delivery/            Reusable project delivery skill
  tools/python/                      Ignored document utility dependencies
  README.md                          Project overview and setup entrypoint
  AGENTS.md                          Instructions for coding agents
  .agents/, .codex/, .git/            Preserved skills, settings and history
```

The supplied PDF is preserved under `docs/source/`. Existing protected configuration/history folders are retained. Implemented application code is under `apps/web` and `apps/api`; shared contracts/client are under `packages`, migrations under `database`, checks under `tests`, and local tooling under `scripts`. The worker and remaining modules follow the tracker. See the [initial data model](docs/development/DATA_MODEL.md).

## Planning documents

Hosted database setup: [Supabase setup](docs/development/SUPABASE_SETUP.md). The schema, trusted TLS connection and actual application journeys are verified. Use `npm run dev:hosted` to review against Supabase; `npm run dev` retains the local database. See the [current test report](docs/development/TEST_REPORT.md) for results and review steps.

1. [Roadmap](docs/planning/ROADMAP.md): scope, architecture, frontend/backend responsibilities, milestone order and release gates.
2. [API and connections](docs/planning/API_AND_CONNECTIONS.md): proposed endpoints, sessions, uploads, notifications and service configuration.
3. [Requirements coverage](docs/planning/TRACEABILITY.md): PRD requirements mapped to delivery and acceptance evidence.
4. [Decision log](docs/planning/DECISIONS.md): pending owner, HR, legal and operational decisions.
5. [Original PRD](docs/source/NOLT_HR_Employee_Lifecycle_Portal_Full_PRD%20%283%29.pdf) and [extracted text](docs/source/prd-extracted.txt).
6. [Implementation skill](skills/nolt-hr-delivery/SKILL.md): project-specific instructions for the approved build.

## Delivery phases

| Phase | Scope |
|---|---|
| Foundation | Confirm decisions, designs, permissions, data model and API contracts |
| Phase 1 | Authentication, invitations, checklist, biodata/declarations, files, HR form builder, signature fields, drafts, review/correction, progress and audit |
| Phase 2A | Guarantors/references, policies, confidentiality/indemnity and beneficiaries |
| Phase 2B | HMO/AXA exports, induction, assets and reports; core builder belongs to Phase 1 |
| Phase 3 | Handover, asset returns, departmental clearance, exit interview and closure |

The roadmap flags the PRD's conflicting placement of induction in its MVP description. Proposed delivery follows the PRD release table and places full induction in Phase 2B. Local implementation is now approved. Unresolved HR/legal/provider decisions remain in the decision log and do not imply production approval.
