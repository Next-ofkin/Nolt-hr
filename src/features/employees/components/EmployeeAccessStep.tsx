import type { AccessMode } from '../data/employee-wizard'

interface EmployeeAccessStepProps {
  accessMode: AccessMode
  email: string
  onChangeAccessMode: (mode: AccessMode) => void
  onChangeEmail: (email: string) => void
}

export function EmployeeAccessStep({ accessMode, email, onChangeAccessMode, onChangeEmail }: EmployeeAccessStepProps) {
  return (
    <div>
      <h2 className="dynamic-form-step-title">Portal Access</h2>
      <p className="dynamic-form-step-desc">How would you like to give this employee access?</p>

      <div className="wizard-choice-group" role="radiogroup" aria-label="Portal access timing">
        <label
          role="radio"
          tabIndex={0}
          aria-checked={accessMode === 'invite_now'}
          onClick={() => onChangeAccessMode('invite_now')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onChangeAccessMode('invite_now')
            }
          }}
          className={`wizard-choice-card${accessMode === 'invite_now' ? ' selected' : ''}`}
        >
          <span className="wizard-choice-dot" />
          <div>
            <span className="wizard-choice-title">Send invitation now</span>
            <p className="wizard-choice-desc">The employee receives a secure link to activate their portal access right away.</p>
          </div>
        </label>

        <label
          role="radio"
          tabIndex={0}
          aria-checked={accessMode === 'invite_later'}
          onClick={() => onChangeAccessMode('invite_later')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onChangeAccessMode('invite_later')
            }
          }}
          className={`wizard-choice-card${accessMode === 'invite_later' ? ' selected' : ''}`}
        >
          <span className="wizard-choice-dot" />
          <div>
            <span className="wizard-choice-title">Send invitation later</span>
            <p className="wizard-choice-desc">
              The employee record will be created without portal access. You can send an invitation later from the employee's Access tab.
            </p>
          </div>
        </label>
      </div>

      {accessMode === 'invite_now' && (
        <div className="field mt-4">
          <label htmlFor="wiz_invite_email">Invitation email</label>
          <input
            id="wiz_invite_email"
            type="email"
            value={email}
            onChange={(e) => onChangeEmail(e.target.value)}
          />
          <p className="form-note">
            The employee will receive a secure link to activate their NOLT HR portal access.
          </p>
        </div>
      )}
    </div>
  )
}
