import React from 'react'
import { FileText, FileCheck, ArrowUp, ArrowDown, Trash2, Eye, Loader2 } from 'lucide-react'
import type { PackageItemInput } from '../data/onboarding-packages-types'

interface PackageItemsListProps {
  items: PackageItemInput[]
  isReadOnly?: boolean
  onMoveUp?: (index: number) => void
  onMoveDown?: (index: number) => void
  onRemove?: (index: number) => void
  onPreviewForm?: (formVersionId: string, formTitle?: string) => void
  /** formVersionId currently being fetched for preview, if any. */
  previewLoadingFormVersionId?: string | null
}

export const PackageItemsList: React.FC<PackageItemsListProps> = ({
  items,
  isReadOnly = false,
  onMoveUp,
  onMoveDown,
  onRemove,
  onPreviewForm,
  previewLoadingFormVersionId,
}) => {
  if (items.length === 0) {
    return (
      <div className="package-items-empty">
        <FileText style={{ width: 26, height: 26 }} />
        <div className="package-items-empty-title">No items added to this package yet</div>
        <div className="package-items-empty-hint">
          Add published form versions or required document specifications using the actions above.
        </div>
      </div>
    )
  }

  return (
    <div className="package-item-list">
      {items.map((item, index) => {
        const isFirst = index === 0
        const isLast = index === items.length - 1
        const isForm = item.itemType === 'form'

        return (
          <div key={item.id || `${item.itemType}-${index}`} className="package-item-row">
            <div className="package-item-info">
              <span className="package-item-index">{index + 1}</span>
              <span className={`package-item-icon ${isForm ? 'package-item-icon-form' : 'package-item-icon-document'}`}>
                {isForm ? <FileText style={{ width: 16, height: 16 }} /> : <FileCheck style={{ width: 16, height: 16 }} />}
              </span>

              <div className="package-item-details">
                <div className="package-item-title-row">
                  <span className="package-item-title">
                    {isForm ? item.formTitle || 'Form' : item.documentTitle}
                  </span>
                  <span className={`package-item-tag ${isForm ? 'package-item-tag-form' : 'package-item-tag-document'}`}>
                    {isForm ? `Form (Version ${item.formVersionNumber ?? 1})` : 'Document Requirement'}
                  </span>
                  <span className={`package-item-tag ${item.required ? 'package-item-tag-required' : 'package-item-tag-optional'}`}>
                    {item.required ? 'Required' : 'Optional'}
                  </span>
                </div>

                {!isForm && item.documentDescription && (
                  <p className="package-item-desc">{item.documentDescription}</p>
                )}
              </div>
            </div>

            <div className="package-item-actions">
              {isForm && onPreviewForm && item.formVersionId && (
                <button
                  type="button"
                  onClick={() => onPreviewForm(item.formVersionId, item.formTitle)}
                  disabled={previewLoadingFormVersionId === item.formVersionId}
                  className="btn-icon"
                  title="Preview Form"
                >
                  {previewLoadingFormVersionId === item.formVersionId ? (
                    <Loader2 style={{ width: 15, height: 15 }} className="spin" />
                  ) : (
                    <Eye style={{ width: 15, height: 15 }} />
                  )}
                </button>
              )}

              {!isReadOnly && (
                <>
                  <button
                    type="button"
                    disabled={isFirst}
                    onClick={() => onMoveUp?.(index)}
                    className="btn-icon"
                    title="Move up"
                  >
                    <ArrowUp style={{ width: 15, height: 15 }} />
                  </button>
                  <button
                    type="button"
                    disabled={isLast}
                    onClick={() => onMoveDown?.(index)}
                    className="btn-icon"
                    title="Move down"
                  >
                    <ArrowDown style={{ width: 15, height: 15 }} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove?.(index)}
                    className="btn-icon danger"
                    title="Remove item"
                  >
                    <Trash2 style={{ width: 15, height: 15 }} />
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
