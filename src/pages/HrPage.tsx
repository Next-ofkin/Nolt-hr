import { useProfiles, useCurrentProfile } from '../lib/queries'
import { InviteUserForm } from '../components/InviteUserForm'
import type { UserRole } from '../lib/database.types'

export default function HrPage() {
  const { data: employees, error: listError, isLoading } = useProfiles()
  const { data: profile } = useCurrentProfile()
  const isAdmin = profile?.role === 'admin'

  const inviteRoles: UserRole[] = isAdmin
    ? ['employee', 'hr', 'admin']
    : ['employee']

  return (
    <div className="page">
      <h1>HR — Invite & Directory</h1>

      <InviteUserForm roles={inviteRoles} />

      <div className="card">
        <h2>Employee Directory</h2>
        {listError && <p className="error">{listError.message}</p>}
        {isLoading && <p>Loading…</p>}
        {!isLoading && employees?.length === 0 && <p>No employees found.</p>}
        {!isLoading && employees && employees.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id}>
                  <td>{e.full_name}</td>
                  <td>{e.email}</td>
                  <td>{e.role}</td>
                  <td>{new Date(e.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}