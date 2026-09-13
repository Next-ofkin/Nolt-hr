import type { SubmitHandler } from 'react-hook-form'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/useAuth'

interface LoginForm {
  email: string
  password: string
}

export default function Login() {
  const { session, signIn, isLoading } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } } | null)?.from
    ?.pathname ?? '/'

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>()

  if (isLoading) return <div className="page">Loading session…</div>
  if (session) return <Navigate to={from} replace />

  const onSubmit: SubmitHandler<LoginForm> = async ({ email, password }) => {
    const result = await signIn(email, password)
    if (result.error) {
      setError('root', { message: result.error })
    }
  }

  return (
    <div className="page">
      <form className="auth-form" onSubmit={handleSubmit(onSubmit)}>
        <h1>Sign in</h1>
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
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? 'true' : 'false'}
          {...register('password', { required: 'Password is required' })}
        />
        {errors.password && (
          <p className="field-error">{errors.password.message}</p>
        )}
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="auth-footer">
          Your administrator will send you an invitation email to join.
        </p>
      </form>
    </div>
  )
}