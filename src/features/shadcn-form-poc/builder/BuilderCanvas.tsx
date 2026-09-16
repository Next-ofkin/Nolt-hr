import React from 'react'
import type { FormStep } from '../domain/form-schema'
import {
  GripVertical,
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
  AlertCircle,
} from 'lucide-react'

interface BuilderCanvasProps {
  steps: FormStep[]
  activeStepId: string
  onSelectStep: (stepId: string) => void
  activeFieldId: string | null
  onSelectField: (fieldId: string) => void
  onReorderField: (fromIndex: number, toIndex: number) => void
  onDuplicateField: (fieldId: string) => void
  onDeleteField: (fieldId: string) => void
}

export const BuilderCanvas: React.FC<BuilderCanvasProps> = ({
  steps,
  activeStepId,
  onSelectStep,
  activeFieldId,
  onSelectField,
  onReorderField,
  onDuplicateField,
  onDeleteField,
}) => {
  const activeStep = steps.find((s) => s.id === activeStepId) || steps[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      {/* Step Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          overflowX: 'auto',
          paddingBottom: '0.25rem',
          borderBottom: '1px solid var(--border, #e2e5ea)',
        }}
      >
        {steps.map((step) => {
          const isActive = step.id === activeStepId
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onSelectStep(step.id)}
              style={{
                padding: '0.5rem 0.85rem',
                borderRadius: '8px 8px 0 0',
                border: isActive ? '1px solid var(--border, #e2e5ea)' : '1px solid transparent',
                borderBottom: isActive ? '2px solid var(--primary, #2563eb)' : 'none',
                background: isActive ? 'var(--surface, #ffffff)' : 'transparent',
                color: isActive ? 'var(--primary, #2563eb)' : 'var(--text-muted, #64748b)',
                fontWeight: isActive ? 600 : 500,
                fontSize: '0.875rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {step.shortTitle || step.title}
            </button>
          )
        })}
      </div>

      {/* Canvas Step Header */}
      <div style={{ background: 'var(--surface, #ffffff)', border: '1px solid var(--border, #e2e5ea)', borderRadius: '12px', padding: '1.25rem 1.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-strong, #0f172a)' }}>
          {activeStep.title}
        </h3>
        {activeStep.description && (
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.9rem', color: 'var(--text-muted, #64748b)' }}>
            {activeStep.description}
          </p>
        )}
      </div>

      {/* Field Cards */}
      {activeStep.fields.length === 0 ? (
        <div
          style={{
            background: '#f8fafc',
            border: '2px dashed var(--border, #e2e5ea)',
            borderRadius: '12px',
            padding: '3rem 1.5rem',
            textAlign: 'center',
            color: 'var(--text-muted, #64748b)',
          }}
        >
          <AlertCircle style={{ width: '28px', height: '28px', margin: '0 auto 0.5rem', opacity: 0.6 }} />
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>No fields in this step yet</div>
          <div style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>
            Click a field type from the left palette to add it here.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {activeStep.fields.map((field, index) => {
            const isSelected = field.id === activeFieldId
            return (
              <div
                key={field.id}
                onClick={() => onSelectField(field.id)}
                style={{
                  background: 'var(--surface, #ffffff)',
                  border: isSelected
                    ? '2px solid var(--primary, #2563eb)'
                    : '1px solid var(--border, #e2e5ea)',
                  borderRadius: '10px',
                  padding: '1rem 1.25rem',
                  boxShadow: isSelected ? '0 0 0 3px rgba(37, 99, 235, 0.1)' : '0 1px 2px rgba(0,0,0,0.03)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  position: 'relative',
                }}
              >
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <GripVertical style={{ width: '16px', height: '16px', color: '#94a3b8', cursor: 'grab' }} />
                    <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-strong, #0f172a)' }}>
                      {field.label}
                    </span>
                    {field.required && (
                      <span style={{ color: 'var(--danger, #dc2626)', fontWeight: 700, fontSize: '0.9rem' }}>*</span>
                    )}
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '0.15rem 0.45rem',
                        borderRadius: '999px',
                        background: '#f1f5f9',
                        color: '#475569',
                        textTransform: 'uppercase',
                        marginLeft: '0.25rem',
                      }}
                    >
                      {field.type}
                    </span>
                    {field.width === 'half' && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--primary, #2563eb)', fontWeight: 600 }}>
                        [ 50% width ]
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => onReorderField(index, index - 1)}
                      style={{ padding: '0.25rem', border: '0', background: 'transparent', cursor: 'pointer', opacity: index === 0 ? 0.3 : 1 }}
                      title="Move up"
                    >
                      <ArrowUp style={{ width: '14px', height: '14px', color: '#64748b' }} />
                    </button>
                    <button
                      type="button"
                      disabled={index === activeStep.fields.length - 1}
                      onClick={() => onReorderField(index, index + 1)}
                      style={{ padding: '0.25rem', border: '0', background: 'transparent', cursor: 'pointer', opacity: index === activeStep.fields.length - 1 ? 0.3 : 1 }}
                      title="Move down"
                    >
                      <ArrowDown style={{ width: '14px', height: '14px', color: '#64748b' }} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDuplicateField(field.id)}
                      style={{ padding: '0.25rem', border: '0', background: 'transparent', cursor: 'pointer' }}
                      title="Duplicate field"
                    >
                      <Copy style={{ width: '14px', height: '14px', color: '#64748b' }} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteField(field.id)}
                      style={{ padding: '0.25rem', border: '0', background: 'transparent', cursor: 'pointer' }}
                      title="Delete field"
                    >
                      <Trash2 style={{ width: '14px', height: '14px', color: '#dc2626' }} />
                    </button>
                  </div>
                </div>

                {/* Preview Control Placeholder */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e5ea', borderRadius: '6px', padding: '0.55rem 0.75rem', fontSize: '0.85rem', color: '#64748b' }}>
                  {field.placeholder || `[ Preview control for ${field.label} ]`}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
