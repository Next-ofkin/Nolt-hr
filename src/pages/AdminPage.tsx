import { useProfiles, useUpdateUserRole } from '../lib/queries'
import { RoleBadge } from '../components/RoleBadge'
import type { UserRole } from '../lib/database.types'

export default function AdminPage() {
  const { data: users, error: listError, isLoading } = useProfiles()
  const updateUserRole = useUpdateUserRole()

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>User Access &amp; Roles</h1>
          <p className="subtitle">Manage application access and role assignments.</p>
        </div>
      </div>

      <div className="card">
        {listError && <p className="error">{listError.message}</p>}
        {isLoading && <p>Loading…</p>}
        {!isLoading && users?.length === 0 && <p>No users found.</p>}
        {!isLoading && users && users.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.full_name}</td>
                  <td>{u.email}</td>
                  <td>
                    <RoleBadge role={u.role} />
                  </td>
                  <td>{new Date(u.created_at).toLocaleDateString()}</td>
                  <td>
                    <select
                      value={u.role}
                      disabled={updateUserRole.isPending}
                      aria-label={`Change role for ${u.full_name}`}
                      onChange={(event) => {
                        void updateUserRole.mutateAsync({
                          userId: u.id,
                          role: event.target.value as UserRole,
                        })
                      }}
                    >
                      <option value="employee">Employee</option>
                      <option value="hr">HR</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {updateUserRole.isError && (
          <p className="error">
            {updateUserRole.error instanceof Error
              ? updateUserRole.error.message
              : 'Failed to change role'}
          </p>
        )}
      </div>
    </div>
  )
}
