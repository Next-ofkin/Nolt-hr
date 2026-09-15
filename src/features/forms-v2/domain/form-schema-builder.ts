import { z } from 'zod'
import type { NoltFormDefinition, NoltFormFieldDefinition } from './form-definition'

export function buildZodSchemaFromFormDefinition(definition: NoltFormDefinition) {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const section of definition.sections) {
    for (const field of section.fields) {
      if (['HEADING', 'PARAGRAPH', 'DIVIDER'].includes(field.type)) {
        continue
      }

      shape[field.key] = buildFieldZodSchema(field)
    }
  }

  return z.object(shape)
}

function buildFieldZodSchema(field: NoltFormFieldDefinition): z.ZodTypeAny {
  const isReq = Boolean(field.required || field.validation?.required)
  const reqMsg = field.validation?.requiredMessage || `${field.label || 'This field'} is required.`

  switch (field.type) {
    case 'SHORT_TEXT':
    case 'LONG_TEXT':
    case 'PHONE': {
      let s = z.string()
      if (field.validation?.minLength) {
        s = s.min(field.validation.minLength, `Minimum length is ${field.validation.minLength} characters.`)
      }
      if (field.validation?.maxLength) {
        s = s.max(field.validation.maxLength, `Maximum length is ${field.validation.maxLength} characters.`)
      }
      if (field.validation?.pattern) {
        s = s.regex(
          new RegExp(field.validation.pattern),
          field.validation.patternMessage || 'Invalid input format.'
        )
      }

      if (isReq) {
        return s.min(1, reqMsg)
      }
      return s.optional().or(z.literal(''))
    }

    case 'EMAIL': {
      const s = z.string()
      if (isReq) {
        return s.min(1, reqMsg).email('Please enter a valid email address.')
      }
      return z.union([z.string().email('Please enter a valid email address.'), z.literal('')]).optional()
    }

    case 'NUMBER': {
      const num = z.coerce.number({ invalid_type_error: 'Please enter a valid number.' })
      if (isReq) {
        let n = num
        if (field.validation?.min !== undefined) {
          n = n.min(field.validation.min, `Must be at least ${field.validation.min}`)
        }
        if (field.validation?.max !== undefined) {
          n = n.max(field.validation.max, `Must be at most ${field.validation.max}`)
        }
        return n
      }
      return num.optional().or(z.nan())
    }

    case 'DATE': {
      if (isReq) {
        return z.string().min(1, reqMsg)
      }
      return z.string().optional().or(z.literal(''))
    }

    case 'DROPDOWN':
    case 'RADIO':
    case 'YES_NO': {
      if (isReq) {
        return z.string().min(1, reqMsg)
      }
      return z.string().optional().or(z.literal(''))
    }

    case 'CHECKBOX': {
      const hasOptions = Array.isArray(field.options) && field.options.length > 0
      if (hasOptions) {
        const arr = z.array(z.string())
        if (isReq) {
          return arr.min(1, reqMsg)
        }
        return arr.optional()
      } else {
        const bool = z.boolean()
        if (isReq) {
          return bool.refine((val) => val === true, { message: reqMsg })
        }
        return bool.optional()
      }
    }

    case 'FILE_UPLOAD': {
      if (isReq) {
        return z
          .any()
          .refine((file) => file !== null && file !== undefined && file !== '', { message: reqMsg })
      }
      return z.any().optional()
    }

    case 'SIGNATURE': {
      if (isReq) {
        return z.string().min(1, reqMsg)
      }
      return z.string().optional().or(z.literal(''))
    }

    case 'REPEATING_GROUP': {
      const colShape: Record<string, z.ZodTypeAny> = {}
      const columns = field.repeatingGroup?.columns || []
      for (const col of columns) {
        const colSchema: z.ZodTypeAny = col.required
          ? z.string().min(1, `${col.label} is required.`)
          : z.string().optional().or(z.literal(''))
        colShape[col.key] = colSchema
      }

      let groupArray = z.array(z.object(colShape))
      const minRows = field.repeatingGroup?.minRows
      if (minRows && minRows > 0) {
        groupArray = groupArray.min(minRows, `At least ${minRows} entry row(s) required.`)
      }
      return groupArray
    }

    default:
      return z.any().optional()
  }
}
