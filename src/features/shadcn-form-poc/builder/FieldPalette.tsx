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
} from 'lucide-react'

interface FieldPaletteProps {
  onAddField: (type: FieldType) => void
}

interface PaletteItem {
  type: FieldType
  label: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
}

const CATEGORIES: { name: string; items: PaletteItem[] }[] = [
  {
    name: 'Input',
    items: [
      { type: 'text', label: 'Short Text', icon: Type },
      { type: 'textarea', label: 'Long Text', icon: AlignLeft },
      { type: 'email', label: 'Email', icon: Mail },
      { type: 'phone', label: 'Phone', icon: Phone },
      { type: 'number', label: 'Number', icon: Hash },
      { type: 'date', label: 'Date', icon: Calendar },
    ],
  },
  {
    name: 'Choice',
    items: [
      { type: 'select', label: 'Select Dropdown', icon: ChevronDown },
      { type: 'radio', label: 'Radio Choice', icon: CircleDot },
      { type: 'checkbox', label: 'Checkbox', icon: CheckSquare },
      { type: 'yesno', label: 'Yes / No', icon: ToggleLeft },
    ],
  },
  {
    name: 'Advanced',
    items: [
      { type: 'file', label: 'File Upload', icon: Upload },
      { type: 'education_repeater', label: 'Education Group', icon: GraduationCap },
    ],
  },
  {
    name: 'Layout',
    items: [
      { type: 'section_heading', label: 'Section Heading', icon: Heading },
      { type: 'paragraph', label: 'Paragraph / Note', icon: FileText },
    ],
  },
]

export const FieldPalette: React.FC<FieldPaletteProps> = ({ onAddField }) => {
  return (
    <>
      <div className="panel-heading">
        <span className="panel-title">Field palette</span>
        <span className="panel-subtitle">Click a field to add it to the active step</span>
      </div>

      {CATEGORIES.map((category) => (
        <div key={category.name} className="palette-section">
          <h3>{category.name}</h3>
          <div className="palette-grid">
            {category.items.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => onAddField(item.type)}
                  className="palette-item"
                >
                  <span className="palette-item-icon">
                    <Icon style={{ width: 14, height: 14 }} />
                  </span>
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </>
  )
}
