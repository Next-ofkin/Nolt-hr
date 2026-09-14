import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EMPLOYEE_STATUSES,
  archiveEmployeePayload,
  canManageEmployees,
  createEmployeePayload,
  employeeDirectoryRow,
  employeeMutationError,
  isEmployeeStatus,
  updateEmployeePayload,
  validateEmployee,
  type EmployeeFormValues,
  type EmployeeWithRelations,
} from '../src/lib/employee-domain.ts'

const validForm: EmployeeFormValues = {
  first_name: ' Ada ',
  middle_name: ' N. ',
  last_name: ' Lovelace ',
  work_email: ' ADA@Example.com ',
  phone: ' +234 800 000 0000 ',
  staff_id: ' NOLT-001 ',
  job_title: ' Analyst ',
  department_id: 'department-id',
  employment_type_id: 'type-id',
  start_date: '2026-09-15',
  status: 'HR_REVIEW',
}

test('employee validation requires identity, email, department, and employment type', () => {
  const errors = validateEmployee({
    ...validForm,
    first_name: ' ',
    last_name: '',
    work_email: 'invalid',
    department_id: '',
    employment_type_id: '',
  })
  assert.deepEqual(errors, {
    first_name: 'First name is required',
    last_name: 'Last name is required',
    work_email: 'Enter a valid work email',
    department_id: 'Department is required',
    employment_type_id: 'Employment type is required',
  })
})

test('only the nine defined employee lifecycle statuses are valid', () => {
  assert.equal(EMPLOYEE_STATUSES.length, 9)
  assert.equal(isEmployeeStatus('READY_TO_RESUME'), true)
  assert.equal(isEmployeeStatus('ACTIVE'), false)
})

test('admin and HR may access employee management while employees may not', () => {
  assert.equal(canManageEmployees('admin'), true)
  assert.equal(canManageEmployees('hr'), true)
  assert.equal(canManageEmployees('employee'), false)
  assert.equal(canManageEmployees(null), false)
})

test('employee directory rows render real record values with readable fallbacks', () => {
  const employee = {
    id: 'employee-id',
    auth_user_id: null,
    first_name: 'Ada',
    middle_name: null,
    last_name: 'Lovelace',
    work_email: 'ada@example.com',
    phone: null,
    staff_id: null,
    job_title: 'Analyst',
    department_id: 'department-id',
    employment_type_id: 'type-id',
    start_date: null,
    status: 'DRAFT',
    created_at: '2026-09-14T00:00:00Z',
    updated_at: '2026-09-14T00:00:00Z',
    department: { id: 'department-id', name: 'Technology' },
    employment_type: { id: 'type-id', name: 'Permanent' },
  } satisfies EmployeeWithRelations

  assert.deepEqual(employeeDirectoryRow(employee), {
    id: 'employee-id',
    name: 'Ada Lovelace',
    staffId: '—',
    workEmail: 'ada@example.com',
    department: 'Technology',
    employmentType: 'Permanent',
    jobTitle: 'Analyst',
    startDate: null,
    status: 'DRAFT',
  })
})

test('create employee payload normalizes values and leaves status to the DRAFT database default', () => {
  const payload = createEmployeePayload(validForm)
  assert.deepEqual(payload, {
    first_name: 'Ada',
    middle_name: 'N.',
    last_name: 'Lovelace',
    work_email: 'ada@example.com',
    phone: '+234 800 000 0000',
    staff_id: 'NOLT-001',
    job_title: 'Analyst',
    department_id: 'department-id',
    employment_type_id: 'type-id',
    start_date: '2026-09-15',
  })
  assert.equal('status' in payload, false)
  assert.equal('auth_user_id' in payload, false)
})

test('edit employee payload includes a valid lifecycle status but never auth_user_id', () => {
  const payload = updateEmployeePayload(validForm)
  assert.equal(payload.status, 'HR_REVIEW')
  assert.equal('auth_user_id' in payload, false)
})

test('archive behavior retains the record and changes only its status', () => {
  assert.deepEqual(archiveEmployeePayload(), { status: 'ARCHIVED' })
})

test('duplicate work email and staff ID errors are friendly', () => {
  assert.equal(
    employeeMutationError({ code: '23505', message: 'employees_work_email_unique_ci' }, 'Failed'),
    'An employee with this work email already exists.',
  )
  assert.equal(
    employeeMutationError({ code: '23505', details: 'employees_staff_id_unique_ci' }, 'Failed'),
    'An employee with this staff ID already exists.',
  )
})
