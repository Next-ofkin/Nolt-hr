import { Link, useNavigate, useParams } from 'react-router-dom'
import { EmployeeForm } from '../components/EmployeeForm'
import {
  useDepartments,
  useEmployee,
  useEmploymentTypes,
  useUpdateEmployee,
} from '../lib/employee-queries'
import {
  archiveEmployeePayload,
  formatEmployeeName,
  updateEmployeePayload,
  type EmployeeFormValues,
} from '../lib/employee-domain'

export default function EditEmployeePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const employeeQuery = useEmployee(id)
  const departments = useDepartments()
  const employmentTypes = useEmploymentTypes()
  const updateEmployee = useUpdateEmployee(id)
  const employee = employeeQuery.data

  const onSubmit = async (values: EmployeeFormValues) => {
    await updateEmployee.mutateAsync(updateEmployeePayload(values))
    navigate(`/hr/employees/${id}`)
  }

  const onArchive = async () => {
    if (!employee || !window.confirm(`Archive ${formatEmployeeName(employee)}? The record will be retained.`)) {
      return
    }
    await updateEmployee.mutateAsync(archiveEmployeePayload())
    navigate(`/hr/employees/${id}`)
  }

  if (employeeQuery.isLoading || departments.isLoading || employmentTypes.isLoading) {
    return <div className="page"><p>Loading employee form…</p></div>
  }

  if (employeeQuery.error || departments.error || employmentTypes.error) {
    return <div className="page"><p className="error">Unable to load this employee.</p></div>
  }

  if (!employee) {
    return <div className="page"><h1>Employee not found</h1><Link to="/hr/employees">Back to employees</Link></div>
  }

  return (
    <div className="page employee-page narrow-page">
      <Link className="back-link" to={`/hr/employees/${employee.id}`}>← Back to employee</Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Employee lifecycle</p>
          <h1>Edit {formatEmployeeName(employee)}</h1>
          <p className="subtitle">Update employment details and lifecycle status.</p>
        </div>
      </div>
      <EmployeeForm
        employee={employee}
        departments={departments.data ?? []}
        employmentTypes={employmentTypes.data ?? []}
        includeStatus
        submitLabel="Save Changes"
        isSubmitting={updateEmployee.isPending}
        error={updateEmployee.error?.message}
        onSubmit={onSubmit}
      />
      {employee.status !== 'ARCHIVED' && (
        <section className="card danger-zone">
          <div>
            <h2>Archive employee</h2>
            <p>Remove this employee from active lifecycle work without deleting their record.</p>
          </div>
          <button
            className="btn btn-danger"
            type="button"
            disabled={updateEmployee.isPending}
            onClick={() => void onArchive()}
          >
            Archive Employee
          </button>
        </section>
      )}
    </div>
  )
}
