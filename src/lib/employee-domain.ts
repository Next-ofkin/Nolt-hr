import type {
  Department,
  Employee,
  EmployeeInsert,
  EmployeeStatus,
  EmployeeUpdate,
  EmploymentType,
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
  department_id: string
  employment_type_id: string
  start_date: string
  status: EmployeeStatus
}

export interface EmployeeFilters {
  search: string
  departmentId: string
  employmentTypeId: string
  status: EmployeeStatus | ''
  page: number
}

export type EmployeeWithRelations = Employee & {
  department: Pick<Department, 'id' | 'name'> | null
  employment_type: Pick<EmploymentType, 'id' | 'name'> | null
}

export interface EmployeeValidationErrors {
  first_name?: string
  last_name?: string
  work_email?: string
  department_id?: string
  employment_type_id?: string
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
  if (!values.department_id) errors.department_id = 'Department is required'
  if (!values.employment_type_id) errors.employment_type_id = 'Employment type is required'
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
    department_id: values.department_id,
    employment_type_id: values.employment_type_id,
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
    department_id: employee?.department_id ?? '',
    employment_type_id: employee?.employment_type_id ?? '',
    start_date: employee?.start_date ?? '',
    status: employee?.status ?? 'DRAFT',
  }
}

export function formatEmployeeName(employee: Pick<Employee, 'first_name' | 'middle_name' | 'last_name'>) {
  return [employee.first_name, employee.middle_name, employee.last_name].filter(Boolean).join(' ')
}

export function employeeDirectoryRow(employee: EmployeeWithRelations) {
  return {
    id: employee.id,
    name: formatEmployeeName(employee),
    staffId: employee.staff_id ?? '—',
    workEmail: employee.work_email,
    department: employee.department?.name ?? '—',
    employmentType: employee.employment_type?.name ?? '—',
    jobTitle: employee.job_title ?? '—',
    startDate: employee.start_date ?? null,
    status: employee.status,
  }
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
  if (databaseError.code === '23503') return 'Choose a valid department and employment type.'
  return fallback
}
