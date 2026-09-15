import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Save,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { useAcceptFormImportJob, useCancelFormImportJob, useFormImportJob } from '../lib/form-import-queries'
import { FormDocumentRenderer } from '../components/FormDocumentRenderer'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { supabase } from '../lib/supabase'
import { slugifyFieldKey } from '../lib/form-builder-domain'
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
  const [pdfSignedUrl, setPdfSignedUrl] = useState<string | null>(null)

  // Field Inspector State
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  // Load job proposed schema into state
  useEffect(() => {
    if (job?.proposed_schema && loadedJobId !== job.id) {
      queueMicrotask(() => {
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
      })
    }
  }, [job, loadedJobId])

  // Fetch signed URL for private PDF source
  useEffect(() => {
    if (job?.source_object_path) {
      let isMounted = true
      supabase.storage
        .from('form-imports')
        .createSignedUrl(job.source_object_path, 3600)
        .then(({ data }) => {
          if (isMounted && data?.signedUrl) {
            setPdfSignedUrl(data.signedUrl)
          }
        })
      return () => {
        isMounted = false
      }
    }
  }, [job?.source_object_path])

  if (isLoading) {
    return (
      <div className="p-8 max-w-7xl mx-auto text-center space-y-3">
        <Sparkles className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
        <p className="text-gray-500 text-sm">Loading AI PDF import job review…</p>
      </div>
    )
  }

  if (error || !job) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-4">
        <h1 className="text-xl font-bold">Import Job Not Found</h1>
        <Link to="/hr/forms">
          <Button variant="outline">Back to Forms</Button>
        </Link>
      </div>
    )
  }

  const isAnalyzing = ['UPLOADED', 'ANALYZING'].includes(job.status)
  const isFailed = job.status === 'FAILED'

  // Flagged items count
  const flaggedIndices = fields
    .map((f, idx) => (f.needs_review ? idx : null))
    .filter((idx): idx is number => idx !== null)

  const flaggedCount = flaggedIndices.length

  const handleNextFlagged = () => {
    if (flaggedIndices.length === 0) return
    const currentPos = selectedIdx !== null ? flaggedIndices.indexOf(selectedIdx) : -1
    const nextPos = (currentPos + 1) % flaggedIndices.length
    setSelectedIdx(flaggedIndices[nextPos])
  }

  const handlePrevFlagged = () => {
    if (flaggedIndices.length === 0) return
    const currentPos = selectedIdx !== null ? flaggedIndices.indexOf(selectedIdx) : -1
    const prevPos = currentPos <= 0 ? flaggedIndices.length - 1 : currentPos - 1
    setSelectedIdx(flaggedIndices[prevPos])
  }

  const handleUpdateSelectedField = (updates: Record<string, unknown>) => {
    if (selectedIdx === null) return
    const next = [...fields]
    const current = { ...next[selectedIdx], ...updates }

    // Auto-update field_key if label changes and field_key wasn't manually edited
    if (updates.label && typeof updates.label === 'string') {
      current.field_key = slugifyFieldKey(updates.label)
    }

    next[selectedIdx] = current
    setFields(next)
    setSaveStatus('saving')
    setTimeout(() => setSaveStatus('saved'), 600)
  }

  const handleAcceptImport = async () => {
    if (job.status !== 'READY_FOR_REVIEW') {
      setActionError('Only jobs ready for review can be accepted as draft forms.')
      return
    }

    if (!name.trim()) {
      setActionError('Form name is required.')
      return
    }

    if (flaggedCount > 0) {
      const proceed = window.confirm(
        `There are ${flaggedCount} items flagged for review. Create DRAFT form anyway?`
      )
      if (!proceed) return
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

  // Selected Field mockup for inspector
  const selectedField = selectedIdx !== null ? fields[selectedIdx] : null
  const selectedFieldConfig = (selectedField?.configuration as Record<string, unknown>) || {}
  const selectedFieldLayout = (selectedFieldConfig.layout as Record<string, unknown>) || {}

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

  const flaggedFieldIds = new Set(
    fields.map((f, idx) => (f.needs_review ? `mock-fld-${idx}` : null)).filter(Boolean) as string[]
  )

  const selectedMockId = selectedIdx !== null ? `mock-fld-${selectedIdx}` : null

  return (
    <div className="min-h-screen bg-gray-100/60 flex flex-col">
      {/* Top Workspace Header */}
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between shadow-sm sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Link to="/hr/forms">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-gray-900">AI PDF Import Review</h1>
              <Badge variant={job.status === 'READY_FOR_REVIEW' ? 'success' : 'warning'}>
                {job.status}
              </Badge>
              {saveStatus === 'saving' && <span className="text-xs text-blue-600 font-medium">Saving...</span>}
              {saveStatus === 'saved' && <span className="text-xs text-green-600 font-medium flex items-center gap-1"><Save className="w-3 h-3" /> Saved</span>}
            </div>
            <p className="text-xs text-gray-500">
              Source PDF: <strong>{job.original_filename}</strong>
            </p>
          </div>
        </div>

        {/* Review Toolbar & Action */}
        <div className="flex items-center gap-3">
          {job.status === 'READY_FOR_REVIEW' && (
            <div className="flex items-center gap-2 border-r pr-3">
              <span className="text-xs text-gray-600 font-medium">
                Flagged: <strong>{flaggedCount}</strong>
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={flaggedCount === 0}
                onClick={handlePrevFlagged}
              >
                <ChevronLeft className="w-3 h-3 mr-1" /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={flaggedCount === 0}
                onClick={handleNextFlagged}
              >
                Next <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          )}

          <Button variant="ghost" onClick={handleCancel} disabled={acceptMutation.isPending}>
            Cancel
          </Button>

          {job.status === 'READY_FOR_REVIEW' && (
            <Button variant="primary" disabled={acceptMutation.isPending} onClick={handleAcceptImport}>
              <Sparkles className="w-4 h-4 mr-2" />
              {acceptMutation.isPending ? 'Creating Draft…' : 'Create Draft Form'}
            </Button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-md">
          {actionError}
        </div>
      )}

      {/* Analysis Status Banners */}
      {isAnalyzing && (
        <div className="p-12 max-w-2xl mx-auto my-auto text-center space-y-4">
          <Card className="p-8 text-center bg-blue-50/50 border-blue-200 space-y-3">
            <Sparkles className="w-10 h-10 text-blue-600 animate-spin mx-auto" />
            <h2 className="text-lg font-semibold text-blue-900">Analyzing Blank Form PDF…</h2>
            <p className="text-sm text-blue-700 max-w-md mx-auto">
              NOLT AI is extracting multi-column rows, section headings, repeating tables, and signature blocks.
            </p>
          </Card>
        </div>
      )}

      {isFailed && (
        <div className="p-12 max-w-2xl mx-auto my-auto text-center space-y-4">
          <Card className="p-8 text-center bg-red-50/50 border-red-200 space-y-3">
            <AlertTriangle className="w-10 h-10 text-red-600 mx-auto" />
            <h2 className="text-lg font-semibold text-red-900">Analysis Could Not Complete</h2>
            <p className="text-sm text-red-700 max-w-md mx-auto">
              {job.error_message || 'The AI PDF import service encountered an error.'}
            </p>
            <div className="pt-2">
              <Button variant="outline" onClick={handleCancel}>
                Cancel & Return to Forms
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Full 2-Pane Side-by-Side Review Workspace */}
      {job.status === 'READY_FOR_REVIEW' && (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden p-4 gap-4">
          {/* Left Pane: Source PDF Preview */}
          <div className="w-full md:w-1/2 flex flex-col bg-white border rounded-lg shadow-sm overflow-hidden">
            <div className="bg-gray-50 border-b px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-500" />
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Source PDF</span>
              </div>
              {pdfSignedUrl && (
                <a href={pdfSignedUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  <Eye className="w-3 h-3" /> Open Full Window
                </a>
              )}
            </div>

            <div className="flex-1 bg-gray-200 relative min-h-[500px]">
              {pdfSignedUrl ? (
                <iframe src={pdfSignedUrl} title="Source PDF" className="w-full h-full min-h-[650px] border-0" />
              ) : (
                <div className="flex items-center justify-center h-full text-xs text-gray-500">
                  Loading source PDF preview...
                </div>
              )}
            </div>
          </div>

          {/* Right Pane: Proposed Digital Form Preview & Inspector */}
          <div className="w-full md:w-1/2 flex flex-col bg-white border rounded-lg shadow-sm overflow-hidden relative">
            <div className="bg-gray-50 border-b px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Digital Form Adaptation</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-2" />
                  <input
                    type="text"
                    placeholder="Search fields..."
                    className="pl-7 pr-2 py-1 text-xs border rounded-md w-36 focus:w-48 transition-all"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Badge variant="neutral">{mockFields.length} Questions Extracted</Badge>
              </div>
            </div>

            {/* Document Canvas Display */}
            <div className="flex-1 p-6 overflow-y-auto bg-gray-100/50">
              <FormDocumentRenderer
                version={mockVersion}
                fields={mockFields.filter(
                  (f) =>
                    !searchQuery ||
                    (f.label || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                    f.field_key.includes(searchQuery.toLowerCase())
                )}
                presentation={{ mode: presentationMode }}
                selectedFieldId={selectedMockId}
                flaggedFieldIds={flaggedFieldIds}
                onSelectField={(mockId) => {
                  const idx = parseInt(mockId.replace('mock-fld-', ''), 10)
                  if (!isNaN(idx)) setSelectedIdx(idx)
                }}
              />
            </div>

            {/* Selected Field Inspector Sheet / Side Panel */}
            {selectedField && (
              <div className="absolute inset-y-0 right-0 w-80 bg-white border-l shadow-xl z-20 flex flex-col p-4 overflow-y-auto space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h3 className="text-sm font-bold text-gray-900">Edit Selected Field</h3>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedIdx(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Label</Label>
                    <Input
                      className="h-8 text-xs"
                      value={String(selectedField.label || '')}
                      onChange={(e) => handleUpdateSelectedField({ label: e.target.value })}
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Machine Key (snake_case)</Label>
                    <Input
                      className="h-8 text-xs font-mono"
                      value={String(selectedField.field_key || '')}
                      onChange={(e) => handleUpdateSelectedField({ field_key: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Field Type</Label>
                      <select
                        className="w-full h-8 text-xs border rounded px-2"
                        value={String(selectedField.field_type)}
                        onChange={(e) => handleUpdateSelectedField({ field_type: e.target.value })}
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
                      <Label className="text-xs">Grid Span</Label>
                      <select
                        className="w-full h-8 text-xs border rounded px-2"
                        value={Number(selectedFieldLayout.span || 12)}
                        onChange={(e) =>
                          handleUpdateSelectedField({
                            configuration: {
                              ...selectedFieldConfig,
                              layout: { ...selectedFieldLayout, span: Number(e.target.value) },
                            },
                          })
                        }
                      >
                        <option value={12}>12 (Full Width)</option>
                        <option value={6}>6 (Half Width)</option>
                        <option value={4}>4 (Third Width)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="fld_req"
                      checked={Boolean(selectedField.required)}
                      onChange={(e) => handleUpdateSelectedField({ required: e.target.checked })}
                    />
                    <Label htmlFor="fld_req" className="text-xs cursor-pointer">
                      Required Field
                    </Label>
                  </div>

                  <div>
                    <Label className="text-xs">Data Classification</Label>
                    <select
                      className="w-full h-8 text-xs border rounded px-2"
                      value={String(selectedFieldConfig.dataClassification || 'GENERAL')}
                      onChange={(e) =>
                        handleUpdateSelectedField({
                          configuration: { ...selectedFieldConfig, dataClassification: e.target.value },
                        })
                      }
                    >
                      <option value="GENERAL">General Biodata</option>
                      <option value="SENSITIVE_HEALTH">Sensitive Health Data</option>
                      <option value="SENSITIVE_FINANCIAL">Sensitive Financial Data</option>
                    </select>
                  </div>

                  {Boolean(selectedField.needs_review) && (
                    <div className="pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs text-green-700 border-green-300 bg-green-50"
                        onClick={() => handleUpdateSelectedField({ needs_review: false })}
                      >
                        ✓ Mark Reviewed
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
