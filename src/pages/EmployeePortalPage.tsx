import { useEffect } from 'react'
import { Package } from 'lucide-react'
import { EmployeeStatusBadge } from '../components/EmployeeStatusBadge'
import { useActivateEmployeeAccount, useMyEmployee } from '../lib/employee-queries'
import { useMyOnboardingAssignments, useStartMyOnboarding } from '../features/employee-onboarding/data/employee-onboarding-queries'
import { MyOnboardingCard } from '../features/employee-onboarding/components/MyOnboardingCard'
import { toast } from '../components/ui/use-toast'
import { employeeOnboardingPersistenceMessage } from '../features/employee-onboarding/data/employee-onboarding-types'

function displayDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value.includes('T') ? value : `${value}T00:00:00`).toLocaleDateString()
}

export default function EmployeePortalPage() {
  const { data: employee, isLoading, error } = useMyEmployee()
  const { mutate: activateAccount } = useActivateEmployeeAccount()
  const { data: assignments, isLoading: isLoadingOnboarding } = useMyOnboardingAssignments(Boolean(employee))
  const { mutate: startOnboarding, isPending: isStarting, variables: startingAssignmentId } = useStartMyOnboarding()

  useEffect(() => {
    // Invoke activation RPC on mount for authenticated user
    activateAccount()
  }, [activateAccount])

  if (isLoading) {
    return (
      <div className="page">
        <p>Loading your portal…</p>
      </div>
    )
  }

  if (error || !employee) {
    return (
      <div className="page employee-portal-unlinked">
        <div className="card text-center" style={{ maxWidth: '540px', margin: '3rem auto', padding: '2rem' }}>
          <h2>Employee account not linked</h2>
          <p className="mt-2" style={{ color: 'var(--text-muted)' }}>
            Your account is signed in, but it is not connected to an employee record. Please contact Human Resources.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="page employee-portal-page">
      <div className="portal-header mb-4">
        <p className="eyebrow" style={{ letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--primary)', fontWeight: 700 }}>
          NOLT FINANCE
        </p>
        <h1>EMPLOYEE PORTAL</h1>
        <p style={{ fontSize: '1.1rem', color: 'var(--text-strong)', marginTop: '0.25rem' }}>
          Welcome, {employee.first_name}
        </p>
      </div>

      <div className="detail-grid mb-4">
        <section className="card">
          <h2>Your employment profile</h2>
          <dl className="detail-list">
            <dt>Job Title</dt>
            <dd>{employee.job_title ?? '—'}</dd>

            <dt>Staff ID</dt>
            <dd>{employee.staff_id ?? '—'}</dd>

            <dt>Work Email</dt>
            <dd>{employee.work_email}</dd>

            <dt>Start Date</dt>
            <dd>{displayDate(employee.start_date)}</dd>

            <dt>Lifecycle Status</dt>
            <dd>
              <EmployeeStatusBadge status={employee.status} />
            </dd>
          </dl>
        </section>
      </div>

      <div className="onboarding-section">
        <h2 style={{ marginBottom: '1rem' }}>My Onboarding</h2>

        {isLoadingOnboarding ? (
          <section className="card">
            <p className="subtitle">Loading your onboarding…</p>
          </section>
        ) : !assignments || assignments.length === 0 ? (
          <section className="card empty-state section-empty-state">
            <Package style={{ width: 30, height: 30, color: 'var(--text-muted)', margin: '0 auto 0.6rem' }} />
            <h3 style={{ margin: 0, fontWeight: 600 }}>No onboarding tasks have been assigned yet.</h3>
            <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)' }}>
              Your onboarding requirements will appear here once Human Resources assigns a package.
            </p>
          </section>
        ) : (
          <div className="onboarding-assignment-list">
            {assignments.map((assignment) => (
              <MyOnboardingCard
                key={assignment.id}
                assignment={assignment}
                isStarting={isStarting && startingAssignmentId === assignment.id}
                onStart={(target) =>
                  startOnboarding(target.id, {
                    onError: (err) => toast.error('Unable to Start Onboarding', employeeOnboardingPersistenceMessage(err)),
                  })
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
