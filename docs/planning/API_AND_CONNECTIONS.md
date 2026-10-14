# API and integration plan

Implemented contract: [generated OpenAPI JSON](../api/openapi.json), with generated frontend types in `packages/api-client/src/schema.d.ts`. The inventory below retains the roadmap proposals; delivered paths are generated from the actual Nest controllers.

Employee response paths delivered on 14 October 2026 are `GET`/`PUT /api/v1/me/assignments/{id}/response` and `POST /api/v1/me/assignments/{id}/response/submit`. They enforce own-record/recipient access, revision checks, server validation and transactional immutable evidence. See [response contract and limits](../development/RESPONSES.md).

Status: proposed contract inventory for roadmap approval, not an implemented or executable OpenAPI specification. Source: PRD pp5–19,22–24. Generate and commit `openapi.yaml` during M0/M1, then generate the TypeScript client from it. Never hand-maintain a second incompatible client contract.

## Confirmed form-builder and signature contract additions

Owner requirements in [FORM_BUILDER.md](FORM_BUILDER.md) extend this inventory. The builder is core-release functionality implemented with shadcn/ui; the API remains the authority for published schemas and actor permissions.

| Operations | Contract behaviour |
|---|---|
| `GET/POST /forms`, `POST /forms/{id}/versions`, `GET/PATCH /form-versions/{id}` | Authorised HR authors draft sections, stable field IDs, allowlisted validation/conditions, recipient/sensitivity and upload/signature settings; published versions cannot be patched |
| `POST /form-versions/{id}/validate`, `/publish`, `/preview`, `/archive` | Validate safe rules/conditional dependencies, render exact respondent schema, publish immutable version and archive from future assignment |
| `POST /employees/{id}/form-assignments` | HR assigns an exact published version, recipient role, requirement stage, due date and mandatory/review rules; no silent migration of existing responses |
| `POST /requirements/{id}/signature-intents`, `POST /signature-intents/{id}/uploads`, `POST /signature-intents/{id}/confirm` | Bind actor, content revision/digest and consent; authorise private upload, validate/scan bytes, normalise/compress before confirmation and store the immutable object reference/evidence in PostgreSQL; signer identity comes from session |
| `POST /signatures/{id}/download-links` | Permission-checked short-lived private file link; private/no-store response; no permanent URLs or image data in general payloads |
| `POST /external/request/signature-intents`, `POST /external/request/signatures/{id}/confirm` | Same signing checks but external request-scoped identity only; employee session cannot act as guarantor |
| `POST /submissions/{id}/completed-copy` | Render immutable form/answers/signature evidence from accepted version; private audited retrieval |

Final submission checks required signatures against the final content digest and rejects stale signatures after answer changes. Submitted evidence stores exact form/response version, signer, intent, method, checksum and server timestamp. Drawn/uploaded signature images, signed PDFs and ordinary attachments use private file storage. PostgreSQL stores stable file references, signer, exact form/response/consent versions, signing timestamp and checksum per FORM_BUILDER.md. Generic attachments cannot substitute for a required signature unless the published field permits that method. Apply the same private-file validation/storage path to external signatures while preserving request-scoped access.

Employees may create/send/resend/replace external requests. Only the assigned guarantor request session may save, upload, sign or submit guarantor answers. Employee and HR sessions cannot impersonate the guarantor, including through generic requirement draft/submission routes. HR retains review/administration permission without becoming the respondent.

## Boundary and contract conventions

- Same-origin `/api/v1` behind TLS. Browser uses HttpOnly/Secure/SameSite session cookies and CSRF token on mutations. Supabase tokens stay encrypted server-side. API checks active local account status on requests, including after exit deactivation.
- Identity-provider login/callback validates state, nonce and PKCE. Redirect targets are allowlisted. Sessions rotate after login/privilege change; logout/revocation invalidates server state.
- Lists use bounded cursor pagination, allowlisted sort/filter fields and scoped totals. Timestamps are ISO 8601 UTC; calendar dates are `YYYY-MM-DD`.
- Validate path, query and body server-side. IDs do not imply permission. Sensitive DTOs are distinct from general record DTOs.
- Mutations with duplicate risk accept `Idempotency-Key`. Case creation, invitations, submissions, decisions and export jobs persist key/request-hash/results. Reuse with a different body fails.
- Version-sensitive edits carry `expectedRevision` or `If-Match`. Conflict returns 409; stale writes never silently replace another user's changes.
- Errors contain stable `code`, safe `message`, optional field errors and `requestId`. 401 unauthenticated; 403 authenticated but forbidden; 404 inaccessible scoped resource where existence should be hidden; 409 state/version conflict; 422 validation; 429 rate limit.
- Successful workflow mutations return canonical state/version/progress. Frontend invalidates affected checklist, queue and dashboard queries. Sensitive responses use private/no-store caching as appropriate.
- Async operations return 202 plus `jobId` and status URL. Jobs do not rely on a web request staying alive.

## Proposed route groups

Paths below are relative to `/api/v1`. `self` means current employee; `HR` includes explicit permissions, never every staff user. Scoped reviewers need assigned module/record permission. External routes use a separate request session.

| Group | Proposed operations | Access and integration |
|---|---|---|
| Identity | `POST /auth/login`, `/auth/signup`, `/auth/recovery`, `/auth/callback`, `/auth/mfa/enroll`, `/auth/mfa/verify`, `/auth/password`; `GET /auth/session`, `/auth/flow` | Supabase Auth through the server; mandatory TOTP and opaque application sessions |
| Invitations | `POST /employees/{id}/invitations`, `POST /invitations/exchange`, `POST /invitations/activate` | HR send/resend; public exchange rate-limited; activation binds verified identity to intended employee |
| Employees | `POST /employees`, `GET /employees`, `GET /employees/{id}`, `PATCH /employees/{id}` | HR fields/scope only; create snapshots template and queues invite only when requested |
| Employee self | `GET /me/employee`, `GET /me/onboarding`, `GET /me/requirements`, `GET /me/activity` | Own safe record and actionable checklist |
| Cases | `GET /onboarding-cases/{id}`, `POST /onboarding-cases/{id}/ready`, `/resume`, `/complete`, `/reopen` | Explicit HR actions with reason/guards; no arbitrary status PATCH |
| Requirements | `GET /requirements/{id}`, `POST /requirements/{id}/waivers`, `POST /requirements/{id}/not-applicable`, `POST /requirements/{id}/reopen` | Scoped access; waiver/NA/reopen require authority and reason |
| Drafts/forms | `GET /requirements/{id}/draft`, `PUT /requirements/{id}/draft`, `GET /form-schemas/{id}/versions/{version}` | Owner/authorised respondent; incomplete drafts allowed; version-safe schema |
| Submissions | `POST /requirements/{id}/submissions`, `GET /requirements/{id}/submissions`, `GET /submissions/{id}` | Frozen version creation; submission validates active schema/files/consent |
| Review | `GET /reviews/queue`, `POST /submissions/{id}/start-review`, `POST /submissions/{id}/decisions` | Assigned reviewer plus sensitivity permission; decision targets exact version; correction reason required |
| Sensitive sections | `GET /employees/{id}/health`, `GET /employees/{id}/financial`, versioned form mutations via scoped requirements | Dedicated DTOs/scopes; never bundled in general employee response |
| Documents | `POST /requirements/{id}/uploads`, `POST /uploads/{id}/complete`, `GET /documents/{id}`, `POST /documents/{id}/download-links` | Permission-checked authorisation, scan status and immutable references; no public bucket URLs |
| Templates | `GET/POST /templates`, `GET/POST /templates/{id}/versions`, `POST /template-versions/{id}/publish` | Template-management permission; existing assignments keep their snapshots |
| External requests | `POST /employees/{id}/external-requests`, `GET /employees/{id}/external-requests`, `POST /external-requests/{id}/resend`, `/replace`, `/revoke` | HR/self where configured; never expose private respondent evidence through employee tracking |
| External workspace | `POST /external/session/exchange`, `GET /external/request`, `PUT /external/request/draft`, `POST /external/request/submissions`, `POST /external/request/uploads` | Request-scoped session only; reuse protected upload rules; expired/replaced token invalid |
| Policy publishing | `POST /policies`, `POST /policies/{id}/versions`, `POST /policy-versions/{id}/publish`, `GET /policies/{id}/coverage` | HR policy permission; effective date and published version immutable |
| Acknowledgements | `GET /me/policies`, `POST /policy-versions/{id}/acknowledgements` | Assigned employee; exact version, identity, intent and timestamp evidence |
| Agreements | `GET /agreements/{id}`, `POST /agreements/{id}/signatory-steps/{stepId}/execute`, `POST /agreements/{id}/completed-copy` | Exact actor/sequence permission; server renders immutable completed artefact |
| Beneficiaries | `GET/PUT /requirements/{id}/beneficiary-draft`, finalise through submissions | Self plus restricted reviewer; exact 100% total and minor guardian validation |
| HMO | `GET/PUT /requirements/{id}/hmo-draft`, finalise through submissions, `POST /exports/axa` | Consent version, employee/dependents, restricted HR review/export |
| Induction | `GET /employees/{id}/induction`, `POST /induction/{id}/items/{itemId}/completion`, `POST /induction/{id}/employee-signoff`, `/hr-signoff` | Facilitator and distinct sign-off permissions; mandatory-task completion guards |
| Assets | `GET/POST /assets`, `POST /employees/{id}/asset-assignments`, `POST /asset-assignments/{id}/acknowledge`, `/returns`, `/return-exceptions` | Inventory permission; self receipt acknowledgement; return exceptions authorised and reason-bearing |
| Offboarding | `POST /employees/{id}/offboarding-cases`, `GET /offboarding-cases/{id}`, `PUT /offboarding-cases/{id}/handover-draft`, `POST /offboarding-cases/{id}/handover-submissions`, `/clearances`, `/exit-interview`, `/close` | HR initiation/closure, employee handover, department-scoped clearance; immutable handover submissions |
| Reporting | `GET /reports/dashboard`, `GET /reports/onboarding`, `/outstanding`, `/review-ageing`, `/external-responses`, `/policy-coverage`, `/induction`, `/assets`, `/offboarding` | Filters and permission-aware aggregates; no data leakage via counts |
| Exports | `POST /exports`, `GET /exports/{id}`, `POST /exports/{id}/download-links` | Allowed schema/dataset only; private expiring output; recheck requester access |
| Notifications | `GET /me/notifications`, `POST /me/notifications/{id}/read` | Own messages only; provider/webhook state not exposed unnecessarily |
| Admin/audit | `GET /audit-events`, `GET/PUT /settings/file-rules`, `/settings/reminders`, `/roles`, `/reviewer-scopes` | Separate administrative permissions; all changes audited; technical admin not automatically HR reader |
| Operations | `GET /health/live`, `GET /health/ready`, signed provider webhooks | Minimal health payload; authenticated operations details; webhook signatures and replay protection |

## Example contract: submit and review

```json
POST /api/v1/requirements/req_123/submissions
Idempotency-Key: <unique-client-operation-id>
{
  "draftRevision": 4,
  "schemaVersion": 1,
  "documentVersionIds": ["doc_456"],
  "confirmedDeclarationVersionId": "decl_v1"
}
```

Server loads the current owned draft; it does not trust a client claim that required fields are complete. Response includes the immutable submission ID/version, item status, requirement revision and recalculated progress. Server determines actor and submitted timestamp.

```json
POST /api/v1/submissions/sub_789/decisions
Idempotency-Key: <unique-client-operation-id>
{
  "decision": "CHANGES_REQUIRED",
  "reason": "Please upload a legible copy showing the full certificate.",
  "expectedRequirementRevision": 5
}
```

One database transaction verifies reviewer scope and current submission/version, inserts decision, transitions the item, updates derived case state and records audit/outbox. A second conflicting review returns 409. The worker sends the correction notification once per committed event.

## Integration delivery order

1. Contract, generated client, test database and synthetic role fixtures.
2. Identity → session → permissions → employee/case template snapshot.
3. Invitation/outbox/email → activation → checklist read.
4. Form schemas → draft persistence → final validation/versioning.
5. Private upload/quarantine → scan → protected document access.
6. Review decision → correction → resubmission → progress/readiness.
7. External request sessions; policy/agreement evidence; beneficiary validation.
8. HMO export mapping; induction; assets; operational reports.
9. Offboarding from existing asset assignments; access deactivation.
10. Restore, deployment, monitoring and pilot evidence for full release.

## Services and configuration checklist

| Service | Configuration needed | Verification |
|---|---|---|
| Identity | Issuer/client credentials, callback URLs, MFA/recovery, email verification | Wrong recipient, replay, account revocation and expired session tests |
| Database | Runtime/migration roles, encrypted connection, pool limits, migrations/backups | Fresh database migration; restricted role; transaction/recovery checks |
| Storage | Private buckets/prefixes, encryption, CORS, upload limits, quarantine, retention | No anonymous retrieval; cross-user link denial; malicious file blocked |
| Email | Sender domain, provider secret, template IDs, webhook secret | Sandbox delivery, duplicate-safe retry, bounce/failure alert |
| Scanner/renderer | Worker credentials, scan limits/timeouts, renderer sandbox | Fail closed on unavailable scanner; completed artefact matches accepted version |
| Jobs | Outbox polling/claiming, retry/dead-letter policy, scheduled job dedupe | Worker crash resumes without duplicate domain side effects |
| Monitoring | Redacted logs, alert routes, correlation IDs | Simulate API failure, stalled worker and delivery failure |

Store secrets only server-side. Use environment placeholders in examples, never live credentials. Providers, costs and production accounts remain unselected until owner decisions. No third-party e-sign, payroll, AXA API or automatic IT deprovisioning integration is assumed in baseline scope.

## Implemented identity/session baseline

The executable contract in `../api/openapi.json` contains the real Supabase Auth endpoints listed above plus configuration and current/all logout. Browser-bound PKCE email flows, encrypted provider tokens, signed AAL2 verification and actual provider-session revocation checks replace the synthetic OIDC fixture. Signup defaults to EMPLOYEE; a private one-time verified-email bootstrap grants the approved HR account. Supabase sends email through the owner?s Resend SMTP configuration. Email delivery/link exchange remains an explicit verification gate. See [identity setup](../development/IDENTITY.md). Broader lifecycle routes above remain proposed until implemented.
