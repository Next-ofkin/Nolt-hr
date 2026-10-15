# Developer-led Identity Migration — Safety Checklist

Status: **design and permission scaffolding only**; no live identity migration or provider changes have been executed.

## Approved chain of trust

1. A one-time, operator-authorised bootstrap binds an existing MFA-verified Supabase subject to a single `DEVELOPER` local account. Credentials are never hardcoded in the repository. Creation must fail closed when a developer has already been provisioned, and recovery must require a documented manual, multi-person process.
2. A session with `hr.accounts.manage` can create a single-use HR invitation. Recipient email must be verified through Supabase; accept and role assignment are a server-owned, transactional operation. Pending users receive no working HR permissions.
3. An HR session with explicit employee-management capability can create an employee record, issue an invitation linked to that employee ID, and activate the verified Supabase identity only after invite acceptance. No implicit email-match link is accepted as authority.
4. Every portal session still requires a Supabase TOTP-verified `aal2` proof. Provider tokens and account mappings stay server-side. Developer access has `system.manage` and `hr.accounts.manage` but not form-review, financial or health permissions by default.
5. External guarantors and referees remain unauthenticated NOLT users: they use scoped one-time form invitations, not internal accounts.

## Migration strategy (must be validated before rollout)

- Back up and review only **synthetic/dev** records first. Enumerate existing verified identities, active HR users, linked employees, invitations and sessions; do not assume every email-address match is safe.
- Introduce explicit provision/invitation states without destructive changes to `User`, `Identity`, `Employee` or historical `Session` data.
- Backfill existing active HR and employee associations **only with explicit owner/HR review**. Never automatically promote a newly-registered identity.
- Create the one-time developer bootstrapping route or offline command with strict replay/uniqueness controls and audit trail. Enforce TOTP before any developer privileges are usable.
- Build developer-created HR invitations and HR-created employee invitations, with transactional consumption, expiry/revoke/reissue and notification delivery.
- Roll out a gated cutover: first backfill, then test invite acceptance and MFA, finally turn off unrestricted signup and old automatic email-linking triggers. Verify recovery and existing account access before removing legacy rules.
- Add denial tests: public signup cannot provision roles; user cannot select role; employee cannot create HR; HR cannot create developer; two users cannot claim one employee; email re-use cannot steal an employee record; repeated invitation token cannot be accepted; missing AAL2 blocks all staff sessions.
- Never apply migration or send real invitations without separate environment-specific authorisation.

## Scaffolding implemented on feature branch

- `DEVELOPER` grants isolated `system.manage` / `hr.accounts.manage`.
- `DeveloperGuard` checks explicit account-provisioning permission.
- Unit test checks developer role has no inherited HR form/health/finance access.

**Outstanding:** Bootstrap, invitation persistence, database migration, secure routes, invitation UIs, cutover, and end-to-end test evidence. No active user provisioned yet.
