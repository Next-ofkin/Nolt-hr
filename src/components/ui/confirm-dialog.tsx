import React from 'react'
import { AlertTriangle, Trash2, Archive, RotateCcw, HelpCircle, Loader2 } from 'lucide-react'

export interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'primary'
  icon?: 'trash' | 'archive' | 'warning' | 'restore' | 'help'
  isLoading?: boolean
  onConfirm: () => void
  onClose: () => void
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  icon = 'warning',
  isLoading = false,
  onConfirm,
  onClose,
}) => {
  if (!isOpen) return null

  const getIcon = () => {
    switch (icon) {
      case 'trash':
        return <Trash2 style={{ width: 22, height: 22, color: '#ef4444' }} />
      case 'archive':
        return <Archive style={{ width: 22, height: 22, color: '#f59e0b' }} />
      case 'restore':
        return <RotateCcw style={{ width: 22, height: 22, color: '#3b82f6' }} />
      case 'help':
        return <HelpCircle style={{ width: 22, height: 22, color: '#8b5cf6' }} />
      case 'warning':
      default:
        return <AlertTriangle style={{ width: 22, height: 22, color: variant === 'danger' ? '#ef4444' : '#f59e0b' }} />
    }
  }

  const getHeaderBg = () => {
    switch (variant) {
      case 'danger':
        return 'rgba(239, 68, 68, 0.12)'
      case 'warning':
        return 'rgba(245, 158, 11, 0.12)'
      case 'primary':
      default:
        return 'rgba(139, 92, 246, 0.12)'
    }
  }

  const getConfirmBtnStyle = (): React.CSSProperties => {
    if (variant === 'danger') {
      return {
        background: '#dc2626',
        color: '#ffffff',
        border: 'none',
        padding: '0.5rem 1.25rem',
        borderRadius: '8px',
        fontWeight: 600,
        cursor: isLoading ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        transition: 'all 0.15s ease',
        boxShadow: '0 2px 6px rgba(220, 38, 38, 0.3)',
      }
    }
    if (variant === 'warning') {
      return {
        background: '#d97706',
        color: '#ffffff',
        border: 'none',
        padding: '0.5rem 1.25rem',
        borderRadius: '8px',
        fontWeight: 600,
        cursor: isLoading ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        transition: 'all 0.15s ease',
        boxShadow: '0 2px 6px rgba(217, 119, 6, 0.3)',
      }
    }
    return {
      background: '#7c3aed',
      color: '#ffffff',
      border: 'none',
      padding: '0.5rem 1.25rem',
      borderRadius: '8px',
      fontWeight: 600,
      cursor: isLoading ? 'not-allowed' : 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.4rem',
      transition: 'all 0.15s ease',
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onClose()
      }}
    >
      <div className="modal-card" style={{ maxWidth: '440px', padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              background: getHeaderBg(),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {getIcon()}
          </div>
          <div>
            <h3 style={{ margin: '0 0 0.35rem', fontSize: '1.15rem', fontWeight: 600 }}>{title}</h3>
            {description && (
              <p style={{ margin: 0, color: 'var(--text-muted, #94a3b8)', fontSize: '0.9rem', lineHeight: 1.45 }}>
                {description}
              </p>
            )}
          </div>
        </div>

        <div
          className="modal-actions"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            marginTop: '1.5rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--border, rgba(255, 255, 255, 0.1))',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            style={{
              background: 'transparent',
              border: '1px solid var(--border, rgba(255, 255, 255, 0.15))',
              color: 'var(--text-main, #f8fafc)',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              fontWeight: 500,
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            style={getConfirmBtnStyle()}
          >
            {isLoading && <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
