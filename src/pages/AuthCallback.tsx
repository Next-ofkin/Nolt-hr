import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../lib/useAuth'

export default function AuthCallback() {
  const { session, isLoading, authError } = useAuth()

  if (isLoading) {
    return <div className="auth-form" role="status"><h1>Signing you in…</h1><p>Opening your dashboard.</p></div>
  }

  if (authError || !session) {
    return (
      <div className="auth-form">
        <h1>Unable to sign in</h1>
        <p className="error" role="alert">
          {authError ?? 'This link is missing, expired, or has already been used.'}
        </p>
        <p>Request a new magic link using the email address on your invitation.</p>
        <Link to="/login" className="btn btn-primary auth-link">Back to sign in</Link>
      </div>
    )
  }

  return <Navigate to="/" replace />
}
