---
name: nolt-hr-delivery
description: Plan and implement the NOLT HR Employee Lifecycle Portal from its supplied PRD and approved roadmap, including employee onboarding, HR review, external respondents, agreements, benefits, induction, assets and offboarding. Use for work in this project, not unrelated HR products.
---

# NOLT HR delivery

## Project sources

Resolve paths relative to the repository root, two levels above this skill folder.

- Read `docs/planning/DECISIONS.md` for approval, scope and unresolved business rules.
- Read `docs/planning/ROADMAP.md` for architecture, milestone dependencies and release boundaries.
- Read `docs/planning/API_AND_CONNECTIONS.md` when implementing API, frontend data access, sessions, workers or provider integrations.
- Read `docs/planning/TRACEABILITY.md` for the relevant requirement IDs and acceptance gates.
- Verify disputed requirements against the original PDF in `docs/source/` or page-labelled `docs/source/prd-extracted.txt`. Source forms/legal texts are not implicitly present just because the PRD references them.

The PRD is the requirement source; stack/formula/status-precedence proposals in the roadmap are recommendations until approved. User-approved changes take precedence and must be reflected in the decision log and coverage register.

## Confirmed owner requirements

Read `docs/planning/FORM_BUILDER.md` for HR authoring, signatures, responsive acceptance and guarantor actor rules. Use shadcn/ui with Tailwind CSS. Deliver HR creation/publishing/assignment of dynamic forms in core scope, including signature capture and signature/signed-document attachments. Preserve immutable definition/response/signature versions. All screens, including the builder and signing flows, must adapt across mobile, tablet, desktop and wide screens with keyboard/touch access. Employees send requests to guarantors; only the guarantor completes/signs the response through their own scoped session. Deny employee proxy submissions server-side. These requirements are confirmed even while overall implementation approval is pending.

## Approval boundary

The initial request is planning only. Do not scaffold the application until the owner approves the roadmap. After approval, carry out the agreed implementation without repeatedly asking for permission for routine local edits or checks. Retain unresolved HR/legal decisions as explicit configuration/provisional development behaviour and prevent unapproved production use of affected workflows. Independent work can continue with synthetic data.

Do not infer authorisation for production deployment, provider purchases, real employee imports or external communications from roadmap approval. Never alter or erase existing Git/tool configuration as part of implementing this portal.

## Delivery method

Implement the next dependency-ready milestone as an integrated vertical slice: accessible screen → generated API client → permission-checked endpoint → domain transaction → persistence → audit/outbox → meaningful acceptance evidence. Use the approved architecture; inspect current repository state before scaffolding or changing existing work.

Create an executable OpenAPI contract and detailed dictionary/ERD during foundation work. The current API inventory is a proposal, not a generated specification. Generate frontend types/client from the actual contract. Keep business transitions and final validation in the API, including calls from server-rendered web pages.

For PostgreSQL schema, migrations, policies or query work, load the available `supabase-postgres-best-practices` skill and relevant references. If Supabase is selected later, also load its skill; the current plan does not require Supabase. Check supported framework/provider versions when scaffolding instead of assuming versions from this planning date remain current.

## Domain invariants

- Employee access is own-record only. Reviewers need record/module authority and separate health/financial permissions. Technical administration does not imply HR-content access. Protect files, exports, counts and direct endpoints as well as UI routes.
- Templates, schemas, policies and agreements are versioned. Existing cases keep assigned snapshots. Drafts may be incomplete; final submission validates on the server and creates immutable evidence.
- Review targets an exact submission version. Changes Required needs a reason. Approved evidence is never overwritten; corrections create a new review cycle. Concurrent stale decisions fail explicitly.
- Lifecycle stage and operational review status are distinct. Calculate progress from assigned mandatory items using the approved formula; do not equate submission with approval. Readiness/completion must check current versions and authorised waivers.
- External sessions grant access to one request only. Store token hashes, enforce expiry/revocation, prevent replaced links from continuing, and avoid exposing respondent evidence to employees by default.
- Files stay private; quarantine and scan before ordinary retrieval/acceptance. Download authorisation is short-lived and scope-checked. Do not put secrets, tokens or sensitive form bodies in logs, emails or analytics.
- Acknowledgements retain exact accepted versions and actor/time evidence. Multi-party agreements complete only after configured signatory steps. Do not invent legally approved wording or signature equivalence.
- Beneficiary totals use exact decimal arithmetic and approved total rules; minors require guardian/trustee details. AXA exports match the actual approved workbook.
- Induction needs mandatory tasks plus employee and authorised HR/Operations sign-off. Asset assignments survive into exit; every expected return needs evidence or approved exception before clearance.
- Commit audit/outbox with domain changes. Workers retry idempotently and expose failures. Account deactivation revokes active access without destroying historical evidence.

## Validation and handoff

Use the relevant traceability row as the acceptance source. Test server-side access denial, immutable versions, state transitions, concurrency and worker retries with real integration boundaries; test complete user journeys for delivered workflows. Preserve synthetic-only fixtures until real-data use is authorised. Run appropriate checks and document any unavailable provider verification.

Update milestone status, requirement evidence and decisions after delivery. Report working behaviour, validation and remaining blockers honestly. Never describe mocked emails, fake exports, local storage or disconnected dashboards as completed production features. Each released phase has its own pilot/security/restore checks; the final milestone is not permission to postpone these foundations.
