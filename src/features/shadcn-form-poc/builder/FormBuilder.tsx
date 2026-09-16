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
import { Save, Eye } from 'lucide-react'

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
    setSaveToast('Draft saved successfully (Local state)')
    setTimeout(() => setSaveToast(null), 3000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
      {/* Top Builder Control Header */}
      <div
        style={{
          background: 'var(--surface, #ffffff)',
          border: '1px solid var(--border, #e2e5ea)',
          borderRadius: '12px',
          padding: '1rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-strong, #0f172a)' }}>
            {schema.title} Builder
          </h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted, #64748b)', marginTop: '0.15rem' }}>
            Interactive Form Designer • {schema.steps.length} Steps
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {saveToast && (
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#16a34a' }}>
              ✓ {saveToast}
            </span>
          )}
          <button type="button" onClick={handleSaveDraft} className="btn btn-ghost">
            <Save style={{ width: '16px', height: '16px', marginRight: '0.4rem' }} /> Save Draft
          </button>
          <button type="button" onClick={onSwitchToPreview} className="btn btn-primary">
            <Eye style={{ width: '16px', height: '16px', marginRight: '0.4rem' }} /> Preview Employee Form
          </button>
        </div>
      </div>

      {/* 3-Column Desktop Grid Layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 240px) 1fr minmax(260px, 280px)',
          gap: '1.25rem',
          alignItems: 'start',
        }}
      >
        {/* Left: Palette */}
        <FieldPalette onAddField={handleAddField} />

        {/* Middle: Canvas */}
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

        {/* Right: Inspector */}
        <FieldInspector selectedField={selectedField} onUpdateField={handleUpdateField} />
      </div>
    </div>
  )
}
