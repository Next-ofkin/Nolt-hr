import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { useAuth } from '../lib/useAuth'
import { useCurrentProfile } from '../lib/queries'
import { getNavGroups, type NavGroup } from '../lib/navigation'
import { Sidebar } from './Sidebar'

function resolveSectionLabel(pathname: string, groups: NavGroup[]) {
  const items = groups.flatMap((group) => group.items)
  const match = items.find((item) =>
    item.end ? pathname === item.to : pathname.startsWith(item.to),
  )
  if (match) return match.label
  if (pathname.startsWith('/profile')) return 'My Profile'
  return 'NOLT HR'
}

export function AppLayout() {
  const { session, user } = useAuth()
  const { data: profile } = useCurrentProfile()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const role = profile?.role ?? null

  const [lastPathname, setLastPathname] = useState(location.pathname)
  if (location.pathname !== lastPathname) {
    setLastPathname(location.pathname)
    setDrawerOpen(false)
  }

  useEffect(() => {
    if (!drawerOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [drawerOpen])

  if (!session) return null

  const groups = getNavGroups(role)
  const sectionLabel = resolveSectionLabel(location.pathname, groups)
  const name = profile?.full_name ?? user?.email ?? 'Signed in'
  const email = profile?.email ?? user?.email ?? ''

  return (
    <div className="app-shell">
      <div className="sidebar-desktop">
        <Sidebar role={role} name={name} email={email} />
      </div>

      {drawerOpen && (
        <>
          <button
            type="button"
            className="sidebar-overlay"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="sidebar-drawer" id="app-sidebar-drawer">
            <Sidebar
              role={role}
              name={name}
              email={email}
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </>
      )}

      <div className="app-content">
        <header className="app-header">
          <button
            type="button"
            className="app-header-trigger"
            aria-label={drawerOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={drawerOpen}
            aria-controls="app-sidebar-drawer"
            onClick={() => setDrawerOpen((value) => !value)}
          >
            {drawerOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <p className="app-header-title">{sectionLabel}</p>
        </header>

        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
