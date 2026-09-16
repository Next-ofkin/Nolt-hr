import React from 'react'
import type { FormField, FieldOption } from '../domain/form-schema'
import { Plus, Trash2, Settings2 } from 'lucide-react'

interface FieldInspectorProps {
  selectedField: FormField | null
  onUpdateField: (updates: Partial<FormField>) => void
}

export const FieldInspector: React.FC<FieldInspectorProps> = ({ selectedField, onUpdateField }) => {
  if (!selectedField) {
    return (
      <div className="inspector-empty">
        <Settings2 style={{ width: 30, height: 30 }} />
        <div className="inspector-empty-title">No field selected</div>
        <div className="inspector-empty-hint">Select any field on the canvas to edit its properties.</div>
      </div>
    )
  }

  const hasOptions = selectedField.type === 'select' || selectedField.type === 'radio'

  const handleAddOption = () => {
    const currentOptions = selectedField.options || []
    const newCount = currentOptions.length + 1
    const newOpt: FieldOption = { label: `Option ${newCount}`, value: `Option ${newCount}` }
    onUpdateField({ options: [...currentOptions, newOpt] })
  }

  const handleUpdateOption = (index: number, newLabel: string) => {
    const currentOptions = [...(selectedField.options || [])]
    currentOptions[index] = { label: newLabel, value: newLabel }
    onUpdateField({ options: currentOptions })
  }

  const handleDeleteOption = (index: number) => {
    const currentOptions = (selectedField.options || []).filter((_, i) => i !== index)
    onUpdateField({ options: currentOptions })
  }

  return (
    <>
      <div className="panel-heading">
        <span className="panel-title">Field properties</span>
        <span className="inspector-field-name">{selectedField.label}</span>
      </div>

      <div className="field">
        <label htmlFor="inspector-label">Field Label</label>
        <input
          id="inspector-label"
          type="text"
          value={selectedField.label}
          onChange={(e) => onUpdateField({ label: e.target.value })}
        />
      </div>

      {selectedField.type !== 'section_heading' && selectedField.type !== 'paragraph' && selectedField.type !== 'education_repeater' && (
        <div className="field">
          <label htmlFor="inspector-placeholder">Placeholder Text</label>
          <input
            id="inspector-placeholder"
            type="text"
            value={selectedField.placeholder || ''}
            onChange={(e) => onUpdateField({ placeholder: e.target.value })}
          />
        </div>
      )}

      <div className="field">
        <label htmlFor="inspector-help">Help Text / Description</label>
        <input
          id="inspector-help"
          type="text"
          value={selectedField.helpText || ''}
          onChange={(e) => onUpdateField({ helpText: e.target.value })}
        />
      </div>

      {selectedField.type !== 'section_heading' && selectedField.type !== 'paragraph' && (
        <label className="inspector-toggle">
          <input
            type="checkbox"
            checked={!!selectedField.required}
            onChange={(e) => onUpdateField({ required: e.target.checked })}
          />
          <span>Required field</span>
        </label>
      )}

      <div className="field">
        <label htmlFor="inspector-width">Layout Width</label>
        <select
          id="inspector-width"
          value={selectedField.width || 'full'}
          onChange={(e) => onUpdateField({ width: e.target.value as 'full' | 'half' })}
        >
          <option value="full">Full Width (100%)</option>
          <option value="half">Half Width (50% / Pair)</option>
        </select>
      </div>

      {hasOptions && (
        <div className="inspector-options">
          <div className="inspector-options-header">
            <span className="inspector-options-title">Choices</span>
            <button type="button" onClick={handleAddOption} className="btn btn-ghost" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}>
              <Plus style={{ width: 12, height: 12, marginRight: '0.2rem' }} /> Add
            </button>
          </div>

          {(selectedField.options || []).map((opt, idx) => (
            <div key={idx} className="option-row">
              <input
                type="text"
                value={opt.label}
                onChange={(e) => handleUpdateOption(idx, e.target.value)}
              />
              <button
                type="button"
                onClick={() => handleDeleteOption(idx)}
                className="btn-icon danger"
              >
                <Trash2 style={{ width: 14, height: 14 }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
