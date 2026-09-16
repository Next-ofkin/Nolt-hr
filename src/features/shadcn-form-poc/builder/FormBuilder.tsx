import React, { useState } from 'react'
import type { FormSchema, FieldType } from '../domain/form-schema'
import {
  addFieldToStep,
  updateFieldInStep,
  deleteFieldFromStep,
  duplicateFieldInStep,
  reorderFieldsInStep,
} from '../domain/form-schema'
import { FieldPalette } from './FieldPalette'
import { BuilderCanvas } from './BuilderCanvas'
import { FieldInspector } from './FieldInspector'
import { Save, Eye, Check } from 'lucide-react'

interface FormBuilderProps {
  schema: FormSchema
  onChangeSchema: (newSchema: FormSchema) => void
  onSwitchToPreview: () => void
}

export const FormBuilder: React.FC<FormBuilderProps> = ({
  schema,
  onChangeSchema,
  onSwitchToPreview,
}) => {
  const [activeStepId, setActiveStepId] = useState<string>(schema.steps[0]?.id || '')
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null)
  const [saveToast, setSaveToast] = useState<string | null>(null)

  const activeStep = schema.steps.find((s) => s.id === activeStepId) || schema.steps[0]
  const selectedField = activeStep?.fields.find((f) => f.id === activeFieldId) || null

  const handleAddField = (type: FieldType) => {
    if (!activeStepId) return
    const updated = addFieldToStep(schema, activeStepId, type)
    onChangeSchema(updated)
    const newStep = updated.steps.find((s) => s.id === activeStepId)
    if (newStep && newStep.fields.length > 0) {
      setActiveFieldId(newStep.fields[newStep.fields.length - 1].id)
    }
  }

  const handleUpdateField = (updates: Parameters<typeof updateFieldInStep>[3]) => {
    if (!activeStepId || !activeFieldId) return
    const updated = updateFieldInStep(schema, activeStepId, activeFieldId, updates)
    onChangeSchema(updated)
  }

  const handleDeleteField = (fieldId: string) => {
    if (!activeStepId) return
    const updated = deleteFieldFromStep(schema, activeStepId, fieldId)
    onChangeSchema(updated)
    if (activeFieldId === fieldId) {
      setActiveFieldId(null)
    }
  }

  const handleDuplicateField = (fieldId: string) => {
    if (!activeStepId) return
    const updated = duplicateFieldInStep(schema, activeStepId, fieldId)
    onChangeSchema(updated)
  }

  const handleReorderField = (fromIndex: number, toIndex: number) => {
    if (!activeStepId) return
    const updated = reorderFieldsInStep(schema, activeStepId, fromIndex, toIndex)
    onChangeSchema(updated)
  }

  const handleSaveDraft = () => {
    setSaveToast('Draft saved')
    setTimeout(() => setSaveToast(null), 3000)
  }

  return (
    <div className="page" style={{ gap: '1.25rem' }}>
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{schema.steps.length} step{schema.steps.length === 1 ? '' : 's'}</h2>
          <p className="subtitle" style={{ margin: '0.15rem 0 0' }}>
            Add fields from the palette, then click a field to edit its properties.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {saveToast && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--success)' }}>
              <Check style={{ width: 15, height: 15 }} /> {saveToast}
            </span>
          )}
          <button type="button" onClick={handleSaveDraft} className="btn btn-ghost">
            <Save style={{ width: 16, height: 16, marginRight: '0.4rem' }} /> Save Draft
          </button>
          <button type="button" onClick={onSwitchToPreview} className="btn btn-primary">
            <Eye style={{ width: 16, height: 16, marginRight: '0.4rem' }} /> Preview
          </button>
        </div>
      </div>

      <div className="builder-workspace">
        <div className="builder-panel">
          <FieldPalette onAddField={handleAddField} />
        </div>

        <BuilderCanvas
          steps={schema.steps}
          activeStepId={activeStepId}
          onSelectStep={(stepId) => {
            setActiveStepId(stepId)
            setActiveFieldId(null)
          }}
          activeFieldId={activeFieldId}
          onSelectField={setActiveFieldId}
          onReorderField={handleReorderField}
          onDuplicateField={handleDuplicateField}
          onDeleteField={handleDeleteField}
        />

        <div className="builder-panel">
          <FieldInspector selectedField={selectedField} onUpdateField={handleUpdateField} />
        </div>
      </div>
    </div>
  )
}
