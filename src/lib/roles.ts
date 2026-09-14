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

export function isRouteAllowedForRole(route: string, role: UserRole | null | undefined): boolean {
  if (!role) return false
  if (route === '/employee') return role === 'employee'
  if (route.startsWith('/hr')) return role === 'admin' || role === 'hr'
  if (route.startsWith('/admin')) return role === 'admin'
  return true
}
