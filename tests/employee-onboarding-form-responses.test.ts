import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  canFillFormItem,
  employeeOnboardingPersistenceMessage,
  EmployeeOnboardingPersistenceError,
  mapEmployeeOnboardingItem,
} from '../src/features/employee-onboarding/data/employee-onboarding-types.ts'
import type { EmployeeOnboardingItemRow } from '../src/lib/database.types.ts'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

async function readRepositoryFile(relativePath: string) {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8')
}

async function readTypeScriptFiles(directory: string): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true })
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) return readTypeScriptFiles(entryPath)
      if (!entry.isFile() || !/\.(?:ts|tsx)$/.test(entry.name)) return ''
      return readFile(entryPath, 'utf8')
    }),
  )
  return contents.join('\n')
}

function sampleFormItemRow(overrides: Partial<EmployeeOnboardingItemRow> = {}): EmployeeOnboardingItemRow {
  return {
    id: 'item-1',
    assignment_id: 'assign-1',
    source_package_item_id: 'pkg-item-1',
    item_type: 'form',
    sort_order: 0,
    required: true,
    form_version_id: 'form-ver-1',
    form_title_snapshot: 'Employee Data Form',
    form_version_number: 1,
    document_title: null,
    document_description: null,
    state: 'not_started',
    started_at: null,
    completed_at: null,
    response_data: null,
    submitted_at: null,
    created_at: '2026-09-16T10:00:00.000Z',
    updated_at: '2026-09-16T10:00:00.000Z',
    ...overrides,
  }
}

test('mapEmployeeOnboardingItem carries response_data/submitted_at onto form items', () => {
  const submitted = mapEmployeeOnboardingItem(
    sampleFormItemRow({ state: 'submitted', response_data: { full_name: 'Sarah' }, submitted_at: '2026-09-18T09:00:00.000Z' }),
  )
  assert.equal(submitted.itemType, 'form')
  if (submitted.itemType === 'form') {
    assert.deepEqual(submitted.responseData, { full_name: 'Sarah' })
    assert.equal(submitted.submittedAt, '2026-09-18T09:00:00.000Z')
  }

  const fresh = mapEmployeeOnboardingItem(sampleFormItemRow())
  assert.equal(fresh.itemType, 'form')
  if (fresh.itemType === 'form') {
    assert.equal(fresh.responseData, null)
    assert.equal(fresh.submittedAt, null)
  }
})

test('canFillFormItem allows only not_started/in_progress form items — never document items or post-submission states', () => {
  assert.equal(canFillFormItem(mapEmployeeOnboardingItem(sampleFormItemRow({ state: 'not_started' }))), true)
  assert.equal(canFillFormItem(mapEmployeeOnboardingItem(sampleFormItemRow({ state: 'in_progress' }))), true)

  for (const state of ['submitted', 'under_review', 'changes_requested', 'approved', 'waived'] as const) {
    assert.equal(canFillFormItem(mapEmployeeOnboardingItem(sampleFormItemRow({ state }))), false, `state=${state} should not be fillable`)
  }

  const docItem = mapEmployeeOnboardingItem(
    sampleFormItemRow({ item_type: 'document', form_version_id: null, form_title_snapshot: null, form_version_number: null, document_title: 'Passport' }),
  )
  assert.equal(canFillFormItem(docItem), false)
})

test('employeeOnboardingPersistenceMessage formats the new form-response error codes', () => {
  assert.equal(
    employeeOnboardingPersistenceMessage(new EmployeeOnboardingPersistenceError('ALREADY_SUBMITTED', 'x')),
    'This form has already been submitted.',
  )
  assert.equal(
    employeeOnboardingPersistenceMessage(new EmployeeOnboardingPersistenceError('ASSIGNMENT_NOT_ACTIVE', 'x')),
    'Start your onboarding before submitting this form.',
  )
})

test('employee-onboarding repository exposes the form-response read/write API and calls the right RPC', async () => {
  const source = await readRepositoryFile('src/features/employee-onboarding/data/employee-onboarding-repository.ts')

  assert.match(source, /export async function getAssignedFormSchema\b/)
  assert.match(source, /export async function submitOnboardingFormResponse\b/)
  assert.match(source, /\.rpc\('submit_onboarding_form_response'/)
  assert.match(source, /\.from\('form_definition_versions'\)/)
})

test('the employee checklist only offers Fill Form to the employee\'s own portal view, never HR\'s read-only view', async () => {
  const checklistSource = await readRepositoryFile('src/features/employee-onboarding/components/EmployeeOnboardingChecklist.tsx')
  assert.match(checklistSource, /onFillForm/)

  const myCardSource = await readRepositoryFile('src/features/employee-onboarding/components/MyOnboardingCard.tsx')
  assert.match(myCardSource, /onFillForm=\{setActiveFormItem\}/)

  const hrCardSource = await readRepositoryFile('src/features/employee-onboarding/components/EmployeeOnboardingCard.tsx')
  assert.doesNotMatch(hrCardSource, /onFillForm/)
})

test('FormResponseModal hands the completed payload to the submit RPC and never renders on document items (form items only)', async () => {
  const source = await readRepositoryFile('src/features/employee-onboarding/components/FormResponseModal.tsx')
  assert.match(source, /EmployeeOnboardingFormItem/)
  assert.match(source, /useSubmitOnboardingFormResponse/)
  assert.match(source, /onComplete=\{handleComplete\}/)
})

test('NoltDynamicForm stays backward compatible: without onComplete it still shows its own built-in completed screen', async () => {
  const source = await readRepositoryFile('src/features/shadcn-form-poc/renderer/NoltDynamicForm.tsx')
  assert.match(source, /setCompletedPayload\(merged\)/)
  assert.match(source, /if \(completedPayload\)/)
  assert.match(source, /onComplete\(merged\)/)
})

test('no direct browser DML writes response_data — every mutation goes through submit_onboarding_form_response', async () => {
  const browserSource = await readTypeScriptFiles(path.join(repositoryRoot, 'src'))
  assert.doesNotMatch(browserSource, /\.from\(\s*['"]employee_onboarding_items['"]\s*\)\s*\.(insert|update|delete)/i)
})

test('migration 0027 adds response storage, an assignment-aware employee read policy, and the SECURITY DEFINER submit RPC', async () => {
  const migration = await readRepositoryFile('supabase/migrations/0027_employee_onboarding_form_responses.sql')

  assert.match(migration, /alter table public\.employee_onboarding_items/i)
  assert.match(migration, /add column response_data jsonb/i)
  assert.match(migration, /add column submitted_at timestamptz/i)
  assert.match(migration, /add constraint employee_onboarding_items_response_only_on_forms/i)

  assert.match(migration, /create policy form_definition_versions_select_assigned_employee/i)
  assert.match(migration, /e\.auth_user_id = \(select auth\.uid\(\)\)/i)

  assert.match(migration, /function public\.submit_onboarding_form_response[\s\S]*?security definer/i)
  assert.match(migration, /function public\.submit_onboarding_form_response[\s\S]*?set search_path = ''/i)
  assert.match(migration, /revoke all on function public\.submit_onboarding_form_response/i)
  assert.match(migration, /grant execute on function public\.submit_onboarding_form_response\(uuid, jsonb\) to authenticated/i)

  for (const code of ['ITEM_NOT_FOUND', 'NOT_A_FORM_ITEM', 'ASSIGNMENT_NOT_ACTIVE', 'ALREADY_SUBMITTED', 'INVALID_RESPONSE']) {
    assert.match(migration, new RegExp(code))
  }
})

test('migration 0027 disguises ownership failure as ITEM_NOT_FOUND — never reveals a non-owned item exists', async () => {
  const migration = await readRepositoryFile('supabase/migrations/0027_employee_onboarding_form_responses.sql')
  assert.match(migration, /Same generic not-found response as a missing item/i)
})
