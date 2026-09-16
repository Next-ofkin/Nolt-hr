import { useState } from 'react'
import { Eye, History, LayoutGrid, Plus } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { FormBuilder } from '../../shadcn-form-poc/builder/FormBuilder'
import { NoltDynamicForm } from '../../shadcn-form-poc/renderer/NoltDynamicForm'
import type { FormSchema } from '../../shadcn-form-poc/domain/form-schema'
import { FormVersionHistory } from '../components/FormVersionHistory'
import {
  useCreateDraftFromPublished,
  useFormDefinition,
  usePublishFormDraft,
  useSaveFormDraft,
} from '../data/forms-queries'
import {
  formPersistenceMessage,
  type FormDefinitionDetail,
  type FormVersion,
} from '../data/forms-types'

type EditorView = 'builder' | 'preview' | 'history'

function versionLabel(version: FormVersion | undefined) {
  if (!version) return 'No version available'
  return `Version ${version.versionNumber} ${version.state === 'published' ? 'Published' : 'Draft'}`
}

function FormWorkspace({
  detail,
  refresh,
}: {
  detail: FormDefinitionDetail
  refresh: () => Promise<void>
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const draft = detail.versions.find((version) => version.state === 'draft')
  const latestPublished = detail.versions.find((version) => version.state === 'published')
  const [schema, setSchema] = useState<FormSchema>(
    draft?.definition ?? latestPublished?.definition ?? {
      title: detail.title,
      description: detail.description ?? '',
      steps: [],
    },
  )
  const [revision, setRevision] = useState(draft?.revision ?? 0)
  const [isDirty, setIsDirty] = useState(false)
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const saveMutation = useSaveFormDraft()
  const publishMutation = usePublishFormDraft()
  const createDraftMutation = useCreateDraftFromPublished()

  const requestedView = searchParams.get('view')
  const activeView: EditorView = requestedView === 'history'
    ? 'history'
    : requestedView === 'preview' || !draft
      ? 'preview'
      : 'builder'
  const requestedVersionId = searchParams.get('version')
  const selectedVersion = detail.versions.find((version) => version.id === requestedVersionId)
    ?? draft
    ?? latestPublished
    ?? detail.versions[0]
  const previewSchema = selectedVersion?.id === draft?.id ? schema : selectedVersion?.definition

  const showView = (view: EditorView, versionId?: string) => {
    const next = new URLSearchParams()
    if (view !== 'builder') next.set('view', view)
    if (versionId) next.set('version', versionId)
    setSearchParams(next)
  }

  const saveCurrentDraft = async () => {
    if (!draft) throw new Error('This form has no editable draft. Create a new draft first.')
    try {
      const saved = await saveMutation.mutateAsync({
        formDefinitionId: detail.id,
        definition: schema,
        title: schema.title,
        description: schema.description,
        expectedRevision: revision,
      })
      setRevision(saved.revision)
      setIsDirty(false)
      return saved
    } catch (error) {
      throw new Error(formPersistenceMessage(error, 'Unable to save this draft.'), { cause: error })
    }
  }

  const handlePublish = async () => {
    if (!draft) return
    setPublishError(null)
    try {
      if (isDirty) await saveCurrentDraft()
      const published = await publishMutation.mutateAsync(detail.id)
      setPublishDialogOpen(false)
      showView('preview', published.versionId)
      await refresh()
    } catch (error) {
      setPublishError(formPersistenceMessage(error, 'Unable to publish this version.'))
    }
  }

  const handleCreateDraft = async () => {
    setPageError(null)
    try {
      await createDraftMutation.mutateAsync(detail.id)
      showView('builder')
      await refresh()
    } catch (error) {
      setPageError(formPersistenceMessage(error, 'Unable to create a new draft.'))
    }
  }

  const headingVersion = draft ?? latestPublished

  return (
    <div className="page employee-page">
      <Link className="back-link" to="/hr/forms">← Back to forms</Link>

      <div className="page-heading">
        <div>
          <p className="eyebrow">Form builder</p>
          <h1>{detail.title}</h1>
          <p className="subtitle">
            {versionLabel(headingVersion)}
            {draft ? ` · Revision ${revision}` : ''}
            {isDirty ? ' · Unsaved changes' : ''}
          </p>
        </div>

        {!draft && latestPublished && !detail.archivedAt && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={createDraftMutation.isPending}
            onClick={() => void handleCreateDraft()}
          >
            <Plus size={16} aria-hidden="true" />
            {createDraftMutation.isPending ? 'Creating…' : 'Create New Draft'}
          </button>
        )}
      </div>

      {detail.archivedAt && (
        <p className="error">This form is archived. Its versions remain available for history and preview only.</p>
      )}
      {pageError && <p className="error" role="alert">{pageError}</p>}

      <div className="view-switcher" role="tablist" aria-label="Form editor view" style={{ alignSelf: 'flex-start' }}>
        {draft && (
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'builder'}
            onClick={() => showView('builder')}
            className={`view-switcher-btn${activeView === 'builder' ? ' active' : ''}`}
          >
            <LayoutGrid size={15} aria-hidden="true" /> Builder
          </button>
        )}
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'preview'}
          onClick={() => showView('preview', selectedVersion?.id)}
          className={`view-switcher-btn${activeView === 'preview' ? ' active' : ''}`}
        >
          <Eye size={15} aria-hidden="true" /> Employee Preview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'history'}
          onClick={() => showView('history')}
          className={`view-switcher-btn${activeView === 'history' ? ' active' : ''}`}
        >
          <History size={15} aria-hidden="true" /> Version History
        </button>
      </div>

      {activeView === 'builder' && draft && (
        <FormBuilder
          schema={schema}
          onChangeSchema={(nextSchema) => {
            setSchema(nextSchema)
            setIsDirty(true)
          }}
          onSwitchToPreview={() => showView('preview', draft.id)}
          onSaveDraft={async () => {
            await saveCurrentDraft()
          }}
          headerActions={(
            <button
              type="button"
              className="btn btn-ghost"
              disabled={publishMutation.isPending || saveMutation.isPending}
              onClick={() => {
                setPublishError(null)
                setPublishDialogOpen(true)
              }}
            >
              Publish
            </button>
          )}
        />
      )}

      {activeView === 'preview' && (
        previewSchema && selectedVersion ? (
          <div className="page" style={{ gap: '1.25rem' }}>
            <div className="card" style={{ paddingBlock: '0.85rem' }}>
              <strong>{versionLabel(selectedVersion)}</strong>
              <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                {selectedVersion.state === 'published' ? 'Immutable published version' : 'Current draft preview'}
              </span>
            </div>
            {previewSchema.steps.length > 0 ? (
              <NoltDynamicForm
                key={selectedVersion.id}
                schema={previewSchema}
                onSwitchToBuilder={draft && selectedVersion.id === draft.id ? () => showView('builder') : undefined}
              />
            ) : (
              <div className="card empty-state">
                <h2>This version has no sections to preview.</h2>
              </div>
            )}
          </div>
        ) : (
          <div className="card empty-state"><h2>No form version is available to preview.</h2></div>
        )
      )}

      {activeView === 'history' && (
        <FormVersionHistory
          versions={detail.versions}
          onPreview={(versionId) => showView('preview', versionId)}
        />
      )}

      {publishDialogOpen && draft && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="publish-form-title">
          <div className="modal-card">
            <h2 id="publish-form-title">Publish Version {draft.versionNumber}?</h2>
            <p className="modal-description">
              Published versions cannot be edited. Future changes will create a new draft version.
            </p>
            {isDirty && (
              <p className="modal-description">Your current changes will be saved before publication.</p>
            )}
            {publishError && <p className="error" role="alert">{publishError}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={publishMutation.isPending || saveMutation.isPending}
                onClick={() => setPublishDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={publishMutation.isPending || saveMutation.isPending}
                onClick={() => void handlePublish()}
              >
                {publishMutation.isPending || saveMutation.isPending
                  ? 'Publishing…'
                  : `Publish Version ${draft.versionNumber}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function FormEditorPage() {
  const { formId } = useParams()
  const detailQuery = useFormDefinition(formId)

  if (detailQuery.isLoading) {
    return <div className="page"><p>Loading form…</p></div>
  }
  if (detailQuery.error) {
    return (
      <div className="page">
        <Link className="back-link" to="/hr/forms">← Back to forms</Link>
        <p className="error">Unable to load this form.</p>
      </div>
    )
  }
  if (!detailQuery.data) {
    return (
      <div className="page">
        <Link className="back-link" to="/hr/forms">← Back to forms</Link>
        <div className="card empty-state">
          <h1>Form not found</h1>
          <p>This form does not exist or is no longer available.</p>
        </div>
      </div>
    )
  }

  const draft = detailQuery.data.versions.find((version) => version.state === 'draft')
  const latestPublished = detailQuery.data.versions.find((version) => version.state === 'published')
  const workspaceKey = draft?.id ?? latestPublished?.id ?? detailQuery.data.id

  return (
    <FormWorkspace
      key={workspaceKey}
      detail={detailQuery.data}
      refresh={async () => {
        await detailQuery.refetch()
      }}
    />
  )
}
