import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  canProceedFromEmployeeStep,
  canProceedFromOnboardingStep,
  createInitialWizardState,
  isFullSuccess,
  type EmployeeCreationResult,
} from '../src/features/employees/data/employee-wizard.ts'
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

function sampleResult(overrides: Partial<EmployeeCreationResult> = {}): EmployeeCreationResult {
  return {
    employee: { id: 'emp-1', first_name: 'Sarah', middle_name: null, last_name: 'Williams', work_email: 's@x.com', start_date: null },
    invitation: 'deferred',
    onboarding: 'deferred',
    ...overrides,
  }
}

// ------------------------------------------------------------
// Wizard domain logic (pure, no I/O)
// ------------------------------------------------------------

test('createInitialWizardState defaults both secondary actions to "later" — creating an employee never implies sending anything', () => {
  const state = createInitialWizardState()
  assert.equal(state.accessMode, 'invite_later')
  assert.equal(state.onboardingMode, 'assign_later')
  assert.equal(state.packageVersionId, null)
  assert.equal(state.employee.status, 'DRAFT')
})

test('canProceedFromEmployeeStep requires first name, last name, and a valid email', () => {
  const state = createInitialWizardState()
  assert.equal(canProceedFromEmployeeStep(state.employee), false)

  const valid = { ...state.employee, first_name: 'Sarah', last_name: 'Williams', work_email: 'sarah@nolt.com' }
  assert.equal(canProceedFromEmployeeStep(valid), true)

  const badEmail = { ...valid, work_email: 'not-an-email' }
  assert.equal(canProceedFromEmployeeStep(badEmail), false)
})

test('canProceedFromOnboardingStep only requires a package when assigning now', () => {
  assert.equal(canProceedFromOnboardingStep({ onboardingMode: 'assign_later', packageVersionId: null }), true)
  assert.equal(canProceedFromOnboardingStep({ onboardingMode: 'assign_now', packageVersionId: null }), false)
  assert.equal(canProceedFromOnboardingStep({ onboardingMode: 'assign_now', packageVersionId: 'ver-1' }), true)
})

test('isFullSuccess is true only when neither secondary action failed', () => {
  assert.equal(isFullSuccess(sampleResult()), true)
  assert.equal(isFullSuccess(sampleResult({ invitation: 'sent', onboarding: 'assigned' })), true)
  assert.equal(isFullSuccess(sampleResult({ invitation: 'failed' })), false)
  assert.equal(isFullSuccess(sampleResult({ onboarding: 'failed' })), false)
})

// ------------------------------------------------------------
// Wizard component wiring (static source assertions)
// ------------------------------------------------------------

test('the wizard creates the employee exactly once, only from the final Create Employee action — never while navigating steps', async () => {
  const source = await readRepositoryFile('src/features/employees/components/NewEmployeeWizard.tsx')

  const createCalls = source.match(/createEmployee\.mutateAsync/g) ?? []
  assert.equal(createCalls.length, 1, 'createEmployee.mutateAsync should be called exactly once, inside handleCreate')

  // goNext/goBack (step navigation) must not call it.
  const goNextBody = source.slice(source.indexOf('const goNext'), source.indexOf('const goBack'))
  assert.doesNotMatch(goNextBody, /createEmployee\.mutateAsync/)
})

test('the wizard guards against double-submit: an in-flight create disables the button and re-entrancy is blocked', async () => {
  const source = await readRepositoryFile('src/features/employees/components/NewEmployeeWizard.tsx')

  assert.match(source, /if \(isSubmitting\) return/)
  assert.match(source, /disabled=\{isSubmitting\}/)
})

test('the wizard reuses the existing onboarding-assignment repository rather than duplicating its logic', async () => {
  const wizardSource = await readRepositoryFile('src/features/employees/components/NewEmployeeWizard.tsx')
  const stepSource = await readRepositoryFile('src/features/employees/components/EmployeeOnboardingStep.tsx')

  for (const source of [wizardSource, stepSource]) {
    assert.match(source, /from '\.\.\/\.\.\/employee-onboarding\/data\/employee-onboarding-repository'/)
  }
  assert.match(wizardSource, /assignOnboardingPackage\(/)
  assert.match(stepSource, /listPublishedPackageVersions|getPackageVersionPreview/)

  // No parallel copy of the assignment SQL/RPC wiring inside the employees feature.
  const employeesFeatureSource = await readTypeScriptFiles(path.join(repositoryRoot, 'src/features/employees'))
  assert.doesNotMatch(employeesFeatureSource, /\.rpc\('assign_onboarding_package'/)
})

test('the wizard reuses the existing invite-user Edge Function rather than a second invitation system', async () => {
  const source = await readRepositoryFile('src/features/employees/components/NewEmployeeWizard.tsx')
  assert.match(source, /useSendEmployeeInvitation/)

  const employeesFeatureSource = await readTypeScriptFiles(path.join(repositoryRoot, 'src/features/employees'))
  assert.doesNotMatch(employeesFeatureSource, /functions\.invoke\(/, 'invitation sending must go through the shared employee-queries hook, not a second direct call')
})

test('partial success is surfaced per-action with retry, never as a silent full failure or a fabricated full success', async () => {
  const source = await readRepositoryFile('src/features/employees/components/EmployeeCreationResult.tsx')

  assert.match(source, /Could not be sent/)
  assert.match(source, /Retry Invitation/)
  assert.match(source, /Could not be assigned/)
  assert.match(source, /Retry Assignment/)
})

test('the Access step edits the same employee.work_email the record will be created with — no separate invitation-email field invented', async () => {
  const source = await readRepositoryFile('src/features/employees/components/EmployeeAccessStep.tsx')
  assert.doesNotMatch(source, /invitationEmail/)
  assert.match(source, /email:\s*string/)

  const wizardSource = await readRepositoryFile('src/features/employees/components/NewEmployeeWizard.tsx')
  assert.match(wizardSource, /email=\{state\.employee\.work_email\}/)
})

// ------------------------------------------------------------
// Access status derivation reuse (no scattered/duplicate logic)
// ------------------------------------------------------------

test('EmployeePortalAccessCard reuses the existing getEmployeeAccountState helper instead of a duplicate deriveEmployeePortalAccessStatus', async () => {
  const source = await readRepositoryFile('src/features/employees/components/EmployeePortalAccessCard.tsx')
  assert.match(source, /getEmployeeAccountState/)
})

test('employee cannot reach HR employee creation, and HR/admin routes stay HR/admin-only', () => {
  for (const route of ['/hr/employees/new', '/hr/employees']) {
    assert.equal(isRouteAllowedForRole(route, 'admin'), true)
    assert.equal(isRouteAllowedForRole(route, 'hr'), true)
    assert.equal(isRouteAllowedForRole(route, 'employee'), false)
    assert.equal(isRouteAllowedForRole(route, null), false)
  }
})

// ------------------------------------------------------------
// Security: no browser service-role, no direct auth.users mutation, no email-only linking
// ------------------------------------------------------------

test('no browser code touches the service-role key or calls the Auth Admin API directly', async () => {
  const browserSource = await readTypeScriptFiles(path.join(repositoryRoot, 'src'))
  assert.doesNotMatch(browserSource, /SUPABASE_SERVICE_ROLE_KEY/i)
  assert.doesNotMatch(browserSource, /auth\.admin\./)
})

test('resend/revoke query hooks call the invite-user Edge Function, never a direct table mutation on employee_invitations', async () => {
  const source = await readRepositoryFile('src/lib/employee-queries.ts')
  assert.match(source, /useResendEmployeeInvitation/)
  assert.match(source, /useRevokeEmployeeInvitation/)
  assert.match(source, /functions\.invoke[\s\S]*?'invite-user'/)
  assert.doesNotMatch(source, /\.from\(\s*['"]employee_invitations['"]\s*\)\s*\.(insert|update|delete)/)
})

// ------------------------------------------------------------
// Edge Function: action modes
// ------------------------------------------------------------

test('invite-user Edge Function supports invite/resend/revoke actions, defaulting to invite for backward compatibility', async () => {
  const source = await readRepositoryFile('supabase/functions/invite-user/index.ts')

  assert.match(source, /const action = typeof body\.action === 'string' \? body\.action : 'invite'/)
  assert.match(source, /\['invite', 'resend', 'revoke'\]\.includes\(action\)/)
  assert.match(source, /async function revokePendingInvitation/)
  assert.match(source, /supabase\.auth\.admin\.deleteUser\(employee\.auth_user_id\)/)
  assert.match(source, /supabase\.rpc\('revoke_employee_invitation'/)
})

test('revoke requires an unaccepted invitation and never touches an already-activated account', async () => {
  const source = await readRepositoryFile('supabase/functions/invite-user/index.ts')
  assert.match(source, /if \(employee\.account_activated_at\) \{\s*\n\s*return \{ error: 'This invitation has already been accepted and cannot be revoked\.'/)
})

// ------------------------------------------------------------
// Migration 0026
// ------------------------------------------------------------

test('migration 0026 adds exactly the revoke_employee_invitation RPC, SECURITY DEFINER, with no client-facing grant', async () => {
  const migration = await readRepositoryFile('supabase/migrations/0026_revoke_employee_invitation.sql')

  assert.match(migration, /create or replace function public\.revoke_employee_invitation/i)
  assert.match(migration, /security definer/i)
  assert.match(migration, /set search_path = public/i)
  assert.match(migration, /revoke execute on function public\.revoke_employee_invitation\(uuid, uuid\) from public, anon, authenticated/i)

  // No duplicate/second linkage or invitation table.
  assert.doesNotMatch(migration, /create table/i)
})
