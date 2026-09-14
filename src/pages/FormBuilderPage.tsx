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
  LayoutGrid,
  Search,
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
  validateFormVersionForPublishing,
  type FieldCategory,
} from '../lib/form-builder-domain'
import { FormDocumentRenderer } from '../components/FormDocumentRenderer'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import type { FormField, FormFieldType, Json } from '../lib/database.types'

const PALETTE_CATEGORIES: Array<{ key: FieldCategory; label: string }> = [
  { key: 'text', label: 'Text Input' },
  { key: 'choice', label: 'Choices' },
  { key: 'other', label: 'Date & Other' },
  { key: 'advanced', label: 'Uploads, Signatures & Data' },
  { key: 'content', label: 'Content & Layout' },
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
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [keyError, setKeyError] = useState<string | null>(null)
  const [leftTab, setLeftTab] = useState<'FIELDS' | 'STRUCTURE'>('FIELDS')
  const [searchQuery, setSearchQuery] = useState('')

  const template = templateQuery.data
  const version = versionQuery.data
  const fields = fieldsQuery.data ?? []

  const isLoading = templateQuery.isLoading || versionQuery.isLoading || fieldsQuery.isLoading

  if (isLoading) {
    return (
      <div className="page p-6 max-w-7xl mx-auto">
        <p className="text-gray-500">Loading NOLT Form Studio…</p>
      </div>
    )
  }

  if (templateQuery.error || versionQuery.error || !template || !version) {
    return (
      <div className="page p-6 max-w-7xl mx-auto space-y-3">
        <h1 className="text-xl font-bold">Form Studio item not found</h1>
        <Link to="/hr/forms">
          <Button variant="outline">Back to Forms</Button>
        </Link>
      </div>
    )
  }

  const isEditable = isFormVersionEditable(version.status)
  const selectedField = fields.find((f) => f.id === selectedFieldId)
  const presentationConfig = (version.presentation_config as Record<string, unknown>) || {}
  const currentMode = (presentationConfig.mode as 'STANDARD' | 'DOCUMENT' | 'AGREEMENT') || 'STANDARD'

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
    try {
      await deleteFieldMutation.mutateAsync(fieldId)
      if (selectedFieldId === fieldId) {
        setSelectedFieldId(null)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete field.')
    }
  }

  const handleMoveField = async (currentIndex: number, direction: 'up' | 'down') => {
    if (!isEditable) return
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (targetIndex < 0 || targetIndex >= fields.length) return

    const reordered = [...fields]
    const [moved] = reordered.splice(currentIndex, 1)
    reordered.splice(targetIndex, 0, moved)

    const orderedIds = reordered.map((f) => f.id)

    try {
      await reorderFieldsMutation.mutateAsync(orderedIds)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reorder fields.')
    }
  }

  const handleOpenPublishModal = () => {
    setPublishError(null)
    const err = validateFormVersionForPublishing(version.title, fields)
    if (err) {
      setPublishError(err)
    }
    setIsPublishModalOpen(true)
  }

  const handlePublish = async () => {
    const err = validateFormVersionForPublishing(version.title, fields)
    if (err) {
      setPublishError(err)
      return
    }

    try {
      await publishMutation.mutateAsync()
      setIsPublishModalOpen(false)
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Failed to publish form version.')
    }
  }

  const handleCreateDraft = async () => {
    try {
      const newVersionId = await createDraftMutation.mutateAsync(version.id)
      navigate(`/hr/forms/${template.id}/builder/${newVersionId}`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create new draft version.')
    }
  }

  return (
    <div className="builder-page flex flex-col h-screen overflow-hidden bg-gray-50">
      {/* Studio Top Header */}
      <header className="builder-navbar h-14 bg-white border-b px-4 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3">
          <Link to={`/hr/forms/${template.id}`}>
            <Button variant="ghost" size="sm">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </Link>
          <div className="h-4 w-px bg-gray-200" />
          <h1 className="font-semibold text-base text-gray-900 truncate max-w-xs md:max-w-md">
            {template.name}
          </h1>
          <Badge variant="neutral" className="text-xs">
            v{version.version_number}
          </Badge>
          <Badge variant={version.status === 'PUBLISHED' ? 'success' : 'warning'} className="text-xs">
            {version.status}
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          {/* Presentation Mode Selector */}
          <div className="hidden md:flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Mode:</span>
            <select
              className="input input-sm text-xs py-1"
              disabled={!isEditable}
              value={currentMode}
              onChange={(e) => {
                const mode = e.target.value
                updateVersionMutation.mutate({
                  presentation_config: { ...presentationConfig, mode },
                })
              }}
            >
              <option value="STANDARD">Standard</option>
              <option value="DOCUMENT">Document</option>
              <option value="AGREEMENT">Agreement</option>
            </select>
          </div>

          <Button variant="outline" size="sm" onClick={() => setIsPreviewOpen(true)}>
            <Eye className="w-4 h-4 mr-1.5" />
            Preview
          </Button>

          {isEditable ? (
            <Button variant="primary" size="sm" onClick={handleOpenPublishModal}>
              <Send className="w-4 h-4 mr-1.5" />
              Publish Version
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={handleCreateDraft}>
              <Plus className="w-4 h-4 mr-1.5" />
              Create New Draft
            </Button>
          )}
        </div>
      </header>

      {/* Read-Only Notice Banner */}
      {!isEditable && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 flex items-center justify-between shrink-0">
          <span>
            <strong>Read-Only Mode:</strong> Version {version.version_number} is PUBLISHED and immutable.
          </span>
          <Button variant="ghost" size="sm" className="h-6 text-xs text-amber-900" onClick={handleCreateDraft}>
            Create New Draft
          </Button>
        </div>
      )}

      {/* Main Studio 3-Panel Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Palette & Structure */}
        <aside className="w-72 bg-white border-r flex flex-col shrink-0">
          <div className="p-3 border-b flex items-center gap-2 bg-gray-50">
            <Button
              variant={leftTab === 'FIELDS' ? 'primary' : 'ghost'}
              size="sm"
              className="flex-1 text-xs"
              onClick={() => setLeftTab('FIELDS')}
            >
              Fields Palette
            </Button>
            <Button
              variant={leftTab === 'STRUCTURE' ? 'primary' : 'ghost'}
              size="sm"
              className="flex-1 text-xs"
              onClick={() => setLeftTab('STRUCTURE')}
            >
              Structure
            </Button>
          </div>

          {leftTab === 'FIELDS' ? (
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search fields..."
                  className="input input-sm pl-8 text-xs w-full"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {PALETTE_CATEGORIES.map((cat) => {
                const categoryMetas = Object.values(FIELD_TYPE_METADATA)
                  .filter((m) => m.category === cat.key)
                  .filter((m) => !searchQuery || m.label.toLowerCase().includes(searchQuery.toLowerCase()))

                if (categoryMetas.length === 0) return null

                return (
                  <div key={cat.key} className="space-y-2">
                    <h3 className="text-xs font-bold uppercase text-gray-400 tracking-wider">
                      {cat.label}
                    </h3>
                    <div className="grid grid-cols-1 gap-1.5">
                      {categoryMetas.map((meta) => (
                        <button
                          key={meta.type}
                          type="button"
                          disabled={!isEditable}
                          className="w-full text-left p-2 border rounded-md hover:border-blue-500 hover:bg-blue-50/50 transition-all text-xs flex items-center justify-between group disabled:opacity-50 disabled:pointer-events-none"
                          onClick={() => handleAddField(meta.type)}
                        >
                          <span className="font-medium text-gray-800 group-hover:text-blue-900">
                            {meta.label}
                          </span>
                          <Plus className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-600" />
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <h3 className="text-xs font-bold uppercase text-gray-400 tracking-wider mb-2">
                Document Structure ({fields.length})
              </h3>
              {fields.map((f, idx) => (
                <div
                  key={f.id}
                  className={`p-2 border rounded-md text-xs cursor-pointer flex items-center justify-between ${
                    selectedFieldId === f.id ? 'border-blue-600 bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedFieldId(f.id)}
                >
                  <div className="truncate pr-2">
                    <span className="font-semibold text-gray-500 mr-1.5">#{idx + 1}</span>
                    <span>{f.label || f.field_key}</span>
                  </div>
                  <Badge variant="neutral" className="text-[10px] shrink-0">
                    {f.field_type}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Center Workspace: A4 Document Canvas */}
        <main className="flex-1 bg-gray-200 overflow-y-auto p-6 md:p-10 flex justify-center">
          <div className="w-full max-w-4xl bg-white shadow-xl rounded-md border min-h-[900px] p-8 md:p-12 relative flex flex-col">
            {/* Header Editable Block */}
            <div className="mb-6 pb-4 border-b space-y-2">
              {isEditable ? (
                <>
                  <input
                    type="text"
                    className="input text-2xl font-bold border-none px-0 focus:ring-0 w-full"
                    value={version.title}
                    placeholder="Form Title"
                    onChange={(e) => updateVersionMutation.mutate({ title: e.target.value })}
                  />
                  <textarea
                    className="input text-sm text-gray-600 border-none px-0 focus:ring-0 w-full resize-none"
                    rows={2}
                    value={version.description || ''}
                    placeholder="Form Description for HR reference..."
                    onChange={(e) => updateVersionMutation.mutate({ description: e.target.value })}
                  />
                  <textarea
                    className="input text-sm text-blue-900 bg-blue-50/50 p-2 rounded border-none w-full resize-none"
                    rows={2}
                    value={version.instructions || ''}
                    placeholder="Instructions for employee filling this form (optional)..."
                    onChange={(e) => updateVersionMutation.mutate({ instructions: e.target.value })}
                  />
                </>
              ) : (
                <>
                  <h1 className="text-2xl font-bold text-gray-900">{version.title}</h1>
                  {version.description && <p className="text-sm text-gray-600">{version.description}</p>}
                </>
              )}
            </div>

            {/* Document Canvas Fields */}
            <div className="flex-1">
              {fields.length === 0 ? (
                <div className="py-20 text-center text-gray-400 border-2 border-dashed rounded-lg">
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="font-semibold text-sm">Form Document Canvas is Empty</p>
                  <p className="text-xs mt-1">Click any field type from the Left Palette to build your form.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {fields.map((field, idx) => (
                    <div
                      key={field.id}
                      className={`relative p-3 border rounded-md transition-all cursor-pointer ${
                        selectedFieldId === field.id ? 'border-blue-600 ring-2 ring-blue-100 bg-blue-50/20' : 'hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedFieldId(field.id)}
                    >
                      {/* Floating Control Toolbar */}
                      {isEditable && (
                        <div className="absolute top-2 right-2 flex items-center gap-1 bg-white/90 shadow-sm border rounded p-0.5 z-10" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="p-1 hover:bg-gray-100 rounded text-gray-600 disabled:opacity-30"
                            disabled={idx === 0}
                            title="Move Up"
                            onClick={() => handleMoveField(idx, 'up')}
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            className="p-1 hover:bg-gray-100 rounded text-gray-600 disabled:opacity-30"
                            disabled={idx === fields.length - 1}
                            title="Move Down"
                            onClick={() => handleMoveField(idx, 'down')}
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            className="p-1 hover:bg-gray-100 rounded text-gray-600"
                            title="Duplicate"
                            onClick={() => handleDuplicateField(field)}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            className="p-1 hover:bg-red-50 text-red-600 rounded"
                            title="Delete"
                            onClick={() => handleDeleteField(field.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      <FormDocumentRenderer
                        version={version}
                        fields={[field]}
                        presentation={{ mode: currentMode, showHeader: false, showFooter: false }}
                        selectedFieldId={selectedFieldId}
                        onSelectField={setSelectedFieldId}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Right Panel: Property Inspector */}
        <aside className="w-80 bg-white border-l flex flex-col shrink-0">
          <div className="p-3 border-b bg-gray-50 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-gray-800">Field Settings Inspector</h2>
            {selectedField && (
              <Badge variant="neutral" className="text-[10px]">
                {selectedField.field_type}
              </Badge>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {!selectedField ? (
              <div className="py-12 text-center text-xs text-gray-400 space-y-2">
                <LayoutGrid className="w-8 h-8 mx-auto opacity-40" />
                <p>Click any field in the document canvas to inspect and edit properties.</p>
              </div>
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
          </div>
        </aside>
      </div>

      {/* Live Preview Modal */}
      {isPreviewOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Badge variant="success">LIVE PREVIEW</Badge>
                <h2 className="text-lg font-bold">{version.title}</h2>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setIsPreviewOpen(false)}>
                ✕ Close
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto py-6">
              <FormDocumentRenderer
                version={version}
                fields={fields}
                presentation={{ mode: currentMode }}
                readOnly
              />
            </div>
          </div>
        </div>
      )}

      {/* Publish Confirmation Modal */}
      {isPublishModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card max-w-md">
            <h2 className="text-lg font-bold">Publish Form Version {version.version_number}?</h2>
            <p className="text-sm text-gray-600 mt-2">
              Publishing makes Version {version.version_number} immutable. Future edits will require creating a new draft version.
            </p>

            {publishError && (
              <div className="alert alert-error my-3" role="alert">
                <p>{publishError}</p>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <Button variant="ghost" disabled={publishMutation.isPending} onClick={() => setIsPublishModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={publishMutation.isPending} onClick={handlePublish}>
                {publishMutation.isPending ? 'Publishing…' : 'Publish Version'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

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
  const config = (field.configuration as Record<string, unknown>) || {}
  const layout = (config.layout as Record<string, unknown>) || {}
  const span = (layout.span as number) || 12

  const handleKeyChange = (val: string) => {
    const trimmed = val.toLowerCase().trim()
    if (!trimmed || !/^[a-z][a-z0-9_]*$/.test(trimmed)) {
      onKeyErrorChange('Field key must start with a lowercase letter and contain only a-z, 0-9, and _.')
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

  const handleSpanChange = (newSpan: number) => {
    const newConfig = { ...config, layout: { ...layout, span: newSpan } }
    onUpdate({ configuration: newConfig as Json })
  }

  return (
    <div className="space-y-4 text-xs">
      <div>
        <label className="font-semibold block mb-1">Field Label / Title</label>
        <input
          type="text"
          className="input input-sm w-full"
          disabled={!isEditable}
          value={field.label || ''}
          onChange={(e) => onUpdate({ label: e.target.value })}
        />
      </div>

      <div>
        <label className="font-semibold block mb-1">Machine Key *</label>
        <input
          type="text"
          className="input input-sm w-full font-mono"
          disabled={!isEditable}
          value={field.field_key}
          onChange={(e) => handleKeyChange(e.target.value)}
        />
        {keyError && <p className="text-red-600 mt-1">{keyError}</p>}
      </div>

      <div>
        <label className="font-semibold block mb-1">Layout Column Width</label>
        <select
          className="input input-sm w-full"
          disabled={!isEditable}
          value={span}
          onChange={(e) => handleSpanChange(Number(e.target.value))}
        >
          <option value={12}>Full Width (12/12)</option>
          <option value={6}>Half Width (6/12)</option>
          <option value={4}>Third Width (4/12)</option>
        </select>
      </div>

      <div>
        <label className="font-semibold block mb-1">Help Description</label>
        <input
          type="text"
          className="input input-sm w-full"
          disabled={!isEditable}
          value={field.description || ''}
          placeholder="Instructions below input"
          onChange={(e) => onUpdate({ description: e.target.value })}
        />
      </div>

      <div className="pt-2">
        <label className="flex items-center gap-2 cursor-pointer font-medium">
          <input
            type="checkbox"
            disabled={!isEditable}
            checked={field.required}
            onChange={(e) => onUpdate({ required: e.target.checked })}
          />
          Required field
        </label>
      </div>

      {/* Advanced Field Options */}
      {field.field_type === 'FILE_UPLOAD' && (
        <div className="pt-3 border-t space-y-2">
          <h4 className="font-bold uppercase text-gray-400">File Upload Rules</h4>
          <div>
            <label className="block mb-1">Allowed File Types</label>
            <input
              type="text"
              className="input input-sm w-full"
              disabled={!isEditable}
              value={String(config.allowedTypes || 'PDF, DOCX, PNG')}
              onChange={(e) => {
                const newCfg = { ...config, allowedTypes: e.target.value }
                onUpdate({ configuration: newCfg as Json })
              }}
            />
          </div>
        </div>
      )}

      {field.field_type === 'SIGNATURE' && (
        <div className="pt-3 border-t space-y-2">
          <h4 className="font-bold uppercase text-gray-400">Signature Rules</h4>
          <div>
            <label className="block mb-1">Signer Role</label>
            <input
              type="text"
              className="input input-sm w-full"
              disabled={!isEditable}
              value={String(config.signerRole || 'Employee')}
              onChange={(e) => {
                const newCfg = { ...config, signerRole: e.target.value }
                onUpdate({ configuration: newCfg as Json })
              }}
            />
          </div>
        </div>
      )}

      {field.field_type === 'REPEATING_GROUP' && (
        <div className="pt-3 border-t space-y-2">
          <h4 className="font-bold uppercase text-gray-400">Repeating Group Columns</h4>
          <p className="text-gray-500">Configured as repeatable table rows in Form Studio.</p>
        </div>
      )}
    </div>
  )
}
