# NOLT HR project instructions

For planning or implementing this portal, read [skills/nolt-hr-delivery/SKILL.md](skills/nolt-hr-delivery/SKILL.md) and follow the approved scope recorded in [docs/planning/DECISIONS.md](docs/planning/DECISIONS.md).

The owner approved local implementation on 13 October 2026. Follow the roadmap and maintain [docs/TRACKER.md](docs/TRACKER.md): check off only implemented, verified work and record remaining limits. Preserve the supplied PDF and existing protected Git/tool directories. The portal is live on a VPS (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)); real employee imports and paid-service changes still need explicit owner approval.

## Core Rules

**Finish and verify each workflow from screen to database before marking it complete.**

1. **Follow the PRD and approved decisions.** Confirmed owner changes take priority over earlier proposals.
2. **Use the agreed stack:** TypeScript, Next.js/React, shadcn/ui, Tailwind, NestJS, Prisma and Supabase.
3. **Build connected features:** frontend → typed API client → backend permissions/validation → database → audit records.
4. **Use real authentication.** Supabase Auth and MFA; no fake login shortcuts.
5. **Enforce access in the backend.** Employees access only their own records. Guarantors/references complete their own forms; employees cannot impersonate them.
6. **Preserve evidence.** Published forms and submitted answers stay immutable. Corrections must create new versions.
7. **Keep files private.** Signatures/documents belong in private storage; the database stores references and evidence—not Base64 images.
8. **Make delivered screens responsive and accessible.**
9. **Test before checking tracker boxes.** Record unfinished work and verification limits honestly.
10. **Protect secrets and existing work.** Preserve the PRD, Git/tool configuration and historical records.
11. **Push verified checkpoints when requested.**
12. **Keep production separate.** Production data lives in the Supabase project `Nolthr`. Never drop or recreate its tables, never edit `_prisma_migrations`, and never delete evidence tables without a reviewed plan and the owner's explicit yes. Test migrations on a disposable database first.
13. **Never put secrets or server details in this public repository** (keys, passwords, IP addresses). Server settings live in the untracked `deploy/vps/.env.api`.
14. **Verify before merging:** `npm run typecheck`, `npm test` and `npm run build`. GitHub Actions is currently blocked by a billing lock, so run these locally.

*HR controls the forms; the application enforces security, validation and workflow rules.*

## Current Position & Working Workflows

Working and verified in the live system (21 October 2026):
- **Real authentication:** Supabase email/password, email confirmation and mandatory authenticator MFA. Three roles only: DEVELOPER, HR, EMPLOYEE. Every active HR user can review.
- **Forms:** HR builds drafts, previews, publishes, unpublishes, and creates new versions. Published versions are immutable. Rules: [FORM_AND_PACK_RULES](docs/development/FORM_AND_PACK_RULES.md).
- **Packs:** versioned bundles of forms, assigned to an employee's onboarding case. Assignments use the newest published form versions at assignment time; employees keep what they were given. Deadlines can be extended with a recorded reason.
- **Employees and invitations:** directory, onboarding cases, invitations through Supabase/Resend, activation.
- **Employee workspace:** own checklist, drafts, validated submissions, immutable submission history, private uploads and signatures.
- **HR review:** mandatory correction reasons, versioned resubmission, approvals.
- **Guarantor/reference requests:** the employee sends a secure email link; the guarantor completes and signs their own form through a one-request session. Employees cannot answer for them.
- **Interface:** phone-first layout (floating bottom navigation, bottom-sheet dialogs, 48px touch targets on phones), site icon, brand colours from `apps/web/src/lib/brand.ts`.
- **Hosting:** Docker Compose + Caddy on one VPS.

## Open items

Policies, agreements, induction, assets, offboarding, reminders, report exports, verified database backup/restore, secret rotation after the Railway period, and a working CI (billing lock). See the tracker.
