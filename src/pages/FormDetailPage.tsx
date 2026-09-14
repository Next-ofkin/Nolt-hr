import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PlusCircle } from 'lucide-react'
import {
  useArchiveFormTemplate,
  useCreateFormDraftFromVersion,
  useFormTemplate,
} from '../lib/form-builder-queries'

function displayDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value.includes('T') ? value : `${value}T00:00:00`).toLocaleDateString()
}

export default function FormDetailPage() {
  const { templateId } = useParams()
  const navigate = useNavigate()

  const templateQuery = useFormTemplate(templateId)
  const createDraftMutation = useCreateFormDraftFromVersion(templateId)
  const archiveMutation = useArchiveFormTemplate()

  const [error, setError] = useState<string | null>(null)

  const template = templateQuery.data

  if (templateQuery.isLoading) {
    return (
      <div className="page">
        <p>Loading form details…</p>
      </div>
    )
  }

  if (templateQuery.error || !template) {
    return (
      <div className="page">
        <h1>Form not found</h1>
        <Link to="/hr/forms">Back to Forms</Link>
      </div>
    )
  }

  const versions = template.versions ?? []
  const draftVersion = versions.find((v) => v.status === 'DRAFT')
  const latestPublishedVersion = versions.find((v) => v.status === 'PUBLISHED')

  const handleCreateNewDraft = async () => {
    if (!latestPublishedVersion) return
    setError(null)
    try {
      const newVersionId = await createDraftMutation.mutateAsync(latestPublishedVersion.id)
      navigate(`/hr/forms/${template.id}/builder/${newVersionId}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create new draft version.'
      setError(msg)
    }
  }

  const handleArchive = async () => {
    if (window.confirm(`Archive "${template.name}"?`)) {
      try {
        await archiveMutation.mutateAsync(template.id)
        navigate('/hr/forms')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to archive form.'
        setError(msg)
      }
    }
  }

  return (
    <div className="page form-detail-page">
      <Link to="/hr/forms" className="back-link">← Back to Forms</Link>

      {error && (
        <div className="alert alert-error mb-4" role="alert">
          <p>{error}</p>
        </div>
      )}

      <div className="page-heading">
        <div>
          <div className="heading-meta">
            <span className="badge badge-neutral">{template.category || 'General'}</span>
          </div>
          <h1>{template.name}</h1>
          <p className="subtitle">{template.description || 'No description provided.'}</p>
        </div>
        <div className="page-actions">
          {draftVersion ? (
            <Link to={`/hr/forms/${template.id}/builder/${draftVersion.id}`} className="btn btn-primary">
              Edit Draft (v{draftVersion.version_number})
            </Link>
          ) : (
            latestPublishedVersion && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={createDraftMutation.isPending}
                onClick={handleCreateNewDraft}
              >
                <PlusCircle size={16} aria-hidden="true" /> Create New Draft Version
              </button>
            )
          )}
          <button
            type="button"
            className="btn btn-ghost"
            style={{ color: 'var(--danger)' }}
            onClick={handleArchive}
          >
            Archive Form
          </button>
        </div>
      </div>

      <section className="card">
        <h2>Version History</h2>
        {versions.length === 0 ? (
          <p className="text-muted">No versions found for this form.</p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Title</th>
                  <th>Created Date</th>
                  <th>Published Date</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id}>
                    <td><strong>Version {v.version_number}</strong></td>
                    <td>
                      {v.status === 'PUBLISHED' && <span className="badge badge-success">Published</span>}
                      {v.status === 'DRAFT' && <span className="badge badge-warning">Draft</span>}
                      {v.status === 'ARCHIVED' && <span className="badge badge-neutral">Archived</span>}
                    </td>
                    <td>{v.title}</td>
                    <td>{displayDate(v.created_at)}</td>
                    <td>{displayDate(v.published_at)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        to={`/hr/forms/${template.id}/builder/${v.id}`}
                        className={v.status === 'DRAFT' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                      >
                        {v.status === 'DRAFT' ? 'Edit Builder' : 'View Read-Only'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
