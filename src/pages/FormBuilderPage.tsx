import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  Copy,
  Eye,
  FileText,
  Plus,
  Send,
  Trash2,
} from 'lucide-react'
import {
  useCreateFormDraftFromVersion,
  useCreateFormField,
  useDeleteFormField,
  useFormFields,
  useFormTemplate,
  useFormVersion,
  usePublishFormVersion,
  useReorderFormFields,
  useUpdateFormField,
  useUpdateFormVersion,
} from '../lib/form-builder-queries'
import {
  duplicateFieldPayload,
  FIELD_TYPE_METADATA,
  generateUniqueFieldKey,
  getDefaultConfiguration,
  isFormVersionEditable,
  slugifyFieldKey,
  validateFieldKey,
  validateFormVersionForPublishing,
} from '../lib/form-builder-domain'
import type { ChoiceOption, FieldCategory } from '../lib/form-builder-domain'
import type { FormField, FormFieldType, Json } from '../lib/database.types'

const PALETTE_CATEGORIES: Array<{ key: FieldCategory; label: string }> = [
  { key: 'text', label: 'Text Input' },
  { key: 'choice', label: 'Choices' },
  { key: 'other', label: 'Date & Other' },
  { key: 'content', label: 'Content' },
  { key: 'advanced', label: 'Advanced (Phase 2)' },
]

export default function FormBuilderPage() {
  const { templateId, versionId } = useParams()
  const navigate = useNavigate()

  const templateQuery = useFormTemplate(templateId)
  const versionQuery = useFormVersion(versionId)
  const fieldsQuery = useFormFields(versionId)

  const updateVersionMutation = useUpdateFormVersion(versionId)
  const createFieldMutation = useCreateFormField()
  const updateFieldMutation = useUpdateFormField(versionId)
  const deleteFieldMutation = useDeleteFormField(versionId)
  const reorderFieldsMutation = useReorderFormFields(versionId)
  const publishMutation = usePublishFormVersion(versionId)
  const createDraftMutation = useCreateFormDraftFromVersion(templateId)

  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [keyError, setKeyError] = useState<string | null>(null)

  const template = templateQuery.data
  const version = versionQuery.data
  const fields = fieldsQuery.data ?? []
  const isEditable = isFormVersionEditable(version?.status)

  const selectedField = fields.find((f) => f.id === selectedFieldId) ?? null

  if (templateQuery.isLoading || versionQuery.isLoading || fieldsQuery.isLoading) {
    return <div className="page"><p>Loading Form Builder…</p></div>
  }

  if (!template || !version) {
    return (
      <div className="page">
        <h1>Form or version not found</h1>
        <Link to="/hr/forms">Back to Forms</Link>
      </div>
    )
  }

  // --- Field Handlers ---
  const handleAddField = async (type: FormFieldType) => {
    if (!isEditable) return
    const meta = FIELD_TYPE_METADATA[type]
    const defaultLabel = meta.defaultLabel
    const newKey = generateUniqueFieldKey(defaultLabel, fields)
    const nextPosition = Math.max(-1, ...fields.map((f) => f.position)) + 1

    try {
      const newField = await createFieldMutation.mutateAsync({
        form_version_id: version.id,
        field_type: type,
        label: defaultLabel,
        field_key: newKey,
        position: nextPosition,
        required: false,
        configuration: getDefaultConfiguration(type) as Json,
      })
      setSelectedFieldId(newField.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add field.')
    }
  }

  const handleDuplicateField = async (field: FormField) => {
    if (!isEditable) return
    const payload = duplicateFieldPayload(field, fields)
    try {
      const newField = await createFieldMutation.mutateAsync(payload)
      setSelectedFieldId(newField.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to duplicate field.')
    }
  }

  const handleDeleteField = async (fieldId: string) => {
    if (!isEditable) return
    if (!window.confirm('Delete this field from the draft form?')) return
    try {
      await deleteFieldMutation.mutateAsync(fieldId)
      if (selectedFieldId === fieldId) setSelectedFieldId(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete field.')
    }
  }

  const handleMoveField = async (index: number, direction: 'up' | 'down') => {
    if (!isEditable) return
    const newFields = [...fields]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newFields.length) return

    const [moved] = newFields.splice(index, 1)
    newFields.splice(targetIndex, 0, moved)

    const orderedIds = newFields.map((f) => f.id)
    await reorderFieldsMutation.mutateAsync(orderedIds)
  }

  const handlePublish = async () => {
    const validationError = validateFormVersionForPublishing(version.title, fields)
    if (validationError) {
      setPublishError(validationError)
      return
    }

    setPublishError(null)
    try {
      await publishMutation.mutateAsync()
      setIsPublishModalOpen(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to publish form.'
      setPublishError(msg)
    }
  }

  const handleCreateNewDraftVersion = async () => {
    try {
      const newVersionId = await createDraftMutation.mutateAsync(version.id)
      navigate(`/hr/forms/${template.id}/builder/${newVersionId}`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create new draft version.')
    }
  }

  return (
    <div className="builder-container">
      {/* Header Bar */}
      <header className="builder-header">
        <div className="builder-header-left">
          <Link to={`/hr/forms/${template.id}`} className="btn btn-ghost btn-sm">
            <ChevronLeft size={16} aria-hidden="true" /> Exit Builder
          </Link>
          <div className="builder-title-meta">
            <h1>{version.title}</h1>
            <span className={version.status === 'PUBLISHED' ? 'badge badge-success' : 'badge badge-warning'}>
              v{version.version_number} {version.status}
            </span>
          </div>
        </div>

        <div className="builder-header-right">
          <button
            type="button"
            className={isPreviewMode ? 'btn btn-secondary' : 'btn btn-ghost'}
            onClick={() => setIsPreviewMode(!isPreviewMode)}
          >
            <Eye size={16} aria-hidden="true" /> {isPreviewMode ? 'Edit Form' : 'Preview Form'}
          </button>

          {isEditable ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setPublishError(null)
                setIsPublishModalOpen(true)
              }}
            >
              <Send size={16} aria-hidden="true" /> Publish Form
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={createDraftMutation.isPending}
              onClick={handleCreateNewDraftVersion}
            >

              <Plus size={16} aria-hidden="true" /> Create New Draft Version
            </button>
          )}
        </div>
      </header>

      {!isEditable && (
        <div className="alert alert-warning" style={{ borderRadius: 0, padding: '0.6rem 1.5rem', border: 'none' }}>
          <p>
            <strong>Read-only:</strong> Version {version.version_number} is published and immutable. Click <em>Create New Draft Version</em> to make edits.
          </p>
        </div>
      )}

      {/* Main Workspace */}
      {isPreviewMode ? (
        <FormPreviewOverlay version={version} fields={fields} onClose={() => setIsPreviewMode(false)} />
      ) : (
        <div className="builder-workspace">
          {/* Left Panel: Field Palette */}
          <aside className="builder-panel builder-palette">
            <h2>Field Palette</h2>
            <p className="panel-subtitle">Click to add fields to the canvas.</p>

            {PALETTE_CATEGORIES.map((cat) => (
              <div key={cat.key} className="palette-section">
                <h3>{cat.label}</h3>
                <div className="palette-grid">
                  {Object.values(FIELD_TYPE_METADATA)
                    .filter((m) => m.category === cat.key)
                    .map((meta) => (
                      <button
                        key={meta.type}
                        type="button"
                        className="palette-item"
                        disabled={!isEditable}
                        onClick={() => handleAddField(meta.type)}
                      >
                        <span className="palette-item-name">{meta.label}</span>
                        {meta.isAdvanced && <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>Phase 2</span>}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </aside>

          {/* Center Panel: Form Canvas */}
          <main className="builder-canvas">
            <div className="canvas-header-card card">
              {isEditable ? (
                <>
                  <input
                    type="text"
                    className="input input-title"
                    value={version.title}
                    placeholder="Form Title"
                    onChange={(e) => updateVersionMutation.mutate({ title: e.target.value })}
                  />
                  <textarea
                    className="input input-subtitle mt-2"
                    rows={2}
                    value={version.description || ''}
                    placeholder="Form Description or Instructions for employee..."
                    onChange={(e) => updateVersionMutation.mutate({ description: e.target.value })}
                  />
                </>
              ) : (
                <>
                  <h2>{version.title}</h2>
                  <p style={{ color: 'var(--text-muted)' }}>{version.description}</p>
                </>
              )}
            </div>

            <div className="canvas-fields-list">
              {fields.length === 0 ? (
                <div className="card empty-state my-4">
                  <FileText size={32} aria-hidden="true" />
                  <h2>Form canvas is empty</h2>
                  <p>Click any field type from the Left Palette to add your first field.</p>
                </div>
              ) : (
                fields.map((field, idx) => (
                  <div
                    key={field.id}
                    className={`canvas-field-card card ${selectedFieldId === field.id ? 'selected' : ''}`}
                    onClick={() => setSelectedFieldId(field.id)}
                  >
                    <div className="field-card-header">
                      <div className="field-card-info">
                        <span className="badge badge-neutral">{FIELD_TYPE_METADATA[field.field_type]?.label}</span>
                        <code className="field-key-badge">{field.field_key}</code>
                        {field.required && <span className="badge badge-danger">Required</span>}
                      </div>

                      {isEditable && (
                        <div className="field-card-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="btn-icon"
                            disabled={idx === 0}
                            title="Move Up"
                            onClick={() => handleMoveField(idx, 'up')}
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn-icon"
                            disabled={idx === fields.length - 1}
                            title="Move Down"
                            onClick={() => handleMoveField(idx, 'down')}
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn-icon"
                            title="Duplicate Field"
                            onClick={() => handleDuplicateField(field)}
                          >
                            <Copy size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn-icon danger"
                            title="Delete Field"
                            onClick={() => handleDeleteField(field.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="field-card-body mt-2">
                      <strong className="field-card-label">
                        {field.label || <em>Unlabeled Field</em>}
                      </strong>
                      {field.description && <p className="field-card-desc">{field.description}</p>}

                      {/* Mock Mini Visual Element */}
                      <div className="field-card-mock-input mt-2">
                        {field.field_type === 'SHORT_TEXT' && <input type="text" disabled placeholder={field.placeholder || 'Short text answer'} className="input input-sm" />}
                        {field.field_type === 'LONG_TEXT' && <textarea disabled placeholder={field.placeholder || 'Long text answer'} rows={2} className="input input-sm" />}
                        {field.field_type === 'EMAIL' && <input type="email" disabled placeholder="name@example.com" className="input input-sm" />}
                        {field.field_type === 'PHONE' && <input type="text" disabled placeholder="+234 800 000 0000" className="input input-sm" />}
                        {field.field_type === 'NUMBER' && <input type="number" disabled placeholder="0" className="input input-sm" />}
                        {field.field_type === 'DATE' && <input type="date" disabled className="input input-sm" />}
                        {field.field_type === 'HEADING' && <h3>{field.label}</h3>}
                        {field.field_type === 'PARAGRAPH' && <p>{String((field.configuration as Record<string, unknown>)?.content || 'Paragraph text content')}</p>}
                        {field.field_type === 'DIVIDER' && <hr />}
                        {['DROPDOWN', 'RADIO', 'CHECKBOX', 'YES_NO'].includes(field.field_type) && (
                          <div className="mock-choices">
                            {(((field.configuration as Record<string, unknown>)?.options as ChoiceOption[]) || []).map((opt, oIdx) => (
                              <span key={oIdx} className="choice-chip">
                                {opt.label}
                              </span>
                            ))}
                          </div>
                        )}
                        {['FILE_UPLOAD', 'SIGNATURE', 'REPEATING_GROUP'].includes(field.field_type) && (
                          <span className="text-muted" style={{ fontSize: '0.8rem' }}>[Phase 2 Feature]</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </main>

          {/* Right Panel: Field Settings Inspector */}
          <aside className="builder-panel builder-inspector">
            <h2>Field Settings</h2>
            {!selectedField ? (
              <p className="panel-subtitle">Click any field in the canvas to edit its properties.</p>
            ) : (
              <FieldInspector
                field={selectedField}
                fields={fields}
                isEditable={isEditable}
                keyError={keyError}
                onUpdate={(updates) => {
                  updateFieldMutation.mutate({ fieldId: selectedField.id, updates })
                }}
                onKeyErrorChange={setKeyError}
              />
            )}
          </aside>
        </div>
      )}

      {/* Publish Confirmation Modal */}
      {isPublishModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h2>Publish Form Version {version.version_number}?</h2>
            <p className="modal-description mt-2">
              Publishing will make Version {version.version_number} immutable. Future modifications will require creating a new draft version.
            </p>

            {publishError && (
              <div className="alert alert-error my-3" role="alert">
                <p>{publishError}</p>
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={publishMutation.isPending}
                onClick={() => setIsPublishModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={publishMutation.isPending}
                onClick={handlePublish}
              >
                {publishMutation.isPending ? 'Publishing…' : 'Publish Version'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// -------------------------------------------------------------
// Field Settings Inspector Component
// -------------------------------------------------------------
function FieldInspector({
  field,
  fields,
  isEditable,
  keyError,
  onUpdate,
  onKeyErrorChange,
}: {
  field: FormField
  fields: FormField[]
  isEditable: boolean
  keyError: string | null
  onUpdate: (updates: Partial<FormField>) => void
  onKeyErrorChange: (err: string | null) => void
}) {
  const [label, setLabel] = useState(field.label || '')
  const [fieldKey, setFieldKey] = useState(field.field_key)
  const [description, setDescription] = useState(field.description || '')
  const [placeholder, setPlaceholder] = useState(field.placeholder || '')
  const [required, setRequired] = useState(field.required)
  const [config, setConfig] = useState<Record<string, unknown>>((field.configuration as Record<string, unknown>) || {})

  const handleLabelChange = (newLabel: string) => {
    setLabel(newLabel)
    if (!isEditable) return

    // Auto-update key if key matches current auto-slug of old label
    const autoOldKey = slugifyFieldKey(field.label || '')
    if (fieldKey === autoOldKey) {
      const autoNewKey = generateUniqueFieldKey(newLabel, fields.filter((f) => f.id !== field.id))
      setFieldKey(autoNewKey)
      onKeyErrorChange(null)
      onUpdate({ label: newLabel, field_key: autoNewKey })
      return
    }
    onUpdate({ label: newLabel })
  }

  const handleKeyChange = (newKey: string) => {
    const trimmed = newKey.trim().toLowerCase()
    setFieldKey(trimmed)
    if (!validateFieldKey(trimmed)) {
      onKeyErrorChange('Field key must contain only lowercase letters, numbers, and underscores.')
      return
    }
    const isDuplicate = fields.some((f) => f.id !== field.id && f.field_key === trimmed)
    if (isDuplicate) {
      onKeyErrorChange('This field key is already in use in this version.')
      return
    }
    onKeyErrorChange(null)
    onUpdate({ field_key: trimmed })
  }

  const handleOptionsChange = (options: ChoiceOption[]) => {
    const newConfig = { ...config, options }
    setConfig(newConfig)
    onUpdate({ configuration: newConfig as unknown as Json })
  }

  const handleAddOption = () => {
    const currentOptions = (config.options as ChoiceOption[]) || []
    const idx = currentOptions.length + 1
    const newOptions = [...currentOptions, { label: `Option ${idx}`, value: `option_${idx}` }]
    handleOptionsChange(newOptions)
  }

  const handleRemoveOption = (index: number) => {
    const currentOptions = (config.options as ChoiceOption[]) || []
    const newOptions = currentOptions.filter((_, i) => i !== index)
    handleOptionsChange(newOptions)
  }

  const handleEditOption = (index: number, key: 'label' | 'value', val: string) => {
    const currentOptions = [...(((config.options as ChoiceOption[]) || []))]
    if (!currentOptions[index]) return
    currentOptions[index] = { ...currentOptions[index], [key]: val }
    if (key === 'label' && !currentOptions[index].value) {
      currentOptions[index].value = slugifyFieldKey(val)
    }
    handleOptionsChange(currentOptions)
  }

  return (
    <div className="inspector-content">
      <div className="inspector-header mb-3">
        <span className="badge badge-neutral">{FIELD_TYPE_METADATA[field.field_type]?.label}</span>
        <code className="field-key-badge">{field.field_key}</code>
      </div>

      <div className="form-group">
        <label>Field Label</label>
        <input
          type="text"
          className="input"
          disabled={!isEditable}
          value={label}
          onChange={(e) => handleLabelChange(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label>Field Machine Key *</label>
        <input
          type="text"
          className="input"
          disabled={!isEditable}
          value={fieldKey}
          onChange={(e) => handleKeyChange(e.target.value)}
        />
        {keyError && <p className="error" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>{keyError}</p>}
      </div>

      <div className="form-group">
        <label>Help Description</label>
        <input
          type="text"
          className="input"
          disabled={!isEditable}
          value={description}
          placeholder="Instructions shown below input"
          onChange={(e) => {
            setDescription(e.target.value)
            onUpdate({ description: e.target.value })
          }}
        />
      </div>

      <div className="form-group checkbox-group mt-2">
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            disabled={!isEditable}
            checked={required}
            onChange={(e) => {
              setRequired(e.target.checked)
              onUpdate({ required: e.target.checked })
            }}
          />
          Required field
        </label>
      </div>

      {['SHORT_TEXT', 'LONG_TEXT', 'EMAIL', 'PHONE', 'NUMBER'].includes(field.field_type) && (
        <div className="form-group mt-3">
          <label>Placeholder Text</label>
          <input
            type="text"
            className="input"
            disabled={!isEditable}
            value={placeholder}
            placeholder="e.g. Enter answer here"
            onChange={(e) => {
              setPlaceholder(e.target.value)
              onUpdate({ placeholder: e.target.value })
            }}
          />
        </div>
      )}

      {/* Choice Fields Options Editor */}
      {['DROPDOWN', 'RADIO', 'CHECKBOX', 'YES_NO'].includes(field.field_type) && (
        <div className="inspector-options-editor mt-4">
          <h3>Choice Options</h3>
          <div className="options-list mt-2">
            {(((config.options as ChoiceOption[]) || [])).map((opt, i) => (
              <div key={i} className="option-row mb-2">
                <input
                  type="text"
                  className="input input-sm"
                  disabled={!isEditable}
                  placeholder="Label"
                  value={opt.label}
                  onChange={(e) => handleEditOption(i, 'label', e.target.value)}
                />
                <input
                  type="text"
                  className="input input-sm"
                  disabled={!isEditable}
                  placeholder="Value"
                  value={opt.value}
                  onChange={(e) => handleEditOption(i, 'value', e.target.value)}
                />
                {isEditable && (
                  <button
                    type="button"
                    className="btn-icon danger"
                    title="Remove Option"
                    onClick={() => handleRemoveOption(i)}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          {isEditable && field.field_type !== 'YES_NO' && (
            <button
              type="button"
              className="btn btn-ghost btn-sm mt-2"
              onClick={handleAddOption}
            >
              + Add Option
            </button>
          )}
        </div>
      )}

      {/* Content Field Editor */}
      {['HEADING', 'PARAGRAPH'].includes(field.field_type) && (
        <div className="form-group mt-3">
          <label>Content Text</label>
          <textarea
            className="input"
            rows={3}
            disabled={!isEditable}
            value={String(config.content || '')}
            onChange={(e) => {
              const newCfg = { ...config, content: e.target.value }
              setConfig(newCfg)
              onUpdate({ configuration: newCfg as Json })
            }}
          />
        </div>
      )}
    </div>
  )
}

// -------------------------------------------------------------
// Live Preview Overlay Component
// -------------------------------------------------------------
function FormPreviewOverlay({
  version,
  fields,
  onClose,
}: {
  version: { title: string; description?: string | null }
  fields: FormField[]
  onClose: () => void
}) {
  return (
    <div className="preview-container">
      <div className="preview-card card">
        <div className="preview-header mb-4">
          <span className="badge badge-success mb-2">LIVE PREVIEW</span>
          <h1>{version.title}</h1>
          {version.description && <p className="subtitle">{version.description}</p>}
        </div>

        <form onSubmit={(e) => e.preventDefault()} className="preview-form">
          {fields.map((field) => (
            <div key={field.id} className="preview-field-group mb-4">
              {field.field_type !== 'HEADING' && field.field_type !== 'PARAGRAPH' && field.field_type !== 'DIVIDER' && (
                <label className="preview-label">
                  {field.label || 'Unlabeled'}
                  {field.required && <span style={{ color: 'var(--danger)', marginLeft: '0.25rem' }}>*</span>}
                </label>
              )}

              {field.description && <p className="preview-desc">{field.description}</p>}

              {field.field_type === 'SHORT_TEXT' && <input type="text" className="input" placeholder={field.placeholder || ''} />}
              {field.field_type === 'LONG_TEXT' && <textarea className="input" rows={4} placeholder={field.placeholder || ''} />}
              {field.field_type === 'EMAIL' && <input type="email" className="input" placeholder={field.placeholder || 'user@example.com'} />}
              {field.field_type === 'PHONE' && <input type="tel" className="input" placeholder={field.placeholder || '+234 800 000 0000'} />}
              {field.field_type === 'NUMBER' && <input type="number" className="input" placeholder={field.placeholder || '0'} />}
              {field.field_type === 'DATE' && <input type="date" className="input" />}

              {field.field_type === 'DROPDOWN' && (
                <select className="input">
                  <option value="">-- Select option --</option>
                  {(((field.configuration as Record<string, unknown>)?.options as ChoiceOption[]) || []).map((opt, i) => (
                    <option key={i} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              )}

              {field.field_type === 'RADIO' && (
                <div className="preview-choices-list">
                  {(((field.configuration as Record<string, unknown>)?.options as ChoiceOption[]) || []).map((opt, i) => (
                    <label key={i} className="choice-option-row">
                      <input type="radio" name={field.field_key} value={opt.value} />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              )}

              {field.field_type === 'CHECKBOX' && (
                <div className="preview-choices-list">
                  {(((field.configuration as Record<string, unknown>)?.options as ChoiceOption[]) || []).map((opt, i) => (
                    <label key={i} className="choice-option-row">
                      <input type="checkbox" value={opt.value} />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              )}

              {field.field_type === 'YES_NO' && (
                <div className="preview-choices-list flex-row">
                  <label className="choice-option-row">
                    <input type="radio" name={field.field_key} value="yes" />
                    <span>Yes</span>
                  </label>
                  <label className="choice-option-row">
                    <input type="radio" name={field.field_key} value="no" />
                    <span>No</span>
                  </label>
                </div>
              )}

              {field.field_type === 'HEADING' && <h2>{field.label || String((field.configuration as Record<string, unknown>)?.content || '')}</h2>}
              {field.field_type === 'PARAGRAPH' && <p>{String((field.configuration as Record<string, unknown>)?.content || field.label || '')}</p>}
              {field.field_type === 'DIVIDER' && <hr />}

              {['FILE_UPLOAD', 'SIGNATURE', 'REPEATING_GROUP'].includes(field.field_type) && (
                <div className="card text-center py-3" style={{ background: 'var(--bg)', color: 'var(--text-muted)' }}>
                  <em>{FIELD_TYPE_METADATA[field.field_type]?.label} — Supported in a later phase</em>
                </div>
              )}
            </div>
          ))}

          <div className="preview-actions mt-4 pt-3" style={{ borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
            <span className="text-muted" style={{ fontSize: '0.85rem' }}>Visual Preview Mode — Form submissions are disabled</span>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close Preview
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
