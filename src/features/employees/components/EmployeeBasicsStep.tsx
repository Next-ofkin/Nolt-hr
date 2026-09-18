import type { EmployeeFormValues } from '../../../lib/employee-domain'
import { validateEmployeeStep } from '../data/employee-wizard'

interface EmployeeBasicsStepProps {
  values: EmployeeFormValues
  showErrors: boolean
  onChange: (values: EmployeeFormValues) => void
}

export function EmployeeBasicsStep({ values, showErrors, onChange }: EmployeeBasicsStepProps) {
  const errors = showErrors ? validateEmployeeStep(values) : {}

  const set = <K extends keyof EmployeeFormValues>(key: K, value: EmployeeFormValues[K]) => {
    onChange({ ...values, [key]: value })
  }

  return (
    <div>
      <h2 className="dynamic-form-step-title">Employee Details</h2>
      <p className="dynamic-form-step-desc">Just the essentials to create the employment record.</p>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="wiz_first_name">First Name *</label>
          <input
            id="wiz_first_name"
            value={values.first_name}
            onChange={(e) => set('first_name', e.target.value)}
          />
          {errors.first_name && <p className="field-error">{errors.first_name}</p>}
        </div>
        <div className="field">
          <label htmlFor="wiz_middle_name">Middle Name</label>
          <input
            id="wiz_middle_name"
            value={values.middle_name}
            onChange={(e) => set('middle_name', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="wiz_last_name">Last Name *</label>
          <input
            id="wiz_last_name"
            value={values.last_name}
            onChange={(e) => set('last_name', e.target.value)}
          />
          {errors.last_name && <p className="field-error">{errors.last_name}</p>}
        </div>
        <div className="field">
          <label htmlFor="wiz_work_email">Email *</label>
          <input
            id="wiz_work_email"
            type="email"
            value={values.work_email}
            onChange={(e) => set('work_email', e.target.value)}
          />
          {errors.work_email && <p className="field-error">{errors.work_email}</p>}
        </div>
        <div className="field">
          <label htmlFor="wiz_phone">Phone</label>
          <input
            id="wiz_phone"
            type="tel"
            value={values.phone}
            onChange={(e) => set('phone', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="wiz_staff_id">Staff ID</label>
          <input
            id="wiz_staff_id"
            value={values.staff_id}
            onChange={(e) => set('staff_id', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="wiz_job_title">Job Title</label>
          <input
            id="wiz_job_title"
            value={values.job_title}
            onChange={(e) => set('job_title', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="wiz_start_date">Start Date</label>
          <input
            id="wiz_start_date"
            type="date"
            value={values.start_date}
            onChange={(e) => set('start_date', e.target.value)}
          />
        </div>
      </div>
      <p className="form-note">New employees begin in Draft status.</p>
    </div>
  )
}
