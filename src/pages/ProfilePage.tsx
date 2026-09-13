import type { SubmitHandler } from 'react-hook-form'
import { useForm } from 'react-hook-form'
import { useCurrentProfile, useUpdateProfile } from '../lib/queries'
import { useAuth } from '../lib/useAuth'

interface ProfileForm {
  full_name: string
  email: string
}

export default function ProfilePage() {
  const { user } = useAuth()
  const { data: profile } = useCurrentProfile()
  const updateProfile = useUpdateProfile(user?.id)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileForm>({
    values: {
      full_name: profile?.full_name ?? '',
      email: profile?.email ?? '',
    },
  })

  const onSubmit: SubmitHandler<ProfileForm> = async (values) => {
    await updateProfile.mutateAsync(values)
  }

  return (
    <div className="page">
      <form className="auth-form" onSubmit={handleSubmit(onSubmit)}>
        <h1>Edit profile</h1>
        {updateProfile.isError && (
          <p className="error">
            {updateProfile.error instanceof Error
              ? updateProfile.error.message
              : 'Failed to save changes'}
          </p>
        )}
        {updateProfile.isSuccess && <p className="success">Profile updated.</p>}
        <label htmlFor="fullName">Full name</label>
        <input
          id="fullName"
          type="text"
          aria-invalid={errors.full_name ? 'true' : 'false'}
          {...register('full_name', { required: 'Full name is required' })}
        />
        {errors.full_name && (
          <p className="field-error">{errors.full_name.message}</p>
        )}
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          aria-invalid={errors.email ? 'true' : 'false'}
          {...register('email', {
            required: 'Email is required',
            pattern: {
              value: /\S+@\S+\.\S+/,
              message: 'Enter a valid email address',
            },
          })}
        />
        {errors.email && <p className="field-error">{errors.email.message}</p>}
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  )
}