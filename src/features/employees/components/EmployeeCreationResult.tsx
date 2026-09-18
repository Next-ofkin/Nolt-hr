import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'
import { formatEmployeeName } from '../../../lib/employee-domain'
import { formatOnboardingDate } from '../../employee-onboarding/data/employee-onboarding-types'
import { isFullSuccess, type EmployeeCreationResult as CreationResult } from '../data/employee-wizard'

interface EmployeeCreationResultProps {
  result: CreationResult
  isRetryingInvitation: boolean
  isRetryingOnboarding: boolean
  onRetryInvitation: () => void
  onRetryOnboarding: () => void
  onViewEmployee: () => void
  onAddAnother: () => void
}

export function EmployeeCreationResult({
  result,
  isRetryingInvitation,
  isRetryingOnboarding,
  onRetryInvitation,
  onRetryOnboarding,
  onViewEmployee,
  onAddAnother,
}: EmployeeCreationResultProps) {
  const name = formatEmployeeName(result.employee)
  const allSucceeded = isFullSuccess(result)

  return (
    <div className="card dynamic-form-complete wizard-result">
      <div className="dynamic-form-complete-icon">
        <CheckCircle2 style={{ width: 32, height: 32 }} />
      </div>
      <h2>{name} has been added</h2>
      {!allSucceeded && (
        <p style={{ color: 'var(--text-muted)' }}>
          The employee record was created successfully. A couple of follow-up actions need your attention below.
        </p>
      )}

      <div className="wizard-result-rows">
        <div className="wizard-result-row">
          <span className="wizard-result-label">Employee record</span>
          <span className="badge badge-success">Created</span>
        </div>

        <div className="wizard-result-row">
          <span className="wizard-result-label">Portal invitation</span>
          {result.invitation === 'sent' && <span className="badge badge-success">Sent</span>}
          {result.invitation === 'deferred' && <span className="badge badge-neutral">Not invited</span>}
          {result.invitation === 'failed' && (
            <div className="wizard-result-failure">
              <span className="badge badge-danger">
                <AlertTriangle style={{ width: 12, height: 12 }} /> Could not be sent
              </span>
              {result.invitationError && <p className="wizard-result-error-detail">{result.invitationError}</p>}
              <button type="button" className="btn btn-ghost btn-sm" disabled={isRetryingInvitation} onClick={onRetryInvitation}>
                <RefreshCw style={{ width: 13, height: 13, marginRight: '0.35rem' }} />
                {isRetryingInvitation ? 'Retrying…' : 'Retry Invitation'}
              </button>
            </div>
          )}
        </div>

        <div className="wizard-result-row">
          <span className="wizard-result-label">Onboarding package</span>
          {result.onboarding === 'assigned' && (
            <span className="badge badge-success">
              {result.packageTitleSnapshot}
              {result.packageVersionNumber ? ` — V${result.packageVersionNumber}` : ''}
            </span>
          )}
          {result.onboarding === 'deferred' && <span className="badge badge-neutral">Not assigned</span>}
          {result.onboarding === 'failed' && (
            <div className="wizard-result-failure">
              <span className="badge badge-danger">
                <AlertTriangle style={{ width: 12, height: 12 }} /> Could not be assigned
              </span>
              {result.onboardingError && <p className="wizard-result-error-detail">{result.onboardingError}</p>}
              <button type="button" className="btn btn-ghost btn-sm" disabled={isRetryingOnboarding} onClick={onRetryOnboarding}>
                <RefreshCw style={{ width: 13, height: 13, marginRight: '0.35rem' }} />
                {isRetryingOnboarding ? 'Retrying…' : 'Retry Assignment'}
              </button>
            </div>
          )}
        </div>

        {result.employee.start_date && (
          <div className="wizard-result-row">
            <span className="wizard-result-label">Start date</span>
            <span>{formatOnboardingDate(result.employee.start_date)}</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginTop: '1.5rem' }}>
        <button type="button" className="btn btn-ghost" onClick={onAddAnother}>
          Add Another Employee
        </button>
        <button type="button" className="btn btn-primary" onClick={onViewEmployee}>
          View Employee
        </button>
      </div>
    </div>
  )
}
