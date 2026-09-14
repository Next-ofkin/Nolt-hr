import { useEffect } from 'react'
import { EmployeeStatusBadge } from '../components/EmployeeStatusBadge'
import { useActivateEmployeeAccount, useMyEmployee } from '../lib/employee-queries'

function displayDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value.includes('T') ? value : `${value}T00:00:00`).toLocaleDateString()
}

export default function EmployeePortalPage() {
  const { data: employee, isLoading, error } = useMyEmployee()
  const { mutate: activateAccount } = useActivateEmployeeAccount()

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

        <section className="card">
          <h2>Your Onboarding</h2>
          <p className="mt-2" style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
            No onboarding package has been assigned yet.
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.35rem' }}>
            Your onboarding requirements will appear here once Human Resources assigns a package.
          </p>
        </section>
      </div>
    </div>
  )
}
