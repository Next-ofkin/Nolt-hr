export type NoltFieldType =
  | 'SHORT_TEXT'
  | 'LONG_TEXT'
  | 'EMAIL'
  | 'PHONE'
  | 'NUMBER'
  | 'DATE'
  | 'DROPDOWN'
  | 'RADIO'
  | 'CHECKBOX'
  | 'YES_NO'
  | 'FILE_UPLOAD'
  | 'SIGNATURE'
  | 'HEADING'
  | 'PARAGRAPH'
  | 'DIVIDER'
  | 'REPEATING_GROUP'

export type DataClassification =
  | 'GENERAL'
  | 'SENSITIVE_HEALTH'
  | 'SENSITIVE_FINANCIAL'
  | 'SENSITIVE_IDENTITY'

export interface ChoiceOption {
  label: string
  value: string
}

export interface VisibilityRule {
  fieldKey: string
  operator: 'equals'
  value: unknown
}

export interface FieldValidationRules {
  required?: boolean
  requiredMessage?: string
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  pattern?: string
  patternMessage?: string
}

export interface RepeatingGroupColumn {
  id: string
  key: string
  type: Exclude<NoltFieldType, 'HEADING' | 'PARAGRAPH' | 'DIVIDER' | 'REPEATING_GROUP'>
  label: string
  placeholder?: string
  required?: boolean
  options?: ChoiceOption[]
}

export interface NoltFormFieldDefinition {
  id: string
  key: string
  type: NoltFieldType
  label: string
  description?: string
  placeholder?: string
  required?: boolean
  defaultValue?: unknown
  options?: ChoiceOption[]
  validation?: FieldValidationRules
  visibilityRule?: VisibilityRule
  dataClassification?: DataClassification
  layout?: {
    span?: 12 | 6 | 4
  }
  repeatingGroup?: {
    minRows?: number
    maxRows?: number
    columns: RepeatingGroupColumn[]
  }
  fileUpload?: {
    accept?: string
    maxSizeMb?: number
  }
  signature?: {
    signerRole?: string
  }
  content?: string
}

export interface NoltFormSectionDefinition {
  id: string
  title: string
  description?: string
  fields: NoltFormFieldDefinition[]
}

export interface NoltFormDefinition {
  id: string
  title: string
  description?: string
  instructions?: string
  sections: NoltFormSectionDefinition[]
}

export function shouldShowField(
  field: NoltFormFieldDefinition,
  formValues: Record<string, unknown>,
): boolean {
  if (!field.visibilityRule) {
    return true
  }
  const watchedValue = formValues[field.visibilityRule.fieldKey]
  return String(watchedValue) === String(field.visibilityRule.value)
}
