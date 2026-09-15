import type { NoltFormDefinition, NoltFormFieldDefinition } from './form-definition'

export function buildDefaultValues(definition: NoltFormDefinition): Record<string, unknown> {
  const defaults: Record<string, unknown> = {}

  for (const section of definition.sections) {
    for (const field of section.fields) {
      if (['HEADING', 'PARAGRAPH', 'DIVIDER'].includes(field.type)) {
        continue
      }

      defaults[field.key] = getFieldDefaultValue(field)
    }
  }

  return defaults
}

function getFieldDefaultValue(field: NoltFormFieldDefinition): unknown {
  if (field.defaultValue !== undefined && field.defaultValue !== null) {
    return field.defaultValue
  }

  switch (field.type) {
    case 'CHECKBOX': {
      const hasOptions = Array.isArray(field.options) && field.options.length > 0
      return hasOptions ? [] : false
    }

    case 'REPEATING_GROUP': {
      const minRows = field.repeatingGroup?.minRows || 1
      const columns = field.repeatingGroup?.columns || []
      const rows: Array<Record<string, string>> = []
      for (let i = 0; i < minRows; i++) {
        const row: Record<string, string> = {}
        for (const col of columns) {
          row[col.key] = ''
        }
        rows.push(row)
      }
      return rows
    }

    case 'FILE_UPLOAD':
      return null

    default:
      return ''
  }
}
