import type { UserRole } from './database.types'

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  hr: 'HR',
  employee: 'Employee',
}

export const ROLE_ACCESS_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Full HR administration access',
  hr: 'Employee management access',
  employee: 'Standard employee access',
}
