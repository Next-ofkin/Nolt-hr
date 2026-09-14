import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileText, PlusCircle, UploadCloud, AlertCircle } from 'lucide-react'
import { useArchiveFormTemplate, useFormTemplates } from '../lib/form-builder-queries'
import { useUploadAndAnalyzePdf } from '../lib/form-import-queries'
import { Button } from '../components/ui/button'
import { Card, CardTitle, CardDescription, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'

function displayDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value.includes('T') ? value : `${value}T00:00:00`).toLocaleDateString()
}

export default function FormsPage() {
  const navigate = useNavigate()
  const { data: templates, isLoading, error } = useFormTemplates()
  const archiveMutation = useArchiveFormTemplate()
  const uploadMutation = useUploadAndAnalyzePdf()

  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setUploadError(null)
    if (!file) return

    if (file.type !== 'application/pdf') {
      setUploadError('Only PDF files are supported.')
      return
    }

    if (file.size > 15 * 1024 * 1024) {
      setUploadError('PDF file size must not exceed 15 MB.')
      return
    }

    setSelectedFile(file)
  }

  const handleStartImport = async () => {
    if (!selectedFile) return
    setUploadError(null)
    try {
      const job = await uploadMutation.mutateAsync(selectedFile)
      setIsImportModalOpen(false)
      setSelectedFile(null)
      navigate(`/hr/forms/import/${job.id}`)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload PDF.')
    }
  }

  if (isLoading) {
    return (
      <div className="page p-6 max-w-7xl mx-auto">
        <p className="text-gray-500">Loading HR forms library…</p>
      </div>
    )
  }

  return (
    <div className="page p-6 max-w-7xl mx-auto space-y-6">
      {/* Header & Page Title */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Forms Library</h1>
          <p className="text-sm text-gray-500 mt-1">
            Create, import and manage reusable HR forms and agreement templates.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => setIsImportModalOpen(true)}>
            <UploadCloud className="w-4 h-4 mr-2" />
            Import PDF
          </Button>
          <Link to="/hr/forms/new">
            <Button variant="primary">
              <PlusCircle className="w-4 h-4 mr-2" />
              Create Form
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <p>{error instanceof Error ? error.message : 'Failed to load form templates.'}</p>
        </div>
      )}

      {/* Templates List Table */}
      {!templates || templates.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent className="flex flex-col items-center justify-center space-y-3">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-full">
              <FileText className="w-8 h-8" />
            </div>
            <CardTitle>No HR form templates yet</CardTitle>
            <CardDescription>
              Create your first HR form manually or import a blank PDF document to get started.
            </CardDescription>
            <div className="flex gap-3 pt-3">
              <Button variant="secondary" onClick={() => setIsImportModalOpen(true)}>
                Import PDF
              </Button>
              <Link to="/hr/forms/new">
                <Button variant="primary">+ Create Form</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Form Name</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Last Updated</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((tpl) => (
                  <tr key={tpl.id}>
                    <td>
                      <Link to={`/hr/forms/${tpl.id}`} className="font-semibold text-blue-700 hover:underline">
                        {tpl.name}
                      </Link>
                      {tpl.description && (
                        <p className="text-xs text-gray-500 truncate max-w-md">{tpl.description}</p>
                      )}
                    </td>
                    <td>
                      <Badge variant="neutral">{tpl.category || 'General'}</Badge>
                    </td>
                    <td>
                      {tpl.is_active ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="neutral">Archived</Badge>
                      )}
                    </td>
                    <td className="text-xs text-gray-500">{displayDate(tpl.updated_at)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="flex justify-end gap-2">
                        <Link to={`/hr/forms/${tpl.id}`}>
                          <Button variant="ghost" size="sm">
                            Manage
                          </Button>
                        </Link>
                        {tpl.is_active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-800"
                            onClick={() => {
                              if (window.confirm(`Archive "${tpl.name}"?`)) {
                                archiveMutation.mutate(tpl.id)
                              }
                            }}
                          >
                            Archive
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* AI PDF Import Modal */}
      {isImportModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card max-w-lg">
            <h2>Import PDF Form Template</h2>
            <p className="modal-description mt-1">
              Upload a blank form template (PDF). NOLT AI will analyze the layout and propose an editable digital draft.
            </p>

            <div className="alert alert-warning my-3 flex items-start gap-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong>Important Privacy Notice:</strong> Upload blank form templates only. Do NOT upload completed employee forms containing personal data.
              </div>
            </div>

            {uploadError && (
              <div className="alert alert-error my-3" role="alert">
                <p>{uploadError}</p>
              </div>
            )}

            <div className="form-group my-4">
              <label className="block text-sm font-medium mb-1">Select PDF File (Max 15 MB)</label>
              <input
                type="file"
                accept="application/pdf"
                className="input cursor-pointer"
                onChange={handleFileChange}
              />
              {selectedFile && (
                <p className="text-xs text-gray-600 mt-1 font-medium">
                  Selected: {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                </p>
              )}
            </div>

            <div className="modal-actions mt-6">
              <Button
                variant="ghost"
                disabled={uploadMutation.isPending}
                onClick={() => {
                  setIsImportModalOpen(false)
                  setSelectedFile(null)
                  setUploadError(null)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!selectedFile || uploadMutation.isPending}
                onClick={handleStartImport}
              >
                {uploadMutation.isPending ? 'Uploading & Analyzing…' : 'Start AI Analysis'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
