import * as React from 'react'
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { ToastMessage, ToastVariant } from './use-toast'

export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  toast: ToastMessage
  onDismiss: (id: string) => void
}

const variantStyles: Record<ToastVariant, { container: string; icon: React.ReactNode }> = {
  default: {
    container: 'bg-slate-900 text-white border-slate-800 shadow-xl',
    icon: <Info className="h-5 w-5 text-indigo-400 shrink-0" />,
  },
  success: {
    container: 'bg-emerald-950/90 text-emerald-100 border-emerald-800/80 shadow-emerald-950/40 shadow-xl',
    icon: <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />,
  },
  destructive: {
    container: 'bg-rose-950/90 text-rose-100 border-rose-800/80 shadow-rose-950/40 shadow-xl',
    icon: <AlertCircle className="h-5 w-5 text-rose-400 shrink-0" />,
  },
  warning: {
    container: 'bg-amber-950/90 text-amber-100 border-amber-800/80 shadow-amber-950/40 shadow-xl',
    icon: <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />,
  },
}

export const Toast: React.FC<ToastProps> = ({ toast: t, onDismiss, className, ...props }) => {
  const { container, icon } = variantStyles[t.variant || 'default']

  return (
    <div
      className={cn(
        'group pointer-events-auto relative flex w-full max-w-md items-start justify-between space-x-3 overflow-hidden rounded-xl border p-4 shadow-2xl transition-all duration-300 backdrop-blur-md animate-in slide-in-from-bottom-5 fade-in-80',
        container,
        className,
      )}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        padding: '0.875rem 1rem',
        borderRadius: '0.75rem',
        borderWidth: '1px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
      }}
      {...props}
    >
      <div style={{ marginTop: '0.125rem' }}>{icon}</div>

      <div style={{ flex: 1 }}>
        {t.title && (
          <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.3 }}>
            {t.title}
          </h4>
        )}
        {t.description && (
          <p style={{ margin: t.title ? '0.25rem 0 0' : 0, fontSize: '0.8125rem', opacity: 0.9, lineHeight: 1.4 }}>
            {t.description}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => onDismiss(t.id)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'currentColor',
          opacity: 0.6,
          cursor: 'pointer',
          padding: '0.2rem',
          borderRadius: '0.375rem',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        className="hover:opacity-100 transition-opacity"
        aria-label="Close notification"
      >
        <X style={{ width: 14, height: 14 }} />
      </button>
    </div>
  )
}
