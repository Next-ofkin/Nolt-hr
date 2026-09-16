import React, { useState, useMemo } from 'react'
import { useForm, FormProvider } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { FormSchema } from '../domain/form-schema'
import { buildZodSchemaForStep } from '../domain/form-schema'
import { DynamicField } from './DynamicField'
import { Check, ArrowLeft, ArrowRight, Send } from 'lucide-react'

interface NoltDynamicFormProps {
  schema: FormSchema
  onSwitchToBuilder?: () => void
}

export const NoltDynamicForm: React.FC<NoltDynamicFormProps> = ({ schema, onSwitchToBuilder }) => {
  const [activeStepIndex, setActiveStepIndex] = useState(0)
  const [accumulatedData, setAccumulatedData] = useState<Record<string, unknown>>({
    education_history: [{ school_institution: '', qualification: '', completion_date: '' }],
  })
  const [completedPayload, setCompletedPayload] = useState<Record<string, unknown> | null>(null)

  const activeStep = schema.steps[activeStepIndex] || schema.steps[0]

  const activeZodSchema = useMemo(() => buildZodSchemaForStep(activeStep), [activeStep])

  const methods = useForm({
    resolver: zodResolver(activeZodSchema),
    defaultValues: accumulatedData,
    mode: 'onTouched',
  })

  const { handleSubmit } = methods

  const handleStepSubmit = (stepData: Record<string, unknown>) => {
    const merged = { ...accumulatedData, ...stepData }
    setAccumulatedData(merged)

    if (activeStepIndex < schema.steps.length - 1) {
      setActiveStepIndex(activeStepIndex + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
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
              disabled={activeStepIndex === 0}
              className="btn btn-ghost"
              style={{ minHeight: 44, padding: '0.65rem 1.4rem' }}
            >
              <ArrowLeft style={{ width: 16, height: 16, marginRight: '0.4rem' }} /> Previous
            </button>

            <button type="submit" className="btn btn-primary" style={{ minHeight: 44, padding: '0.65rem 1.6rem' }}>
              {activeStepIndex === schema.steps.length - 1 ? (
                <>
                  <Send style={{ width: 16, height: 16, marginRight: '0.4rem' }} /> Submit Form
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
