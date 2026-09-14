import type {
  Employee,
  EmployeeInsert,
  EmployeeStatus,
  EmployeeUpdate,
  UserRole,
} from './database.types.ts'

export const EMPLOYEE_MANAGER_ROLES = ['admin', 'hr'] as const satisfies readonly UserRole[]

export const EMPLOYEE_STATUSES = [
  'DRAFT',
  'INVITED',
  'PRE_ONBOARDING',
  'HR_REVIEW',
  'READY_TO_RESUME',
  'POST_ONBOARDING',
  'COMPLETED',
  'SUSPENDED',
  'ARCHIVED',
] as const satisfies readonly EmployeeStatus[]

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  DRAFT: 'Draft',
  INVITED: 'Invited',
  PRE_ONBOARDING: 'Pre-Onboarding',
  HR_REVIEW: 'HR Review',
  READY_TO_RESUME: 'Ready to Resume',
  POST_ONBOARDING: 'Post-Onboarding',
  COMPLETED: 'Completed',
  SUSPENDED: 'Suspended',
  ARCHIVED: 'Archived',
}

export interface EmployeeFormValues {
  first_name: string
  middle_name: string
  last_name: string
  work_email: string
  phone: string
  staff_id: string
  job_title: string
  start_date: string
  status: EmployeeStatus
}

export interface EmployeeFilters {
  search: string
  status: EmployeeStatus | ''
  page: number
}

export interface EmployeeValidationErrors {
  first_name?: string
  last_name?: string
  work_email?: string
  status?: string
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function optional(value: string) {
  const normalized = value.trim()
  return normalized || null
}

export function canManageEmployees(role: UserRole | null | undefined) {
  return role === 'admin' || role === 'hr'
}

export function isEmployeeStatus(value: string): value is EmployeeStatus {
  return EMPLOYEE_STATUSES.includes(value as EmployeeStatus)
}

export function validateEmployee(values: EmployeeFormValues): EmployeeValidationErrors {
  const errors: EmployeeValidationErrors = {}
  if (!values.first_name.trim()) errors.first_name = 'First name is required'
  if (!values.last_name.trim()) errors.last_name = 'Last name is required'
  if (!EMAIL_PATTERN.test(values.work_email.trim())) errors.work_email = 'Enter a valid work email'
  if (!isEmployeeStatus(values.status)) errors.status = 'Choose a valid lifecycle status'
  return errors
}

export function createEmployeePayload(values: EmployeeFormValues): EmployeeInsert {
  return {
    first_name: values.first_name.trim(),
    middle_name: optional(values.middle_name),
    last_name: values.last_name.trim(),
    work_email: values.work_email.trim().toLowerCase(),
    phone: optional(values.phone),
    staff_id: optional(values.staff_id),
    job_title: optional(values.job_title),
    start_date: optional(values.start_date),
  }
}

export function updateEmployeePayload(values: EmployeeFormValues): EmployeeUpdate {
  return { ...createEmployeePayload(values), status: values.status }
}

export function archiveEmployeePayload(): EmployeeUpdate {
  return { status: 'ARCHIVED' }
}

export function employeeFormValues(employee?: Employee | null): EmployeeFormValues {
  return {
    first_name: employee?.first_name ?? '',
    middle_name: employee?.middle_name ?? '',
    last_name: employee?.last_name ?? '',
    work_email: employee?.work_email ?? '',
    phone: employee?.phone ?? '',
    staff_id: employee?.staff_id ?? '',
    job_title: employee?.job_title ?? '',
    start_date: employee?.start_date ?? '',
    status: employee?.status ?? 'DRAFT',
  }
}

export function formatEmployeeName(employee: Pick<Employee, 'first_name' | 'middle_name' | 'last_name'>) {
  return [employee.first_name, employee.middle_name, employee.last_name].filter(Boolean).join(' ')
}

export function employeeDirectoryRow(employee: Employee) {
  return {
    id: employee.id,
    name: formatEmployeeName(employee),
    staffId: employee.staff_id ?? '—',
    workEmail: employee.work_email,
    jobTitle: employee.job_title ?? '—',
    startDate: employee.start_date ?? null,
    status: employee.status,
  }
}

export function hasActiveEmployeeFilters(filters: EmployeeFilters) {
  return Boolean(filters.search.trim() || filters.status)
}

export function sanitizeEmployeeSearch(value: string) {
  return value.trim().replace(/[,()%_*]/g, ' ').replace(/\s+/g, ' ')
}

export function employeeMutationError(error: unknown, fallback: string) {
  const databaseError = error as { code?: string; message?: string; details?: string }
  if (databaseError.code === '23505') {
    const detail = `${databaseError.message ?? ''} ${databaseError.details ?? ''}`.toLowerCase()
    if (detail.includes('work_email')) return 'An employee with this work email already exists.'
    if (detail.includes('staff_id')) return 'An employee with this staff ID already exists.'
    return 'An employee with these details already exists.'
  }
  if (databaseError.code === '23503') return 'One of the linked records for this employee is no longer valid.'
  return fallback
}
