import React, { useState } from 'react'
import { Eye, FileText, FileCheck, Loader2, ArrowLeft } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import type { FormSchema } from '../../shadcn-form-poc/domain/form-schema'
import { NoltDynamicForm } from '../../shadcn-form-poc/renderer/NoltDynamicForm'
import type { PackageItemInput } from '../data/onboarding-packages-types'

interface PackagePreviewModalProps {
  isOpen: boolean
  onClose: () => void
  packageTitle: string
  packageDescription?: string | null
  versionNumber: number
  items: PackageItemInput[]
}

export const PackagePreviewModal: React.FC<PackagePreviewModalProps> = ({
  isOpen,
  onClose,
  packageTitle,
  packageDescription,
  versionNumber,
  items,
}) => {
  const [selectedFormSchema, setSelectedFormSchema] = useState<FormSchema | null>(null)
  const [selectedFormTitle, setSelectedFormTitle] = useState<string>('')
  const [isLoadingSchema, setIsLoadingSchema] = useState(false)

  if (!isOpen) return null

  const handlePreviewForm = async (formVersionId: string, formTitle?: string) => {
    setIsLoadingSchema(true)
    setSelectedFormTitle(formTitle || 'Form Preview')

    try {
      const { data, error } = await supabase
        .from('form_definition_versions')
        .select('definition')
        .eq('id', formVersionId)
        .single()

      if (error) throw error

      if (data?.definition) {
        setSelectedFormSchema(data.definition as unknown as FormSchema)
      }
    } catch {
      setSelectedFormSchema(null)
    } finally {
      setIsLoadingSchema(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card modal-card-xl no-padding">
        <div className="modal-header">
          {selectedFormSchema ? (
            <button type="button" onClick={() => setSelectedFormSchema(null)} className="btn btn-ghost" style={{ padding: '0.4rem 0.75rem' }}>
              <ArrowLeft style={{ width: 14, height: 14, marginRight: '0.35rem' }} /> Back to Package Summary
            </button>
          ) : (
            <div className="modal-header-info">
              <span className="modal-header-icon">
                <Eye style={{ width: 18, height: 18 }} />
              </span>
              <div>
                <h3>{packageTitle}</h3>
                <p style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span className="badge badge-success">Version {versionNumber} Preview</span>
                  <span>{items.length} items total</span>
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="modal-body">
          {isLoadingSchema && (
            <div className="package-items-empty" style={{ border: 'none' }}>
              <Loader2 style={{ width: 22, height: 22 }} className="spin" />
              <div className="package-items-empty-hint">Loading form schema preview…</div>
            </div>
          )}

          {!isLoadingSchema && selectedFormSchema && (
            <div>
              <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Form Preview: {selectedFormTitle}</h4>
                <p className="subtitle" style={{ margin: '0.15rem 0 0' }}>
                  Interactive preview using the approved form schema renderer.
                </p>
              </div>
              <NoltDynamicForm schema={selectedFormSchema} />
            </div>
          )}

          {!isLoadingSchema && !selectedFormSchema && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {packageDescription && (
                <p className="package-editor-readonly-desc" style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.85rem 1rem' }}>
                  {packageDescription}
                </p>
              )}

              <div>
                <p className="package-editor-field-label" style={{ marginBottom: '0.6rem' }}>Package Content &amp; Requirements</p>

                <div className="package-item-list">
                  {items.map((item, idx) => {
                    const isForm = item.itemType === 'form'
                    return (
                      <div key={idx} className="package-item-row">
                        <div className="package-item-info">
                          <span className="package-item-index">{idx + 1}</span>
                          <span className={`package-item-icon ${isForm ? 'package-item-icon-form' : 'package-item-icon-document'}`}>
                            {isForm ? <FileText style={{ width: 16, height: 16 }} /> : <FileCheck style={{ width: 16, height: 16 }} />}
                          </span>
                          <div className="package-item-details">
                            <div className="package-item-title-row">
                              <span className="package-item-title">{isForm ? item.formTitle || 'Form' : item.documentTitle}</span>
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

                        {isForm && item.formVersionId && (
                          <button
                            type="button"
                            onClick={() => handlePreviewForm(item.formVersionId, item.formTitle)}
                            className="btn-tinted btn-tinted-primary"
                          >
                            <Eye style={{ width: 14, height: 14, marginRight: '0.35rem' }} /> Preview Form
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Close Preview
          </button>
        </div>
      </div>
    </div>
  )
}
