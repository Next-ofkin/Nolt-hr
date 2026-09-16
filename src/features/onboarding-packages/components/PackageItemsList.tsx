import React from 'react'
import { FileText, FileCheck, ArrowUp, ArrowDown, Trash2, Eye } from 'lucide-react'
import type { PackageItemInput } from '../data/onboarding-packages-types'

interface PackageItemsListProps {
  items: PackageItemInput[]
  isReadOnly?: boolean
  onMoveUp?: (index: number) => void
  onMoveDown?: (index: number) => void
  onRemove?: (index: number) => void
  onPreviewForm?: (formVersionId: string, formTitle?: string) => void
}

export const PackageItemsList: React.FC<PackageItemsListProps> = ({
  items,
  isReadOnly = false,
  onMoveUp,
  onMoveDown,
  onRemove,
  onPreviewForm,
}) => {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center bg-slate-50/50">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
          <FileText className="h-6 w-6" />
        </div>
        <h4 className="text-sm font-semibold text-slate-700">No items added to this package yet</h4>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          Add published form versions or required document specifications using the actions above.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      {items.map((item, index) => {
        const isFirst = index === 0
        const isLast = index === items.length - 1
        const isForm = item.itemType === 'form'

        return (
          <div
            key={item.id || `${item.itemType}-${index}`}
            className="group flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 shadow-sm transition-all"
          >
            <div className="flex items-center space-x-3.5 min-w-0">
              {/* Item Index / Icon */}
              <div className="flex items-center space-x-2 shrink-0">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">
                  {index + 1}
                </span>
                <div
                  className={`rounded-lg p-2 ${
                    isForm ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'
                  }`}
                >
                  {isForm ? <FileText className="h-4 w-4" /> : <FileCheck className="h-4 w-4" />}
                </div>
              </div>

              {/* Details */}
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <h4 className="text-sm font-semibold text-slate-900 truncate">
                    {isForm ? item.formTitle || 'Form' : item.documentTitle}
                  </h4>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                      isForm ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {isForm ? `Form (Version ${item.formVersionNumber ?? 1})` : 'Document Requirement'}
                  </span>
                  {item.required ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-800">
                      Required
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                      Optional
                    </span>
                  )}
                </div>

                {!isForm && item.documentDescription && (
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{item.documentDescription}</p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-1 shrink-0 ml-4">
              {isForm && onPreviewForm && item.formVersionId && (
                <button
                  type="button"
                  onClick={() => onPreviewForm(item.formVersionId, item.formTitle)}
                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  title="Preview Form"
                >
                  <Eye className="h-4 w-4" />
                </button>
              )}

              {!isReadOnly && (
                <>
                  <button
                    type="button"
                    disabled={isFirst}
                    onClick={() => onMoveUp?.(index)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    title="Move Up"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={isLast}
                    onClick={() => onMoveDown?.(index)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    title="Move Down"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove?.(index)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Remove Item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
