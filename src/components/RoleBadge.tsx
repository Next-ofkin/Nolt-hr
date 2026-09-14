import type { UserRole } from '../lib/database.types'
import { ROLE_LABELS } from '../lib/roles'

export function RoleBadge({ role }: { role: UserRole }) {
  return <span className={`role-badge role-${role}`}>{ROLE_LABELS[role]}</span>
}