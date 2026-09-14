import { useForm, type SubmitHandler } from 'react-hook-form'
import {
  EMPLOYEE_STATUSES,
  EMPLOYEE_STATUS_LABELS,
  employeeFormValues,
  type EmployeeFormValues,
} from '../lib/employee-domain'
import type { Department, Employee, EmploymentType } from '../lib/database.types'

interface EmployeeFormProps {
  employee?: Employee | null
  departments: Department[]
  employmentTypes: EmploymentType[]
  includeStatus?: boolean
  submitLabel: string
  isSubmitting: boolean
  error?: string | null
  onSubmit: (values: EmployeeFormValues) => Promise<void>
}

export function EmployeeForm({
  employee,
  departments,
  employmentTypes,
  includeStatus = false,
  submitLabel,
  isSubmitting,
  error,
  onSubmit,
}: EmployeeFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmployeeFormValues>({ defaultValues: employeeFormValues(employee) })

  const submit: SubmitHandler<EmployeeFormValues> = async (values) => onSubmit(values)

  return (
    <form className="card employee-form" onSubmit={handleSubmit(submit)} noValidate>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="first_name">First Name *</label>
          <input id="first_name" {...register('first_name', { required: 'First name is required' })} />
          {errors.first_name && <p className="field-error">{errors.first_name.message}</p>}
        </div>
        <div className="field">
          <label htmlFor="middle_name">Middle Name</label>
          <input id="middle_name" {...register('middle_name')} />
        </div>
        <div className="field">
          <label htmlFor="last_name">Last Name *</label>
          <input id="last_name" {...register('last_name', { required: 'Last name is required' })} />
          {errors.last_name && <p className="field-error">{errors.last_name.message}</p>}
        </div>
        <div className="field">
          <label htmlFor="work_email">Work Email *</label>
          <input
            id="work_email"
            type="email"
            {...register('work_email', {
              required: 'Work email is required',
              pattern: { value: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: 'Enter a valid work email' },
            })}
          />
          {errors.work_email && <p className="field-error">{errors.work_email.message}</p>}
        </div>
        <div className="field">
          <label htmlFor="phone">Phone</label>
          <input id="phone" type="tel" {...register('phone')} />
        </div>
        <div className="field">
          <label htmlFor="staff_id">Staff ID</label>
          <input id="staff_id" {...register('staff_id')} />
        </div>
        <div className="field">
          <label htmlFor="job_title">Job Title</label>
          <input id="job_title" {...register('job_title')} />
        </div>
        <div className="field">
          <label htmlFor="department_id">Department *</label>
          <select id="department_id" {...register('department_id', { required: 'Department is required' })}>
            <option value="">Select department</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>{department.name}</option>
            ))}
          </select>
          {errors.department_id && <p className="field-error">{errors.department_id.message}</p>}
        </div>
        <div className="field">
          <label htmlFor="employment_type_id">Employment Type *</label>
          <select
            id="employment_type_id"
            {...register('employment_type_id', { required: 'Employment type is required' })}
          >
            <option value="">Select employment type</option>
            {employmentTypes.map((employmentType) => (
              <option key={employmentType.id} value={employmentType.id}>{employmentType.name}</option>
            ))}
          </select>
          {errors.employment_type_id && (
            <p className="field-error">{errors.employment_type_id.message}</p>
          )}
        </div>
        <div className="field">
          <label htmlFor="start_date">Start Date</label>
          <input id="start_date" type="date" {...register('start_date')} />
        </div>
        {includeStatus && (
          <div className="field">
            <label htmlFor="status">Lifecycle Status *</label>
            <select id="status" {...register('status', { required: true })}>
              {EMPLOYEE_STATUSES.map((status) => (
                <option key={status} value={status}>{EMPLOYEE_STATUS_LABELS[status]}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      {!includeStatus && (
        <p className="form-note">New employees begin in Draft status.</p>
      )}
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
