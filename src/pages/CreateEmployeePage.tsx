import { Link, useNavigate } from 'react-router-dom'
import { EmployeeForm } from '../components/EmployeeForm'
import { useCreateEmployee, useDepartments, useEmploymentTypes } from '../lib/employee-queries'
import { createEmployeePayload, type EmployeeFormValues } from '../lib/employee-domain'

export default function CreateEmployeePage() {
  const navigate = useNavigate()
  const departments = useDepartments()
  const employmentTypes = useEmploymentTypes()
  const createEmployee = useCreateEmployee()

  const onSubmit = async (values: EmployeeFormValues) => {
    const employee = await createEmployee.mutateAsync(createEmployeePayload(values))
    navigate(`/hr/employees/${employee.id}`)
  }

  if (departments.isLoading || employmentTypes.isLoading) {
    return <div className="page"><p>Loading employee form…</p></div>
  }

  if (departments.error || employmentTypes.error) {
    return <div className="page"><p className="error">Unable to load departments and employment types.</p></div>
  }

  return (
    <div className="page employee-page narrow-page">
      <Link className="back-link" to="/hr/employees">← Back to employees</Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Employee lifecycle</p>
          <h1>Add Employee</h1>
          <p className="subtitle">Create the employee’s HR business record.</p>
        </div>
      </div>
      <EmployeeForm
        departments={departments.data ?? []}
        employmentTypes={employmentTypes.data ?? []}
        submitLabel="Create Employee"
        isSubmitting={createEmployee.isPending}
        error={createEmployee.error?.message}
        onSubmit={onSubmit}
      />
    </div>
  )
}
