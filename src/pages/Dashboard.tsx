import { Link, Navigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, PlusCircle, ShieldCheck, Users } from 'lucide-react'
import { useCurrentProfile } from '../lib/queries'
import { useAuth } from '../lib/useAuth'
import { getGreeting, deriveNeedsAttention } from '../lib/dashboard'
import { EMPLOYEE_STATUS_LABELS, formatEmployeeName } from '../lib/employee-domain'
import { useEmployeeStatusCounts, useRecentEmployees } from '../lib/employee-queries'
import { EmployeeStatusBadge } from '../components/EmployeeStatusBadge'
import type { EmployeeStatus, UserRole } from '../lib/database.types'

const SECONDARY_STATUSES = [
  'INVITED',
  'READY_TO_RESUME',
  'POST_ONBOARDING',
  'COMPLETED',
] as const satisfies readonly EmployeeStatus[]

function firstNameOf(fullName: string | null | undefined) {
  return fullName?.trim().split(/\s+/)[0] ?? null
}

function displayDate(value: string | null) {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString() : '—'
}

export default function Dashboard() {
  const { user } = useAuth()
  const { data: profile } = useCurrentProfile()
  const role = profile?.role ?? null

  if (role === 'employee') {
    return <Navigate to="/employee" replace />
  }

  if (role === 'admin' || role === 'hr') {
    return <HrDashboard role={role} firstName={firstNameOf(profile?.full_name)} />
  }

  return <WelcomeDashboard name={profile?.full_name ?? user?.email ?? null} />
}

function WelcomeDashboard({ name }: { name: string | null }) {
  return (
    <div className="page">
      <div className="card dashboard-greeting">
        <h1>{getGreeting(new Date(), name)}</h1>
        <p className="subtitle">Welcome to the NOLT HR portal.</p>
      </div>
    </div>
  )
}

function HrDashboard({ role, firstName }: { role: UserRole; firstName: string | null }) {
  const statusCounts = useEmployeeStatusCounts(true)
  const recentEmployees = useRecentEmployees(5, true)
  const counts = statusCounts.data?.counts ?? ({} as Record<EmployeeStatus, number>)
  const total = statusCounts.data?.total ?? 0
  const needsAttention = deriveNeedsAttention(counts)
  const recent = recentEmployees.data ?? []

  return (
    <div className="page employee-page">
      <div className="dashboard-greeting">
        <h1>{getGreeting(new Date(), firstName)}</h1>
        <p className="subtitle">Here&apos;s what&apos;s happening across your workforce.</p>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <span>Total Employees</span>
          <strong>{total}</strong>
        </div>
        <div className="metric-card">
          <span>{EMPLOYEE_STATUS_LABELS.DRAFT}</span>
          <strong>{counts.DRAFT ?? 0}</strong>
        </div>
        <div className="metric-card">
          <span>{EMPLOYEE_STATUS_LABELS.PRE_ONBOARDING}</span>
          <strong>{counts.PRE_ONBOARDING ?? 0}</strong>
        </div>
        <div className="metric-card">
          <span>{EMPLOYEE_STATUS_LABELS.HR_REVIEW}</span>
          <strong>{counts.HR_REVIEW ?? 0}</strong>
        </div>
      </div>

      <div className="status-summary-row">
        {SECONDARY_STATUSES.map((status) => (
          <span className="status-summary-item" key={status}>
            {EMPLOYEE_STATUS_LABELS[status]} <strong>{counts[status] ?? 0}</strong>
          </span>
        ))}
      </div>

      <section className="card">
        <h2>Quick Actions</h2>
        <div className="quick-actions">
          <Link className="btn btn-primary" to="/hr/employees/new">
            <PlusCircle size={16} aria-hidden="true" /> Add Employee
          </Link>
          <Link className="btn btn-ghost" to="/hr/employees">
            <Users size={16} aria-hidden="true" /> View Employees
          </Link>
          {role === 'admin' && (
            <Link className="btn btn-ghost" to="/admin">
              <ShieldCheck size={16} aria-hidden="true" /> Manage User Access
            </Link>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Recent Employees</h2>
        {recentEmployees.isLoading && <p>Loading…</p>}
        {!recentEmployees.isLoading && recent.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Users size={22} aria-hidden="true" />
            </div>
            <h2>No employee records yet.</h2>
            <p>Create your first employee record to get started.</p>
            <Link className="btn btn-primary" to="/hr/employees/new">
              Add Employee
            </Link>
          </div>
        )}
        {!recentEmployees.isLoading && recent.length > 0 && (
          <div className="table-scroll">
            <table className="table recent-employees-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Job Title</th>
                  <th>Status</th>
                  <th>Start Date</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((employee) => (
                  <tr key={employee.id}>
                    <td>
                      <Link to={`/hr/employees/${employee.id}`}>{formatEmployeeName(employee)}</Link>
                    </td>
                    <td>{employee.job_title ?? '—'}</td>
                    <td>
                      <EmployeeStatusBadge status={employee.status} />
                    </td>
                    <td>{displayDate(employee.start_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card attention-card">
        <h2>Needs Attention</h2>
        {needsAttention.length === 0 ? (
          <p className="attention-clear">
            <CheckCircle2 size={16} aria-hidden="true" /> You&apos;re all caught up.
          </p>
        ) : (
          <ul className="attention-list">
            {needsAttention.map((entry) => (
              <li className="attention-item" key={entry.status}>
                <AlertTriangle size={16} aria-hidden="true" /> {entry.message}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
