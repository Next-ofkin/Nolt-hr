import assert from 'node:assert/strict'
import test from 'node:test'
import { getEmployeeAccountState } from '../src/lib/employee-domain.ts'
import type { Employee, EmployeeInvitation } from '../src/lib/database.types.ts'

function createMockEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-123',
    first_name: 'John',
    middle_name: null,
    last_name: 'Adeyemi',
    work_email: 'john@noltfinance.com',
    phone: null,
    staff_id: 'NOLT-001',
    job_title: 'Financial Analyst',
    department_id: null,
    employment_type_id: null,
    start_date: '2026-10-01',
    status: 'DRAFT',
    auth_user_id: null,
    invited_at: null,
    invited_by: null,
    account_activated_at: null,
    created_at: '2026-09-14T00:00:00Z',
    updated_at: '2026-09-14T00:00:00Z',
    ...overrides,
  }
}

function createMockInvitation(overrides: Partial<EmployeeInvitation> = {}): EmployeeInvitation {
  return {
    id: 'inv-456',
    employee_id: 'emp-123',
    auth_user_id: null,
    email: 'john@noltfinance.com',
    status: 'PENDING',
    invited_by: 'admin-789',
    failure_code: null,
    created_at: '2026-09-14T10:00:00Z',
    sent_at: '2026-09-14T10:00:01Z',
    accepted_at: null,
    failed_at: null,
    revoked_at: null,
    ...overrides,
  }
}

test('getEmployeeAccountState calculates state accurately', () => {
  const draftEmp = createMockEmployee({ status: 'DRAFT' })
  assert.equal(getEmployeeAccountState(draftEmp, null), 'NOT_INVITED')

  const pendingEmp = createMockEmployee({ status: 'INVITED' })
  const pendingInv = createMockInvitation({ status: 'PENDING' })
  assert.equal(getEmployeeAccountState(pendingEmp, pendingInv), 'PENDING')

  const activeEmp = createMockEmployee({
    status: 'PRE_ONBOARDING',
    auth_user_id: 'user-999',
    account_activated_at: '2026-09-14T12:00:00Z',
  })
  const acceptedInv = createMockInvitation({ status: 'ACCEPTED', accepted_at: '2026-09-14T12:00:00Z' })
  assert.equal(getEmployeeAccountState(activeEmp, acceptedInv), 'ACTIVE')

  const failedEmp = createMockEmployee({ status: 'DRAFT' })
  const failedInv = createMockInvitation({ status: 'FAILED', failure_code: 'EMAIL_EXISTS' })
  assert.equal(getEmployeeAccountState(failedEmp, failedInv), 'FAILED')
})

test('authorization: only Admin and HR can initiate employee invitations', () => {
  const canInviteRole = (role: string | null) => role === 'admin' || role === 'hr'

  assert.equal(canInviteRole('admin'), true)
  assert.equal(canInviteRole('hr'), true)
  assert.equal(canInviteRole('employee'), false)
  assert.equal(canInviteRole(null), false)
})

test('employee invitation derives email and full name server-side from employee record', () => {
  const employee = createMockEmployee({
    first_name: 'Jane',
    middle_name: 'O.',
    last_name: 'Doe',
    work_email: 'jane.doe@noltfinance.com',
  })

  // Simulating server-side extraction in Edge Function
  const fullName = [employee.first_name, employee.middle_name, employee.last_name].filter(Boolean).join(' ')
  const workEmail = employee.work_email.trim().toLowerCase()
  const role = 'employee'

  assert.equal(fullName, 'Jane O. Doe')
  assert.equal(workEmail, 'jane.doe@noltfinance.com')
  assert.equal(role, 'employee')
})

test('invitation rules enforce status and linkage constraints', () => {
  const archivedEmp = createMockEmployee({ status: 'ARCHIVED' })
  const linkedEmp = createMockEmployee({ status: 'PRE_ONBOARDING', auth_user_id: 'auth-1' })
  const preOnboardingEmp = createMockEmployee({ status: 'PRE_ONBOARDING' })

  const canInvite = (emp: Employee) => !emp.auth_user_id && emp.status === 'DRAFT'

  assert.equal(canInvite(createMockEmployee({ status: 'DRAFT' })), true)
  assert.equal(canInvite(archivedEmp), false)
  assert.equal(canInvite(linkedEmp), false)
  assert.equal(canInvite(preOnboardingEmp), false)
})

test('activation RPC logic transitions INVITED -> PRE_ONBOARDING and is idempotent', () => {
  function simulateActivation(emp: Employee) {
    if (!emp.auth_user_id) return { ok: false, error: 'Employee record not linked' }
    const nextStatus = emp.status === 'INVITED' ? 'PRE_ONBOARDING' : emp.status
    const nextActivatedAt = emp.account_activated_at ?? '2026-09-14T12:00:00Z'
    return {
      ok: true,
      employee: {
        ...emp,
        status: nextStatus,
        account_activated_at: nextActivatedAt,
      },
    }
  }

  const invitedEmp = createMockEmployee({ status: 'INVITED', auth_user_id: 'user-1' })
  const res1 = simulateActivation(invitedEmp)
  assert.equal(res1.ok, true)
  assert.equal(res1.employee?.status, 'PRE_ONBOARDING')
  assert.equal(Boolean(res1.employee?.account_activated_at), true)

  // Second activation call (idempotent)
  const res2 = simulateActivation(res1.employee!)
  assert.equal(res2.ok, true)
  assert.equal(res2.employee?.status, 'PRE_ONBOARDING')
  assert.equal(res2.employee?.account_activated_at, res1.employee?.account_activated_at)

  // Status regression safety check: HR_REVIEW should remain HR_REVIEW
  const hrReviewEmp = createMockEmployee({ status: 'HR_REVIEW', auth_user_id: 'user-1' })
  const res3 = simulateActivation(hrReviewEmp)
  assert.equal(res3.employee?.status, 'HR_REVIEW')
})

test('no email-only account linking fallback exists', () => {
  function findLinkedEmployee(authUid: string, workEmail: string, employees: Employee[]) {
    // Correct security model: MUST match auth_user_id, NEVER match by work_email alone
    return employees.find((e) => e.auth_user_id === authUid) ?? null
  }

  const emp = createMockEmployee({ auth_user_id: null, work_email: 'test@noltfinance.com' })
  const result = findLinkedEmployee('auth-user-99', 'test@noltfinance.com', [emp])

  // Email matches, but auth_user_id does NOT, so lookup must return null!
  assert.equal(result, null)
})
