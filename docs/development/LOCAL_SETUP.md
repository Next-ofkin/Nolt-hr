# Local development

This first slice implements HR form authoring. It does not yet implement production login, employee assignment/submission, third-party delivery, private uploads or actual signing. Use synthetic data only. The local identity endpoint is disabled unless explicitly enabled, rejects non-loopback callers/untrusted browser origins, and is unavailable under `NODE_ENV=production`.

## First setup

Use Node.js 24 LTS and npm. From the repository root:

```powershell
npm ci
Copy-Item .env.example .env
npm run contracts:build
npm run db:generate
```

Do not overwrite an existing `.env` when repeating setup. The example passwords are only for the workspace-local development database.

Start PostgreSQL in one terminal:

```powershell
npm run db:local
```

This starts a real PostgreSQL server on `127.0.0.1:54329`, stores its persistent data under ignored `.local/postgres`, and provisions a restricted runtime role. It does not install a system service or change system accounts. Stop it with Ctrl+C. If the port is occupied, stop the existing project server before starting another.

In another terminal, initialise the database and start the applications:

```powershell
npm run db:migrate
npm run db:permissions
npm run db:seed
npm run dev
```

Open **http://127.0.0.1:3000** and choose **Continue as local HR**. API documentation is at **http://127.0.0.1:4000/api/docs**. The web application forwards same-origin API requests to NestJS; no database credentials are sent to the browser.

On later runs, start `db:local` and `dev`; migration/permissions/seed only need repeating when setup or schema changes. Seed is idempotent and creates only `hr@example.test` and `employee@example.test` identities. Forms created during tests remain synthetic development records.

## Working feature

1. Create a form and choose Employee, Guarantor or Reference as its respondent.
2. Add/reorder/remove supported fields and change labels, help text and required flags.
3. Configure dropdown choices, signature method or signed-document attachment purpose.
4. Save the draft and reopen it from the form library.
5. Preview the respondent layout, then publish a locked version.
6. Create a new version without changing the previous published content.

Signature and attachment fields currently configure requirements and display a labelled preview; they do not collect/store files or signatures. Guarantor recipient selection does not yet send invitations. The tracker keeps those tasks open. The initial library shows the latest version of up to 100 forms; full pagination/history browsing is tracked separately.

## Verification

With local PostgreSQL/API/web running:

```powershell
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

`npm test` includes real PostgreSQL/API integration, so it deliberately fails if the API/database is unavailable. Browser checks exercise authoring/publishing/versioning and layouts at 320, 375, 768, 1024, 1440 and 1920 CSS pixels. Full application accessibility, zoom and touch signing remain future acceptance work.

After API contract changes:

```powershell
npm run contracts:build
npm run api:generate
```

The command compiles NestJS (including decorator metadata), exports `docs/api/openapi.json`, then regenerates the frontend client types. Zod supplies input schemas and server validation; cross-field refinements are enforced at runtime even where OpenAPI cannot express them.

## Current architecture notes

- `apps/web`: Next.js/React, official shadcn component source and Tailwind CSS.
- `apps/api`: NestJS, session/HR guards, CSRF verification and transactional form mutations.
- `packages/form-schemas`: shared field/content validation and defaults, compiled before applications.
- `packages/api-client`: generated OpenAPI types and browser fetch client.
- `database`: Prisma schema, checked-in migration and synthetic seed. Additional SQL checks and the immutability trigger are intentional database protections beyond Prisma's declarative model.
- `scripts`: workspace-local PostgreSQL and restricted runtime grants.
- `docs/TRACKER.md`: implementation checklist, also read by the local `/tracker` page.

The application runtime cannot create schema objects, modify users, or update/delete audit/outbox evidence. Domain changes write audit and outbox in the same transaction. Outbox events are retained pending the worker/notification milestone; no mail delivery is claimed.

Managed OIDC, production session controls, rate limits, idempotent invitation/submission handling, complete role scopes and provider configuration must be completed before production deployment. API startup intentionally refuses `NODE_ENV=production` until that identity milestone is implemented. A successful frontend production build verifies compilation; it is not production readiness.
