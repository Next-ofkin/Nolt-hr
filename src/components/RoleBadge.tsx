import type { UserRole } from '../lib/database.types'

const labels: Record<UserRole, string> = {
  admin: 'Admin',
  hr: 'HR',
  employee: 'Employee',
}

export function RoleBadge({ role }: { role: UserRole }) {
  return <span className={`role-badge role-${role}`}>{labels[role]}</span>
}