import { useState } from 'react'
import { splitVersionsForDisplay } from '../../../lib/utils'
import type { FormVersion } from '../data/forms-types'

function displayDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : '—'
}

function VersionState({ state }: Pick<FormVersion, 'state'>) {
  if (state === 'published') {
    return <span className="employee-status employee-status-completed">Published</span>
  }
  if (state === 'superseded') {
    return <span className="employee-status employee-status-archived">Superseded</span>
  }
  return <span className="employee-status employee-status-draft">Draft</span>
}

export function FormVersionHistory({
  versions,
  onPreview,
}: {
  versions: FormVersion[]
  onPreview: (versionId: string) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const { visible, hiddenCount } = splitVersionsForDisplay(versions, showAll)

  return (
    <section className="card" aria-labelledby="version-history-heading">
      <h2 id="version-history-heading">Version history</h2>
      <p className="subtitle">Publishing a new version supersedes the old one. Published and superseded versions are immutable and cannot be deleted.</p>

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
            {visible.map((version) => (
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

      {hiddenCount > 0 && (
        <button type="button" className="btn btn-ghost" style={{ marginTop: '0.75rem' }} onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer versions' : `Show ${hiddenCount} older ${hiddenCount === 1 ? 'version' : 'versions'}`}
        </button>
      )}
    </section>
  )
}
