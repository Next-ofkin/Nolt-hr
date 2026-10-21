# Form and Pack lifecycle rules

Updated 21 October 2026. Enforced by the API (`apps/api/src/forms.ts`, `packs.ts`, `pack-rules.ts`) and by database triggers (migrations `20261021100000_form_and_pack_lifecycle` and the earlier immutability migrations). The screens only mirror these rules.

## Statuses

| Item | Statuses |
|---|---|
| Form version | DRAFT → PUBLISHED → UNPUBLISHED (can be reopened only while never used) |
| Pack | DRAFT → PUBLISHED → WITHDRAWN (the screen says "unpublished") |

## Forms

| Action | Rule |
|---|---|
| Edit | Drafts only. A published version is immutable; make a **new version** to change it |
| Unpublish | A published version that is **not inside any pack**. A form in a pack stays published; change it with a **new version**, because packs use the newest published version |
| Reopen as draft | An unpublished version that was never assigned, is not in a pack and has no newer version |
| Delete | **Unpublish first** (or never publish). Refused if any version was sent to an employee or the form is in a pack |
| Used forms | A form with assignments or submissions is locked; its history is evidence and is never edited or deleted |

## Packs

| Action | Rule |
|---|---|
| Unpublish | Any published pack. Employees who already have it keep it |
| Reopen as draft / edit | The pack must be unpublished first, must never have been assigned, and must have no newer version. Otherwise make a **new version** |
| Delete | **Unpublish first**, then the same conditions as reopening (never assigned, no newer version) |
| Assign | Only a published, non-empty pack, to an active onboarding case. Refused if a newer published version exists, if the pack is already on the case, or if any of its forms is already on the case. A pack for a different employment type needs an explicit confirmation |
| Versions | Each assignment records exactly which pack and form versions the employee got |

## Which form version does a new assignment use?

When a pack is assigned, each form in it resolves to the **newest published version** of that form at that moment. Employees who were assigned earlier keep the version they were given. Nothing already assigned changes silently.

## Roles

Only three roles exist: DEVELOPER, HR and EMPLOYEE (migration `20261020210000_three_roles_only`). Every active HR user can review submissions (`20261020110000_all_active_hr_review`). Guarantors and references are not roles: they act through a one-request, email-verified session.

## Tests

`tests/form-pack-rules.test.ts` and `tests/pack-rules.test.ts` cover these rules with mocked data. `scripts/test-lifecycle-db.mjs` covers the lifecycle against a real disposable database.

## Known limits

- The "delete requires unpublish first" rule is enforced in the API. Direct SQL by a privileged role can bypass it; treat database access as a controlled operation.
- Deleting test data that already has submissions needs a privileged, reviewed script because evidence tables are protected. It is never done from the app.
