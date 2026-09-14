import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Trash2, PlusCircle, Sparkles } from 'lucide-react'
import { useAcceptFormImportJob, useCancelFormImportJob, useFormImportJob } from '../lib/form-import-queries'
import { FormDocumentRenderer } from '../components/FormDocumentRenderer'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Label } from '../components/ui/label'
import type { FormField, FormVersion, Json } from '../lib/database.types'

export default function FormImportReviewPage() {
  const { importJobId } = useParams()
  const navigate = useNavigate()

  const { data: job, isLoading, error } = useFormImportJob(importJobId)
  const acceptMutation = useAcceptFormImportJob()
  const cancelMutation = useCancelFormImportJob()

  const [name, setName] = useState('')
  const [category, setCategory] = useState('General')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [presentationMode, setPresentationMode] = useState<'STANDARD' | 'DOCUMENT' | 'AGREEMENT'>('DOCUMENT')
  const [fields, setFields] = useState<Array<Record<string, unknown>>>([])
  const [actionError, setActionError] = useState<string | null>(null)
  const [loadedJobId, setLoadedJobId] = useState<string | null>(null)

  if (job?.proposed_schema && loadedJobId !== job.id) {
    setLoadedJobId(job.id)
    const schema = job.proposed_schema as Record<string, unknown>
    const formInfo = (schema.form as Record<string, unknown>) || {}
    setName(String(formInfo.name || job.original_filename.replace(/\.pdf$/i, '')))
    setCategory(String(formInfo.category || 'General'))
    setDescription(String(formInfo.description || ''))
    setInstructions(String(formInfo.instructions || ''))
    const pres = (formInfo.presentation as Record<string, unknown>) || {}
    setPresentationMode((pres.mode as 'STANDARD' | 'DOCUMENT' | 'AGREEMENT') || 'DOCUMENT')
    setFields((schema.fields as Array<Record<string, unknown>>) || [])
  }

  if (isLoading) {
    return (
      <div className="page p-6 max-w-7xl mx-auto">
        <p className="text-gray-500">Loading AI PDF import job review…</p>
      </div>
    )
  }

  if (error || !job) {
    return (
      <div className="page p-6 max-w-7xl mx-auto space-y-4">
        <h1 className="text-xl font-bold">Import Job Not Found</h1>
        <Link to="/hr/forms">
          <Button variant="outline">Back to Forms</Button>
        </Link>
      </div>
    )
  }

  const isAnalyzing = ['UPLOADED', 'ANALYZING'].includes(job.status)
  const isFailed = job.status === 'FAILED'

  const handleAddField = () => {
    const newField = {
      field_type: 'SHORT_TEXT',
      label: 'New Field',
      field_key: `new_field_${fields.length + 1}`,
      required: false,
      description: null,
      placeholder: null,
      configuration: {},
      position: fields.length,
      needs_review: false,
    }
    setFields([...fields, newField])
  }

  const handleRemoveField = (idx: number) => {
    setFields(fields.filter((_, i) => i !== idx))
  }

  const handleUpdateField = (idx: number, updates: Record<string, unknown>) => {
    const next = [...fields]
    next[idx] = { ...next[idx], ...updates }
    setFields(next)
  }

  const handleAcceptImport = async () => {
    if (!name.trim()) {
      setActionError('Form name is required.')
      return
    }

    setActionError(null)
    try {
      const res = await acceptMutation.mutateAsync({
        jobId: job.id,
        name: name.trim(),
        category: category.trim() || 'General',
        description: description.trim(),
        instructions: instructions.trim(),
        presentation: { mode: presentationMode },
        fields,
      })

      // Redirect directly to Form Studio builder as V1 DRAFT
      navigate(`/hr/forms/${res.templateId}/builder/${res.versionId}`)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create DRAFT form.')
    }
  }

  const handleCancel = async () => {
    if (window.confirm('Cancel PDF import job? The temporary source file will be cleaned up.')) {
      await cancelMutation.mutateAsync(job.id)
      navigate('/hr/forms')
    }
  }

  // Convert proposed fields array to FormField mockup format for renderer
  const mockVersion: FormVersion = {
    id: 'mock-ver',
    form_template_id: 'mock-tpl',
    version_number: 1,
    status: 'DRAFT',
    title: name || 'Form Title',
    description: description || null,
    instructions: instructions || null,
    published_at: null,
    published_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    presentation_config: { mode: presentationMode },
  }

  const mockFields: FormField[] = fields.map((f, idx) => ({
    id: `mock-fld-${idx}`,
    form_version_id: 'mock-ver',
    field_type: String(f.field_type || 'SHORT_TEXT') as FormField['field_type'],
    label: String(f.label || ''),
    description: f.description ? String(f.description) : null,
    placeholder: f.placeholder ? String(f.placeholder) : null,
    required: Boolean(f.required),
    position: idx,
    field_key: String(f.field_key || `field_${idx}`),
    configuration: (f.configuration as unknown as Json) || {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }))

  return (
    <div className="page p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b pb-4">
        <div className="flex items-center gap-3">
          <Link to="/hr/forms">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">AI PDF Import Review</h1>
              <Badge variant={job.status === 'READY_FOR_REVIEW' ? 'success' : 'warning'}>
                {job.status}
              </Badge>
            </div>
            <p className="text-xs text-gray-500">
              Source PDF: <strong>{job.original_filename}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={handleCancel} disabled={acceptMutation.isPending}>
            Cancel Import
          </Button>
          <Button
            variant="primary"
            disabled={isAnalyzing || isFailed || acceptMutation.isPending}
            onClick={handleAcceptImport}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {acceptMutation.isPending ? 'Creating Draft…' : 'Create Draft Form'}
          </Button>
        </div>
      </div>

      {actionError && (
        <div className="alert alert-error" role="alert">
          <p>{actionError}</p>
        </div>
      )}

      {/* Analysis Status Banners */}
      {isAnalyzing && (
        <Card className="p-8 text-center bg-blue-50/50 border-blue-200">
          <div className="flex flex-col items-center space-y-3">
            <Sparkles className="w-8 h-8 text-blue-600 animate-spin" />
            <h2 className="text-lg font-semibold text-blue-900">Analyzing Blank Form PDF…</h2>
            <p className="text-sm text-blue-700 max-w-md">
              NOLT AI is extracting form sections, field types, headings, and legal clauses. This page will update automatically when ready.
            </p>
          </div>
        </Card>
      )}

      {isFailed && (
        <Card className="p-8 text-center bg-red-50/50 border-red-200">
          <div className="flex flex-col items-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-red-600" />
            <h2 className="text-lg font-semibold text-red-900">Analysis Could Not Complete</h2>
            <p className="text-sm text-red-700 max-w-md">
              {job.error_message || 'The AI PDF import service is currently not configured or encountered an error.'}
            </p>
            <div className="pt-3">
              <Button variant="outline" onClick={handleCancel}>
                Cancel & Return to Forms
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Side-by-side Review Grid */}
      {job.status === 'READY_FOR_REVIEW' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Form Settings & Field Editor List */}
          <div className="lg:col-span-5 space-y-6">
            <Card className="p-5 space-y-4">
              <h2 className="font-semibold text-base border-b pb-2">Document Settings</h2>
              <div className="space-y-3">
                <div>
                  <Label>Form Title *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <Label>Category</Label>
                  <Input value={category} onChange={(e) => setCategory(e.target.value)} />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <div>
                  <Label>Instructions for Employee</Label>
                  <Textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
                </div>
                <div>
                  <Label>Presentation Mode</Label>
                  <select
                    className="input"
                    value={presentationMode}
                    onChange={(e) => setPresentationMode(e.target.value as 'STANDARD' | 'DOCUMENT' | 'AGREEMENT')}
                  >
                    <option value="STANDARD">Standard Questionnaire</option>
                    <option value="DOCUMENT">Official HR Document</option>
                    <option value="AGREEMENT">Legal Agreement</option>
                  </select>
                </div>
              </div>
            </Card>

            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <h2 className="font-semibold text-base">Extracted Fields ({fields.length})</h2>
                <Button variant="ghost" size="sm" onClick={handleAddField}>
                  <PlusCircle className="w-4 h-4 mr-1" /> Add Field
                </Button>
              </div>

              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                {fields.map((f, idx) => (
                  <div key={idx} className="p-3 border rounded-md space-y-2 bg-gray-50/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-gray-400">#{idx + 1}</span>
                        {Boolean(f.needs_review) && (
                          <Badge variant="warning" className="text-[10px]">
                            Needs Review
                          </Badge>
                        )}
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-red-600" onClick={() => handleRemoveField(idx)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Type</Label>
                        <select
                          className="input input-sm text-xs"
                          value={String(f.field_type)}
                          onChange={(e) => handleUpdateField(idx, { field_type: e.target.value })}
                        >
                          <option value="SHORT_TEXT">Short Text</option>
                          <option value="LONG_TEXT">Long Text</option>
                          <option value="EMAIL">Email</option>
                          <option value="PHONE">Phone</option>
                          <option value="NUMBER">Number</option>
                          <option value="DATE">Date</option>
                          <option value="DROPDOWN">Dropdown</option>
                          <option value="RADIO">Radio</option>
                          <option value="CHECKBOX">Checkbox</option>
                          <option value="YES_NO">Yes / No</option>
                          <option value="HEADING">Heading</option>
                          <option value="PARAGRAPH">Paragraph</option>
                          <option value="DIVIDER">Divider</option>
                          <option value="FILE_UPLOAD">File Upload</option>
                          <option value="SIGNATURE">Signature</option>
                          <option value="REPEATING_GROUP">Repeating Group</option>
                        </select>
                      </div>

                      <div>
                        <Label className="text-xs">Machine Key</Label>
                        <Input
                          className="input-sm text-xs"
                          value={String(f.field_key || '')}
                          onChange={(e) => handleUpdateField(idx, { field_key: e.target.value })}
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs">Label / Content</Label>
                      <Input
                        className="input-sm text-xs"
                        value={String(f.label || '')}
                        onChange={(e) => handleUpdateField(idx, { label: e.target.value })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Right Column: Live Document Preview */}
          <div className="lg:col-span-7">
            <Card className="p-6 bg-gray-100 min-h-[700px] flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold uppercase text-gray-500">Proposed Form Preview</span>
                <Badge variant="neutral">Mode: {presentationMode}</Badge>
              </div>

              <div className="flex-1 bg-white shadow-md rounded-md p-8 border">
                <FormDocumentRenderer
                  version={mockVersion}
                  fields={mockFields}
                  presentation={{ mode: presentationMode }}
                  readOnly
                />
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
