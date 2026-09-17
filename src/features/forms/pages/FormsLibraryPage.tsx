import { useState } from 'react'
import { Archive, FileText, Plus, Search, Clock, Eye, History, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { createBlankFormSchema } from '../../shadcn-form-poc/domain/form-schema'
import { ConfirmDialog } from '../../../components/ui/confirm-dialog'
import { toast } from '../../../components/ui/use-toast'
import {
  useArchiveFormDefinition,
  useCreateDraftFromPublished,
  useCreateFormDefinition,
  useFormDefinitions,
} from '../data/forms-queries'
import {
  filterFormsBySearch,
  filterFormsByStatus,
  formatFormDate,
  formPersistenceMessage,
  type FormStatusFilter,
  type FormDefinitionSummary,
} from '../data/forms-types'

export default function FormsLibraryPage() {
  const navigate = useNavigate()
  const formsQuery = useFormDefinitions()
  const createFormMutation = useCreateFormDefinition()
  const createDraftMutation = useCreateDraftFromPublished()
  const archiveMutation = useArchiveFormDefinition()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<FormStatusFilter>('all')
  const [actionFormId, setActionFormId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    description: string
    confirmText: string
    variant: 'danger' | 'warning' | 'primary'
    icon: 'trash' | 'archive' | 'warning' | 'restore'
    isLoading: boolean
    onConfirm: () => Promise<void>
  }>({
    isOpen: false,
    title: '',
    description: '',
    confirmText: 'Confirm',
    variant: 'danger',
    icon: 'warning',
    isLoading: false,
    onConfirm: async () => {},
  })

  const forms = formsQuery.data || []

  const handleCreateForm = async () => {
    setActionFormId('new')
    setActionError(null)
    const definition = createBlankFormSchema()
    try {
      const created = await createFormMutation.mutateAsync({
        title: definition.title,
        description: definition.description,
        definition,
      })
      toast.success('Form Draft Created', 'Navigating to form builder...')
      navigate(`/hr/forms/${created.formDefinitionId}/edit`)
    } catch (error) {
      const msg = formPersistenceMessage(error, 'Unable to create a new form.')
      setActionError(msg)
      toast.error('Creation Failed', msg)
    } finally {
      setActionFormId(null)
    }
  }

  const handleCreateDraft = async (formDefinitionId: string) => {
    setActionFormId(formDefinitionId)
    setActionError(null)
    try {
      await createDraftMutation.mutateAsync(formDefinitionId)
      toast.success('Draft Created', 'Navigating to form editor...')
      navigate(`/hr/forms/${formDefinitionId}/edit`)
    } catch (error) {
      const msg = formPersistenceMessage(error, 'Unable to create a new draft.')
      setActionError(msg)
      toast.error('Draft Creation Failed', msg)
    } finally {
      setActionFormId(null)
    }
  }

  const handleArchive = (form: FormDefinitionSummary) => {
    setConfirmDialog({
      isOpen: true,
      title: `Archive "${form.title}"?`,
      description: 'It will be hidden from the active forms list, but its published version history will be retained.',
      confirmText: 'Archive Form',
      variant: 'warning',
      icon: 'archive',
      isLoading: false,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isLoading: true }))
        setActionFormId(form.id)
        setActionError(null)
        try {
          await archiveMutation.mutateAsync(form.id)
          toast.success('Form Archived', `"${form.title}" archived successfully.`)
        } catch (error) {
          const msg = formPersistenceMessage(error, 'Unable to archive this form.')
          setActionError(msg)
          toast.error('Archive Failed', msg)
        } finally {
          setActionFormId(null)
          setConfirmDialog((prev) => ({ ...prev, isOpen: false, isLoading: false }))
        }
      },
    })
  }

  const searchFiltered = filterFormsBySearch(forms, search)
  const filteredForms = filterFormsByStatus(searchFiltered, statusFilter)
  const hasActiveFilters = search.trim() !== '' || statusFilter !== 'all'
  const isLoading = formsQuery.isLoading

  return (
    <div className="page resource-library">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Form management</p>
          <h1>Forms</h1>
          <p className="subtitle">Create and manage employee forms.</p>
        </div>

        <button type="button" onClick={() => void handleCreateForm()} disabled={createFormMutation.isPending} className="btn btn-primary">
          <Plus style={{ width: 16, height: 16, marginRight: '0.4rem' }} />
          {createFormMutation.isPending ? 'Creating…' : 'New Form'}
        </button>
      </div>

      {actionError && (
        <div className="alert alert-error" role="alert">
          <p style={{ margin: 0 }}>{actionError}</p>
        </div>
      )}

      {formsQuery.error && (
        <div className="alert alert-error" role="alert">
          <p style={{ margin: 0 }}>Unable to load forms.</p>
        </div>
      )}

      <div className="resource-toolbar">
        <div className="search-input-wrap">
          <Search style={{ width: 16, height: 16 }} />
          <label htmlFor="form-search" className="sr-only">Search forms</label>
          <input
            id="form-search"
            type="search"
            placeholder="Search forms..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="form-status-filter" className="sr-only">Filter by status</label>
          <select
            id="form-status-filter"
            className="resource-status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as FormStatusFilter)}
          >
            <option value="all">All Forms</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {!isLoading && !formsQuery.error && (
        <p className="resource-result-count">
          Showing {filteredForms.length} {filteredForms.length === 1 ? 'form' : 'forms'}
        </p>
      )}

      {isLoading && (
        <div className="resource-skeleton-list" aria-label="Loading forms" aria-busy="true">
          <div className="resource-skeleton-card" />
          <div className="resource-skeleton-card" />
          <div className="resource-skeleton-card" />
        </div>
      )}

      {!isLoading && !formsQuery.error && filteredForms.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <FileText size={22} aria-hidden="true" />
          </div>
          {hasActiveFilters ? (
            <>
              <h2>No forms found</h2>
              <p>Try changing your search or filters.</p>
            </>
          ) : (
            <>
              <h2>No forms yet</h2>
              <p style={{ maxWidth: '46ch', marginInline: 'auto' }}>
                Create your first employee form to start building its draft.
              </p>
              <button type="button" onClick={() => void handleCreateForm()} disabled={createFormMutation.isPending} className="btn btn-primary" style={{ marginTop: '1rem' }}>
                <Plus style={{ width: 16, height: 16, marginRight: '0.4rem' }} /> New Form
              </button>
            </>
          )}
        </div>
      )}

      {!isLoading && !formsQuery.error && filteredForms.length > 0 && (
        <div className="resource-card-list">
          {filteredForms.map((form) => (
            <FormCard
              key={form.id}
              form={form}
              isBusy={actionFormId === form.id}
              onEditDraft={() => navigate(`/hr/forms/${form.id}/edit`)}
              onCreateDraft={() => void handleCreateDraft(form.id)}
              onPreview={() => navigate(`/hr/forms/${form.id}/edit?view=preview`)}
              onVersionHistory={() => navigate(`/hr/forms/${form.id}/edit?view=history`)}
              onArchive={() => void handleArchive(form)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmText={confirmDialog.confirmText}
        variant={confirmDialog.variant}
        icon={confirmDialog.icon}
        isLoading={confirmDialog.isLoading}
        onConfirm={() => void confirmDialog.onConfirm()}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  )
}

function FormCard({
  form,
  isBusy,
  onEditDraft,
  onCreateDraft,
  onPreview,
  onVersionHistory,
  onArchive,
}: {
  form: FormDefinitionSummary
  isBusy: boolean
  onEditDraft: () => void
  onCreateDraft: () => void
  onPreview: () => void
  onVersionHistory: () => void
  onArchive: () => void
}) {
  const hasDraft = form.draftVersionNumber !== null
  const hasPublished = form.latestPublishedVersionNumber !== null
  const canPreviewOrHistory = hasDraft || hasPublished

  return (
    <div className="resource-card">
      <div className="resource-card-top">
        <div className="resource-card-heading">
          <h3 className="resource-card-title">{form.title}</h3>
          {form.description && <p className="resource-card-description">{form.description}</p>}
        </div>

        <div className="resource-card-badges">
          {form.archivedAt && <span className="badge badge-neutral">Archived</span>}
          {hasDraft && (
            <span className="badge badge-warning">
              <Clock style={{ width: 12, height: 12 }} /> Draft V{form.draftVersionNumber}
            </span>
          )}
          {hasPublished && (
            <span className="badge badge-success">Published V{form.latestPublishedVersionNumber}</span>
          )}
          {!hasDraft && !hasPublished && !form.archivedAt && <span className="badge badge-neutral">Unavailable</span>}
        </div>
      </div>

      <div className="resource-card-footer">
        <span className="resource-card-updated">Updated {formatFormDate(form.updatedAt)}</span>

        <div className="resource-card-actions">
          {hasDraft && !form.archivedAt && (
            <button type="button" onClick={onEditDraft} className="btn btn-primary">
              Edit Draft <ArrowRight style={{ width: 15, height: 15, marginLeft: '0.4rem' }} />
            </button>
          )}
          {!hasDraft && hasPublished && !form.archivedAt && (
            <button type="button" onClick={onCreateDraft} disabled={isBusy} className="btn btn-primary">
              {isBusy ? 'Creating…' : 'Create New Draft'}
            </button>
          )}
          {canPreviewOrHistory && (
            <button type="button" onClick={onPreview} className="btn btn-ghost">
              <Eye style={{ width: 15, height: 15, marginRight: '0.4rem' }} /> Preview
            </button>
          )}
          {canPreviewOrHistory && (
            <button type="button" onClick={onVersionHistory} className="btn btn-ghost">
              <History style={{ width: 15, height: 15, marginRight: '0.4rem' }} /> Version History
            </button>
          )}
          {!form.archivedAt && (
            <button type="button" onClick={onArchive} disabled={isBusy} className="btn btn-danger">
              <Archive style={{ width: 15, height: 15, marginRight: '0.4rem' }} /> Archive
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
