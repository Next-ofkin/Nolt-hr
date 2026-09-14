import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import { EmployeeStatusBadge } from '../components/EmployeeStatusBadge'
import { EMPLOYEE_PAGE_SIZE, useEmployeeDirectory } from '../lib/employee-queries'
import {
  EMPLOYEE_STATUSES,
  EMPLOYEE_STATUS_LABELS,
  employeeDirectoryRow,
  hasActiveEmployeeFilters,
  type EmployeeFilters,
} from '../lib/employee-domain'
import type { EmployeeStatus } from '../lib/database.types'

const initialFilters: EmployeeFilters = {
  search: '',
  status: '',
  page: 1,
}

export default function EmployeesPage() {
  const [filters, setFilters] = useState(initialFilters)
  const directory = useEmployeeDirectory(filters)
  const employees = directory.data?.employees ?? []
  const total = directory.data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / EMPLOYEE_PAGE_SIZE))
  const filtersActive = hasActiveEmployeeFilters(filters)

  const updateFilter = <K extends keyof EmployeeFilters>(key: K, value: EmployeeFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value, page: key === 'page' ? Number(value) : 1 }))
  }

  const clearFilters = () => setFilters(initialFilters)

  return (
    <div className="page employee-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Employee lifecycle</p>
          <h1>Employees</h1>
          <p className="subtitle">Manage employee records and lifecycle information.</p>
        </div>
        <Link className="btn btn-primary" to="/hr/employees/new">Add Employee</Link>
      </div>

      <div className="metric-card">
        <span>Total employees</span>
        <strong>{total}</strong>
      </div>

      <section className="card directory-card" aria-label="Employee directory">
        <div className="directory-filters directory-filters-compact">
          <div className="field search-field">
            <label htmlFor="employee-search">Search employees</label>
            <input
              id="employee-search"
              type="search"
              placeholder="Name, email or staff ID"
              value={filters.search}
              onChange={(event) => updateFilter('search', event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="status-filter">Status</label>
            <select
              id="status-filter"
              value={filters.status}
              onChange={(event) => updateFilter('status', event.target.value as EmployeeStatus | '')}
            >
              <option value="">All statuses</option>
              {EMPLOYEE_STATUSES.map((status) => (
                <option key={status} value={status}>{EMPLOYEE_STATUS_LABELS[status]}</option>
              ))}
            </select>
          </div>
        </div>

        {directory.error && <p className="error">Unable to load employee records.</p>}
        {directory.isLoading && <p className="empty-state">Loading employees…</p>}
        {!directory.isLoading && !directory.error && employees.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Users size={22} aria-hidden="true" />
            </div>
            {filtersActive ? (
              <>
                <h2>No employees match your filters.</h2>
                <p>Try adjusting or clearing your search and filters.</p>
                <button type="button" className="btn btn-ghost" onClick={clearFilters}>
                  Clear Filters
                </button>
              </>
            ) : (
              <>
                <h2>No employees yet</h2>
                <p>Create your first employee record to start managing their lifecycle.</p>
                <Link className="btn btn-primary" to="/hr/employees/new">
                  Add Employee
                </Link>
              </>
            )}
          </div>
        )}
        {!directory.isLoading && employees.length > 0 && (
          <div className="table-scroll">
            <table className="table employee-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Staff ID</th>
                  <th>Work Email</th>
                  <th>Job Title</th>
                  <th>Start Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => {
                  const row = employeeDirectoryRow(employee)
                  return (
                    <tr key={row.id}>
                      <td><strong>{row.name}</strong></td>
                      <td>{row.staffId}</td>
                      <td>{row.workEmail}</td>
                      <td>{row.jobTitle}</td>
                      <td>{row.startDate ? new Date(`${row.startDate}T00:00:00`).toLocaleDateString() : '—'}</td>
                      <td><EmployeeStatusBadge status={row.status} /></td>
                      <td>
                        <div className="table-actions">
                          <Link to={`/hr/employees/${row.id}`}>View</Link>
                          <Link to={`/hr/employees/${row.id}/edit`}>Edit</Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {total > EMPLOYEE_PAGE_SIZE && (
          <div className="pagination">
            <button
              className="btn btn-ghost"
              type="button"
              disabled={filters.page === 1}
              onClick={() => updateFilter('page', filters.page - 1)}
            >
              Previous
            </button>
            <span>Page {filters.page} of {totalPages}</span>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={filters.page >= totalPages}
              onClick={() => updateFilter('page', filters.page + 1)}
            >
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
