# Nolt HR

Fullstack HR application built with **React 19 + Vite + Supabase** (Auth + PostgreSQL with Row Level Security).

## Stack

- **Frontend:** React 19, TypeScript, React Router v7, React Hook Form, TanStack Query
- **Backend:** Supabase (PostgREST + RLS) plus an Edge Function for email invites
- **Auth:** Supabase Auth magic links for invited users; password login only for the seeded admin
- **RBAC:** Three roles enforced in the database, not just in the UI

| Role       | Can                                                        |
| ---------- | ---------------------------------------------------------- |
| `admin`    | Everything: invite users with any role, change roles        |
| `hr`       | Invite employees, view the employee directory              |
| `employee` | Own profile only                                            |

## Who can invite

Users are **invited by email** — there is no self-service signup page. An invite is sent through a [Supabase Edge Function](supabase/functions/invite-user/index.ts) that:

1. Verifies the caller's JWT and looks up their role in `profiles`
2. Rejects the request unless the caller is `admin` or `hr`
3. Lets HR invite only `employee`; only `admin` may grant `hr`/`admin`
4. Calls `supabase.auth.admin.inviteUserByEmail()`, assigns the authorized role, and emails the invite link

Accepting an invitation signs the user in and sends them through `/auth/callback` to the dashboard. Later sign-ins use one-time magic links. `shouldCreateUser: false` ensures the login form cannot create accounts.

Access control is also enforced **server-side** via:

1. **Row Level Security policies** on the `profiles` table — employees only read/write their own row; `hr`/`admin` may read all; `admin` may update/delete any.
2. A `SECURITY DEFINER` Postgres function `update_user_role` (admin-only) for role changes.
3. The invite role is written to protected `app_metadata` and the profile by the Edge Function. User-editable metadata is never trusted for authorization.

The React app additionally hides routes by role (`RequireRole`) for UX, but RLS/Edge Function checks are the real gate.

## Setup

### 1. Configure environment

```bash
cp .env.example .env
```

Fill in your Supabase project URL and anon key:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_ADMIN_EMAIL=admin@your-company.com
```

> The anon key is safe for the browser; it is restricted by RLS. The service role key never touches the client.

### 2. Apply the database migrations

```bash
npm run db:link    # links to the remote project (prompts for your DB password)
npm run db:migrate # pushes supabase/migrations/*.sql to the remote database
```

Or run the files manually in the Supabase **SQL editor**:

- [`0001_init_auth_rbac.sql`](supabase/migrations/0001_init_auth_rbac.sql) — creates `profiles`, the `user_role` enum, the auto-profile trigger, RLS policies, and `update_user_role`.
- [`0002_email_invites.sql`](supabase/migrations/0002_email_invites.sql) — removes the old password-based `create_user_with_role`, lets the trigger pick the role up from invite metadata.
- [`0003_fix_rls_recursion.sql`](supabase/migrations/0003_fix_rls_recursion.sql) — **required fix**: the 0001 RLS policies self-referenced `profiles`, which makes Postgres raise *"infinite recursion detected in policy for relation profiles"* (a 500 for every `GET /profiles`). Role checks now go through a `SECURITY DEFINER` helper.
- [`0004_secure_invite_roles.sql`](supabase/migrations/0004_secure_invite_roles.sql) — prevents user-editable metadata from assigning privileged roles; the authorized invite function now owns role assignment.

### 3. Deploy the invite Edge Function

```bash
supabase functions deploy invite-user
supabase secrets set SITE_URL=http://localhost:5173   # or your production URL
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically at deploy time. Keep `verify_jwt = true` (already set in `supabase/config.toml`) so only signed-in users can reach it.

Make sure a real SMTP provider is configured (**Authentication → Email templates → Invite user** sends the email).

In **Authentication → URL Configuration**, add these allowed redirect URLs:

```
http://localhost:5173/auth/callback
http://127.0.0.1:5173/auth/callback
https://your-production-domain.example/auth/callback
```

Set the hosted project's Site URL to the production domain. If you customized the invite or magic-link email templates, use Supabase's `{{ .ConfirmationURL }}` link so the configured redirect is preserved.

### 4. Seed the first admin

Self-registration is disabled, so use the seed script (needs the service role key — server side only):

```bash
cp .env.seed.example .env.seed   # fill in URL, service role key, admin email + password
npm run db:seed
```

It creates the admin (or promotes them if the email already exists) and sets the admin role on both the auth user and the `profiles` row.

Set `VITE_ADMIN_EMAIL` to the same value as `SEED_ADMIN_EMAIL`. The address is used only to select the admin password form; the app verifies the signed-in user's database role before accepting the password login. Never put the admin password in a `VITE_` variable.

Afterwards, invite everyone else from **HR → Invite a user** and manage roles in **Admin → User management**.

### 5. Run

```bash
npm install
npm run dev
```

## Pages

| Route      | Access              | Purpose                                         |
| ---------- | ------------------- | ----------------------------------------------- |
| `/login`   | Public              | Sign in (invited users land here to authenticate) |
| `/`        | Any user            | Dashboard with your profile                     |
| `/profile` | Any user            | Edit your name/email                             |
| `/hr`      | `hr`, `admin`       | Invite users + employee directory                |
| `/admin`   | `admin`             | Manage user roles                                |

## Scripts

| Script               | What it does                                  |
| -------------------- | --------------------------------------------- |
| `npm run dev`        | Start the Vite dev server                     |
| `npm run build`      | Type-check + production build                 |
| `npm run lint`       | ESLint                                        |
| `npm run db:link`    | Link Supabase CLI to the remote project       |
| `npm run db:migrate` | Push local migrations to the remote database  |
| `npm run db:seed`    | Create/promote the admin user (reads `.env.seed`) |
| `npm run db:pull`    | Pull remote schema changes into migrations    |
| `npm run db:start`   | Start a local Supabase stack                  |
| `npm run functions:deploy` | Deploy the `invite-user` edge function |
| `npm run deploy`     | Migrate + seed + deploy edge functions         |

## Project layout

```
src/
  lib/
    supabase.ts          Supabase client (typed)
    database.types.ts    Hand-written types matching the migration
    auth-context.ts      Context + types for the auth state
    auth.tsx             <AuthProvider> — session state
    useAuth.ts           useAuth() hook
    queries.ts           TanStack Query hooks (profiles, invites, roles)
  components/
    AppLayout.tsx        Nav bar with role-aware links + sign out
    RequireAuth.tsx      Redirects unauthenticated users to /login
    RequireRole.tsx      Renders 403 for unauthorized roles
    RoleBadge.tsx        Role pill
  pages/
    Login.tsx Dashboard.tsx ProfilePage.tsx HrPage.tsx AdminPage.tsx
supabase/
  migrations/            Backend schema + RLS
  functions/invite-user/ Edge Function that sends email invites
scripts/
  seed-admin.mjs         Creates/promotes the first admin (npm run db:seed)
```

## Production notes

- Keep **Email confirmations** on and disable public signups in the Supabase dashboard.
- Never ship the service role key to the client; it lives only in the Edge Function's secrets.
- Regenerate types after schema changes with `npx supabase gen types typescript` and reconcile with `src/lib/database.types.ts` (`npm run gen:types`).

## Data fetching & forms

- **TanStack Query** drives all server data: `useCurrentProfile`, `useProfiles`, `useUpdateProfile`, `useInviteUser`, `useUpdateUserRole` in [`src/lib/queries.ts`](src/lib/queries.ts). `QueryClientProvider` is mounted in `src/main.tsx`.
- **React Hook Form** powers every form (login, profile edit, invite) with declarative validation.
