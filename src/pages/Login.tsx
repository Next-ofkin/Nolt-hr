import { useState } from 'react'
import type { SubmitHandler } from 'react-hook-form'
import { useForm, useWatch } from 'react-hook-form'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/useAuth'
import { isPasswordAdmin } from '../lib/auth-flows'
import { passwordAdminEmail } from '../lib/supabase'

interface LoginForm {
  email: string
  password?: string
}

export default function Login() {
  const { session, sendMagicLink, signInAdmin, isLoading, authError } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } } | null)?.from
    ?.pathname ?? '/'

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>()
  const email = useWatch({ control, name: 'email', defaultValue: '' })
  const adminLogin = isPasswordAdmin(email, passwordAdminEmail)
  const [magicLinkDestination, setMagicLinkDestination] = useState<string | null>(null)

  if (isLoading) return <div className="page">Loading session…</div>
  if (session) return <Navigate to={from} replace />

  const onSubmit: SubmitHandler<LoginForm> = async ({ email, password }) => {
    const result = adminLogin
      ? await signInAdmin(email, password ?? '')
      : await sendMagicLink(email)
    if (result.error) {
      setError('root', { message: result.error })
      return
    }
    if (!adminLogin) {
      setMagicLinkDestination(email.trim().toLowerCase())
    }
  }

  if (magicLinkDestination) {
    return (
      <div className="page">
        <div className="auth-form" role="status">
          <h1>Check your email</h1>
          <p>
            We sent a one-time sign-in link to <strong>{magicLinkDestination}</strong>.
          </p>
          <p className="auth-footer">The link expires in one hour and can only be used once.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <form className="auth-form" onSubmit={handleSubmit(onSubmit)}>
        <h1>Sign in</h1>
        <p className="subtitle">
          Enter your work email. We’ll send you a secure, one-time sign-in link.
        </p>
        {authError && <p className="error" role="alert">{authError}</p>}
        {errors.root && <p className="error">{errors.root.message}</p>}
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          aria-invalid={errors.email ? 'true' : 'false'}
          {...register('email', { required: 'Email is required' })}
        />
        {errors.email && <p className="field-error">{errors.email.message}</p>}
        {adminLogin && (
          <>
            <p className="admin-login-note">Administrator account — enter your password.</p>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={errors.password ? 'true' : 'false'}
              {...register('password', {
                validate: (value) => !adminLogin || Boolean(value) || 'Password is required',
              })}
            />
            {errors.password && (
              <p className="field-error">{errors.password.message}</p>
            )}
          </>
        )}
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting
            ? adminLogin ? 'Signing in…' : 'Sending link…'
            : adminLogin ? 'Sign in as admin' : 'Email me a magic link'}
        </button>
        <p className="auth-footer">
          Only users invited by an administrator or HR can sign in.
        </p>
      </form>
    </div>
  )
}
