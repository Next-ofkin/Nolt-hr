import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, FileText, Loader2 } from 'lucide-react'
import { getAssignedFormSchema } from '../data/employee-onboarding-repository'
import { useSubmitOnboardingFormResponse } from '../data/employee-onboarding-queries'
import { employeeOnboardingPersistenceMessage, type EmployeeOnboardingFormItem } from '../data/employee-onboarding-types'
import type { FormSchema } from '../../shadcn-form-poc/domain/form-schema'
import { NoltDynamicForm } from '../../shadcn-form-poc/renderer/NoltDynamicForm'

interface FormResponseModalProps {
  item: EmployeeOnboardingFormItem
  onClose: () => void
}

export function FormResponseModal({ item, onClose }: FormResponseModalProps) {
  const [schema, setSchema] = useState<FormSchema | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const submitResponse = useSubmitOnboardingFormResponse()

  useEffect(() => {
    let isMounted = true
    getAssignedFormSchema(item.formVersionId)
      .then((data) => {
        if (isMounted) setSchema(data)
      })
      .catch((err) => {
        if (isMounted) setLoadError(err instanceof Error ? err.message : 'Failed to load this form.')
      })
    return () => {
      isMounted = false
    }
  }, [item.formVersionId])

  const handleComplete = (data: Record<string, unknown>) => {
    setSubmitError(null)
    submitResponse.mutate(
      { itemId: item.id, responseData: data },
      {
        onSuccess: () => setIsSubmitted(true),
        onError: (err) => setSubmitError(employeeOnboardingPersistenceMessage(err, 'Unable to submit this form.')),
      },
    )
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card modal-card-xl no-padding">
        {!isSubmitted && (
          <div className="modal-header">
            <div className="modal-header-info">
              <span className="modal-header-icon">
                <FileText style={{ width: 18, height: 18 }} />
              </span>
              <div>
                <h3>{item.formTitle}</h3>
                <p>Version {item.formVersionNumber}</p>
              </div>
            </div>
          </div>
        )}

        <div className="modal-body">
          {isSubmitted ? (
            <div className="dynamic-form-complete" style={{ border: 'none', padding: '1rem 0' }}>
              <div className="dynamic-form-complete-icon">
                <CheckCircle2 style={{ width: 32, height: 32 }} />
              </div>
              <h2>Form submitted</h2>
              <p>Thank you — your response for "{item.formTitle}" has been recorded.</p>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button type="button" className="btn btn-primary" onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          ) : loadError ? (
            <div className="alert alert-error" role="alert">
              <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} /> {loadError}
              </p>
            </div>
          ) : !schema ? (
            <div className="package-items-empty" style={{ border: 'none' }}>
              <Loader2 style={{ width: 22, height: 22 }} className="spin" />
              <div className="package-items-empty-hint">Loading form…</div>
            </div>
          ) : (
            <>
              {submitError && (
                <div className="alert alert-error" role="alert" style={{ marginBottom: '1rem' }}>
                  <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                    <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} /> {submitError}
                  </p>
                </div>
              )}
              <NoltDynamicForm
                schema={schema}
                initialData={{}}
                isSubmitting={submitResponse.isPending}
                onComplete={handleComplete}
              />
            </>
          )}
        </div>

        {!isSubmitted && (
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitResponse.isPending}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
