import type {
  EmployeeOnboardingAssignmentRow,
  EmployeeOnboardingItemRow,
} from '../../../lib/database.types'

export type EmployeeOnboardingErrorCode =
  | 'UNAUTHORIZED'
  | 'EMPLOYEE_NOT_FOUND'
  | 'EMPLOYEE_ARCHIVED'
  | 'PACKAGE_VERSION_NOT_FOUND'
  | 'PACKAGE_NOT_PUBLISHED'
  | 'PACKAGE_ARCHIVED'
  | 'DUPLICATE_ACTIVE_ASSIGNMENT'
  | 'ASSIGNMENT_NOT_FOUND'
  | 'ASSIGNMENT_CANCELLED'
  | 'ASSIGNMENT_COMPLETED'
  | 'ITEM_NOT_FOUND'
  | 'NOT_A_FORM_ITEM'
  | 'ASSIGNMENT_NOT_ACTIVE'
  | 'ALREADY_SUBMITTED'
  | 'INVALID_RESPONSE'
  | (string & {})

export class EmployeeOnboardingPersistenceError extends Error {
  readonly code: EmployeeOnboardingErrorCode

  constructor(code: EmployeeOnboardingErrorCode, message: string) {
    super(message)
    this.name = 'EmployeeOnboardingPersistenceError'
    this.code = code
  }
}

export function employeeOnboardingPersistenceMessage(
  error: unknown,
  fallbackMessage = 'An unexpected error occurred while managing this onboarding assignment.',
): string {
  if (error instanceof EmployeeOnboardingPersistenceError) {
    if (error.code === 'DUPLICATE_ACTIVE_ASSIGNMENT') {
      return 'This employee already has an active assignment for this exact package version.'
    }
    if (error.code === 'PACKAGE_NOT_PUBLISHED') {
      return 'Only published onboarding package versions can be assigned.'
    }
    if (error.code === 'EMPLOYEE_ARCHIVED') {
      return 'This employee is archived and cannot receive a new onboarding assignment.'
    }
    if (error.code === 'ALREADY_SUBMITTED') {
      return 'This form has already been submitted.'
    }
    if (error.code === 'ASSIGNMENT_NOT_ACTIVE') {
      return 'Start your onboarding before submitting this form.'
    }
    if (error.message) return error.message
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallbackMessage
}

export type AssignmentState = 'assigned' | 'in_progress' | 'completed' | 'cancelled'

export type OnboardingItemState =
  | 'not_started'
  | 'in_progress'
  | 'submitted'
  | 'under_review'
  | 'changes_requested'
  | 'approved'
  | 'waived'

export interface EmployeeOnboardingFormItem {
  id: string
  assignmentId: string
  sourcePackageItemId: string
  itemType: 'form'
  sortOrder: number
  required: boolean
  state: OnboardingItemState
  formVersionId: string
  formTitle: string
  formVersionNumber: number
  startedAt: string | null
  completedAt: string | null
  responseData: Record<string, unknown> | null
  submittedAt: string | null
}

export interface EmployeeOnboardingDocumentItem {
  id: string
  assignmentId: string
  sourcePackageItemId: string
  itemType: 'document'
  sortOrder: number
  required: boolean
  state: OnboardingItemState
  documentTitle: string
  documentDescription: string | null
  startedAt: string | null
  completedAt: string | null
}

export type EmployeeOnboardingItem = EmployeeOnboardingFormItem | EmployeeOnboardingDocumentItem

export interface EmployeeOnboardingAssignment {
  id: string
  employeeId: string
  packageVersionId: string
  packageTitleSnapshot: string
  packageDescriptionSnapshot: string | null
  packageVersionNumber: number
  state: AssignmentState
  dueDate: string | null
  assignedBy: string
  assignedAt: string
  startedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  cancelledBy: string | null
  cancellationReason: string | null
  items: EmployeeOnboardingItem[]
}

export interface AssignOnboardingPackageResult {
  assignmentId: string
  employeeId: string
  packageVersionId: string
  packageTitleSnapshot: string
  packageVersionNumber: number
  state: AssignmentState
  itemCount: number
}

export interface StartMyOnboardingResult {
  assignmentId: string
  state: AssignmentState
  alreadyStarted: boolean
}

export interface CancelOnboardingAssignmentResult {
  assignmentId: string
  alreadyCancelled: boolean
}

export interface SubmitOnboardingFormResponseResult {
  itemId: string
  state: OnboardingItemState
  submittedAt: string
}

export function mapEmployeeOnboardingItem(row: EmployeeOnboardingItemRow): EmployeeOnboardingItem {
  if (row.item_type === 'form') {
    return {
      id: row.id,
      assignmentId: row.assignment_id,
      sourcePackageItemId: row.source_package_item_id,
      itemType: 'form',
      sortOrder: row.sort_order,
      required: row.required,
      state: row.state as OnboardingItemState,
      formVersionId: row.form_version_id as string,
      formTitle: row.form_title_snapshot ?? 'Form',
      formVersionNumber: row.form_version_number ?? 1,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      responseData: (row.response_data as Record<string, unknown> | null) ?? null,
      submittedAt: row.submitted_at,
    }
  }
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    sourcePackageItemId: row.source_package_item_id,
    itemType: 'document',
    sortOrder: row.sort_order,
    required: row.required,
    state: row.state as OnboardingItemState,
    documentTitle: row.document_title ?? 'Document Requirement',
    documentDescription: row.document_description,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }
}

export function mapEmployeeOnboardingAssignment(
  row: EmployeeOnboardingAssignmentRow,
  itemRows: EmployeeOnboardingItemRow[],
): EmployeeOnboardingAssignment {
  const items = itemRows
    .filter((item) => item.assignment_id === row.id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(mapEmployeeOnboardingItem)

  return {
    id: row.id,
    employeeId: row.employee_id,
    packageVersionId: row.package_version_id,
    packageTitleSnapshot: row.package_title_snapshot,
    packageDescriptionSnapshot: row.package_description_snapshot,
    packageVersionNumber: row.package_version_number,
    state: row.state as AssignmentState,
    dueDate: row.due_date,
    assignedBy: row.assigned_by,
    assignedAt: row.assigned_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    cancelledBy: row.cancelled_by,
    cancellationReason: row.cancellation_reason,
    items,
  }
}

/** Only approved/waived items count toward completion — matches the RPC's not_started default and keeps future review states from silently inflating progress. */
const COMPLETE_ITEM_STATES: ReadonlySet<OnboardingItemState> = new Set(['approved', 'waived'])

export interface OnboardingProgress {
  completed: number
  total: number
  percent: number
}

export function calculateOnboardingProgress(items: EmployeeOnboardingItem[]): OnboardingProgress {
  const total = items.length
  const completed = items.filter((item) => COMPLETE_ITEM_STATES.has(item.state)).length
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100)
  return { completed, total, percent }
}

/** Assignments still requiring employee/HR attention, most relevant first. */
export function isActiveAssignment(assignment: EmployeeOnboardingAssignment): boolean {
  return assignment.state === 'assigned' || assignment.state === 'in_progress'
}

/** Only these states may still be opened and filled in — once submitted, editing is a future (HR-review) phase. */
const FILLABLE_ITEM_STATES: ReadonlySet<OnboardingItemState> = new Set(['not_started', 'in_progress'])

export function canFillFormItem(item: EmployeeOnboardingItem): item is EmployeeOnboardingFormItem {
  return item.itemType === 'form' && FILLABLE_ITEM_STATES.has(item.state)
}

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** "30 Sep 2026" — matches the readable date format used across onboarding packages. */
export function formatOnboardingDate(value: string): string {
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00Z`)
  return `${date.getUTCDate()} ${SHORT_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}
