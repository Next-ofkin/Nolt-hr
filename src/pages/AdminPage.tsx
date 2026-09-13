import { useProfiles, useUpdateUserRole } from '../lib/queries'
import { InviteUserForm } from '../components/InviteUserForm'
import type { UserRole } from '../lib/database.types'

export default function AdminPage() {
  const { data: users, error: listError, isLoading } = useProfiles()
  const updateUserRole = useUpdateUserRole()

  return (
    <div className="page">
      <h1>Admin — User management</h1>

      <InviteUserForm roles={['employee', 'hr', 'admin']} />

      <div className="card">
        <h2>Users</h2>
        {listError && <p className="error">{listError.message}</p>}
        {isLoading && <p>Loading…</p>}
        {!isLoading && users?.length === 0 && <p>No users found.</p>}
        {!isLoading && users && users.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.full_name}</td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>
                    <select
                      value={u.role}
                      disabled={updateUserRole.isPending}
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