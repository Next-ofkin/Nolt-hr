import React, { useState } from 'react'
import { FileCheck } from 'lucide-react'

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
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card modal-card-wide no-padding">
        <div className="modal-header">
          <div className="modal-header-info">
            <span className="modal-header-icon">
              <FileCheck style={{ width: 18, height: 18 }} />
            </span>
            <div>
              <h3>Add Required Document</h3>
              <p>Specify a document requirement for new employees.</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {error && <p className="error" style={{ margin: 0 }}>{error}</p>}

            <div className="field">
              <label htmlFor="doc-title">
                Document Title <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                id="doc-title"
                type="text"
                placeholder="e.g. Passport Photograph, Proof of Address"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  if (error) setError(null)
                }}
                autoFocus
              />
            </div>

            <div className="field">
              <label htmlFor="doc-description">
                Instructions / Description <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(Optional)</span>
              </label>
              <textarea
                id="doc-description"
                placeholder="e.g. Upload a clear color copy of your passport photo page."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
              />
              <span>Mandatory requirement (employee must provide to complete package)</span>
            </label>
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn btn-ghost">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Add Requirement
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
