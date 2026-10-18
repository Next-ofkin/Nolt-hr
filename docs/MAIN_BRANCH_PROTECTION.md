# Main branch protection — NOLT HR

**Repository:** Next-ofkin/Nolt-hr
**Production branch:** main. This branch deploys Railway and Vercel automatically.

## GitHub admin action required

GitHub Settings → Rules → Rulesets → New branch ruleset.

- Name: `Protect main production`
- Enforcement: **Active**
- Target branches: **Include by pattern: `main`**
- Restrict deletions, block force pushes, require a pull request before merging.
- Require **1 approval** from a person other than the author (if at least two repository contributors are available).
- Require code owner review after reviewers have been assigned and `.github/CODEOWNERS` is present.
- Dismiss stale approvals after new commits and require resolution of conversations.
- Do **not** set required status checks until there is a reliable check to select: previous GitHub Actions checks were intentionally retired and requiring a missing check would permanently block merges.
- Do not grant a broad bypass to contributors. Ensure an authorised admin can recover or revise rules in emergencies.

Under Settings → Collaborators and teams, grant least privilege: owner **Admin**, trusted release maintainer **Maintain** (if necessary), developers **Write**, reviewers **Triage** or **Read** if they only need issue management. Make any access changes directly in GitHub only after verifying the intended GitHub usernames.

**Important:** Adding CODEOWNERS does not itself protect main or change collaborator permissions. This connector cannot install a ruleset or grant roles because it does not have repository administration access. A repository admin must activate the rule in GitHub.

## Human test release

- PR reviewed and local typecheck/tests/build completed.
- Supabase migrations reviewed and deployed before any incompatible main merge.
- Rails and Vercel deployment statuses verified; operator confirms login and HR/employee/guarantor acceptance.
- Do not enable `HR_INVITATION_DELIVERY_ENABLED` and `HR_INVITATION_ACCEPTANCE_ENABLED` in Production without controlled email allowlist, validated redirect and sender, verified rollback and operator activation procedure.
