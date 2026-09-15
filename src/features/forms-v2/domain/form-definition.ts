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

export interface FormProgressStats {
  totalInputFields: number
  completedInputFields: number
  totalRequiredFields: number
  completedRequiredFields: number
  percentComplete: number
}

export function isInputField(type: NoltFieldType): boolean {
  return type !== 'HEADING' && type !== 'PARAGRAPH' && type !== 'DIVIDER'
}

export function isFieldValueFilled(val: unknown): boolean {
  if (val === undefined || val === null || val === '') return false
  if (Array.isArray(val)) return val.length > 0
  if (typeof val === 'boolean') return val === true
  return true
}

export function calculateFormProgress(
  formDef: NoltFormDefinition,
  formValues: Record<string, unknown>,
): FormProgressStats {
  let totalInputFields = 0
  let completedInputFields = 0
  let totalRequiredFields = 0
  let completedRequiredFields = 0

  for (const section of formDef.sections) {
    for (const field of section.fields) {
      if (!isInputField(field.type)) continue
      if (!shouldShowField(field, formValues)) continue

      totalInputFields++
      const val = formValues[field.key]
      const filled = isFieldValueFilled(val)

      if (filled) {
        completedInputFields++
      }

      if (field.required) {
        totalRequiredFields++
        if (filled) {
          completedRequiredFields++
        }
      }
    }
  }

  const percentComplete =
    totalInputFields > 0 ? Math.round((completedInputFields / totalInputFields) * 100) : 0

  return {
    totalInputFields,
    completedInputFields,
    totalRequiredFields,
    completedRequiredFields,
    percentComplete,
  }
}

export function calculateSectionCompletion(
  section: NoltFormSectionDefinition,
  formValues: Record<string, unknown>,
): { isComplete: boolean; isStarted: boolean } {
  let inputCount = 0
  let filledCount = 0

  for (const field of section.fields) {
    if (!isInputField(field.type)) continue
    if (!shouldShowField(field, formValues)) continue

    inputCount++
    if (isFieldValueFilled(formValues[field.key])) {
      filledCount++
    }
  }

  return {
    isComplete: inputCount > 0 && filledCount === inputCount,
    isStarted: filledCount > 0,
  }
}
