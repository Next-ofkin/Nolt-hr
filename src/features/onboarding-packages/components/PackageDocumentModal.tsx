import React, { useState } from 'react'
import { FileCheck, X } from 'lucide-react'

interface PackageDocumentModalProps {
  isOpen: boolean
  onClose: () => void
  onAddDocument: (doc: { documentTitle: string; documentDescription: string; required: boolean }) => void
}

export const PackageDocumentModal: React.FC<PackageDocumentModalProps> = ({
  isOpen,
  onClose,
  onAddDocument,
}) => {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [required, setRequired] = useState(true)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('Document requirement title cannot be empty.')
      return
    }
    onAddDocument({
      documentTitle: title.trim(),
      documentDescription: description.trim(),
      required,
    })
    setTitle('')
    setDescription('')
    setRequired(true)
    setError(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <div className="flex items-center space-x-2">
            <div className="rounded-md bg-amber-50 p-2 text-amber-600">
              <FileCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Add Required Document</h3>
              <p className="text-xs text-slate-500">Specify a document requirement for new employees.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-xs text-red-600">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Document Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Passport Photograph, Proof of Address"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                if (error) setError(null)
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Instructions / Description <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              placeholder="e.g. Upload a clear color copy of your passport photo page."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="doc-required-toggle"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="doc-required-toggle" className="text-xs font-medium text-slate-700 cursor-pointer">
              Mandatory requirement (employee must provide to complete package)
            </label>
          </div>

          {/* Footer */}
          <div className="flex justify-end space-x-2 border-t border-slate-100 pt-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700 transition-colors shadow-sm"
            >
              Add Requirement
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
