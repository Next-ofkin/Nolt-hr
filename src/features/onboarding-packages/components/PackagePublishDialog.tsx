import React from 'react'
import { Sparkles, AlertTriangle } from 'lucide-react'

interface PackagePublishDialogProps {
  isOpen: boolean
  versionNumber: number
  isPublishing: boolean
  onClose: () => void
  onConfirmPublish: () => void
}

export const PackagePublishDialog: React.FC<PackagePublishDialogProps> = ({
  isOpen,
  versionNumber,
  isPublishing,
  onClose,
  onConfirmPublish,
}) => {
  if (!isOpen) return null

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <h2>Publish Version {versionNumber}?</h2>

        <div className="modal-alert" style={{ margin: '0.75rem 0 1rem' }}>
          <AlertTriangle style={{ width: 18, height: 18 }} />
          <div>
            <strong>Published versions are permanent and immutable.</strong>
            <p style={{ margin: '0.2rem 0 0' }}>
              Once published, the package items and pinned form versions cannot be edited or deleted.
              Future changes will require branching a Version {versionNumber + 1} draft.
            </p>
          </div>
        </div>

        <p className="modal-description" style={{ margin: 0 }}>
          Are you sure you want to publish this onboarding package version?
        </p>

        <div className="modal-actions">
          <button type="button" onClick={onClose} disabled={isPublishing} className="btn btn-ghost">
            Cancel
          </button>
          <button type="button" onClick={onConfirmPublish} disabled={isPublishing} className="btn btn-primary">
            <Sparkles style={{ width: 15, height: 15, marginRight: '0.4rem' }} />
            {isPublishing ? 'Publishing…' : `Publish Version ${versionNumber}`}
          </button>
        </div>
      </div>
    </div>
  )
}
