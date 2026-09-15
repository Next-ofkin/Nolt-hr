export interface GoogleFormItemTextQuestion {
  paragraph?: boolean
}

export interface GoogleFormItemDateQuestion {
  includeYear?: boolean
  includeTime?: boolean
}

export interface GoogleFormChoiceOption {
  value: string
}

export interface GoogleFormItemChoiceQuestion {
  type: 'RADIO' | 'CHECKBOX' | 'DROP_DOWN'
  options: GoogleFormChoiceOption[]
}

export interface GoogleFormQuestion {
  required?: boolean
  textQuestion?: GoogleFormItemTextQuestion
  dateQuestion?: GoogleFormItemDateQuestion
  choiceQuestion?: GoogleFormItemChoiceQuestion
}

export interface GoogleFormQuestionItem {
  question: GoogleFormQuestion
}

export type GoogleFormPageBreakItem = Record<string, never>

export interface GoogleFormItem {
  title: string
  description?: string
  questionItem?: GoogleFormQuestionItem
  pageBreakItem?: GoogleFormPageBreakItem
}

export interface GoogleFormCreateItemRequest {
  createItem: {
    item: GoogleFormItem
    location: {
      index: number
    }
  }
}

export interface GoogleFormBatchUpdatePayload {
  requests: GoogleFormCreateItemRequest[]
}

export interface GoogleFormCreatePayload {
  info: {
    title: string
    documentTitle?: string
  }
}

export interface GoogleFormPublishSettingsPayload {
  publishSettings: {
    isPublished: boolean
    isAcceptingResponses: boolean
  }
}

export interface GoogleFormPocSafeResult {
  ok: true
  formId: string
  title: string
  responderUri: string
  editUri: string
}

export interface GoogleFormPocErrorResult {
  ok: false
  error: string
  errorCode:
    | 'GOOGLE_AUTH_NOT_CONFIGURED'
    | 'GOOGLE_AUTH_FAILED'
    | 'GOOGLE_FORMS_CREATE_FAILED'
    | 'GOOGLE_FORMS_UPDATE_FAILED'
    | 'GOOGLE_FORMS_PUBLISH_FAILED'
    | 'GOOGLE_RATE_LIMITED'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'INVALID_REQUEST'
}

export function buildGoogleFormCreatePayload(title: string): GoogleFormCreatePayload {
  const formTitle = title.trim() || 'Employee Data Form'
  return {
    info: {
      title: formTitle,
      documentTitle: formTitle,
    },
  }
}

export interface NoltPocField {
  type: 'SECTION' | 'SHORT_TEXT' | 'LONG_TEXT' | 'DATE' | 'CHOICE'
  title: string
  required?: boolean
  options?: string[]
}

export interface NoltPocFormDefinition {
  title: string
  fields: NoltPocField[]
}

export function getDefaultPocFormDefinition(title = 'Employee Data Form'): NoltPocFormDefinition {
  return {
    title,
    fields: [
      { type: 'SECTION', title: 'Personal Information' },
      { type: 'SHORT_TEXT', title: 'First Name', required: true },
      { type: 'SHORT_TEXT', title: 'Last Name', required: true },
      { type: 'DATE', title: 'Date of Birth', required: true },
      {
        type: 'CHOICE',
        title: 'Employment Type',
        options: ['Permanent', 'Contract', 'Temporary'],
      },
      { type: 'SECTION', title: 'Contact Information' },
      { type: 'SHORT_TEXT', title: 'Email Address' },
      { type: 'SHORT_TEXT', title: 'Phone Number' },
      { type: 'LONG_TEXT', title: 'Home Address' },
    ],
  }
}

export function buildGoogleFormBatchUpdatePayload(
  definition: NoltPocFormDefinition,
): GoogleFormBatchUpdatePayload {
  const requests: GoogleFormCreateItemRequest[] = []

  definition.fields.forEach((field, index) => {
    if (field.type === 'SECTION') {
      requests.push({
        createItem: {
          item: {
            title: field.title,
            pageBreakItem: {},
          },
          location: { index },
        },
      })
    } else if (field.type === 'SHORT_TEXT') {
      requests.push({
        createItem: {
          item: {
            title: field.title,
            questionItem: {
              question: {
                required: Boolean(field.required),
                textQuestion: { paragraph: false },
              },
            },
          },
          location: { index },
        },
      })
    } else if (field.type === 'LONG_TEXT') {
      requests.push({
        createItem: {
          item: {
            title: field.title,
            questionItem: {
              question: {
                required: Boolean(field.required),
                textQuestion: { paragraph: true },
              },
            },
          },
          location: { index },
        },
      })
    } else if (field.type === 'DATE') {
      requests.push({
        createItem: {
          item: {
            title: field.title,
            questionItem: {
              question: {
                required: Boolean(field.required),
                dateQuestion: { includeYear: true, includeTime: false },
              },
            },
          },
          location: { index },
        },
      })
    } else if (field.type === 'CHOICE') {
      const opts = (field.options || []).map((val) => ({ value: val }))
      requests.push({
        createItem: {
          item: {
            title: field.title,
            questionItem: {
              question: {
                required: Boolean(field.required),
                choiceQuestion: {
                  type: 'RADIO',
                  options: opts,
                },
              },
            },
          },
          location: { index },
        },
      })
    }
  })

  return { requests }
}

export function buildSafeResult(
  formId: string,
  title: string,
  responderUri?: string,
): GoogleFormPocSafeResult {
  return {
    ok: true,
    formId,
    title,
    responderUri: responderUri || `https://docs.google.com/forms/d/e/${formId}/viewform`,
    editUri: `https://docs.google.com/forms/d/${formId}/edit`,
  }
}
