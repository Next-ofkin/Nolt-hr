import type {
  FormField,
  FormFieldInsert,
  FormFieldType,
  FormVersion,
  FormVersionStatus,
} from './database.types'

export type FieldCategory = 'text' | 'choice' | 'other' | 'content' | 'advanced'

export interface FieldTypeMeta {
  type: FormFieldType
  label: string
  category: FieldCategory
  description: string
  defaultLabel: string
  isAdvanced?: boolean
}

export const FIELD_TYPE_METADATA: Record<FormFieldType, FieldTypeMeta> = {
  SHORT_TEXT: {
    type: 'SHORT_TEXT',
    label: 'Short Text',
    category: 'text',
    description: 'Single-line text input for short answers',
    defaultLabel: 'Short Text Field',
  },
  LONG_TEXT: {
    type: 'LONG_TEXT',
    label: 'Long Text',
    category: 'text',
    description: 'Multi-line text area for descriptions or long comments',
    defaultLabel: 'Long Text Field',
  },
  EMAIL: {
    type: 'EMAIL',
    label: 'Email',
    category: 'text',
    description: 'Email address input with format validation',
    defaultLabel: 'Email Address',
  },
  PHONE: {
    type: 'PHONE',
    label: 'Phone Number',
    category: 'text',
    description: 'Phone number input',
    defaultLabel: 'Phone Number',
  },
  NUMBER: {
    type: 'NUMBER',
    label: 'Number',
    category: 'text',
    description: 'Numeric input for quantities or amounts',
    defaultLabel: 'Number Field',
  },
  DATE: {
    type: 'DATE',
    label: 'Date',
    category: 'other',
    description: 'Date picker input',
    defaultLabel: 'Date Field',
  },
  DROPDOWN: {
    type: 'DROPDOWN',
    label: 'Dropdown',
    category: 'choice',
    description: 'Select one option from a collapsible list',
    defaultLabel: 'Select an Option',
  },
  RADIO: {
    type: 'RADIO',
    label: 'Radio Group',
    category: 'choice',
    description: 'Select exactly one option from a list',
    defaultLabel: 'Choice Field',
  },
  CHECKBOX: {
    type: 'CHECKBOX',
    label: 'Checkbox Group',
    category: 'choice',
    description: 'Select one or multiple options',
    defaultLabel: 'Select Options',
  },
  YES_NO: {
    type: 'YES_NO',
    label: 'Yes / No',
    category: 'choice',
    description: 'Binary Yes or No selection',
    defaultLabel: 'Yes / No Question',
  },
  HEADING: {
    type: 'HEADING',
    label: 'Heading',
    category: 'content',
    description: 'Section heading or title text',
    defaultLabel: 'Section Heading',
  },
  PARAGRAPH: {
    type: 'PARAGRAPH',
    label: 'Paragraph Text',
    category: 'content',
    description: 'Instructional or explanatory text block',
    defaultLabel: 'Instructional text goes here.',
  },
  DIVIDER: {
    type: 'DIVIDER',
    label: 'Divider Line',
    category: 'content',
    description: 'Visual separator line between sections',
    defaultLabel: 'Divider',
  },
  FILE_UPLOAD: {
    type: 'FILE_UPLOAD',
    label: 'File Upload',
    category: 'advanced',
    description: 'Document or image attachment',
    defaultLabel: 'File Attachment',
    isAdvanced: true,
  },
  SIGNATURE: {
    type: 'SIGNATURE',
    label: 'Signature',
    category: 'advanced',
    description: 'Digital signature capture',
    defaultLabel: 'Signature Required',
    isAdvanced: true,
  },
  REPEATING_GROUP: {
    type: 'REPEATING_GROUP',
    label: 'Repeating Group',
    category: 'advanced',
    description: 'Group of fields that can be repeated',
    defaultLabel: 'Repeating Section',
    isAdvanced: true,
  },
}

export type DataClassification = 'GENERAL' | 'SENSITIVE_HEALTH' | 'SENSITIVE_FINANCIAL'

export interface FieldLayoutConfig {
  span?: 12 | 6 | 4
  newRow?: boolean
  placement?: 'flow' | 'header_aside'
}

export interface VisibilityRule {
  fieldKey: string
  operator: 'equals'
  value: unknown
}

export interface RepeatingGroupColumn {
  name: string
  type: FormFieldType
}

export interface RepeatingGroupConfig {
  minRows?: number
  maxRows?: number
  columns?: RepeatingGroupColumn[]
}

export interface ChoiceOption {
  label: string
  value: string
}

export function slugifyFieldKey(label: string): string {
  const withSpaces = label
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
  const normalized = withSpaces
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!normalized) return 'field_key'
  if (!/^[a-z]/.test(normalized)) return `field_${normalized}`
  return normalized
}

export function validateFieldKey(key: string): boolean {
  return Boolean(key) && key === key.toLowerCase().trim() && /^[a-z][a-z0-9_]*$/.test(key)
}

export function generateUniqueFieldKey(baseLabel: string, existingFields: Array<{ field_key: string }>): string {
  const baseKey = slugifyFieldKey(baseLabel)
  const existingKeys = new Set(existingFields.map((f) => f.field_key))
  if (!existingKeys.has(baseKey)) return baseKey

  let counter = 1
  while (existingKeys.has(`${baseKey}_${counter}`)) {
    counter++
  }
  return `${baseKey}_${counter}`
}

export function getDefaultConfiguration(type: FormFieldType): Record<string, unknown> {
  switch (type) {
    case 'DROPDOWN':
    case 'RADIO':
    case 'CHECKBOX':
      return {
        options: [
          { label: 'Option 1', value: 'option_1' },
          { label: 'Option 2', value: 'option_2' },
        ],
      }
    case 'YES_NO':
      return {
        options: [
          { label: 'Yes', value: 'yes' },
          { label: 'No', value: 'no' },
        ],
      }
    case 'LONG_TEXT':
      return { rows: 4, maxLength: 2000 }
    case 'NUMBER':
      return { min: null, max: null }
    case 'HEADING':
      return { content: 'Section Heading' }
    case 'PARAGRAPH':
      return { content: 'Enter instructions or explanatory text here.' }
    default:
      return {}
  }
}

export function isFormVersionEditable(status: FormVersionStatus | undefined | null): boolean {
  return status === 'DRAFT'
}

export function validateFormVersionForPublishing(
  title: string,
  fields: FormField[],
): string | null {
  if (!title.trim()) {
    return 'Form title cannot be empty.'
  }
  if (fields.length === 0) {
    return 'Form must contain at least one field before publishing.'
  }

  const keys = new Set<string>()
  for (const field of fields) {
    if (!validateFieldKey(field.field_key)) {
      return `Field "${field.label || 'Unlabeled'}" has an invalid key "${field.field_key}". Keys must be lowercase letters, numbers, and underscores.`
    }
    if (keys.has(field.field_key)) {
      return `Duplicate field key "${field.field_key}" found. All field keys must be unique.`
    }
    keys.add(field.field_key)

    if (['DROPDOWN', 'RADIO', 'CHECKBOX'].includes(field.field_type)) {
      const config = (field.configuration ?? {}) as { options?: ChoiceOption[] }
      if (!Array.isArray(config.options) || config.options.length === 0) {
        return `Field "${field.label || 'Choice field'}" must have at least one option configured.`
      }
    }
  }

  return null
}

export function duplicateFieldPayload(
  sourceField: FormField,
  existingFields: FormField[],
): FormFieldInsert {
  const newKey = generateUniqueFieldKey(
    `${sourceField.label || 'field'}_copy`,
    existingFields,
  )
  const maxPosition = Math.max(-1, ...existingFields.map((f) => f.position))

  return {
    form_version_id: sourceField.form_version_id,
    field_type: sourceField.field_type,
    label: sourceField.label ? `${sourceField.label} (Copy)` : 'Copy',
    description: sourceField.description,
    placeholder: sourceField.placeholder,
    required: sourceField.required,
    position: maxPosition + 1,
    field_key: newKey,
    configuration: sourceField.configuration,
  }
}

export function getLatestPublishedVersion(versions: FormVersion[]): FormVersion | null {
  const published = versions.filter((v) => v.status === 'PUBLISHED')
  if (published.length === 0) return null
  return published.reduce((latest, current) =>
    current.version_number > latest.version_number ? current : latest
  )
}
