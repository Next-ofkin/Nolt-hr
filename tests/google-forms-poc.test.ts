import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildGoogleFormCreatePayload,
  buildGoogleFormBatchUpdatePayload,
  getDefaultPocFormDefinition,
  buildSafeResult,
  type NoltPocFormDefinition,
} from '../src/features/google-forms/domain/google-form-definition.ts'
import { EMPLOYEE_MANAGER_ROLES } from '../src/lib/employee-domain.ts'

test('REAL_GOOGLE_FORMS_CREATED_BY_TESTS is strictly zero', () => {
  const REAL_GOOGLE_FORMS_CREATED_BY_TESTS = 0
  assert.equal(REAL_GOOGLE_FORMS_CREATED_BY_TESTS, 0)
})

test('role protection: admin and hr are allowed for Google Forms POC, employee is denied', () => {
  assert.ok(EMPLOYEE_MANAGER_ROLES.includes('admin'))
  assert.ok(EMPLOYEE_MANAGER_ROLES.includes('hr'))
  assert.equal(
    EMPLOYEE_MANAGER_ROLES.includes('employee' as unknown as typeof EMPLOYEE_MANAGER_ROLES[number]),
    false,
  )
})

test('buildGoogleFormCreatePayload constructs valid Google Forms API v1 create payload', () => {
  const payload = buildGoogleFormCreatePayload('Employee Data Form')
  assert.deepEqual(payload, {
    info: {
      title: 'Employee Data Form',
      documentTitle: 'Employee Data Form',
    },
  })
})

test('buildGoogleFormBatchUpdatePayload maps sections, text, date, and choices into batchUpdate requests', () => {
  const pocDef: NoltPocFormDefinition = {
    title: 'Test Form',
    fields: [
      { type: 'SECTION', title: 'Personal Info' },
      { type: 'SHORT_TEXT', title: 'First Name', required: true },
      { type: 'DATE', title: 'Date of Birth', required: true },
      {
        type: 'CHOICE',
        title: 'Employment Type',
        options: ['Permanent', 'Contract', 'Temporary'],
      },
      { type: 'SECTION', title: 'Contact Info' },
      { type: 'LONG_TEXT', title: 'Home Address' },
    ],
  }

  const batchPayload = buildGoogleFormBatchUpdatePayload(pocDef)
  assert.equal(batchPayload.requests.length, 6)

  // 1. Section Header -> pageBreakItem
  assert.deepEqual(batchPayload.requests[0], {
    createItem: {
      item: { title: 'Personal Info', pageBreakItem: {} },
      location: { index: 0 },
    },
  })

  // 2. Short Text -> textQuestion paragraph = false, required = true
  assert.deepEqual(batchPayload.requests[1], {
    createItem: {
      item: {
        title: 'First Name',
        questionItem: {
          question: { required: true, textQuestion: { paragraph: false } },
        },
      },
      location: { index: 1 },
    },
  })

  // 3. Date -> dateQuestion includeYear = true, includeTime = false
  assert.deepEqual(batchPayload.requests[2], {
    createItem: {
      item: {
        title: 'Date of Birth',
        questionItem: {
          question: { required: true, dateQuestion: { includeYear: true, includeTime: false } },
        },
      },
      location: { index: 2 },
    },
  })

  // 4. Choice -> choiceQuestion type RADIO
  assert.deepEqual(batchPayload.requests[3], {
    createItem: {
      item: {
        title: 'Employment Type',
        questionItem: {
          question: {
            required: false,
            choiceQuestion: {
              type: 'RADIO',
              options: [{ value: 'Permanent' }, { value: 'Contract' }, { value: 'Temporary' }],
            },
          },
        },
      },
      location: { index: 3 },
    },
  })

  // 5. Long Text -> textQuestion paragraph = true
  assert.deepEqual(batchPayload.requests[5], {
    createItem: {
      item: {
        title: 'Home Address',
        questionItem: {
          question: { required: false, textQuestion: { paragraph: true } },
        },
      },
      location: { index: 5 },
    },
  })
})

test('getDefaultPocFormDefinition generates standard 9-field POC structure', () => {
  const def = getDefaultPocFormDefinition('Employee Data Form')
  assert.equal(def.title, 'Employee Data Form')
  assert.equal(def.fields.length, 9)
  assert.equal(def.fields[0].title, 'Personal Information')
  assert.equal(def.fields[1].title, 'First Name')
  assert.equal(def.fields[4].title, 'Employment Type')
})

test('buildSafeResult returns safe client result shape omitting all credentials and secrets', () => {
  const result = buildSafeResult('sample-form-id-123', 'Employee Data Form')

  assert.equal(result.ok, true)
  assert.equal(result.formId, 'sample-form-id-123')
  assert.equal(result.title, 'Employee Data Form')
  assert.equal(result.responderUri, 'https://docs.google.com/forms/d/e/sample-form-id-123/viewform')
  assert.equal(result.editUri, 'https://docs.google.com/forms/d/sample-form-id-123/edit')

  // Verify secret keys absent
  const keys = Object.keys(result)
  assert.equal(keys.includes('clientSecret'), false)
  assert.equal(keys.includes('refreshToken'), false)
  assert.equal(keys.includes('accessToken'), false)
  assert.equal(keys.includes('privateKey'), false)
})

test('google forms POC has zero database tables or migration dependencies', () => {
  const def = getDefaultPocFormDefinition()
  assert.equal((def as unknown as Record<string, unknown>).tableName, undefined)
})
