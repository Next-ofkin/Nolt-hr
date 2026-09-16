import type { FormVersion } from '../data/forms-types'

function displayDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : '—'
}

function VersionState({ state }: Pick<FormVersion, 'state'>) {
  const statusClass = state === 'published' ? 'employee-status-completed' : 'employee-status-draft'
  return (
    <span className={`employee-status ${statusClass}`}>
      {state === 'published' ? 'Published' : 'Draft'}
    </span>
  )
}

export function FormVersionHistory({
  versions,
  onPreview,
}: {
  versions: FormVersion[]
  onPreview: (versionId: string) => void
}) {
  return (
    <section className="card" aria-labelledby="version-history-heading">
      <h2 id="version-history-heading">Version history</h2>
      <p className="subtitle">Published versions are immutable. Rollback and deletion are not available.</p>

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Version</th>
              <th>State</th>
              <th>Created</th>
              <th>Published</th>
              <th>Published by</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((version) => (
              <tr key={version.id}>
                <td><strong>Version {version.versionNumber}</strong></td>
                <td><VersionState state={version.state} /></td>
                <td>{displayDateTime(version.createdAt)}</td>
                <td>{displayDateTime(version.publishedAt)}</td>
                <td>{version.publishedBy ?? '—'}</td>
                <td>
                  <button type="button" className="btn btn-ghost" onClick={() => onPreview(version.id)}>
                    Preview
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
