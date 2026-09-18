import React, { useState, useMemo } from 'react'
import { useForm, FormProvider } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { FormSchema } from '../domain/form-schema'
import { buildZodSchemaForStep } from '../domain/form-schema'
import { DynamicField } from './DynamicField'
import { Check, ArrowLeft, ArrowRight, Save, Send } from 'lucide-react'

interface NoltDynamicFormProps {
  schema: FormSchema
  onSwitchToBuilder?: () => void
  /**
   * Seed data for the form. Defaults to the shadcn-form-poc demo's own
   * education-history seed so the builder/package preview usages of this
   * component keep behaving exactly as before — a real caller (e.g. an
   * assigned onboarding form) should pass `{}` explicitly.
   */
  initialData?: Record<string, unknown>
  /**
   * When provided, the form hands the final merged payload to the caller
   * instead of showing its own built-in "completed" screen — the caller
   * owns persistence and whatever happens next (success/error/retry).
   * Without it, behavior is unchanged from the original POC/preview use.
   */
  onComplete?: (data: Record<string, unknown>) => void
  /** Disables the submit button while a caller-owned onComplete is in flight. */
  isSubmitting?: boolean
  /**
   * When provided, shows a "Save & Continue Later" action on every step
   * that hands the raw (unvalidated) current values to the caller — a
   * draft may be incomplete, so this deliberately bypasses the
   * Continue/Submit validation resolver. Never triggers onComplete.
   */
  onSaveDraft?: (currentStepData: Record<string, unknown>) => Promise<void> | void
}

const DEMO_SEED_DATA: Record<string, unknown> = {
  education_history: [{ school_institution: '', qualification: '', completion_date: '' }],
}

export const NoltDynamicForm: React.FC<NoltDynamicFormProps> = ({
  schema,
  onSwitchToBuilder,
  initialData,
  onComplete,
  isSubmitting = false,
  onSaveDraft,
}) => {
  const [activeStepIndex, setActiveStepIndex] = useState(0)
  const [accumulatedData, setAccumulatedData] = useState<Record<string, unknown>>(initialData ?? DEMO_SEED_DATA)
  const [completedPayload, setCompletedPayload] = useState<Record<string, unknown> | null>(null)
  const [isSavingDraft, setIsSavingDraft] = useState(false)

  const activeStep = schema.steps[activeStepIndex] || schema.steps[0]

  const activeZodSchema = useMemo(() => buildZodSchemaForStep(activeStep), [activeStep])

  const methods = useForm({
    resolver: zodResolver(activeZodSchema),
    defaultValues: accumulatedData,
    mode: 'onTouched',
  })

  const { handleSubmit, getValues } = methods

  const handleSaveDraft = async () => {
    if (!onSaveDraft || isSavingDraft) return
    // Raw current values, deliberately not run through the step's zod
    // resolver — a draft is allowed to be incomplete.
    const merged = { ...accumulatedData, ...getValues() }
    setAccumulatedData(merged)
    setIsSavingDraft(true)
    try {
      await onSaveDraft(merged)
    } finally {
      setIsSavingDraft(false)
    }
  }

  const handleStepSubmit = (stepData: Record<string, unknown>) => {
    const merged = { ...accumulatedData, ...stepData }
    setAccumulatedData(merged)

    if (activeStepIndex < schema.steps.length - 1) {
      setActiveStepIndex(activeStepIndex + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else if (onComplete) {
      // Caller owns what happens next (including retry on failure), so
      // this component deliberately stays on the last step instead of
      // flipping to its own completed screen.
      onComplete(merged)
    } else {
      setCompletedPayload(merged)
    }
  }

  const handlePrevStep = () => {
    if (activeStepIndex > 0) {
      setActiveStepIndex(activeStepIndex - 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  if (completedPayload) {
    return (
      <div className="card dynamic-form-complete">
        <div className="dynamic-form-complete-icon">
          <Check style={{ width: 32, height: 32 }} />
        </div>
        <h2>Form completed successfully</h2>
        <p>Thank you for providing your employee information. Your responses have been validated and captured.</p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setCompletedPayload(null)
              setActiveStepIndex(0)
              setAccumulatedData({
                education_history: [{ school_institution: '', qualification: '', completion_date: '' }],
              })
            }}
          >
            Reset Form
          </button>
          {onSwitchToBuilder && (
            <button type="button" onClick={onSwitchToBuilder} className="btn btn-primary">
              Return to Form Builder
            </button>
          )}
        </div>

        {import.meta.env.DEV && (
          <details style={{ marginTop: '2rem', textAlign: 'left', background: 'var(--bg)', padding: '1rem', borderRadius: 8, border: '1px solid var(--border)' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Developer Data Payload
            </summary>
            <pre style={{ fontSize: '0.8rem', overflowX: 'auto', margin: '0.75rem 0 0', color: 'var(--text)' }}>
              {JSON.stringify(completedPayload, null, 2)}
            </pre>
          </details>
        )}
      </div>
    )
  }

  const progressPercent = ((activeStepIndex + 1) / schema.steps.length) * 100

  return (
    <div className="dynamic-form">
      <div className="card dynamic-form-header">
        <div className="dynamic-form-header-top">
          <div>
            <p className="dynamic-form-eyebrow">{schema.title}</p>
            <h1 style={{ margin: 0, fontSize: '1.3rem' }}>{activeStep.title}</h1>
            {schema.description && <p className="dynamic-form-description">{schema.description}</p>}
          </div>
          <span className="dynamic-form-step-count">
            Step {activeStepIndex + 1} of {schema.steps.length}
          </span>
        </div>

        <div className="form-stepper">
          {schema.steps.map((step, idx) => {
            const isDone = idx < activeStepIndex
            const isCurrent = idx === activeStepIndex
            return (
              <div key={step.id} className={`form-stepper-step${isCurrent ? ' current' : ''}${isDone ? ' completed' : ''}`}>
                <span className="form-stepper-track" />
                <span className="form-stepper-circle">
                  {isDone ? <Check style={{ width: 13, height: 13 }} /> : idx + 1}
                </span>
                <span className="form-stepper-label">{step.shortTitle || step.title}</span>
              </div>
            )
          })}
        </div>

        <div className="form-progress-bar">
          <div className="form-progress-bar-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(handleStepSubmit)} className="card dynamic-form-card">
          <div>
            <h2 className="dynamic-form-step-title">{activeStep.title}</h2>
            {activeStep.description && <p className="dynamic-form-step-desc">{activeStep.description}</p>}
          </div>

          <div className="dynamic-form-grid">
            {activeStep.fields.map((field) => (
              <DynamicField key={field.id} field={field} />
            ))}
          </div>

          <div className="dynamic-form-nav">
            <button
              type="button"
              onClick={handlePrevStep}
              disabled={activeStepIndex === 0 || isSavingDraft}
              className="btn btn-ghost"
              style={{ minHeight: 44, padding: '0.65rem 1.4rem' }}
            >
              <ArrowLeft style={{ width: 16, height: 16, marginRight: '0.4rem' }} /> Previous
            </button>

            {onSaveDraft && (
              <button
                type="button"
                onClick={() => void handleSaveDraft()}
                disabled={isSavingDraft || isSubmitting}
                className="btn btn-ghost"
                style={{ minHeight: 44, padding: '0.65rem 1.4rem' }}
              >
                <Save style={{ width: 15, height: 15, marginRight: '0.4rem' }} />
                {isSavingDraft ? 'Saving…' : 'Save & Continue Later'}
              </button>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || isSavingDraft}
              style={{ minHeight: 48, padding: '0.7rem 1.75rem' }}
            >
              {activeStepIndex === schema.steps.length - 1 ? (
                <>
                  <Send style={{ width: 16, height: 16, marginRight: '0.4rem' }} />
                  {isSubmitting ? 'Submitting…' : 'Submit Form'}
                </>
              ) : (
                <>
                  Continue <ArrowRight style={{ width: 16, height: 16, marginLeft: '0.4rem' }} />
                </>
              )}
            </button>
          </div>
        </form>
      </FormProvider>
    </div>
  )
}
