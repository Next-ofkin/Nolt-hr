import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

async function readRepositoryFile(relativePath: string) {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8')
}

// ------------------------------------------------------------
// NoltDynamicForm: onSaveDraft prop
// ------------------------------------------------------------

test('NoltDynamicForm accepts an optional onSaveDraft prop', async () => {
  const source = await readRepositoryFile('src/features/shadcn-form-poc/renderer/NoltDynamicForm.tsx')
  assert.match(source, /onSaveDraft\?:\s*\(currentStepData: Record<string, unknown>\) => Promise<void> \| void/)
})

test('existing NoltDynamicForm callers (form builder preview, package preview) remain compatible without passing onSaveDraft', async () => {
  const formEditorSource = await readRepositoryFile('src/features/forms/pages/FormEditorPage.tsx')
  const packagePreviewSource = await readRepositoryFile('src/features/onboarding-packages/components/PackagePreviewModal.tsx')

  // FormEditorPage's own draft-save (FormBuilder's onSaveDraft, for the
  // form *definition*) is unrelated and pre-existing — only the actual
  // <NoltDynamicForm ...> call site must stay untouched.
  const noltCallSite = formEditorSource.slice(
    formEditorSource.indexOf('<NoltDynamicForm'),
    formEditorSource.indexOf('/>', formEditorSource.indexOf('<NoltDynamicForm')),
  )
  assert.doesNotMatch(noltCallSite, /onSaveDraft/)
  assert.doesNotMatch(packagePreviewSource, /onSaveDraft/)

  // Both still render NoltDynamicForm at all (sanity: we didn't remove/rename it).
  assert.match(formEditorSource, /<NoltDynamicForm/)
  assert.match(packagePreviewSource, /NoltDynamicForm/)
})

test('Save Draft reads raw current values via getValues(), not the validated handleSubmit path', async () => {
  const source = await readRepositoryFile('src/features/shadcn-form-poc/renderer/NoltDynamicForm.tsx')

  assert.match(source, /const \{ handleSubmit, getValues \} = methods/)
  assert.match(source, /const handleSaveDraft = async \(\) => \{/)

  const draftFnBody = source.slice(source.indexOf('const handleSaveDraft'), source.indexOf('const handleStepSubmit'))
  assert.match(draftFnBody, /getValues\(\)/)
  // The save-draft button must not be routed through handleSubmit's zod-validated submission.
  assert.doesNotMatch(draftFnBody, /handleSubmit\(/)
})

test('Save Draft button is type="button" with its own onClick — not part of the validated <form onSubmit> path', async () => {
  const source = await readRepositoryFile('src/features/shadcn-form-poc/renderer/NoltDynamicForm.tsx')
  assert.match(source, /onClick=\{\(\) => void handleSaveDraft\(\)\}/)
})

test('Save Draft never invokes onComplete', async () => {
  const source = await readRepositoryFile('src/features/shadcn-form-poc/renderer/NoltDynamicForm.tsx')
  const draftFnBody = source.slice(source.indexOf('const handleSaveDraft'), source.indexOf('const handleStepSubmit'))
  assert.doesNotMatch(draftFnBody, /onComplete\(/)
})

test('Save Draft guards against duplicate simultaneous saves', async () => {
  const source = await readRepositoryFile('src/features/shadcn-form-poc/renderer/NoltDynamicForm.tsx')
  assert.match(source, /if \(!onSaveDraft \|\| isSavingDraft\) return/)
  assert.match(source, /disabled=\{isSavingDraft \|\| isSubmitting\}/)
})

test('the new Save & Continue Later action does not visually replace or outrank Continue/Submit — both remain, ghost-styled save action included', async () => {
  const source = await readRepositoryFile('src/features/shadcn-form-poc/renderer/NoltDynamicForm.tsx')
  assert.match(source, /Save & Continue Later/)
  assert.match(source, /Submit Form/)
  assert.match(source, /className="btn btn-ghost"\s*\n\s*style=\{\{ minHeight: 44, padding: '0\.65rem 1\.4rem' \}\}\s*\n\s*>\s*\n\s*<Save/)
})

// ------------------------------------------------------------
// FormResponseModal: hydration + draft wiring
// ------------------------------------------------------------

test('FormResponseModal passes existing response_data as initialData, falling back to an empty object', async () => {
  const source = await readRepositoryFile('src/features/employee-onboarding/components/FormResponseModal.tsx')
  assert.match(source, /initialData=\{item\.responseData \?\? \{\}\}/)
})

test('FormResponseModal wires onSaveDraft to the save-draft repository hook/RPC', async () => {
  const source = await readRepositoryFile('src/features/employee-onboarding/components/FormResponseModal.tsx')
  assert.match(source, /useSaveOnboardingFormDraft/)
  assert.match(source, /onSaveDraft=\{handleSaveDraft\}/)
  assert.match(source, /saveDraft\.mutateAsync\(\{ itemId: item\.id, responseData: data \}\)/)
})

test('successful draft save shows success feedback and closes the modal', async () => {
  const source = await readRepositoryFile('src/features/employee-onboarding/components/FormResponseModal.tsx')
  const draftFnBody = source.slice(source.indexOf('const handleSaveDraft'), source.indexOf('return (\n    <div className="modal-backdrop"'))

  assert.match(draftFnBody, /toast\.success\(/)
  // onClose() must appear in the success (try) path.
  const tryBlock = draftFnBody.slice(draftFnBody.indexOf('try {'), draftFnBody.indexOf('} catch'))
  assert.match(tryBlock, /onClose\(\)/)
})

test('failed draft save keeps the modal open (no onClose in the catch path) and surfaces the existing error banner', async () => {
  const source = await readRepositoryFile('src/features/employee-onboarding/components/FormResponseModal.tsx')
  const draftFnBody = source.slice(source.indexOf('const handleSaveDraft'), source.indexOf('return (\n    <div className="modal-backdrop"'))
  const catchBlock = draftFnBody.slice(draftFnBody.indexOf('} catch'))

  assert.doesNotMatch(catchBlock.split('\n').slice(0, 6).join('\n'), /onClose\(\)/)
  assert.match(catchBlock, /setSubmitError\(/)
})

test('final submission behavior is unchanged: submit still calls submit_onboarding_form_response and locks the item', async () => {
  const source = await readRepositoryFile('src/features/employee-onboarding/components/FormResponseModal.tsx')
  assert.match(source, /useSubmitOnboardingFormResponse/)
  assert.match(source, /onComplete=\{handleComplete\}/)
  assert.match(source, /submitResponse\.mutate\(/)
})

// ------------------------------------------------------------
// Repository / RPC wiring
// ------------------------------------------------------------

test('employee-onboarding repository exposes saveOnboardingFormDraft calling the correct RPC', async () => {
  const source = await readRepositoryFile('src/features/employee-onboarding/data/employee-onboarding-repository.ts')
  assert.match(source, /export async function saveOnboardingFormDraft\b/)
  assert.match(source, /\.rpc\('save_onboarding_form_draft'/)
})

test('useSaveOnboardingFormDraft hook invalidates the same query as other onboarding mutations', async () => {
  const source = await readRepositoryFile('src/features/employee-onboarding/data/employee-onboarding-queries.ts')
  assert.match(source, /export function useSaveOnboardingFormDraft/)
  assert.match(source, /queryKey: \['employee_onboarding_assignments', 'mine'\]/)
})

// ------------------------------------------------------------
// Migration 0028
// ------------------------------------------------------------

test('migration 0028 adds exactly one new RPC (save_onboarding_form_draft), no new table or column', async () => {
  const migration = await readRepositoryFile('supabase/migrations/0028_employee_onboarding_form_draft.sql')

  assert.doesNotMatch(migration, /create table/i)
  assert.doesNotMatch(migration, /add column/i)
  assert.doesNotMatch(migration, /create policy/i)

  assert.match(migration, /create or replace function public\.save_onboarding_form_draft/i)
  assert.match(migration, /security definer/i)
  assert.match(migration, /set search_path = ''/i)
  assert.match(migration, /revoke all on function public\.save_onboarding_form_draft\(uuid, jsonb\) from public, anon/i)
  assert.match(migration, /grant execute on function public\.save_onboarding_form_draft\(uuid, jsonb\) to authenticated/i)
})

test('migration 0028 reuses the exact same ownership/guard structure as submit_onboarding_form_response', async () => {
  const migration = await readRepositoryFile('supabase/migrations/0028_employee_onboarding_form_draft.sql')

  assert.match(migration, /e\.auth_user_id = \(select auth\.uid\(\)\)|v_employee\.auth_user_id is null or v_employee\.auth_user_id <> v_user_id/i)
  assert.match(migration, /ITEM_NOT_FOUND/)
  assert.match(migration, /NOT_A_FORM_ITEM/)
  assert.match(migration, /ASSIGNMENT_NOT_ACTIVE/)
  assert.match(migration, /ALREADY_SUBMITTED/)
})

test('migration 0028 never writes submitted_at and only advances not_started to in_progress', async () => {
  const migration = await readRepositoryFile('supabase/migrations/0028_employee_onboarding_form_draft.sql')

  assert.doesNotMatch(migration, /submitted_at\s*=/)
  assert.match(migration, /v_next_state := case when v_item\.state = 'not_started' then 'in_progress' else v_item\.state end/)
})

test('existing submission tests / RPC are untouched by this change', async () => {
  const submitMigration = await readRepositoryFile('supabase/migrations/0027_employee_onboarding_form_responses.sql')
  assert.match(submitMigration, /submitted_at = now\(\)/)
  assert.match(submitMigration, /state = 'submitted'/)
})
