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
      <div
        style={{
          background: 'var(--surface, #ffffff)',
          border: '1px solid var(--border, #e2e5ea)',
          borderRadius: '12px',
          padding: '2rem 1rem',
          textAlign: 'center',
          color: 'var(--text-muted, #64748b)',
        }}
      >
        <Settings2 style={{ width: '32px', height: '32px', margin: '0 auto 0.5rem', opacity: 0.5 }} />
        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>No Field Selected</div>
        <div style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
          Select any field on the canvas to edit its properties.
        </div>
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
    <div
      style={{
        background: 'var(--surface, #ffffff)',
        border: '1px solid var(--border, #e2e5ea)',
        borderRadius: '12px',
        padding: '1.25rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.1rem',
      }}
    >
      <div>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted, #64748b)' }}>
          Field Properties
        </div>
        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-strong, #0f172a)', marginTop: '0.15rem' }}>
          {selectedField.label}
        </div>
      </div>

      {/* Label */}
      <div className="field">
        <label htmlFor="inspector-label">Field Label</label>
        <input
          id="inspector-label"
          type="text"
          value={selectedField.label}
          onChange={(e) => onUpdateField({ label: e.target.value })}
        />
      </div>

      {/* Placeholder */}
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

      {/* Help Text */}
      <div className="field">
        <label htmlFor="inspector-help">Help Text / Description</label>
        <input
          id="inspector-help"
          type="text"
          value={selectedField.helpText || ''}
          onChange={(e) => onUpdateField({ helpText: e.target.value })}
        />
      </div>

      {/* Required Toggle */}
      {selectedField.type !== 'section_heading' && selectedField.type !== 'paragraph' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={!!selectedField.required}
            onChange={(e) => onUpdateField({ required: e.target.checked })}
            style={{ width: '16px', height: '16px', accentColor: 'var(--primary, #2563eb)' }}
          />
          <span>Required field</span>
        </label>
      )}

      {/* Width Selector */}
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

      {/* Options Manager */}
      {hasOptions && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-strong, #0f172a)' }}>
              Choices / Options
            </span>
            <button
              type="button"
              onClick={handleAddOption}
              className="btn btn-ghost"
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
            >
              <Plus style={{ width: '12px', height: '12px', marginRight: '0.2rem' }} /> Add
            </button>
          </div>

          {(selectedField.options || []).map((opt, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <input
                type="text"
                value={opt.label}
                onChange={(e) => handleUpdateOption(idx, e.target.value)}
                style={{ fontSize: '0.85rem', padding: '0.35rem 0.5rem' }}
              />
              <button
                type="button"
                onClick={() => handleDeleteOption(idx)}
                style={{ padding: '0.3rem', border: '0', background: 'transparent', cursor: 'pointer', color: '#dc2626' }}
              >
                <Trash2 style={{ width: '14px', height: '14px' }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
