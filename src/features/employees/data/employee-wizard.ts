import { validateEmployee, type EmployeeFormValues, type EmployeeValidationErrors } from '../../../lib/employee-domain.ts'

export type AccessMode = 'invite_now' | 'invite_later'
export type OnboardingMode = 'assign_now' | 'assign_later'

export interface EmployeeWizardState {
  employee: EmployeeFormValues
  accessMode: AccessMode
  onboardingMode: OnboardingMode
  packageVersionId: string | null
  dueDate: string | null
}

export const WIZARD_STEPS = ['Employee', 'Access', 'Onboarding', 'Review'] as const
export type WizardStepKey = (typeof WIZARD_STEPS)[number]

/**
 * Both secondary actions default to "later" — creating an employee record
 * must never look like it silently emailed someone or committed them to a
 * package. HR opts in to "now" explicitly on each step.
 */
export function createInitialWizardState(): EmployeeWizardState {
  return {
    employee: {
      first_name: '',
      middle_name: '',
      last_name: '',
      work_email: '',
      phone: '',
      staff_id: '',
      job_title: '',
      start_date: '',
      status: 'DRAFT',
    },
    accessMode: 'invite_later',
    onboardingMode: 'assign_later',
    packageVersionId: null,
    dueDate: null,
  }
}

export function validateEmployeeStep(values: EmployeeFormValues): EmployeeValidationErrors {
  return validateEmployee(values)
}

export function canProceedFromEmployeeStep(values: EmployeeFormValues): boolean {
  return Object.keys(validateEmployeeStep(values)).length === 0
}

export function canProceedFromOnboardingStep(state: Pick<EmployeeWizardState, 'onboardingMode' | 'packageVersionId'>): boolean {
  if (state.onboardingMode === 'assign_later') return true
  return Boolean(state.packageVersionId)
}

export type InvitationOutcome = 'deferred' | 'sent' | 'failed'
export type OnboardingAssignmentOutcome = 'deferred' | 'assigned' | 'failed'

/** Just enough of the newly-created row to render the result screen — not the full Employee shape, so this never implies a re-fetch is needed. */
export interface CreatedEmployeeSummary {
  id: string
  first_name: string
  middle_name: string | null
  last_name: string
  work_email: string
  start_date: string | null
}

export interface EmployeeCreationResult {
  employee: CreatedEmployeeSummary
  invitation: InvitationOutcome
  invitationError?: string
  onboarding: OnboardingAssignmentOutcome
  onboardingError?: string
  packageTitleSnapshot?: string
  packageVersionNumber?: number
  dueDate?: string | null
}

/** True only when every requested action actually succeeded — used to pick the calm "all done" screen vs. the partial-success one. */
export function isFullSuccess(result: EmployeeCreationResult): boolean {
  return result.invitation !== 'failed' && result.onboarding !== 'failed'
}
