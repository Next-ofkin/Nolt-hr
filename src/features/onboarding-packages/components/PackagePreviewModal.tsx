import React, { useState } from 'react'
import { Eye, FileText, FileCheck, X, Loader2, ArrowLeft } from 'lucide-react'
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
      // Fallback preview
      setSelectedFormSchema(null)
    } finally {
      setIsLoadingSchema(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50">
          <div className="flex items-center space-x-3">
            {selectedFormSchema ? (
              <button
                onClick={() => setSelectedFormSchema(null)}
                className="flex items-center space-x-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2.5 py-1.5 rounded-lg transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Package Summary</span>
              </button>
            ) : (
              <div className="flex items-center space-x-2">
                <div className="rounded-lg bg-indigo-100 p-2 text-indigo-600">
                  <Eye className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{packageTitle}</h3>
                  <div className="flex items-center space-x-2 text-xs text-slate-500">
                    <span className="font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full text-[10px]">
                      Version {versionNumber} Preview
                    </span>
                    <span>• {items.length} items total</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 max-h-[75vh] overflow-y-auto">
          {isLoadingSchema && (
            <div className="flex items-center justify-center py-12 text-sm text-slate-500 space-x-2">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
              <span>Loading form schema preview...</span>
            </div>
          )}

          {!isLoadingSchema && selectedFormSchema && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h4 className="text-sm font-semibold text-slate-900">Form Preview: {selectedFormTitle}</h4>
                <p className="text-xs text-slate-500">
                  Interactive preview using approved NoltDynamicForm schema renderer.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
                <NoltDynamicForm schema={selectedFormSchema} />
              </div>
            </div>
          )}

          {!isLoadingSchema && !selectedFormSchema && (
            <div className="space-y-6">
              {packageDescription && (
                <p className="text-sm text-slate-600 bg-slate-50 p-3.5 rounded-lg border border-slate-100">
                  {packageDescription}
                </p>
              )}

              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Package Content & Requirements
                </h4>

                <div className="space-y-2.5">
                  {items.map((item, idx) => {
                    const isForm = item.itemType === 'form'
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all"
                      >
                        <div className="flex items-start space-x-3 min-w-0">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500 mt-0.5">
                            {idx + 1}
                          </span>
                          <div
                            className={`rounded-lg p-2 shrink-0 ${
                              isForm ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'
                            }`}
                          >
                            {isForm ? <FileText className="h-4 w-4" /> : <FileCheck className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center space-x-2">
                              <h5 className="text-sm font-semibold text-slate-900">
                                {isForm ? item.formTitle || 'Form' : item.documentTitle}
                              </h5>
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                                  isForm
                                    ? 'bg-indigo-100 text-indigo-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {isForm
                                  ? `Form (Version ${item.formVersionNumber ?? 1})`
                                  : 'Document Requirement'}
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
                              <p className="text-xs text-slate-500 mt-1">{item.documentDescription}</p>
                            )}
                          </div>
                        </div>

                        {isForm && item.formVersionId && (
                          <button
                            type="button"
                            onClick={() => handlePreviewForm(item.formVersionId, item.formTitle)}
                            className="flex items-center space-x-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors ml-4 shrink-0"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Preview Form</span>
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

        {/* Modal Footer */}
        <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  )
}
