import type { SubmitHandler } from 'react-hook-form'
import { useForm } from 'react-hook-form'
import { useCurrentProfile, useUpdateProfile } from '../lib/queries'
import { useAuth } from '../lib/useAuth'
import { RoleBadge } from '../components/RoleBadge'
import { ROLE_ACCESS_DESCRIPTIONS } from '../lib/roles'

interface ProfileForm {
  full_name: string
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
    values: { full_name: profile?.full_name ?? '' },
  })

  const onSubmit: SubmitHandler<ProfileForm> = async (values) => {
    await updateProfile.mutateAsync(values)
  }

  return (
    <div className="page narrow-page">
      <div className="page-heading">
        <div>
          <h1>My Profile</h1>
          <p className="subtitle">Manage your account information.</p>
        </div>
      </div>

      <form className="card" onSubmit={handleSubmit(onSubmit)}>
        <h2>Profile Information</h2>
        {updateProfile.isError && (
          <p className="error">
            {updateProfile.error instanceof Error
              ? updateProfile.error.message
              : 'Failed to save changes'}
          </p>
        )}
        {updateProfile.isSuccess && <p className="success">Profile updated.</p>}
        <div className="form-grid">
          <div className="field">
            <label htmlFor="fullName">Full Name</label>
            <input
              id="fullName"
              type="text"
              aria-invalid={errors.full_name ? 'true' : 'false'}
              {...register('full_name', { required: 'Full name is required' })}
            />
            {errors.full_name && <p className="field-error">{errors.full_name.message}</p>}
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={profile?.email ?? ''} readOnly disabled />
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>

      <section className="card">
        <h2>Access</h2>
        <div className="heading-meta">{profile?.role && <RoleBadge role={profile.role} />}</div>
        <p className="subtitle">{profile?.role ? ROLE_ACCESS_DESCRIPTIONS[profile.role] : '—'}</p>
      </section>
    </div>
  )
}
