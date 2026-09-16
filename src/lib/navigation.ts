import type { LucideIcon } from 'lucide-react'
import { FileText, Home, LayoutDashboard, ShieldCheck, Users } from 'lucide-react'
import type { UserRole } from './database.types'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  end?: boolean
}

export interface NavGroup {
  label?: string
  items: NavItem[]
}

const DASHBOARD_ITEM: NavItem = { label: 'Dashboard', to: '/', icon: LayoutDashboard, end: true }
const HOME_ITEM: NavItem = { label: 'Home', to: '/employee', icon: Home, end: true }
const EMPLOYEES_ITEM: NavItem = { label: 'Employees', to: '/hr/employees', icon: Users }
const FORMS_ITEM: NavItem = { label: 'Forms', to: '/hr/forms', icon: FileText }
const USER_ACCESS_ITEM: NavItem = { label: 'User Access', to: '/admin', icon: ShieldCheck }

export function getNavGroups(role: UserRole | null | undefined): NavGroup[] {
  if (role === 'admin') {
    return [
      { label: 'Overview', items: [DASHBOARD_ITEM] },
      { label: 'People', items: [EMPLOYEES_ITEM, FORMS_ITEM] },
      { label: 'Administration', items: [USER_ACCESS_ITEM] },
    ]
  }

  if (role === 'hr') {
    return [{ items: [DASHBOARD_ITEM, EMPLOYEES_ITEM, FORMS_ITEM] }]
  }

  if (role === 'employee') {
    return [{ items: [HOME_ITEM] }]
  }

  return [{ items: [DASHBOARD_ITEM] }]
}
