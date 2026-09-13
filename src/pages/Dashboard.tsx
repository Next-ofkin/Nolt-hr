import { RoleBadge } from '../components/RoleBadge'
import { useCurrentProfile } from '../lib/queries'
import { useAuth } from '../lib/useAuth'

export default function Dashboard() {
  const { user } = useAuth()
  const { data: profile } = useCurrentProfile()

  return (
    <div className="page">
      <div className="card">
        <h1>Dashboard</h1>
        <p className="subtitle">
          Welcome back, <strong>{profile?.full_name ?? user?.email}</strong>
        </p>
        {profile?.role && <RoleBadge role={profile.role} />}
      </div>

      <div className="card">
        <h2>Account details</h2>
        <dl className="detail-list">
          <dt>Email</dt>
          <dd>{user?.email}</dd>
          <dt>Full name</dt>
          <dd>{profile?.full_name ?? '—'}</dd>
          <dt>Role</dt>
          <dd>{profile?.role ?? '—'}</dd>
          <dt>Member since</dt>
          <dd>
            {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}
          </dd>
        </dl>
      </div>
    </div>
  )
}