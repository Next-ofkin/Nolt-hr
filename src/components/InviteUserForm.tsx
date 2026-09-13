import type { SubmitHandler } from 'react-hook-form'
import { useForm } from 'react-hook-form'
import { useInviteUser } from '../lib/queries'
import type { UserRole } from '../lib/database.types'

interface InviteForm {
  email: string
  full_name: string
  role: UserRole
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  hr: 'HR',
  employee: 'Employee',
}

export function InviteUserForm({
  roles = ['admin', 'hr', 'employee'],
}: {
  roles?: UserRole[]
}) {
  const inviteUser = useInviteUser()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteForm>({
    defaultValues: { email: '', full_name: '', role: roles[0] ?? 'employee' },
  })

  const onInvite: SubmitHandler<InviteForm> = async (values) => {
    try {
      await inviteUser.mutateAsync(values)
      reset()
    } catch {
      // The mutation's isError state renders the message.
    }
  }

  return (
    <div className="card">
      <h2>Invite a user</h2>
      {inviteUser.isError && (
        <p className="error">
          {inviteUser.error instanceof Error
            ? inviteUser.error.message
            : 'Failed to send invite'}
        </p>
      )}
      {inviteUser.isSuccess && (
        <p className="success">Invitation email sent.</p>
      )}
      <form className="create-form" onSubmit={handleSubmit(onInvite)}>
        <input
          type="email"
          placeholder="Email"
          aria-invalid={errors.email ? 'true' : 'false'}
          {...register('email', {
            required: 'Email is required',
            pattern: {
              value: /\S+@\S+\.\S+/,
              message: 'Enter a valid email address',
            },
          })}
        />
        <input
          type="text"
          placeholder="Full name"
          aria-invalid={errors.full_name ? 'true' : 'false'}
          {...register('full_name', { required: 'Full name is required' })}
        />
        <select
          aria-invalid={errors.role ? 'true' : 'false'}
          {...register('role')}
        >
          {roles.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Sending…' : 'Invite'}
        </button>
      </form>
      {errors.email && <p className="field-error">{errors.email.message}</p>}
      {errors.full_name && (
        <p className="field-error">{errors.full_name.message}</p>
      )}
    </div>
  )
}