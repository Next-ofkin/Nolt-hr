import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  calculateOnboardingProgress,
  employeeOnboardingPersistenceMessage,
  EmployeeOnboardingPersistenceError,
  formatOnboardingDate,
  isActiveAssignment,
  mapEmployeeOnboardingAssignment,
  mapEmployeeOnboardingItem,
  type EmployeeOnboardingItem,
} from '../src/features/employee-onboarding/data/employee-onboarding-types.ts'
import type {
  EmployeeOnboardingAssignmentRow,
  EmployeeOnboardingItemRow,
} from '../src/lib/database.types.ts'
import { isRouteAllowedForRole } from '../src/lib/roles.ts'

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

function sampleAssignmentRow(overrides: Partial<EmployeeOnboardingAssignmentRow> = {}): EmployeeOnboardingAssignmentRow {
  return {
    id: 'assign-1',
    employee_id: 'emp-1',
    package_version_id: 'pkg-ver-1',
    package_title_snapshot: 'New Starter Package',
    package_description_snapshot: 'Standard onboarding',
    package_version_number: 2,
    state: 'assigned',
    due_date: '2026-09-30',
    assigned_by: 'user-1',
    assigned_at: '2026-09-16T10:00:00.000Z',
    started_at: null,
    completed_at: null,
    cancelled_at: null,
    cancelled_by: null,
    cancellation_reason: null,
    created_at: '2026-09-16T10:00:00.000Z',
    updated_at: '2026-09-16T10:00:00.000Z',
    ...overrides,
  }
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
    form_version_number: 2,
    document_title: null,
    document_description: null,
    state: 'not_started',
    started_at: null,
    completed_at: null,
    created_at: '2026-09-16T10:00:00.000Z',
    updated_at: '2026-09-16T10:00:00.000Z',
    ...overrides,
  }
}

function sampleDocItemRow(overrides: Partial<EmployeeOnboardingItemRow> = {}): EmployeeOnboardingItemRow {
  return {
    id: 'item-2',
    assignment_id: 'assign-1',
    source_package_item_id: 'pkg-item-2',
    item_type: 'document',
    sort_order: 1,
    required: true,
    form_version_id: null,
    form_title_snapshot: null,
    form_version_number: null,
    document_title: 'Passport Photograph',
    document_description: 'Upload photo page',
    state: 'not_started',
    started_at: null,
    completed_at: null,
    created_at: '2026-09-16T10:00:00.000Z',
    updated_at: '2026-09-16T10:00:00.000Z',
    ...overrides,
  }
}

test('mapEmployeeOnboardingItem maps form and document snapshot fields', () => {
  const formItem = mapEmployeeOnboardingItem(sampleFormItemRow())
  assert.equal(formItem.itemType, 'form')
  if (formItem.itemType === 'form') {
    assert.equal(formItem.formVersionId, 'form-ver-1')
    assert.equal(formItem.formTitle, 'Employee Data Form')
    assert.equal(formItem.formVersionNumber, 2)
  }

  const docItem = mapEmployeeOnboardingItem(sampleDocItemRow())
  assert.equal(docItem.itemType, 'document')
  if (docItem.itemType === 'document') {
    assert.equal(docItem.documentTitle, 'Passport Photograph')
    assert.equal(docItem.documentDescription, 'Upload photo page')
  }
})

test('mapEmployeeOnboardingAssignment retains the exact package_version_id and snapshot fields, sorted by item order', () => {
  const row = sampleAssignmentRow()
  const items = [sampleDocItemRow({ sort_order: 1 }), sampleFormItemRow({ sort_order: 0 })]
  const mapped = mapEmployeeOnboardingAssignment(row, items)

  assert.equal(mapped.packageVersionId, 'pkg-ver-1')
  assert.equal(mapped.packageTitleSnapshot, 'New Starter Package')
  assert.equal(mapped.packageVersionNumber, 2)
  assert.equal(mapped.items.length, 2)
  assert.equal(mapped.items[0].itemType, 'form')
  assert.equal(mapped.items[1].itemType, 'document')
})

test('mapEmployeeOnboardingAssignment only includes items belonging to that assignment', () => {
  const row = sampleAssignmentRow({ id: 'assign-1' })
  const items = [
    sampleFormItemRow({ id: 'own-item', assignment_id: 'assign-1' }),
    sampleDocItemRow({ id: 'other-item', assignment_id: 'assign-2' }),
  ]
  const mapped = mapEmployeeOnboardingAssignment(row, items)

  assert.equal(mapped.items.length, 1)
  assert.equal(mapped.items[0].id, 'own-item')
})

test('calculateOnboardingProgress only counts approved/waived items as complete', () => {
  const items: EmployeeOnboardingItem[] = [
    mapEmployeeOnboardingItem(sampleFormItemRow({ id: 'a', state: 'approved' })),
    mapEmployeeOnboardingItem(sampleFormItemRow({ id: 'b', state: 'waived' })),
    mapEmployeeOnboardingItem(sampleFormItemRow({ id: 'c', state: 'submitted' })),
    mapEmployeeOnboardingItem(sampleDocItemRow({ id: 'd', state: 'not_started' })),
  ]

  const progress = calculateOnboardingProgress(items)
  assert.equal(progress.completed, 2)
  assert.equal(progress.total, 4)
  assert.equal(progress.percent, 50)
})

test('calculateOnboardingProgress starts every freshly cloned checklist at 0/N — no fabricated progress', () => {
  const items: EmployeeOnboardingItem[] = [
    mapEmployeeOnboardingItem(sampleFormItemRow()),
    mapEmployeeOnboardingItem(sampleDocItemRow()),
  ]
  const progress = calculateOnboardingProgress(items)
  assert.equal(progress.completed, 0)
  assert.equal(progress.percent, 0)
})

test('calculateOnboardingProgress handles an empty checklist without dividing by zero', () => {
  const progress = calculateOnboardingProgress([])
  assert.equal(progress.total, 0)
  assert.equal(progress.completed, 0)
  assert.equal(progress.percent, 0)
})

test('isActiveAssignment is true only for assigned/in_progress states', () => {
  const base = mapEmployeeOnboardingAssignment(sampleAssignmentRow(), [])
  assert.equal(isActiveAssignment({ ...base, state: 'assigned' }), true)
  assert.equal(isActiveAssignment({ ...base, state: 'in_progress' }), true)
  assert.equal(isActiveAssignment({ ...base, state: 'completed' }), false)
  assert.equal(isActiveAssignment({ ...base, state: 'cancelled' }), false)
})

test('formatOnboardingDate renders a readable "30 Sep 2026" style date for a plain date column', () => {
  assert.equal(formatOnboardingDate('2026-09-30'), '30 Sep 2026')
})

test('employeeOnboardingPersistenceMessage formats known domain errors', () => {
  assert.equal(
    employeeOnboardingPersistenceMessage(new EmployeeOnboardingPersistenceError('DUPLICATE_ACTIVE_ASSIGNMENT', 'x')),
    'This employee already has an active assignment for this exact package version.',
  )
  assert.equal(
    employeeOnboardingPersistenceMessage(new EmployeeOnboardingPersistenceError('PACKAGE_NOT_PUBLISHED', 'x')),
    'Only published onboarding package versions can be assigned.',
  )
  assert.equal(
    employeeOnboardingPersistenceMessage(new EmployeeOnboardingPersistenceError('EMPLOYEE_ARCHIVED', 'x')),
    'This employee is archived and cannot receive a new onboarding assignment.',
  )
})

test('employee-onboarding repository exports the RPC-backed mutation API', async () => {
  const source = await readRepositoryFile('src/features/employee-onboarding/data/employee-onboarding-repository.ts')

  for (const fn of [
    'assignOnboardingPackage',
    'startMyOnboarding',
    'cancelOnboardingAssignment',
    'listAssignmentsForEmployee',
    'getMyOnboardingAssignments',
    'listPublishedPackageVersions',
    'getPackageVersionPreview',
  ]) {
    assert.match(source, new RegExp(`export (?:async )?function ${fn}\\b`))
  }

  assert.match(source, /\.rpc\('assign_onboarding_package'/)
  assert.match(source, /\.rpc\('start_my_onboarding'/)
  assert.match(source, /\.rpc\('cancel_onboarding_assignment'/)
})

test('employee-onboarding repository never mutates assignment/item tables directly and never touches the service-role key', async () => {
  const browserSource = await readTypeScriptFiles(path.join(repositoryRoot, 'src'))

  for (const table of ['employee_onboarding_assignments', 'employee_onboarding_items']) {
    assert.doesNotMatch(browserSource, new RegExp(`\\.from\\(\\s*['"]${table}['"]\\s*\\)\\s*\\.insert`, 'i'))
    assert.doesNotMatch(browserSource, new RegExp(`\\.from\\(\\s*['"]${table}['"]\\s*\\)\\s*\\.update`, 'i'))
    assert.doesNotMatch(browserSource, new RegExp(`\\.from\\(\\s*['"]${table}['"]\\s*\\)\\s*\\.delete`, 'i'))
  }

  assert.doesNotMatch(browserSource, /SUPABASE_SERVICE_ROLE_KEY/i)
})

test('employee onboarding ownership never matches by email — auth_user_id / employee_id linkage only', async () => {
  const migration = await readRepositoryFile('supabase/migrations/0025_employee_onboarding_assignments.sql')
  const browserSource = await readTypeScriptFiles(path.join(repositoryRoot, 'src/features/employee-onboarding'))

  assert.match(migration, /e\.auth_user_id = \(select auth\.uid\(\)\)/)
  assert.doesNotMatch(migration, /work_email/i)
  assert.doesNotMatch(browserSource, /work_email/i)
})

test('HR onboarding assignment controls are admin/HR-only and never imported into the employee portal', async () => {
  const employeeDetailSource = await readRepositoryFile('src/pages/EmployeeDetailPage.tsx')
  assert.match(employeeDetailSource, /EmployeeOnboardingSection/)

  const portalSource = await readRepositoryFile('src/pages/EmployeePortalPage.tsx')
  assert.doesNotMatch(portalSource, /EmployeeOnboardingSection/)
  assert.doesNotMatch(portalSource, /AssignOnboardingPackageDialog/)
  assert.doesNotMatch(portalSource, /CancelOnboardingDialog/)

  for (const route of ['/hr/employees', '/hr/employees/emp-1']) {
    assert.equal(isRouteAllowedForRole(route, 'admin'), true)
    assert.equal(isRouteAllowedForRole(route, 'hr'), true)
    assert.equal(isRouteAllowedForRole(route, 'employee'), false)
  }
  assert.equal(isRouteAllowedForRole('/employee', 'employee'), true)
  assert.equal(isRouteAllowedForRole('/employee', 'admin'), false)
  assert.equal(isRouteAllowedForRole('/employee', 'hr'), false)
})

test('employee portal renders a calm empty state and wires Start Onboarding to the RPC-backed mutation', async () => {
  const portalSource = await readRepositoryFile('src/pages/EmployeePortalPage.tsx')

  assert.match(portalSource, /No onboarding tasks have been assigned yet\./)
  assert.match(portalSource, /useMyOnboardingAssignments/)
  assert.match(portalSource, /useStartMyOnboarding/)
})

test('HR employee detail renders a calm empty state prompting to assign a package', async () => {
  const sectionSource = await readRepositoryFile('src/features/employee-onboarding/components/EmployeeOnboardingSection.tsx')

  assert.match(sectionSource, /No onboarding package assigned/)
  assert.match(sectionSource, /Assign a published onboarding package to begin this employee's onboarding\./)
})

test('migration 0025 defines assignment/item tables, ownership RLS, immutability guards, and SECURITY DEFINER RPCs', async () => {
  const migration = await readRepositoryFile('supabase/migrations/0025_employee_onboarding_assignments.sql')

  assert.match(migration, /create table public\.employee_onboarding_assignments/i)
  assert.match(migration, /create table public\.employee_onboarding_items/i)
  assert.match(migration, /unique index employee_onboarding_assignments_unique_active[\s\S]*where cancelled_at is null and completed_at is null/i)
  assert.match(migration, /enforce_employee_onboarding_assignment_immutability/i)
  assert.match(migration, /enforce_employee_onboarding_item_immutability/i)

  assert.match(migration, /revoke all on public\.employee_onboarding_assignments, public\.employee_onboarding_items\s*\n\s*from anon, authenticated, public/i)
  assert.match(migration, /grant select on public\.employee_onboarding_assignments, public\.employee_onboarding_items to authenticated/i)

  for (const fn of ['assign_onboarding_package', 'start_my_onboarding', 'cancel_onboarding_assignment']) {
    assert.match(migration, new RegExp(`function public\\.${fn}[\\s\\S]*?security definer`, 'i'))
    assert.match(migration, new RegExp(`function public\\.${fn}[\\s\\S]*?set search_path = ''`, 'i'))
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn}`, 'i'))
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}[^;]*to authenticated`, 'i'))
  }

  for (const code of [
    'UNAUTHORIZED', 'EMPLOYEE_NOT_FOUND', 'EMPLOYEE_ARCHIVED', 'PACKAGE_VERSION_NOT_FOUND',
    'PACKAGE_NOT_PUBLISHED', 'PACKAGE_ARCHIVED', 'DUPLICATE_ACTIVE_ASSIGNMENT',
  ]) {
    assert.match(migration, new RegExp(code))
  }
})

test('migration 0025 pins the exact published package version — no reliance on the mutable parent package', async () => {
  const migration = await readRepositoryFile('supabase/migrations/0025_employee_onboarding_assignments.sql')

  assert.match(migration, /package_version_id\s+uuid not null\s+references public\.onboarding_package_versions\(id\)/i)
  assert.match(migration, /if v_version\.state <> 'published' then/i)
})
