# NOLT HR Employee Lifecycle Portal

A secure portal for NOLT Finance to manage employee pre-onboarding, HR reviews, policy acknowledgements, agreements, benefits, induction, company assets and offboarding.

**Current status:** planning complete; roadmap approval pending. Application code has not been scaffolded. shadcn/ui and the HR-owned form builder requirements are confirmed; remaining stack choices and overall implementation await approval.

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
| Authentication | **Managed OIDC provider** | Email-based access, account recovery and privileged MFA; vendor pending |
| File storage | **Private S3-compatible object storage** | Protected uploads, quarantine and completed agreement files; vendor pending |
| Automated verification | **Unit/integration tests + Playwright** | Domain rules, API permissions and complete browser journeys |
| Local document utilities | **Python + pypdf + PyYAML** | PRD extraction and skill validation only; Python is not the proposed application backend |

Email, hosting, identity, scanning and storage providers remain to be selected. Framework/runtime versions will be checked and locked when implementation begins. There are no install, development-server or build commands yet because the application has not been created.

## Confirmed product requirements

- **HR creates and configures forms and requirements:** questions, sections, conditional rules, uploads, signatures, recipients and assignments through a visual builder. This is core scope.
- **Signatures:** HR can request a drawn signature, signature-image attachment or signed-document attachment. Evidence is tied to the signer and exact form version.
- **Guarantor delivery:** the employee sends a secure request; the guarantor completes and signs their own form directly. Employees cannot complete it on their behalf.
- **Responsive throughout:** employee, HR, builder and guarantor screens work on mobile, tablet, desktop and wide screens with touch and keyboard support.

See [form builder and signing requirements](docs/planning/FORM_BUILDER.md).

## Application connection

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

The API verifies identity and permissions, validates submissions, controls lifecycle transitions, and writes audit evidence. The frontend communicates through the API contract. Files remain private and access is granted through authorised, short-lived links. A managed OIDC provider supports the API/session authentication boundary.

## Current folder structure

```text
Nolt-hr/
├── README.md                         Project overview and proposed stack
├── AGENTS.md                         Instructions for coding agents
├── .gitignore                        Local utility dependencies excluded
├── docs/
│   ├── source/
│   │   ├── NOLT_HR_Employee_Lifecycle_Portal_Full_PRD (3).pdf
│   │   └── prd-extracted.txt          Page-labelled PRD text
│   └── planning/
│       ├── ROADMAP.md                 Architecture, milestones and estimates
│       ├── API_AND_CONNECTIONS.md     API inventory and integration flows
│       ├── TRACEABILITY.md            PRD coverage and acceptance checks
│       └── DECISIONS.md               Approval and unresolved choices
├── skills/
│   └── nolt-hr-delivery/
│       └── SKILL.md                   Reusable project delivery skill
├── tools/
│   └── python/                       Local PDF/validation dependencies
├── .agents/                          Existing protected skills
├── .codex/                           Existing protected tool settings
└── .git/                             Existing Git history
```

The supplied PDF is preserved under `docs/source/`. Existing protected configuration/history folders are retained. Application directories will be created after roadmap approval: `apps/web`, `apps/api`, `apps/worker`, shared `packages`, `database` and `tests/e2e`. The detailed proposed structure is in the roadmap.

## Planning documents

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
| Phase 2B | HMO/AXA exports, induction, assets and reports; builder already delivered in Phase 1 |
| Phase 3 | Handover, asset returns, departmental clearance, exit interview and closure |

The roadmap flags the PRD's conflicting placement of induction in its MVP description. Proposed delivery follows the PRD release table and places full induction in Phase 2B. Confirm this and the proposed stack with roadmap approval before implementation starts.
