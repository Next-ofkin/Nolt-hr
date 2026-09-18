import React, { useEffect, useState } from 'react'
import { AlertCircle, Package, Plus } from 'lucide-react'
import {
  cancelOnboardingAssignment,
  listAssignmentsForEmployee,
} from '../data/employee-onboarding-repository'
import {
  employeeOnboardingPersistenceMessage,
  type EmployeeOnboardingAssignment,
} from '../data/employee-onboarding-types'
import { EmployeeOnboardingCard } from './EmployeeOnboardingCard'
import { AssignOnboardingPackageDialog } from './AssignOnboardingPackageDialog'
import { CancelOnboardingDialog } from './CancelOnboardingDialog'
import { toast } from '../../../components/ui/use-toast'

interface EmployeeOnboardingSectionProps {
  employeeId: string
  employeeName: string
  isEmployeeArchived: boolean
}

export const EmployeeOnboardingSection: React.FC<EmployeeOnboardingSectionProps> = ({
  employeeId,
  employeeName,
  isEmployeeArchived,
}) => {
  const [assignments, setAssignments] = useState<EmployeeOnboardingAssignment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<EmployeeOnboardingAssignment | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)

  // Reusable reload, called from event handlers below (never from the
  // mount effect, which fetches inline instead — see loadAssignments'
  // synchronous setIsLoading(true) vs. the lint-clean effect below).
  const loadAssignments = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await listAssignmentsForEmployee(employeeId)
      setAssignments(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load onboarding assignments.'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let isMounted = true
    listAssignmentsForEmployee(employeeId)
      .then((data) => {
        if (isMounted) setAssignments(data)
      })
      .catch((err) => {
        if (isMounted) setError(err instanceof Error ? err.message : 'Failed to load onboarding assignments.')
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })
    return () => {
      isMounted = false
    }
  }, [employeeId])

  const handleCancelConfirm = async (reason: string) => {
    if (!cancelTarget) return
    setIsCancelling(true)
    try {
      await cancelOnboardingAssignment({ assignmentId: cancelTarget.id, reason })
      toast.success('Assignment Cancelled', `"${cancelTarget.packageTitleSnapshot}" has been cancelled.`)
      setCancelTarget(null)
      await loadAssignments()
    } catch (err) {
      toast.error('Cancellation Failed', employeeOnboardingPersistenceMessage(err))
    } finally {
      setIsCancelling(false)
    }
  }

  if (isLoading) {
    return (
      <section className="card">
        <h2>Onboarding</h2>
        <p className="subtitle">Loading onboarding assignments…</p>
      </section>
    )
  }

  return (
    <div className="onboarding-section">
      <div className="page-title-row" style={{ marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Onboarding</h2>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setIsAssignDialogOpen(true)}
          disabled={isEmployeeArchived}
          title={isEmployeeArchived ? 'Archived employees cannot receive a new onboarding assignment.' : undefined}
        >
          <Plus style={{ width: 16, height: 16, marginRight: '0.4rem' }} /> Assign Package
        </button>
      </div>

      {error && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: '1rem' }}>
          <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} /> {error}
          </p>
        </div>
      )}

      {assignments.length === 0 ? (
        <section className="card empty-state section-empty-state">
          <Package style={{ width: 30, height: 30, color: 'var(--text-muted)', margin: '0 auto 0.6rem' }} />
          <h3 style={{ margin: 0, fontWeight: 600 }}>No onboarding package assigned</h3>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)' }}>
            Assign a published onboarding package to begin this employee's onboarding.
          </p>
        </section>
      ) : (
        <div className="onboarding-assignment-list">
          {assignments.map((assignment) => (
            <EmployeeOnboardingCard
              key={assignment.id}
              assignment={assignment}
              onCancel={setCancelTarget}
            />
          ))}
        </div>
      )}

      {isAssignDialogOpen && (
        <AssignOnboardingPackageDialog
          employeeId={employeeId}
          employeeName={employeeName}
          onClose={() => setIsAssignDialogOpen(false)}
          onAssigned={(result) => {
            setIsAssignDialogOpen(false)
            toast.success('Package Assigned', `"${result.packageTitleSnapshot}" assigned to ${employeeName}.`)
            void loadAssignments()
          }}
        />
      )}

      <CancelOnboardingDialog
        isOpen={cancelTarget !== null}
        packageTitle={cancelTarget?.packageTitleSnapshot ?? ''}
        isLoading={isCancelling}
        onConfirm={(reason) => void handleCancelConfirm(reason)}
        onClose={() => setCancelTarget(null)}
      />
    </div>
  )
}
