import React from 'react'
import type { FieldType } from '../domain/form-schema'
import {
  Type,
  AlignLeft,
  Mail,
  Phone,
  Hash,
  Calendar,
  ChevronDown,
  CircleDot,
  CheckSquare,
  ToggleLeft,
  Upload,
  GraduationCap,
  Heading,
  FileText,
  Plus,
} from 'lucide-react'

interface FieldPaletteProps {
  onAddField: (type: FieldType) => void
}

interface PaletteItem {
  type: FieldType
  label: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  category: 'Input' | 'Choice' | 'Advanced' | 'Layout'
}

const PALETTE_ITEMS: PaletteItem[] = [
  { type: 'text', label: 'Short Text', icon: Type, category: 'Input' },
  { type: 'textarea', label: 'Long Text', icon: AlignLeft, category: 'Input' },
  { type: 'email', label: 'Email', icon: Mail, category: 'Input' },
  { type: 'phone', label: 'Phone', icon: Phone, category: 'Input' },
  { type: 'number', label: 'Number', icon: Hash, category: 'Input' },
  { type: 'date', label: 'Date', icon: Calendar, category: 'Input' },

  { type: 'select', label: 'Select Dropdown', icon: ChevronDown, category: 'Choice' },
  { type: 'radio', label: 'Radio Choice', icon: CircleDot, category: 'Choice' },
  { type: 'checkbox', label: 'Checkbox', icon: CheckSquare, category: 'Choice' },
  { type: 'yesno', label: 'Yes / No Button', icon: ToggleLeft, category: 'Choice' },

  { type: 'file', label: 'File Upload', icon: Upload, category: 'Advanced' },
  { type: 'education_repeater', label: 'Education Group', icon: GraduationCap, category: 'Advanced' },

  { type: 'section_heading', label: 'Section Heading', icon: Heading, category: 'Layout' },
  { type: 'paragraph', label: 'Paragraph / Note', icon: FileText, category: 'Layout' },
]

export const FieldPalette: React.FC<FieldPaletteProps> = ({ onAddField }) => {
  return (
    <div
      style={{
        background: 'var(--surface, #ffffff)',
        border: '1px solid var(--border, #e2e5ea)',
        borderRadius: '12px',
        padding: '1.25rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}
    >
      <div>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted, #64748b)' }}>
          Field Palette
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted, #64748b)', marginTop: '0.2rem' }}>
          Click to add field to active step
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {PALETTE_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.type}
              type="button"
              onClick={() => onAddField(item.type)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.6rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--border, #e2e5ea)',
                background: 'var(--surface, #ffffff)',
                color: 'var(--text-strong, #0f172a)',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--primary, #2563eb)'
                e.currentTarget.style.background = '#eff6ff'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border, #e2e5ea)'
                e.currentTarget.style.background = 'var(--surface, #ffffff)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <Icon style={{ width: '16px', height: '16px', color: 'var(--primary, #2563eb)' }} />
                <span>{item.label}</span>
              </div>
              <Plus style={{ width: '14px', height: '14px', color: 'var(--text-muted, #64748b)' }} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
