# Run and review the current project

The portal uses real Supabase Auth and the hosted Supabase PostgreSQL database. The previous synthetic login, OIDC fixture, seed and access CLI are retired. See [identity setup](IDENTITY.md) and [Supabase setup](SUPABASE_SETUP.md).

## Start

Use Node 24 and install workspace dependencies with `npm ci`. Keep `.env` for loopback transport and ignored `.env.supabase` for the real project, restricted/owner database URLs, public CA path and Auth encryption key. Never commit either local secret file. On a fresh checkout, copy `.env.example` only if `.env` does not exist, then populate the ignored hosted file privately.

```powershell
npm run db:generate
npm run contracts:build
npm run db:hosted:status
npm run db:hosted:verify
npm run dev
```

Open `http://127.0.0.1:3000`. Choose **Create an account**, use the approved real email and your own password, open the confirmation email in the same browser, then enrol an authenticator app and verify its code. The approved first HR email receives HR after verification; ordinary signups receive EMPLOYEE access. API docs: `http://127.0.0.1:4000/api/docs`.

Connect Resend directly in Supabase SMTP first to validate email delivery. No test login button or preselected synthetic identity is available. Your password is chosen by you and is not stored in the repository.

## HR form review

Create a draft, choose employee/guarantor/reference, add fields, edit labels/choices/requiredness, reorder/remove fields, save/reopen, preview, publish and create a new version. Published definitions remain immutable. Signature and attachment fields configure requirements only; capture/storage and external delivery remain pending.

## Checks

```powershell
npm run api:generate
npm run typecheck
npm run build
npm test
```

With the real API/web running:

```powershell
npm run test:hosted
npm run test:e2e:hosted
```

These explicit live suites create disposable accounts in real Supabase Auth and exercise actual TOTP, sessions, permission denial and HR authoring. They require the server-only Auth administration key and never email those disposable accounts or modify the owner's account. Their application audit/form evidence is retained with deactivated identities. Do not point them at production.

`npm test` runs provider-independent validation, encryption and security unit tests. `npm run test:e2e` runs public Auth-screen checks; the explicit hosted command includes real-login journeys. Authentication email delivery and the owner's confirmation/recovery journeys need separate mailbox testing after SMTP setup.

The architecture remains Next/shadcn/Tailwind → generated OpenAPI client → Nest permission-checked API → restricted PostgreSQL runtime role. All provider tokens and secrets stay on the server. Production deployment, full lifecycle workflows, actual signatures/uploads, comprehensive browser/zoom/touch coverage, shared rate limiting and backup restore remain gated.

For response workflow verification without watch restarts, run `npm run build`, then `node scripts/hosted-qa.mjs preview` instead of the development launcher. The preview stays on loopback and uses the approved hosted development environment. Run the focused journey with `npm run test:e2e:hosted -- tests/e2e/responses.live.spec.ts`. See [employee responses](RESPONSES.md).

For invitation delivery, run `npm run worker:hosted` alongside the app after building the API. Development recipients must be explicitly approved in the private `INVITATION_TEST_RECIPIENTS` setting. Email uses the existing Supabase SMTP connection to Resend. See [invitations](INVITATIONS.md) for retry behavior and the controlled one-email smoke command. Actual invitation inbox receipt and activation were owner-verified on 14 October 2026.
