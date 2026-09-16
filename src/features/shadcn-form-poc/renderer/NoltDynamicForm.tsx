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

  // Dynamic Zod resolver for current step
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
      <div
        className="card"
        style={{
          textAlign: 'center',
          padding: '3.5rem 2rem',
          maxWidth: '640px',
          margin: '2rem auto',
          background: 'var(--surface, #ffffff)',
          borderRadius: '12px',
          border: '1px solid var(--border, #e2e5ea)',
        }}
      >
        <div
          style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            background: '#dcfce7',
            color: '#16a34a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
            fontSize: '1.75rem',
          }}
        >
          <Check style={{ width: '32px', height: '32px' }} />
        </div>
        <h2 style={{ fontSize: '1.65rem', fontWeight: 700, color: 'var(--text-strong, #0f172a)', margin: '0 0 0.5rem' }}>
          Form completed successfully.
        </h2>
        <p style={{ color: 'var(--text-muted, #64748b)', marginTop: '0.5rem', marginBottom: '1.75rem', fontSize: '0.95rem' }}>
          Thank you for providing your employee information. Your responses have been validated and captured for this SHADCN-native proof of concept.
        </p>

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
          <details
            style={{
              marginTop: '2rem',
              textAlign: 'left',
              background: '#f8fafc',
              padding: '1rem',
              borderRadius: '8px',
              border: '1px solid var(--border, #e2e5ea)',
            }}
          >
            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-muted, #64748b)' }}>
              Developer Data Payload
            </summary>
            <pre style={{ fontSize: '0.8rem', overflowX: 'auto', marginTop: '0.75rem', margin: 0, color: 'var(--text, #334155)' }}>
              {JSON.stringify(completedPayload, null, 2)}
            </pre>
          </details>
        )}
      </div>
    )
  }

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '850px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
      }}
    >
      {/* Progress Header */}
      <div
        style={{
          background: 'var(--surface, #ffffff)',
          border: '1px solid var(--border, #e2e5ea)',
          borderRadius: '12px',
          padding: '1.25rem 1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-strong, #0f172a)' }}>
              {schema.title}
            </h1>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.9rem', color: 'var(--text-muted, #64748b)', whiteSpace: 'pre-line' }}>
              {schema.description}
            </p>
          </div>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary, #2563eb)' }}>
            Step {activeStepIndex + 1} of {schema.steps.length}
          </span>
        </div>

        {/* Step progress pills */}
        <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingTop: '0.25rem' }}>
          {schema.steps.map((step, idx) => {
            const isDone = idx < activeStepIndex
            const isCurrent = idx === activeStepIndex
            return (
              <div
                key={step.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.4rem 0.75rem',
                  borderRadius: '999px',
                  background: isCurrent ? 'var(--primary, #2563eb)' : isDone ? '#dcfce7' : '#f1f5f9',
                  color: isCurrent ? '#ffffff' : isDone ? '#166534' : 'var(--text-muted, #64748b)',
                  fontSize: '0.8rem',
                  fontWeight: isCurrent || isDone ? 600 : 500,
                  whiteSpace: 'nowrap',
                }}
              >
                {isDone ? <Check style={{ width: '12px', height: '12px' }} /> : <span>{idx + 1}</span>}
                <span>{step.shortTitle || step.title}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Main Step Card Form */}
      <FormProvider {...methods}>
        <form
          onSubmit={handleSubmit(handleStepSubmit)}
          style={{
            background: 'var(--surface, #ffffff)',
            border: '1px solid var(--border, #e2e5ea)',
            borderRadius: '12px',
            padding: '2.25rem',
            boxShadow: '0 1px 4px rgba(15, 23, 42, 0.04)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-strong, #0f172a)' }}>
              {activeStep.title}
            </h2>
            {activeStep.description && (
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.9rem', color: 'var(--text-muted, #64748b)' }}>
                {activeStep.description}
              </p>
            )}
          </div>

          {/* Fields Grid */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1.25rem 1rem',
              width: '100%',
            }}
          >
            {activeStep.fields.map((field) => (
              <DynamicField key={field.id} field={field} />
            ))}
          </div>

          {/* Navigation Controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '1.5rem',
              paddingTop: '1.25rem',
              borderTop: '1px solid var(--border, #e2e5ea)',
            }}
          >
            <button
              type="button"
              onClick={handlePrevStep}
              disabled={activeStepIndex === 0}
              className="btn btn-ghost"
              style={{
                minHeight: '44px',
                padding: '0.65rem 1.4rem',
                opacity: activeStepIndex === 0 ? 0.4 : 1,
                cursor: activeStepIndex === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              <ArrowLeft style={{ width: '16px', height: '16px', marginRight: '0.4rem' }} /> Previous
            </button>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ minHeight: '44px', padding: '0.65rem 1.6rem' }}
            >
              {activeStepIndex === schema.steps.length - 1 ? (
                <>
                  <Send style={{ width: '16px', height: '16px', marginRight: '0.4rem' }} /> Submit Form
                </>
              ) : (
                <>
                  Continue <ArrowRight style={{ width: '16px', height: '16px', marginLeft: '0.4rem' }} />
                </>
              )}
            </button>
          </div>
        </form>
      </FormProvider>
    </div>
  )
}
