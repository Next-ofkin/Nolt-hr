# NOLT HR Employee Lifecycle Portal

A secure portal for NOLT Finance to manage employee pre-onboarding, HR reviews, policy acknowledgements, agreements, benefits, induction, company assets and offboarding.

**Current status (21 October 2026):** live on a single VPS at `https://hr.dastings.name.ng`, using Supabase for login, PostgreSQL and private file storage. Working end to end: HR form builder (draft, publish, unpublish, new versions), onboarding **Packs** (versioned bundles of forms), employee directory, invitations by email, employee forms with drafts and submissions, HR review with mandatory correction reasons, guarantor/reference requests completed by the guarantor through a secure link, private uploads and signatures, and a phone-first interface. Three roles exist: DEVELOPER, HR and EMPLOYEE. Real employee imports and the remaining roadmap modules (policies, agreements, induction, assets, offboarding) are not done.

**Track progress:** [implementation checklist](docs/TRACKER.md). Completed boxes require verification evidence. Deployment: [VPS runbook](docs/DEPLOYMENT.md). Rules for forms and packs: [lifecycle rules](docs/development/FORM_AND_PACK_RULES.md).

## Run locally

See [local setup and verification](docs/development/LOCAL_SETUP.md). Node.js 24 is required.

```powershell
npm ci
npm run contracts:build
npm run db:generate
npm run db:hosted:status
npm run dev
```

Keep `.env` and `.env.supabase` configured privately as described in the setup guide. Open **http://127.0.0.1:3000/signup**, choose your own password, confirm your email in the same browser, then set up an authenticator app. There is no synthetic login shortcut. API docs: **http://127.0.0.1:4000/api/docs**.

Checks before any change goes to `main`: `npm run typecheck`, `npm test` (150 tests at the last run) and `npm run build`. See [identity/session setup and limits](docs/development/IDENTITY.md).

## Deployment

Production runs with Docker Compose on one VPS: `web` (Next.js), `api` (NestJS, not exposed publicly) and `caddy` (automatic HTTPS). Update with `bash /opt/nolt/deploy/vps/update.sh` on the server. Full steps, settings and checks: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Branding and handover: [docs/BRANDING_AND_DEPLOYMENT.md](docs/BRANDING_AND_DEPLOYMENT.md). The earlier Railway and Vercel set-up is retired. GitHub Actions currently cannot start because of a GitHub account billing lock; see [main branch protection](docs/MAIN_BRANCH_PROTECTION.md).

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
| Background processing | **TypeScript worker on Node.js** | Transactional outbox and invitation delivery; reminders and exports remain on the roadmap |
| Authentication | **Supabase Auth** | Real email/password access, PKCE email flows and authenticator MFA |
| Authentication email | **Resend through Supabase SMTP** | Owner-managed sender configuration; signup delivery owner-verified |
| File storage | **Supabase private Storage** | Protected uploads and signature objects, scanned before use |
| Hosting | **Docker Compose + Caddy on a VPS** | One server runs web, API and HTTPS; data stays in Supabase |
| Automated verification | **Unit/integration tests + Playwright** | Domain rules, API permissions and browser journeys |
| Local document utilities | **Python + pypdf + PyYAML** | PRD extraction and skill validation only; Python is not the proposed application backend |

Installed versions are locked in `package-lock.json`; the build currently uses Next.js 16.4, React 19, NestJS 12 and Prisma 7. Supabase Auth/PostgreSQL, Resend (email) and Cloudmersive (file scanning) are in use.

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
  scripts/                           Database, readiness and QA tooling
  deploy/vps/                        Docker Compose, Caddy and setup/update scripts for the server
  Dockerfile.api, Dockerfile.web     Container images for the API and the web app
  tests/                             Domain, real-DB API and browser checks
  .github/workflows/                 CI check configuration (blocked by a billing lock)
  docs/TRACKER.md                    Implementation checklist
  docs/DEPLOYMENT.md                 Server runbook
  docs/development/                  Setup, identity, forms/packs, data model, test reports
  docs/api/                          Executable initial OpenAPI contract
  docs/planning/                     Roadmap, connections and requirements
  docs/source/                       Preserved PRD PDF and extracted text
  skills/nolt-hr-delivery/            Reusable project delivery skill
  tools/python/                      Ignored document utility dependencies
  README.md                          Project overview and setup entrypoint
  AGENTS.md                          Instructions for coding agents
  .agents/, .codex/, .git/            Preserved skills, settings and history
```

The supplied PDF is preserved under `docs/source/`. Application code is under `apps/web` and `apps/api`; shared contracts and the generated client are under `packages`, migrations under `database`, checks under `tests`, and tooling under `scripts`. See the [data model](docs/development/DATA_MODEL.md).

## Planning documents

Database setup: [Supabase setup](docs/development/SUPABASE_SETUP.md). All application migrations are applied to the production Supabase project. Use `npm run dev:hosted` to review against Supabase. See the [test report](docs/development/TEST_REPORT.md).

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
| Phase 1 | Authentication, invitations, checklist, biodata/declarations, files, HR form builder, signature fields, drafts, review/correction, progress and audit. **Built.** |
| Phase 2A | Guarantors/references (**built**), policies, confidentiality/indemnity and beneficiaries |
| Phase 2B | HMO/AXA, induction, assets and reports. The AXA enrolment form and a spreadsheet export were built, but the export button was removed from the HR screen by owner decision; the code remains. |
| Phase 3 | Handover, asset returns, departmental clearance, exit interview and closure |

The roadmap flags the PRD's conflicting placement of induction in its MVP description. Proposed delivery follows the PRD release table and places full induction in Phase 2B. Local implementation is now approved. Unresolved HR/legal/provider decisions remain in the decision log and do not imply production approval.
