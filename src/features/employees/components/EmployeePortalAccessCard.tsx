import { useState } from 'react'
import { Mail, RefreshCw, Send, ShieldOff } from 'lucide-react'
import { useAuth } from '../../../lib/useAuth'
import {
  useResendEmployeeInvitation,
  useRevokeEmployeeInvitation,
  useSendEmployeeInvitation,
} from '../../../lib/employee-queries'
import { formatEmployeeName, getEmployeeAccountState } from '../../../lib/employee-domain'
import { ConfirmDialog } from '../../../components/ui/confirm-dialog'
import { toast } from '../../../components/ui/use-toast'
import type { Employee, EmployeeInvitation } from '../../../lib/database.types'

interface EmployeePortalAccessCardProps {
  employee: Employee
  latestInvitation: EmployeeInvitation | null | undefined
}

function displayDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString()
}

export function EmployeePortalAccessCard({ employee, latestInvitation }: EmployeePortalAccessCardProps) {
  const { sendMagicLink } = useAuth()
  const sendInvite = useSendEmployeeInvitation()
  const resendInvite = useResendEmployeeInvitation()
  const revokeInvite = useRevokeEmployeeInvitation()

  const [confirmAction, setConfirmAction] = useState<'invite' | 'resend' | 'revoke' | null>(null)
  const [isSendingSignInLink, setIsSendingSignInLink] = useState(false)

  const accountState = getEmployeeAccountState(employee, latestInvitation)
  const name = formatEmployeeName(employee)

  const closeConfirm = () => setConfirmAction(null)

  const handleInvite = async () => {
    try {
      await sendInvite.mutateAsync(employee.id)
      toast.success('Invitation Sent', `A secure invitation was sent to ${employee.work_email}.`)
    } catch (err) {
      toast.error('Invitation Failed', err instanceof Error ? err.message : 'Unable to send invitation.')
    } finally {
      closeConfirm()
    }
  }

  const handleResend = async () => {
    try {
      await resendInvite.mutateAsync(employee.id)
      toast.success('Invitation Resent', `A fresh invitation was sent to ${employee.work_email}. The previous link no longer works.`)
    } catch (err) {
      toast.error('Resend Failed', err instanceof Error ? err.message : 'Unable to resend invitation.')
    } finally {
      closeConfirm()
    }
  }

  const handleRevoke = async () => {
    try {
      await revokeInvite.mutateAsync(employee.id)
      toast.success('Invitation Revoked', 'The pending invitation link no longer works.')
    } catch (err) {
      toast.error('Revoke Failed', err instanceof Error ? err.message : 'Unable to revoke invitation.')
    } finally {
      closeConfirm()
    }
  }

  const handleSendSignInLink = async () => {
    setIsSendingSignInLink(true)
    try {
      const { error } = await sendMagicLink(employee.work_email)
      if (error) throw new Error(error)
      toast.success('Sign-In Link Sent', `A one-time sign-in link was sent to ${employee.work_email}.`)
    } catch (err) {
      toast.error('Unable to Send Link', err instanceof Error ? err.message : 'Unable to send a sign-in link.')
    } finally {
      setIsSendingSignInLink(false)
    }
  }

  const isBusy = sendInvite.isPending || resendInvite.isPending || revokeInvite.isPending

  return (
    <>
      <section className="card">
        <h2>Portal Access</h2>

        {accountState === 'NOT_INVITED' && (
          <div className="account-access-state">
            <span className="badge badge-neutral">Not invited</span>
            <p className="state-description">No portal invitation has been sent.</p>
            {employee.status === 'DRAFT' && (
              <button type="button" className="btn btn-primary mt-3" onClick={() => setConfirmAction('invite')}>
                <Send style={{ width: 15, height: 15, marginRight: '0.4rem' }} /> Send Invitation
              </button>
            )}
          </div>
        )}

        {accountState === 'PENDING' && (
          <div className="account-access-state">
            <span className="badge badge-warning">Invitation Pending</span>
            <dl className="detail-list mt-3">
              <dt>Sent</dt>
              <dd>{displayDate(latestInvitation?.sent_at || employee.invited_at)}</dd>
            </dl>
            <div className="package-card-actions mt-3">
              <button type="button" className="btn btn-ghost" disabled={isBusy} onClick={() => setConfirmAction('resend')}>
                <RefreshCw style={{ width: 15, height: 15, marginRight: '0.4rem' }} /> Resend Invitation
              </button>
              <button type="button" className="btn btn-danger" disabled={isBusy} onClick={() => setConfirmAction('revoke')}>
                <ShieldOff style={{ width: 15, height: 15, marginRight: '0.4rem' }} /> Revoke Invitation
              </button>
            </div>
          </div>
        )}

        {accountState === 'ACTIVE' && (
          <div className="account-access-state">
            <span className="badge badge-success">Active</span>
            <dl className="detail-list mt-3">
              <dt>Account linked</dt>
              <dd>Yes</dd>
              <dt>Email</dt>
              <dd>{employee.work_email}</dd>
              <dt>Activated</dt>
              <dd>{displayDate(employee.account_activated_at || latestInvitation?.accepted_at)}</dd>
            </dl>
            <button
              type="button"
              className="btn btn-ghost mt-3"
              disabled={isSendingSignInLink}
              onClick={() => void handleSendSignInLink()}
            >
              <Mail style={{ width: 15, height: 15, marginRight: '0.4rem' }} />
              {isSendingSignInLink ? 'Sending…' : 'Send Sign-In Link'}
            </button>
          </div>
        )}

        {accountState === 'FAILED' && (
          <div className="account-access-state">
            <span className="badge badge-danger">Invitation Failed</span>
            <p className="state-description">
              The invitation could not be completed.
              {latestInvitation?.failure_code && ` (${latestInvitation.failure_code})`}
            </p>
            {employee.status === 'DRAFT' && (
              <button type="button" className="btn btn-primary mt-3" onClick={() => setConfirmAction('invite')}>
                <Send style={{ width: 15, height: 15, marginRight: '0.4rem' }} /> Retry Invitation
              </button>
            )}
          </div>
        )}
      </section>

      <ConfirmDialog
        isOpen={confirmAction === 'invite'}
        title={`Invite ${name}?`}
        description={`This person will receive a secure link at ${employee.work_email} to activate their NOLT HR portal access.`}
        confirmText="Send Invitation"
        variant="primary"
        icon="help"
        isLoading={sendInvite.isPending}
        onConfirm={() => void handleInvite()}
        onClose={closeConfirm}
      />

      <ConfirmDialog
        isOpen={confirmAction === 'resend'}
        title={`Resend invitation to ${name}?`}
        description="The previous invitation link will stop working and a fresh one will be sent to the same email address."
        confirmText="Resend Invitation"
        variant="warning"
        icon="restore"
        isLoading={resendInvite.isPending}
        onConfirm={() => void handleResend()}
        onClose={closeConfirm}
      />

      <ConfirmDialog
        isOpen={confirmAction === 'revoke'}
        title={`Revoke invitation for ${name}?`}
        description="The pending invitation link will stop working immediately. The employee record is not affected, and you can invite them again later."
        confirmText="Revoke Invitation"
        variant="danger"
        icon="trash"
        isLoading={revokeInvite.isPending}
        onConfirm={() => void handleRevoke()}
        onClose={closeConfirm}
      />
    </>
  )
}
