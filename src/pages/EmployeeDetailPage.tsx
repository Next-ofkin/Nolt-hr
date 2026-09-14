import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmployeeStatusBadge } from '../components/EmployeeStatusBadge'
import { useEmployee } from '../lib/employee-queries'
import { formatEmployeeName } from '../lib/employee-domain'

const detailSections = ['Overview', 'Onboarding', 'Forms', 'Documents', 'Activity'] as const
type DetailSection = (typeof detailSections)[number]

const emptyStates: Record<Exclude<DetailSection, 'Overview'>, string> = {
  Onboarding: 'No onboarding package has been assigned yet.',
  Forms: 'No employee forms have been assigned yet.',
  Documents: 'No employee documents are available yet.',
  Activity: 'No lifecycle activity has been recorded yet.',
}

function displayDate(value: string | null) {
  return value ? new Date(value.includes('T') ? value : `${value}T00:00:00`).toLocaleDateString() : '—'
}

export default function EmployeeDetailPage() {
  const { id } = useParams()
  const employeeQuery = useEmployee(id)
  const [section, setSection] = useState<DetailSection>('Overview')
  const employee = employeeQuery.data

  if (employeeQuery.isLoading) return <div className="page"><p>Loading employee…</p></div>
  if (employeeQuery.error) return <div className="page"><p className="error">Unable to load this employee.</p></div>
  if (!employee) return <div className="page"><h1>Employee not found</h1><Link to="/hr/employees">Back to employees</Link></div>

  return (
    <div className="page employee-page">
      <Link className="back-link" to="/hr/employees">← Back to employees</Link>
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
          <button className="btn btn-ghost" type="button" disabled title="Coming next">
            Invite Employee — Coming next
          </button>
          <Link className="btn btn-primary" to={`/hr/employees/${employee.id}/edit`}>
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
            <h2>Record information</h2>
            <dl className="detail-list">
              <dt>Account Status</dt>
              <dd>{employee.auth_user_id ? 'Account linked' : 'Not yet linked to a user account'}</dd>
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
    </div>
  )
}
