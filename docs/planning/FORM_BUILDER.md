# HR form builder, signatures and respondent delivery

**Confirmed owner requirements, 13 October 2026.** These clarify and extend the original PRD. They take precedence over earlier suggestions to deliver only fixed forms or defer the form editor until Phase 2B. Overall implementation approval is still pending.

## UI and responsive behaviour

Use **shadcn/ui with Tailwind CSS**, Next.js, React and TypeScript. Build shared UI from its editable components; the HR form builder is project functionality built with these components, not an assumed off-the-shelf shadcn form-builder product. Reference: [official component catalogue](https://ui.shadcn.com/docs/components).

Every employee, HR, reviewer and guarantor screen—including the builder, previews, signing and uploads—must adapt across screen sizes. Use fluid layouts starting at 320 CSS pixels, verify phone/tablet/laptop/wide-screen layouts and 200% zoom, and test representative widths 320, 375, 768, 1024, 1440 and 1920. These are test samples, not fixed supported sizes. Prevent page-level horizontal overflow; wide data tables may use labelled contained scrolling or mobile cards. Builder panels stack or use accessible sheets on small screens. Reordering works with buttons/keyboard as well as drag interaction. Signature capture works with touch, mouse and keyboard-accessible alternatives. Never require desktop-only hover or dragging to finish a task.

## HR-owned form configuration

HR creates, edits, previews, publishes, duplicates and archives forms through the portal. No developer change is required for ordinary new questions, upload requirements or signature fields. HR controls:

- Form title, instructions, sections, field ordering, required/optional fields and help text.
- Text, long text, email, phone, number, date, single/multiple choice, checkbox/consent, repeating groups, file attachment and signature fields.
- Allowlisted validation rules and conditional visibility/requiredness; hidden conditional fields must not block submission or leak through role-restricted payloads.
- Recipient: employee, guarantor, reference, or an explicitly configured HR/signatory step. Each assigned response has a responsible actor.
- Allowed attachment types/sizes, signature capture methods, due dates, review owner and permitted sensitivity category.
- Requirement templates, mandatory/optional stage assignments, consent wording and configured signatory order where applicable.

HR may configure forms and workflows within platform permissions; they cannot bypass system security, remove audit evidence, invent executable scripts, or grant themselves restricted access through a form setting. Permissions and legally approved content still follow authorised roles.

Forms have Draft → Published → Archived definitions. Publish validates stable field IDs, field types, conditional rules without cycles, review/recipient settings and safe upload limits. Preview uses the exact renderer and schema validation as the respondent workspace. Published versions are immutable. Editing creates a new draft version; assignments and submissions keep their original version. Reassignment/migration to a newer version must be explicit and must never silently reinterpret old signatures or answers.

Use a schema-driven renderer and server validator. Domain modules add server-enforced rules (beneficiary totals, guardian rules, staged execution, HMO mappings); HR cannot disable these accidentally by changing a generic field. Custom fields are supported without pretending every field maps to an insurer's export format.

## Signature field and attachments

HR can add a required or optional signature field and select whether the signer can draw a signature, attach a signature image, or either. A separate attachment field can request a signed document. HR sets signer role, signing instruction and consent text; multi-party agreements retain explicit ordered steps.

The signer reviews the relevant form/agreement version, confirms signing intent, draws or uploads their own signature and submits. No actor can insert another person's signature on their behalf. Server validates the authorised signer, required signature, attachment scan status and current content revision. Changing the signed content invalidates the pending signature and requires signing again before final submission.

Evidence references the exact published form/agreement version, immutable response snapshot and content digest, signature object/checksum, signer identity or verified external request, signing method, consent version and server timestamp. Store signature files privately with file validation/scanning and authorised access. Drawn signatures use a safe generated image format. Retain evidence and render a completed copy without replacing earlier signed versions.

Collecting a drawn/uploaded signature is a functional capability; the approved legal process determines when it is sufficient and whether a third-party e-sign provider is required. The builder cannot label every image upload as legally verified signing.

## Employee sends; guarantor completes

1. HR publishes a guarantor form and assigns the required guarantor slots to an employee's case.
2. The employee enters the guarantor's contact details and selects **Send to guarantor**. The platform sends an expiring request link; employee can resend or replace according to policy.
3. The guarantor opens their own secure, request-scoped workspace, completes the form, attaches their evidence and signs if requested.
4. The guarantor submits directly to HR. HR reviews that response and can return it to the guarantor for correction. The guarantor uses a fresh/valid scoped link to resubmit.
5. The employee sees delivery/completion/review status and any authorised replacement action. They cannot fill, save, submit, sign or view private response evidence on behalf of the guarantor.

Enforce this in the backend, not only through UI controls. Guarantor response endpoints require the request-scoped guarantor session; an employee session cannot supply a different `respondentId` to become the signer. HR may review and manage requests, but cannot impersonate a guarantor submission. Show only minimum employee context necessary for the request. Tokens are hashed, expiring and revoked on replacement; prior submitted evidence remains attributable to its original respondent.

## Milestones and acceptance

- **M0:** wireframe the builder, mobile builder workflow, respondent delivery and signature evidence; include in API/schema contracts.
- **M1:** establish shadcn/ui components, responsive shell, actor-scoped permissions and identity/session foundations.
- **M2/M3:** deliver HR form creation/publishing/assignment, schema renderer, validation, drafts, files and employee signature fields as core functionality. The editor is no longer deferred to M6.
- **M4:** core pilot includes an HR-authored form, assignment to an employee, own signature/attachment, submission and correction with preserved versions.
- **M5:** guarantor delivery uses the same published forms/signature controls, with separate actor/session enforcement and staged agreement execution.
- **All milestones:** verify responsive completion, including HR editing and respondent signing on a phone.

Acceptance scenarios:

1. HR publishes a new form with conditional questions, uploads and required signature without a code deployment; assigned employee completes it.
2. Employee cannot submit a required signature field empty; unscanned signature attachments are not accepted.
3. Publishing an edited form leaves existing responses/signatures unchanged; signing binds to exact submitted content.
4. Employee can send/resend/replace a guarantor request but direct attempts to submit or sign its response return access denial.
5. Guarantor completes and signs their own version; another guarantor/request cannot access it; HR reviews it independently.
6. Creation, preview, assignment, signing and completion work on narrow and wide screens, with keyboard and touch interactions.

## Estimate impact

This is additional scope beyond the earlier seeded-template plan. Revised provisional effort: **M0 3–4**, **M3 8–11**, **M4 4–5** engineering person-weeks; other milestone ranges unchanged. Total **34–48 person-weeks**, with a tentative **22–32 calendar-week** planning range under the previous two-engineer/shared-support assumptions. Core M1–M4 is now **17–23 person-weeks** after M0. Re-estimate after builder rules and prototypes are accepted; these are not delivery commitments.
