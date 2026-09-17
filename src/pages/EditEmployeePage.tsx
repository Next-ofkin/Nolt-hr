import React, { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EmployeeForm } from '../components/EmployeeForm'
import { useEmployee, useUpdateEmployee } from '../lib/employee-queries'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { toast } from '../components/ui/use-toast'
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
  const updateEmployee = useUpdateEmployee(id)
  const employee = employeeQuery.data

  const [isConfirmOpen, setIsConfirmOpen] = useState(false)

  const onSubmit = async (values: EmployeeFormValues) => {
    try {
      await updateEmployee.mutateAsync(updateEmployeePayload(values))
      toast.success('Employee Updated', 'Employee details saved successfully.')
      navigate(`/hr/employees/${id}`)
    } catch (err) {
      toast.error('Update Failed', err instanceof Error ? err.message : 'Unable to update employee.')
    }
  }

  const handleConfirmArchive = async () => {
    if (!employee) return
    try {
      await updateEmployee.mutateAsync(archiveEmployeePayload())
      toast.success('Employee Archived', `${formatEmployeeName(employee)} has been archived.`)
      navigate(`/hr/employees/${id}`)
    } catch (err) {
      toast.error('Archive Failed', err instanceof Error ? err.message : 'Unable to archive employee.')
    } finally {
      setIsConfirmOpen(false)
    }
  }

  if (employeeQuery.isLoading) {
    return <div className="page"><p>Loading employee form…</p></div>
  }

  if (employeeQuery.error) {
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
            onClick={() => setIsConfirmOpen(true)}
          >
            Archive Employee
          </button>
        </section>
      )}

      <ConfirmDialog
        isOpen={isConfirmOpen}
        title={`Archive ${formatEmployeeName(employee)}?`}
        description="The employee record will be removed from active lists and retained in archived status."
        confirmText="Archive Employee"
        variant="warning"
        icon="archive"
        isLoading={updateEmployee.isPending}
        onConfirm={() => void handleConfirmArchive()}
        onClose={() => setIsConfirmOpen(false)}
      />
    </div>
  )
}
