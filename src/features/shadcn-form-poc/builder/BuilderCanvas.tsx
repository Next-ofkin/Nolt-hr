import React from 'react'
import type { FormStep } from '../domain/form-schema'
import {
  GripVertical,
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
  LayoutTemplate,
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
    <div className="builder-canvas">
      <div className="detail-tabs">
        {steps.map((step) => {
          const isActive = step.id === activeStepId
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onSelectStep(step.id)}
              className={`detail-tab${isActive ? ' active' : ''}`}
            >
              {step.shortTitle || step.title}
            </button>
          )
        })}
      </div>

      <div className="card canvas-header-card">
        <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{activeStep.title}</h3>
        {activeStep.description && (
          <p className="subtitle" style={{ margin: '0.25rem 0 0' }}>{activeStep.description}</p>
        )}
      </div>

      {activeStep.fields.length === 0 ? (
        <div className="canvas-empty-state">
          <LayoutTemplate style={{ width: 28, height: 28 }} />
          <div className="canvas-empty-state-title">No fields in this step yet</div>
          <div className="canvas-empty-state-hint">Click a field type from the left palette to add it here.</div>
        </div>
      ) : (
        <div className="canvas-fields-list">
          {activeStep.fields.map((field, index) => {
            const isSelected = field.id === activeFieldId
            return (
              <div
                key={field.id}
                onClick={() => onSelectField(field.id)}
                className={`canvas-field-card${isSelected ? ' selected' : ''}`}
              >
                <div className="field-card-header">
                  <div className="field-card-info">
                    <GripVertical style={{ width: 16, height: 16, color: '#94a3b8', flexShrink: 0 }} />
                    <span className="field-card-label">{field.label}</span>
                    {field.required && <span style={{ color: 'var(--danger)', fontWeight: 700 }}>*</span>}
                    <span className="field-key-badge">{field.type.replace('_', ' ')}</span>
                    {field.width === 'half' && <span className="field-width-badge">50%</span>}
                  </div>

                  <div className="field-card-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => onReorderField(index, index - 1)}
                      className="btn-icon"
                      title="Move up"
                    >
                      <ArrowUp style={{ width: 14, height: 14 }} />
                    </button>
                    <button
                      type="button"
                      disabled={index === activeStep.fields.length - 1}
                      onClick={() => onReorderField(index, index + 1)}
                      className="btn-icon"
                      title="Move down"
                    >
                      <ArrowDown style={{ width: 14, height: 14 }} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDuplicateField(field.id)}
                      className="btn-icon"
                      title="Duplicate field"
                    >
                      <Copy style={{ width: 14, height: 14 }} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteField(field.id)}
                      className="btn-icon danger"
                      title="Delete field"
                    >
                      <Trash2 style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                </div>

                <div className="field-card-mock-input">
                  {field.placeholder || `Preview control for ${field.label}`}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
