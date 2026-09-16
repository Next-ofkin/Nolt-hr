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
  /**
   * When provided, "Save Draft" calls this instead of the local-only demo
   * toast. Used by the production form editor to persist to Supabase; left
   * unset on the /hr/shadcn-form-poc reference page so it keeps behaving
   * exactly as before.
   */
  onSaveDraft?: () => void | Promise<void>
  /** Extra controls (e.g. Publish, version badge) rendered next to Preview. */
  headerActions?: React.ReactNode
}

export const FormBuilder: React.FC<FormBuilderProps> = ({
  schema,
  onChangeSchema,
  onSwitchToPreview,
  onSaveDraft,
  headerActions,
}) => {
  const [activeStepId, setActiveStepId] = useState<string>(schema.steps[0]?.id || '')
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null)
  const [saveToast, setSaveToast] = useState<string | null>(null)
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

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

  const handleSaveDraft = async () => {
    if (!onSaveDraft) {
      setSaveToast('Draft saved')
      setTimeout(() => setSaveToast(null), 3000)
      return
    }

    setIsSaving(true)
    setSaveErrorMessage(null)
    try {
      await onSaveDraft()
      setSaveToast('Draft saved')
      setTimeout(() => setSaveToast(null), 3000)
    } catch (err) {
      setSaveErrorMessage(err instanceof Error ? err.message : 'Failed to save draft')
    } finally {
      setIsSaving(false)
    }
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
          {saveErrorMessage && (
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--danger)' }}>{saveErrorMessage}</span>
          )}
          <button type="button" onClick={handleSaveDraft} disabled={isSaving} className="btn btn-ghost">
            <Save style={{ width: 16, height: 16, marginRight: '0.4rem' }} /> {isSaving ? 'Saving…' : 'Save Draft'}
          </button>
          <button type="button" onClick={onSwitchToPreview} className="btn btn-primary">
            <Eye style={{ width: 16, height: 16, marginRight: '0.4rem' }} /> Preview
          </button>
          {headerActions}
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
