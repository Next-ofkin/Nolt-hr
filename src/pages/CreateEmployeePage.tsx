import { Link } from 'react-router-dom'
import { NewEmployeeWizard } from '../features/employees/components/NewEmployeeWizard'

export default function CreateEmployeePage() {
  return (
    <div className="page employee-page narrow-page">
      <Link className="back-link" to="/hr/employees">← Back to employees</Link>
      <NewEmployeeWizard />
    </div>
  )
}
