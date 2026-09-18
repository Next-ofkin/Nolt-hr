import { formatEmployeeName } from '../../../lib/employee-domain'
import { formatOnboardingDate } from '../../employee-onboarding/data/employee-onboarding-types'
import type { PublishedPackageVersionOption } from '../../employee-onboarding/data/employee-onboarding-repository'
import type { EmployeeWizardState } from '../data/employee-wizard'

interface EmployeeReviewStepProps {
  state: EmployeeWizardState
  packageOptions: PublishedPackageVersionOption[]
}

function displayDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function EmployeeReviewStep({ state, packageOptions }: EmployeeReviewStepProps) {
  const { employee, accessMode, onboardingMode, packageVersionId, dueDate } = state
  const selectedPackage = packageOptions.find((o) => o.packageVersionId === packageVersionId)

  return (
    <div>
      <h2 className="dynamic-form-step-title">Review New Employee</h2>
      <p className="dynamic-form-step-desc">Check the details below before creating this employee record.</p>

      <div className="wizard-review-section">
        <p className="wizard-review-heading">Employee</p>
        <p className="wizard-review-primary">{formatEmployeeName({ first_name: employee.first_name, middle_name: employee.middle_name, last_name: employee.last_name })}</p>
        {employee.job_title && <p className="wizard-review-secondary">{employee.job_title}</p>}
        <p className="wizard-review-secondary">{employee.work_email}</p>
        {employee.start_date && <p className="wizard-review-secondary">Starts {displayDate(employee.start_date)}</p>}
      </div>

      <div className="wizard-review-section">
        <p className="wizard-review-heading">Portal Access</p>
        {accessMode === 'invite_now' ? (
          <p className="wizard-review-primary">Invitation will be sent to {employee.work_email}</p>
        ) : (
          <p className="wizard-review-primary">Portal invitation: Send later</p>
        )}
      </div>

      <div className="wizard-review-section">
        <p className="wizard-review-heading">Onboarding</p>
        {onboardingMode === 'assign_now' && selectedPackage ? (
          <>
            <p className="wizard-review-primary">{selectedPackage.title} — Published V{selectedPackage.versionNumber}</p>
            {dueDate && <p className="wizard-review-secondary">Due {formatOnboardingDate(dueDate)}</p>}
          </>
        ) : (
          <p className="wizard-review-primary">Onboarding package: Assign later</p>
        )}
      </div>
    </div>
  )
}
