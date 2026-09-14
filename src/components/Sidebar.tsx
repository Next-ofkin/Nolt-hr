import { NavLink } from 'react-router-dom'
import { getNavGroups } from '../lib/navigation'
import { AccountMenu } from './AccountMenu'
import type { UserRole } from '../lib/database.types'

interface SidebarProps {
  role: UserRole | null
  name: string
  email: string
  onNavigate?: () => void
}

export function Sidebar({ role, name, email, onNavigate }: SidebarProps) {
  const groups = getNavGroups(role)

  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="sidebar-brand">
        <span className="sidebar-brand-primary">NOLT FINANCE</span>
        <span className="sidebar-brand-secondary">HR Portal</span>
      </div>

      <nav className="sidebar-nav">
        {groups.map((group, index) => (
          <div className="nav-group" key={group.label ?? `group-${index}`}>
            {group.label && <p className="nav-group-label">{group.label}</p>}
            {group.items.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <AccountMenu name={name} email={email} role={role} onNavigate={onNavigate} />
      </div>
    </aside>
  )
}
