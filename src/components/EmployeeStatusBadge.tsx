import { EMPLOYEE_STATUS_LABELS } from '../lib/employee-domain'
import type { EmployeeStatus } from '../lib/database.types'

export function EmployeeStatusBadge({ status }: { status: EmployeeStatus }) {
  return (
    <span className={`employee-status employee-status-${status.toLowerCase()}`}>
      {EMPLOYEE_STATUS_LABELS[status]}
    </span>
  )
}
