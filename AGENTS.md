# NOLT HR project instructions

For planning or implementing this portal, read [skills/nolt-hr-delivery/SKILL.md](skills/nolt-hr-delivery/SKILL.md) and follow the approved scope recorded in [docs/planning/DECISIONS.md](docs/planning/DECISIONS.md).

The owner approved local implementation on 13 October 2026. Follow the roadmap and maintain [docs/TRACKER.md](docs/TRACKER.md): check off only implemented, verified work and record remaining limits. Preserve the supplied PDF and existing protected Git/tool directories. Production deployment and real employee imports remain unapproved.

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
12. **Keep production separate.** Deployment, paid services and real employee imports require explicit approval.

*HR controls the forms; the application enforces security, validation and workflow rules.*

## Current Position & Working Workflows

The project currently supports **HR setup → employee invitation → onboarding checklist → employee form submission** (verified in development):
- **Real authentication:** Supabase signup, email confirmation, password login, authenticator MFA, logout and session revocation.
- **HR form builder:** Create/edit drafts, configure questions and recipients, preview, publish and create new versions. Published versions stay immutable.
- **Employee management:** Create employee records, edit employment details and open onboarding cases.
- **Form assignment:** Assign an exact published version, mark required/optional and set due dates.
- **Invitations:** Send through Supabase/Resend, resend, revoke and activate intended employee account. Real email delivery and activation confirmed.
- **Employee workspace:** See own checklist, fill forms, save incomplete drafts, reopen and submit.
- **Submission protection:** Validate answers, prevent stale overwrites, lock submitted answers and retain submission history.
- **Foundations:** Database migrations, access checks, audit records and delivery queue. Responsive across six viewport widths.

## Current Delivery Focus

**HR review and corrections:**
`employee submits → authorised HR reviews → requests changes with a reason → employee corrects/resubmits → HR decides, while preserving every version.`
