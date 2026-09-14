import type { ReactNode } from 'react'
import { useAuth } from '../lib/useAuth'
import { useCurrentProfile } from '../lib/queries'
import type { UserRole } from '../lib/database.types'

export function RequireRole({
  roles,
  children,
}: {
  roles: readonly UserRole[]
  children: ReactNode
}) {
  const { session, isLoading: authLoading } = useAuth()
  const { data: profile, isLoading: profileLoading } = useCurrentProfile()

  if (authLoading || profileLoading) {
    return <div className="page">Loading session…</div>
  }

  if (!session) {
    return null
  }

  if (!profile?.role || !roles.includes(profile.role)) {
    return (
      <div className="page">
        <div className="card">
          <h1>Access denied</h1>
          <p>You do not have permission to view this page.</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
