import React, { useState } from 'react'
import { Ban, Loader2 } from 'lucide-react'

interface CancelOnboardingDialogProps {
  isOpen: boolean
  packageTitle: string
  isLoading: boolean
  onConfirm: (reason: string) => void
  onClose: () => void
}

export const CancelOnboardingDialog: React.FC<CancelOnboardingDialogProps> = ({
  isOpen,
  packageTitle,
  isLoading,
  onConfirm,
  onClose,
}) => {
  const [reason, setReason] = useState('')

  if (!isOpen) return null

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onClose()
      }}
    >
      <div className="modal-card" style={{ maxWidth: '460px', padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
          <div
            style={{
              width: 44, height: 44, borderRadius: 10, background: 'rgba(239, 68, 68, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <Ban style={{ width: 22, height: 22, color: '#ef4444' }} />
          </div>
          <div>
            <h3 style={{ margin: '0 0 0.35rem', fontSize: '1.15rem', fontWeight: 600 }}>
              Cancel "{packageTitle}"?
            </h3>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.45 }}>
              This assignment will be marked cancelled. The checklist and history remain visible; it cannot be undone.
            </p>
          </div>
        </div>

        <label className="package-editor-field-label" htmlFor="cancel-reason" style={{ display: 'block', marginBottom: '0.4rem' }}>
          Reason (optional)
        </label>
        <textarea
          id="cancel-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this assignment being cancelled?"
          rows={3}
          disabled={isLoading}
        />

        <div
          className="modal-actions"
          style={{
            display: 'flex', justifyContent: 'flex-end', gap: '0.75rem',
            marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)',
          }}
        >
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isLoading}>
            Keep Assignment
          </button>
          <button type="button" className="btn btn-danger" onClick={() => onConfirm(reason)} disabled={isLoading}>
            {isLoading && <Loader2 style={{ width: 16, height: 16, marginRight: '0.4rem' }} className="spin" />}
            Cancel Assignment
          </button>
        </div>
      </div>
    </div>
  )
}
