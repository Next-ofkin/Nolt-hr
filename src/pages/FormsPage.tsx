import { Link } from 'react-router-dom'
import { FileText, PlusCircle } from 'lucide-react'
import { useArchiveFormTemplate, useFormTemplates } from '../lib/form-builder-queries'

function displayDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value.includes('T') ? value : `${value}T00:00:00`).toLocaleDateString()
}

export default function FormsPage() {
  const { data: templates, isLoading, error } = useFormTemplates()
  const archiveMutation = useArchiveFormTemplate()

  if (isLoading) {
    return (
      <div className="page">
        <p>Loading HR forms…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <p className="error">Unable to load form templates. Please refresh or try again.</p>
      </div>
    )
  }

  const activeTemplates = templates ?? []

  return (
    <div className="page forms-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">FORMS LIBRARY</p>
          <h1>Forms</h1>
          <p className="subtitle">Create and manage reusable HR forms.</p>
        </div>
        <div className="page-actions">
          <Link to="/hr/forms/new" className="btn btn-primary">
            <PlusCircle size={16} aria-hidden="true" /> Create Form
          </Link>
        </div>
      </div>

      {activeTemplates.length === 0 ? (
        <section className="card empty-state">
          <div className="empty-state-icon">
            <FileText size={24} aria-hidden="true" />
          </div>
          <h2>No forms yet</h2>
          <p>Create your first reusable HR form.</p>
          <Link to="/hr/forms/new" className="btn btn-primary mt-3">
            Create Form
          </Link>
        </section>
      ) : (
        <div className="card">
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Form Name</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Last Updated</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeTemplates.map((template) => (
                  <tr key={template.id}>
                    <td>
                      <Link to={`/hr/forms/${template.id}`} style={{ fontWeight: 600 }}>
                        {template.name}
                      </Link>
                    </td>
                    <td>
                      <span className="badge badge-neutral">
                        {template.category || 'General'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      {template.description || '—'}
                    </td>
                    <td>{displayDate(template.updated_at)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="table-actions" style={{ justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <Link to={`/hr/forms/${template.id}`} className="btn btn-ghost btn-sm">
                          View
                        </Link>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--danger)' }}
                          onClick={() => {
                            if (window.confirm(`Archive "${template.name}"?`)) {
                              archiveMutation.mutate(template.id)
                            }
                          }}
                        >
                          Archive
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
