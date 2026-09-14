import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmployeeStatusBadge } from '../components/EmployeeStatusBadge'
import { useEmployee, useLatestEmployeeInvitation, useSendEmployeeInvitation } from '../lib/employee-queries'
import { formatEmployeeName, getEmployeeAccountState } from '../lib/employee-domain'

const detailSections = ['Overview', 'Onboarding', 'Forms', 'Documents', 'Activity'] as const
type DetailSection = (typeof detailSections)[number]

const emptyStates: Record<Exclude<DetailSection, 'Overview'>, string> = {
  Onboarding: 'No onboarding package has been assigned yet.',
  Forms: 'No employee forms have been assigned yet.',
  Documents: 'No employee documents are available yet.',
  Activity: 'No lifecycle activity has been recorded yet.',
}

function displayDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value.includes('T') ? value : `${value}T00:00:00`).toLocaleDateString()
}

export default function EmployeeDetailPage() {
  const { id } = useParams()
  const employeeQuery = useEmployee(id)
  const invitationQuery = useLatestEmployeeInvitation(id)
  const sendInviteMutation = useSendEmployeeInvitation()

  const [section, setSection] = useState<DetailSection>('Overview')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const employee = employeeQuery.data
  const latestInvitation = invitationQuery.data
  const accountState = getEmployeeAccountState(employee, latestInvitation)

  if (employeeQuery.isLoading || invitationQuery.isLoading) {
    return <div className="page"><p>Loading employee record…</p></div>
  }
  if (employeeQuery.error) {
    return <div className="page"><p className="error">Unable to load this employee.</p></div>
  }
  if (!employee) {
    return (
      <div className="page">
        <h1>Employee not found</h1>
        <Link to="/hr/employees">Back to employees</Link>
      </div>
    )
  }

  const handleSendInvite = async () => {
    setInviteError(null)
    try {
      await sendInviteMutation.mutateAsync(employee.id)
      setIsModalOpen(false)
      setSuccessMessage(`Invitation successfully sent to ${employee.work_email}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send invitation.'
      setInviteError(msg)
    }
  }

  const canInvite = (accountState === 'NOT_INVITED' || accountState === 'FAILED') && employee.status === 'DRAFT'

  return (
    <div className="page employee-page">
      <Link className="back-link" to="/hr/employees">← Back to employees</Link>

      {successMessage && (
        <div className="alert alert-success mb-4" role="status">
          <p>{successMessage}</p>
          <button type="button" className="btn-close" onClick={() => setSuccessMessage(null)}>✕</button>
        </div>
      )}

      <div className="page-heading employee-detail-heading">
        <div>
          <p className="eyebrow">Employee record</p>
          <h1>{formatEmployeeName(employee)}</h1>
          <div className="heading-meta">
            <EmployeeStatusBadge status={employee.status} />
            <span>{employee.job_title ?? 'Job title not set'}</span>
          </div>
        </div>
        <div className="page-actions">
          {canInvite && (
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                setInviteError(null)
                setIsModalOpen(true)
              }}
            >
              Send Invitation
            </button>
          )}
          <Link className="btn btn-secondary" to={`/hr/employees/${employee.id}/edit`}>
            Edit Employee
          </Link>
        </div>
      </div>

      <nav className="detail-tabs" aria-label="Employee record sections">
        {detailSections.map((item) => (
          <button
            key={item}
            type="button"
            className={section === item ? 'detail-tab active' : 'detail-tab'}
            onClick={() => setSection(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      {section === 'Overview' ? (
        <div className="detail-grid">
          <section className="card">
            <h2>Employment details</h2>
            <dl className="detail-list">
              <dt>Full Name</dt><dd>{formatEmployeeName(employee)}</dd>
              <dt>Staff ID</dt><dd>{employee.staff_id ?? '—'}</dd>
              <dt>Work Email</dt><dd>{employee.work_email}</dd>
              <dt>Phone</dt><dd>{employee.phone ?? '—'}</dd>
              <dt>Job Title</dt><dd>{employee.job_title ?? '—'}</dd>
              <dt>Start Date</dt><dd>{displayDate(employee.start_date)}</dd>
              <dt>Lifecycle Status</dt><dd><EmployeeStatusBadge status={employee.status} /></dd>
            </dl>
          </section>

          <section className="card">
            <h2>ACCOUNT ACCESS</h2>

            {accountState === 'NOT_INVITED' && (
              <div className="account-access-state">
                <span className="badge badge-neutral">Not yet invited</span>
                <p className="state-description">This employee does not have access to the Employee Portal.</p>
                {canInvite && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm mt-3"
                    onClick={() => {
                      setInviteError(null)
                      setIsModalOpen(true)
                    }}
                  >
                    Send Invitation
                  </button>
                )}
              </div>
            )}

            {accountState === 'PENDING' && (
              <div className="account-access-state">
                <span className="badge badge-warning">Invitation sent</span>
                <p className="state-description">Waiting for the employee to accept their invitation.</p>
                <dl className="detail-list mt-3">
                  <dt>Sent Date</dt>
                  <dd>{displayDate(latestInvitation?.sent_at || employee.invited_at)}</dd>
                </dl>
              </div>
            )}

            {accountState === 'ACTIVE' && (
              <div className="account-access-state">
                <span className="badge badge-success">Account active</span>
                <p className="state-description">The employee has activated their NOLT HR account.</p>
                <dl className="detail-list mt-3">
                  <dt>Activated Date</dt>
                  <dd>{displayDate(employee.account_activated_at || latestInvitation?.accepted_at)}</dd>
                </dl>
              </div>
            )}

            {accountState === 'FAILED' && (
              <div className="account-access-state">
                <span className="badge badge-danger">Invitation failed</span>
                <p className="state-description">
                  The invitation could not be completed.
                  {latestInvitation?.failure_code && ` (${latestInvitation.failure_code})`}
                </p>
                {canInvite && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm mt-3"
                    onClick={() => {
                      setInviteError(null)
                      setIsModalOpen(true)
                    }}
                  >
                    Retry Invitation
                  </button>
                )}
              </div>
            )}

            <hr style={{ margin: '1.5rem 0', borderColor: 'var(--border)' }} />

            <h2>Record information</h2>
            <dl className="detail-list">
              <dt>Auth Account</dt>
              <dd>{employee.auth_user_id ? 'Linked' : 'Unlinked'}</dd>
              <dt>Created Date</dt><dd>{displayDate(employee.created_at)}</dd>
              <dt>Updated Date</dt><dd>{displayDate(employee.updated_at)}</dd>
            </dl>
          </section>
        </div>
      ) : (
        <section className="card empty-state section-empty-state">
          <h2>{section}</h2>
          <p>{emptyStates[section]}</p>
        </section>
      )}

      {/* Confirmation Modal */}
      {isModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-card">
            <h2 id="modal-title">Invite {formatEmployeeName(employee)}?</h2>
            <p className="modal-email"><strong>{employee.work_email}</strong></p>
            <p className="modal-description">
              This person will receive access to the NOLT Finance Employee Portal.
            </p>

            {inviteError && (
              <div className="alert alert-error my-3" role="alert">
                <p>{inviteError}</p>
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={sendInviteMutation.isPending}
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={sendInviteMutation.isPending}
                onClick={handleSendInvite}
              >
                {sendInviteMutation.isPending ? 'Sending Invitation…' : 'Send Invitation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
