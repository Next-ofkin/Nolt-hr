import React from 'react'
import { Sparkles, X, AlertTriangle } from 'lucide-react'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <div className="flex items-center space-x-2">
            <div className="rounded-md bg-indigo-50 p-2 text-indigo-600">
              <Sparkles className="h-5 w-5" />
            </div>
            <h3 className="text-base font-semibold text-slate-900">Publish Version {versionNumber}?</h3>
          </div>
          <button
            onClick={onClose}
            disabled={isPublishing}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-3 text-sm text-slate-600">
          <div className="rounded-lg bg-amber-50/80 border border-amber-200 p-3.5 flex items-start space-x-3 text-amber-900">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed space-y-1">
              <p className="font-semibold text-amber-950">Published versions are permanent and immutable.</p>
              <p>Once published, the package items and pinned form versions cannot be edited or deleted.</p>
              <p>Future changes will require branching a Version {versionNumber + 1} draft.</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 pt-1">
            Are you sure you want to publish this onboarding package version?
          </p>
        </div>

        <div className="flex justify-end space-x-2 border-t border-slate-100 bg-slate-50 px-6 py-3">
          <button
            onClick={onClose}
            disabled={isPublishing}
            className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirmPublish}
            disabled={isPublishing}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 flex items-center space-x-1.5"
          >
            {isPublishing ? (
              <span>Publishing...</span>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                <span>Publish Version {versionNumber}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
