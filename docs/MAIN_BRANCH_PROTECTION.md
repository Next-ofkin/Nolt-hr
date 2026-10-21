# Main branch protection: NOLT HR

Updated 21 October 2026.

**Repository:** Next-ofkin/Nolt-hr
**Production branch:** `main`. Merging to `main` does **not** deploy anything by itself any more. The server is updated by hand with `bash /opt/nolt/deploy/vps/update.sh` (see [deployment](DEPLOYMENT.md)). Railway and Vercel are no longer used.

## Working rule

Every change goes through a pull request from a short-lived branch, is checked locally (`npm run typecheck`, `npm test`, `npm run build`) and then merged. Do not commit straight to `main`.

## GitHub Actions: currently blocked

The CI workflow (`.github/workflows/ci.yml`) runs install, typecheck, build and tests. Every run currently stops after a few seconds with *"The job was not started because your account is locked due to a billing issue."* This is a GitHub account billing problem, not a code failure. Fix it under GitHub → Settings → Billing and plans (check for a failed payment, expired card or a $0 spending limit). Until then, the local checks above are the gate. Do not make the CI check a required status check while it cannot start, because that would block every merge.

## GitHub admin action (optional hardening)

GitHub Settings → Rules → Rulesets → New branch ruleset.

- Name: `Protect main production`; enforcement **Active**; target `main`.
- Restrict deletions, block force pushes, require a pull request before merging.
- Require 1 approval from someone other than the author only if there are at least two contributors.
- Require code-owner review once reviewers are assigned (`.github/CODEOWNERS` exists and lists the owner).
- Dismiss stale approvals after new commits; require conversations to be resolved.
- Add a required status check only after CI runs reliably again.
- Grant least privilege: owner **Admin**, developers **Write**, reviewers **Triage** or **Read**.

Adding CODEOWNERS alone does not protect `main`; a repository admin must activate the ruleset.

## Release checklist

- Pull request reviewed; typecheck, tests and build pass locally.
- Any database migration is reviewed, tested on a disposable database and applied **before** the code that needs it is deployed.
- After `update.sh`: `docker compose ps` healthy, login works, HR / employee / guarantor spot checks pass.
- Invitation delivery and acceptance switches (`HR_INVITATION_*`) change only with a controlled recipient list and a rollback plan.
