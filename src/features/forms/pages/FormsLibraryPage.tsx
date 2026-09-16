import { useState } from 'react'
import { FileText, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { createBlankFormSchema } from '../../shadcn-form-poc/domain/form-schema'
import {
  useCreateDraftFromPublished,
  useCreateFormDefinition,
  useFormDefinitions,
} from '../data/forms-queries'
import { formPersistenceMessage, type FormDefinitionSummary } from '../data/forms-types'

function displayDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : '—'
}

function FormStatus({ form }: { form: FormDefinitionSummary }) {
  if (form.archivedAt) {
    return <span className="employee-status employee-status-archived">Archived</span>
  }
  if (form.draftVersionNumber !== null) {
    return <span className="employee-status employee-status-draft">Draft</span>
  }
  if (form.latestPublishedVersionNumber !== null) {
    return <span className="employee-status employee-status-completed">Published</span>
  }
  return <span className="employee-status employee-status-draft">Unavailable</span>
}

export default function FormsLibraryPage() {
  const navigate = useNavigate()
  const formsQuery = useFormDefinitions()
  const createFormMutation = useCreateFormDefinition()
  const createDraftMutation = useCreateDraftFromPublished()
  const [actionFormId, setActionFormId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const forms = formsQuery.data ?? []

  const handleCreateForm = async () => {
    setActionError(null)
    const definition = createBlankFormSchema()
    try {
      const created = await createFormMutation.mutateAsync({
        title: definition.title,
        description: definition.description,
        definition,
      })
      navigate(`/hr/forms/${created.formDefinitionId}/edit`)
    } catch (error) {
      setActionError(formPersistenceMessage(error, 'Unable to create a new form.'))
    }
  }

  const handleCreateDraft = async (formDefinitionId: string) => {
    setActionFormId(formDefinitionId)
    setActionError(null)
    try {
      await createDraftMutation.mutateAsync(formDefinitionId)
      navigate(`/hr/forms/${formDefinitionId}/edit`)
    } catch (error) {
      setActionError(formPersistenceMessage(error, 'Unable to create a new draft.'))
    } finally {
      setActionFormId(null)
    }
  }

  return (
    <div className="page employee-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Form management</p>
          <h1>Forms</h1>
          <p className="subtitle">Create and manage employee forms.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={createFormMutation.isPending}
          onClick={() => void handleCreateForm()}
        >
          <Plus size={16} aria-hidden="true" />
          {createFormMutation.isPending ? 'Creating…' : 'New Form'}
        </button>
      </div>

      {actionError && <p className="error" role="alert">{actionError}</p>}

      <section className="card directory-card" aria-label="Forms library">
        {formsQuery.isLoading && <p className="empty-state">Loading forms…</p>}
        {formsQuery.error && <p className="error">Unable to load forms.</p>}

        {!formsQuery.isLoading && !formsQuery.error && forms.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">
              <FileText size={22} aria-hidden="true" />
            </div>
            <h2>No forms yet</h2>
            <p>Create your first employee form to start building its draft.</p>
            <button type="button" className="btn btn-primary" onClick={() => void handleCreateForm()}>
              New Form
            </button>
          </div>
        )}

        {!formsQuery.isLoading && !formsQuery.error && forms.length > 0 && (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Form</th>
                  <th>Status</th>
                  <th>Latest published</th>
                  <th>Draft</th>
                  <th>Last updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {forms.map((form) => (
                  <tr key={form.id}>
                    <td>
                      <strong>{form.title}</strong>
                      {form.description && (
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                          {form.description}
                        </div>
                      )}
                    </td>
                    <td><FormStatus form={form} /></td>
                    <td>
                      {form.latestPublishedVersionNumber === null
                        ? '—'
                        : `Version ${form.latestPublishedVersionNumber}`}
                    </td>
                    <td>
                      {form.draftVersionNumber === null
                        ? '—'
                        : `Version ${form.draftVersionNumber} · revision ${form.draftRevision}`}
                    </td>
                    <td>{displayDateTime(form.updatedAt)}</td>
                    <td>
                      <div className="table-actions" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                        {form.draftVersionNumber !== null && !form.archivedAt && (
                          <Link to={`/hr/forms/${form.id}/edit`}>Edit Draft</Link>
                        )}
                        {form.draftVersionNumber === null && form.latestPublishedVersionNumber !== null && !form.archivedAt && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={actionFormId === form.id}
                            onClick={() => void handleCreateDraft(form.id)}
                          >
                            {actionFormId === form.id ? 'Creating…' : 'Create New Draft'}
                          </button>
                        )}
                        {(form.draftVersionNumber !== null || form.latestPublishedVersionNumber !== null) && (
                          <Link to={`/hr/forms/${form.id}/edit?view=preview`}>Preview</Link>
                        )}
                        {(form.draftVersionNumber !== null || form.latestPublishedVersionNumber !== null) && (
                          <Link to={`/hr/forms/${form.id}/edit?view=history`}>Version History</Link>
                        )}
                      </div>
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
