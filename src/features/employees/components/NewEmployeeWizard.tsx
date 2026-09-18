import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createEmployeePayload } from '../../../lib/employee-domain'
import { useCreateEmployee, useSendEmployeeInvitation } from '../../../lib/employee-queries'
import {
  assignOnboardingPackage,
  listPublishedPackageVersions,
  type PublishedPackageVersionOption,
} from '../../employee-onboarding/data/employee-onboarding-repository'
import { employeeOnboardingPersistenceMessage } from '../../employee-onboarding/data/employee-onboarding-types'
import {
  WIZARD_STEPS,
  canProceedFromEmployeeStep,
  canProceedFromOnboardingStep,
  createInitialWizardState,
  type EmployeeCreationResult as CreationResult,
} from '../data/employee-wizard'
import { WizardStepper } from './WizardStepper'
import { EmployeeBasicsStep } from './EmployeeBasicsStep'
import { EmployeeAccessStep } from './EmployeeAccessStep'
import { EmployeeOnboardingStep } from './EmployeeOnboardingStep'
import { EmployeeReviewStep } from './EmployeeReviewStep'
import { EmployeeCreationResult } from './EmployeeCreationResult'

export function NewEmployeeWizard() {
  const navigate = useNavigate()
  const createEmployee = useCreateEmployee()
  const sendInvitation = useSendEmployeeInvitation()

  const [stepIndex, setStepIndex] = useState(0)
  const [state, setState] = useState(createInitialWizardState)
  const [attemptedNext, setAttemptedNext] = useState(false)

  const [packageOptions, setPackageOptions] = useState<PublishedPackageVersionOption[]>([])
  const [packageOptionsError, setPackageOptionsError] = useState<string | null>(null)

  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<CreationResult | null>(null)
  const [isRetryingInvitation, setIsRetryingInvitation] = useState(false)
  const [isRetryingOnboarding, setIsRetryingOnboarding] = useState(false)

  useEffect(() => {
    let isMounted = true
    listPublishedPackageVersions()
      .then((data) => {
        if (isMounted) setPackageOptions(data)
      })
      .catch((err) => {
        if (isMounted) setPackageOptionsError(err instanceof Error ? err.message : 'Failed to load published packages.')
      })
    return () => {
      isMounted = false
    }
  }, [])

  const resetWizard = () => {
    setState(createInitialWizardState())
    setStepIndex(0)
    setAttemptedNext(false)
    setSubmissionError(null)
    setResult(null)
  }

  const goNext = () => {
    if (stepIndex === 0 && !canProceedFromEmployeeStep(state.employee)) {
      setAttemptedNext(true)
      return
    }
    if (stepIndex === 2 && !canProceedFromOnboardingStep(state)) {
      setAttemptedNext(true)
      return
    }
    setAttemptedNext(false)
    setStepIndex((idx) => Math.min(idx + 1, WIZARD_STEPS.length - 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goBack = () => {
    setAttemptedNext(false)
    setStepIndex((idx) => Math.max(idx - 1, 0))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Nothing is persisted until this runs — every step above only touches
  // local wizard state. Employee creation happens exactly once per click
  // because isSubmitting disables the button for the rest of this call.
  const handleCreate = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    setSubmissionError(null)

    let employeeId: string
    try {
      const created = await createEmployee.mutateAsync(createEmployeePayload(state.employee))
      employeeId = created.id
    } catch (err) {
      setSubmissionError(err instanceof Error ? err.message : 'Unable to create employee record.')
      setIsSubmitting(false)
      return
    }

    const summary = {
      id: employeeId,
      first_name: state.employee.first_name,
      middle_name: state.employee.middle_name || null,
      last_name: state.employee.last_name,
      work_email: state.employee.work_email,
      start_date: state.employee.start_date || null,
    }

    let invitation: CreationResult['invitation'] = 'deferred'
    let invitationError: string | undefined
    if (state.accessMode === 'invite_now') {
      try {
        await sendInvitation.mutateAsync(employeeId)
        invitation = 'sent'
      } catch (err) {
        invitation = 'failed'
        invitationError = err instanceof Error ? err.message : 'Unable to send invitation.'
      }
    }

    let onboarding: CreationResult['onboarding'] = 'deferred'
    let onboardingError: string | undefined
    let packageTitleSnapshot: string | undefined
    let packageVersionNumber: number | undefined
    if (state.onboardingMode === 'assign_now' && state.packageVersionId) {
      try {
        const assignment = await assignOnboardingPackage({
          employeeId,
          packageVersionId: state.packageVersionId,
          dueDate: state.dueDate,
        })
        onboarding = 'assigned'
        packageTitleSnapshot = assignment.packageTitleSnapshot
        packageVersionNumber = assignment.packageVersionNumber
      } catch (err) {
        onboarding = 'failed'
        onboardingError = employeeOnboardingPersistenceMessage(err, 'Unable to assign this onboarding package.')
      }
    }

    setResult({
      employee: summary,
      invitation,
      invitationError,
      onboarding,
      onboardingError,
      packageTitleSnapshot,
      packageVersionNumber,
      dueDate: state.dueDate,
    })
    setIsSubmitting(false)
  }

  const handleRetryInvitation = async () => {
    if (!result) return
    setIsRetryingInvitation(true)
    try {
      await sendInvitation.mutateAsync(result.employee.id)
      setResult({ ...result, invitation: 'sent', invitationError: undefined })
    } catch (err) {
      setResult({ ...result, invitation: 'failed', invitationError: err instanceof Error ? err.message : 'Unable to send invitation.' })
    } finally {
      setIsRetryingInvitation(false)
    }
  }

  const handleRetryOnboarding = async () => {
    if (!result || !state.packageVersionId) return
    setIsRetryingOnboarding(true)
    try {
      const assignment = await assignOnboardingPackage({
        employeeId: result.employee.id,
        packageVersionId: state.packageVersionId,
        dueDate: state.dueDate,
      })
      setResult({
        ...result,
        onboarding: 'assigned',
        onboardingError: undefined,
        packageTitleSnapshot: assignment.packageTitleSnapshot,
        packageVersionNumber: assignment.packageVersionNumber,
      })
    } catch (err) {
      setResult({ ...result, onboarding: 'failed', onboardingError: employeeOnboardingPersistenceMessage(err) })
    } finally {
      setIsRetryingOnboarding(false)
    }
  }

  if (result) {
    return (
      <EmployeeCreationResult
        result={result}
        isRetryingInvitation={isRetryingInvitation}
        isRetryingOnboarding={isRetryingOnboarding}
        onRetryInvitation={() => void handleRetryInvitation()}
        onRetryOnboarding={() => void handleRetryOnboarding()}
        onViewEmployee={() => navigate(`/hr/employees/${result.employee.id}`)}
        onAddAnother={resetWizard}
      />
    )
  }

  const isLastStep = stepIndex === WIZARD_STEPS.length - 1

  return (
    <div className="dynamic-form">
      <div className="card dynamic-form-header">
        <div className="dynamic-form-header-top">
          <div>
            <p className="dynamic-form-eyebrow">New Employee</p>
            <h1 style={{ margin: 0, fontSize: '1.3rem' }}>{WIZARD_STEPS[stepIndex]}</h1>
          </div>
          <span className="dynamic-form-step-count">
            Step {stepIndex + 1} of {WIZARD_STEPS.length}
          </span>
        </div>
        <WizardStepper activeIndex={stepIndex} />
      </div>

      <div className="card dynamic-form-card">
        {submissionError && (
          <div className="alert alert-error" role="alert">
            <p style={{ margin: 0 }}>{submissionError}</p>
          </div>
        )}

        {stepIndex === 0 && (
          <EmployeeBasicsStep
            values={state.employee}
            showErrors={attemptedNext}
            onChange={(employee) => setState((prev) => ({ ...prev, employee }))}
          />
        )}

        {stepIndex === 1 && (
          <EmployeeAccessStep
            accessMode={state.accessMode}
            email={state.employee.work_email}
            onChangeAccessMode={(accessMode) => setState((prev) => ({ ...prev, accessMode }))}
            onChangeEmail={(work_email) => setState((prev) => ({ ...prev, employee: { ...prev.employee, work_email } }))}
          />
        )}

        {stepIndex === 2 && (
          <EmployeeOnboardingStep
            onboardingMode={state.onboardingMode}
            packageVersionId={state.packageVersionId}
            dueDate={state.dueDate}
            options={packageOptions}
            optionsError={packageOptionsError}
            onChangeOnboardingMode={(onboardingMode) => setState((prev) => ({ ...prev, onboardingMode }))}
            onChangePackageVersionId={(packageVersionId) => setState((prev) => ({ ...prev, packageVersionId }))}
            onChangeDueDate={(dueDate) => setState((prev) => ({ ...prev, dueDate }))}
          />
        )}

        {stepIndex === 3 && <EmployeeReviewStep state={state} packageOptions={packageOptions} />}

        <div className="dynamic-form-nav">
          <button
            type="button"
            onClick={goBack}
            disabled={stepIndex === 0 || isSubmitting}
            className="btn btn-ghost"
            style={{ minHeight: 44, padding: '0.65rem 1.4rem' }}
          >
            Back
          </button>
          {isLastStep ? (
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={isSubmitting}
              className="btn btn-primary"
              style={{ minHeight: 44, padding: '0.65rem 1.4rem' }}
            >
              {isSubmitting ? 'Creating…' : 'Create Employee'}
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              className="btn btn-primary"
              style={{ minHeight: 44, padding: '0.65rem 1.4rem' }}
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
