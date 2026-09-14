import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/useAuth'
import { useCurrentProfile } from '../lib/queries'
import { RoleBadge } from './RoleBadge'

export function AppLayout() {
  const { session, user, signOut } = useAuth()
  const { data: profile } = useCurrentProfile()
  const role = profile?.role ?? null

  if (!session) return null

  return (
    <div className="shell">
      <header className="topbar">
        <nav className="nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
          >
            Dashboard
          </NavLink>
          <NavLink to="/profile" className="nav-link">
            Profile
          </NavLink>
          {(role === 'hr' || role === 'admin') && (
            <>
              <NavLink to="/hr/employees" className="nav-link">
                Employees
              </NavLink>
              <NavLink to="/hr" className="nav-link">
                Invitations
              </NavLink>
            </>
          )}
          {role === 'admin' && (
            <NavLink to="/admin" className="nav-link">
              Admin
            </NavLink>
          )}
        </nav>
        <div className="topbar-right">
          {profile?.full_name}
          {role && <RoleBadge role={role} />}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void signOut()}
          >
            Sign out {user?.email}
          </button>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
