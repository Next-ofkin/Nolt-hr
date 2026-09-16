/**
 * SHADCN Form Builder Domain Schema
 * Inspired by FormKitCN (https://github.com/Johuniq/formkitcn) - MIT License
 * Copyright (c) Johuniq / FormKitCN contributors. Adapted for NOLT HR.
 */

import { z } from 'zod'

export type FieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'phone'
  | 'number'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'yesno'
  | 'file'
  | 'education_repeater'
  | 'section_heading'
  | 'paragraph'

export interface FieldOption {
  label: string
  value: string
}

export interface FormField {
  id: string
  name: string
  type: FieldType
  label: string
  placeholder?: string
  helpText?: string
  required?: boolean
  width?: 'full' | 'half'
  options?: FieldOption[]
  visibleIf?: {
    fieldName: string
    equalsValue: string
  }
}

export interface FormStep {
  id: string
  title: string
  shortTitle?: string
  description?: string
  fields: FormField[]
}

export interface FormSchema {
  title: string
  description: string
  steps: FormStep[]
}

/**
 * A clean starting point for a brand-new production form: one empty
 * section, no fields, no demo content. Used by the "New Form" workflow so
 * real forms don't start out pre-filled with the Employee Data demo.
 */
export function createBlankFormSchema(): FormSchema {
  return {
    title: 'Untitled Form',
    description: '',
    steps: [
      {
        id: `step_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        title: 'Section 1',
        fields: [],
      },
    ],
  }
}

export function createDefaultField(type: FieldType, index: number): FormField {
  const id = `field_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
  const baseName = `field_${index + 1}`

  switch (type) {
    case 'text':
      return { id, name: baseName, type: 'text', label: 'Short Text', placeholder: 'Enter text...', width: 'half' }
    case 'textarea':
      return { id, name: baseName, type: 'textarea', label: 'Long Text', placeholder: 'Enter detailed text...', width: 'full', helpText: 'Provide complete details' }
    case 'email':
      return { id, name: baseName, type: 'email', label: 'Email Address', placeholder: 'employee@noltfinance.com', width: 'half', required: true }
    case 'phone':
      return { id, name: baseName, type: 'phone', label: 'Phone Number', placeholder: '+234 800 000 0000', width: 'half', required: true }
    case 'number':
      return { id, name: baseName, type: 'number', label: 'Numeric Value', placeholder: '0000', width: 'half' }
    case 'date':
      return { id, name: baseName, type: 'date', label: 'Date', width: 'half' }
    case 'select':
      return {
        id,
        name: baseName,
        type: 'select',
        label: 'Select Option',
        width: 'half',
        options: [
          { label: 'Option 1', value: 'Option 1' },
          { label: 'Option 2', value: 'Option 2' },
        ],
      }
    case 'radio':
      return {
        id,
        name: baseName,
        type: 'radio',
        label: 'Single Choice',
        width: 'full',
        options: [
          { label: 'Option A', value: 'Option A' },
          { label: 'Option B', value: 'Option B' },
        ],
      }
    case 'checkbox':
      return { id, name: baseName, type: 'checkbox', label: 'Checkbox Choice', width: 'full' }
    case 'yesno':
      return { id, name: baseName, type: 'yesno', label: 'Yes or No Question', width: 'half', required: true }
    case 'file':
      return { id, name: baseName, type: 'file', label: 'File Upload', width: 'full', helpText: 'PNG, JPG or PDF up to 5MB' }
    case 'education_repeater':
      return { id, name: 'education_history', type: 'education_repeater', label: 'Education History', width: 'full' }
    case 'section_heading':
      return { id, name: baseName, type: 'section_heading', label: 'Section Heading', width: 'full' }
    case 'paragraph':
      return { id, name: baseName, type: 'paragraph', label: 'Information Note', helpText: 'Detailed instructions or terms go here...', width: 'full' }
  }
}

export function addFieldToStep(schema: FormSchema, stepId: string, type: FieldType): FormSchema {
  return {
    ...schema,
    steps: schema.steps.map((step) => {
      if (step.id !== stepId) return step
      const newField = createDefaultField(type, step.fields.length)
      return { ...step, fields: [...step.fields, newField] }
    }),
  }
}

export function updateFieldInStep(
  schema: FormSchema,
  stepId: string,
  fieldId: string,
  updates: Partial<FormField>,
): FormSchema {
  return {
    ...schema,
    steps: schema.steps.map((step) => {
      if (step.id !== stepId) return step
      return {
        ...step,
        fields: step.fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f)),
      }
    }),
  }
}

export function deleteFieldFromStep(schema: FormSchema, stepId: string, fieldId: string): FormSchema {
  return {
    ...schema,
    steps: schema.steps.map((step) => {
      if (step.id !== stepId) return step
      return {
        ...step,
        fields: step.fields.filter((f) => f.id !== fieldId),
      }
    }),
  }
}

export function duplicateFieldInStep(schema: FormSchema, stepId: string, fieldId: string): FormSchema {
  return {
    ...schema,
    steps: schema.steps.map((step) => {
      if (step.id !== stepId) return step
      const index = step.fields.findIndex((f) => f.id === fieldId)
      if (index === -1) return step
      const target = step.fields[index]
      const copy: FormField = {
        ...target,
        id: `field_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: `${target.name}_copy`,
        label: `${target.label} (Copy)`,
      }
      const newFields = [...step.fields]
      newFields.splice(index + 1, 0, copy)
      return { ...step, fields: newFields }
    }),
  }
}

export function reorderFieldsInStep(
  schema: FormSchema,
  stepId: string,
  fromIndex: number,
  toIndex: number,
): FormSchema {
  return {
    ...schema,
    steps: schema.steps.map((step) => {
      if (step.id !== stepId) return step
      const newFields = [...step.fields]
      const [moved] = newFields.splice(fromIndex, 1)
      newFields.splice(toIndex, 0, moved)
      return { ...step, fields: newFields }
    }),
  }
}

/**
 * Builds a friendly, contextual "this field is required" message from the
 * field's own type and label (e.g. "Date of Birth" -> "Please select your
 * date of birth."), instead of a generic "Response required." string.
 */
export function friendlyRequiredMessage(field: Pick<FormField, 'type' | 'label'>): string {
  const label = field.label.toLowerCase()

  switch (field.type) {
    case 'date':
      return `Please select your ${label}.`
    case 'select':
    case 'radio':
    case 'yesno':
      return `Please choose your ${label}.`
    case 'checkbox':
      return `Please confirm "${field.label}" to continue.`
    case 'file':
      return `Please upload your ${label}.`
    default:
      return `Please enter your ${label}.`
  }
}

export function buildZodSchemaForStep(step: FormStep): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const field of step.fields) {
    if (field.type === 'section_heading' || field.type === 'paragraph') {
      continue
    }

    if (field.type === 'education_repeater') {
      shape[field.name] = z.array(
        z.object({
          school_institution: z.string().min(1, 'Please enter the school or institution.'),
          qualification: z.string().min(1, 'Please enter the qualification.'),
          completion_date: z.string().optional(),
        }),
      )
      continue
    }

    let fieldZod: z.ZodTypeAny

    if (field.type === 'email') {
      if (field.required) {
        fieldZod = z
          .string()
          .min(1, friendlyRequiredMessage(field))
          .email('Please enter a valid email address.')
      } else {
        fieldZod = z
          .string()
          .email('Please enter a valid email address.')
          .optional()
          .or(z.literal(''))
      }
    } else if (field.type === 'number') {
      if (field.required) {
        fieldZod = z
          .string()
          .min(1, friendlyRequiredMessage(field))
          .regex(/^[0-9]+$/, 'Please use numbers only.')
      } else {
        fieldZod = z.string().optional().or(z.literal(''))
      }
    } else if (field.type === 'yesno' || field.type === 'radio' || field.type === 'select') {
      if (field.required) {
        fieldZod = z.string().min(1, friendlyRequiredMessage(field))
      } else {
        fieldZod = z.string().optional().or(z.literal(''))
      }
    } else if (field.type === 'checkbox') {
      if (field.required) {
        fieldZod = z.boolean().refine((v) => v === true, { message: friendlyRequiredMessage(field) })
      } else {
        fieldZod = z.boolean().optional()
      }
    } else if (field.type === 'file') {
      if (field.required) {
        fieldZod = z.any().refine((val) => val != null && val !== '', { message: friendlyRequiredMessage(field) })
      } else {
        fieldZod = z.any().optional()
      }
    } else {
      // General text, textarea, phone, date
      if (field.required) {
        fieldZod = z.string().min(1, friendlyRequiredMessage(field))
      } else {
        fieldZod = z.string().optional().or(z.literal(''))
      }
    }

    shape[field.name] = fieldZod
  }

  return z.object(shape)
}
