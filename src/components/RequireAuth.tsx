import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/useAuth'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, isLoading, authError } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <div className="page">Loading session…</div>
  }

  if (!session || authError) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
