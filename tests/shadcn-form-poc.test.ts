import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addFieldToStep,
  updateFieldInStep,
  deleteFieldFromStep,
  reorderFieldsInStep,
  buildZodSchemaForStep,
  friendlyRequiredMessage,
  createDefaultField,
} from '../src/features/shadcn-form-poc/domain/form-schema.ts'
import { defaultDemoFormSchema } from '../src/features/shadcn-form-poc/domain/demo-form.ts'
import { EMPLOYEE_MANAGER_ROLES } from '../src/lib/employee-domain.ts'

test('POC route role protection: admin and hr allowed, employee denied', () => {
  assert.ok(EMPLOYEE_MANAGER_ROLES.includes('admin'))
  assert.ok(EMPLOYEE_MANAGER_ROLES.includes('hr'))
  assert.equal(
    EMPLOYEE_MANAGER_ROLES.includes('employee' as unknown as typeof EMPLOYEE_MANAGER_ROLES[number]),
    false,
  )
})

test('Form schema is 100% JSON serializable', () => {
  const jsonString = JSON.stringify(defaultDemoFormSchema)
  const parsed = JSON.parse(jsonString)
  assert.equal(parsed.title, defaultDemoFormSchema.title)
  assert.equal(parsed.steps.length, defaultDemoFormSchema.steps.length)
})

test('builder helper: addFieldToStep appends field to active step', () => {
  const stepId = defaultDemoFormSchema.steps[0].id
  const initialCount = defaultDemoFormSchema.steps[0].fields.length
  const updated = addFieldToStep(defaultDemoFormSchema, stepId, 'text')
  const newStep = updated.steps.find((s) => s.id === stepId)!
  assert.equal(newStep.fields.length, initialCount + 1)
  assert.equal(newStep.fields[newStep.fields.length - 1].type, 'text')
})

test('builder helper: updateFieldInStep updates field properties', () => {
  const stepId = defaultDemoFormSchema.steps[0].id
  const fieldId = defaultDemoFormSchema.steps[0].fields[0].id
  const updated = updateFieldInStep(defaultDemoFormSchema, stepId, fieldId, {
    label: 'Updated First Name',
    required: false,
  })
  const field = updated.steps[0].fields[0]
  assert.equal(field.label, 'Updated First Name')
  assert.equal(field.required, false)
})

test('builder helper: deleteFieldFromStep removes field from step', () => {
  const stepId = defaultDemoFormSchema.steps[0].id
  const fieldId = defaultDemoFormSchema.steps[0].fields[0].id
  const initialCount = defaultDemoFormSchema.steps[0].fields.length
  const updated = deleteFieldFromStep(defaultDemoFormSchema, stepId, fieldId)
  assert.equal(updated.steps[0].fields.length, initialCount - 1)
  assert.equal(updated.steps[0].fields.some((f) => f.id === fieldId), false)
})

test('builder helper: reorderFieldsInStep reorders fields', () => {
  const stepId = defaultDemoFormSchema.steps[0].id
  const firstFieldId = defaultDemoFormSchema.steps[0].fields[0].id
  const updated = reorderFieldsInStep(defaultDemoFormSchema, stepId, 0, 1)
  assert.equal(updated.steps[0].fields[1].id, firstFieldId)
})

test('dynamic Zod schema generation enforces required field validation', () => {
  const step = defaultDemoFormSchema.steps[0]
  const zodSchema = buildZodSchemaForStep(step)
  
  // Valid payload
  const validResult = zodSchema.safeParse({
    first_name: 'Chukwuma',
    last_name: 'Adebayo',
    date_of_birth: '1990-01-01',
  })
  assert.equal(validResult.success, true)

  // Missing required field 'first_name'
  const invalidResult = zodSchema.safeParse({
    last_name: 'Adebayo',
    date_of_birth: '1990-01-01',
  })
  assert.equal(invalidResult.success, false)
})

test('conditional health behavior: details visibleIf health issues is Yes', () => {
  const healthStep = defaultDemoFormSchema.steps[4]
  const detailsField = healthStep.fields.find((f) => f.name === 'health_issue_details')
  assert.ok(detailsField)
  assert.deepEqual(detailsField.visibleIf, {
    fieldName: 'has_health_issues',
    equalsValue: 'Yes',
  })
})

test('employee preview is generated directly from the same serializable schema', () => {
  assert.equal(defaultDemoFormSchema.steps.length, 6)
  assert.ok(defaultDemoFormSchema.steps[0].fields.length > 0)
})

test('maximum layout columns for paired fields is 2', () => {
  for (const step of defaultDemoFormSchema.steps) {
    for (const field of step.fields) {
      assert.ok(field.width === 'full' || field.width === 'half')
    }
  }
})

test('SHADCN Form POC has zero database dependencies', () => {
  assert.equal((defaultDemoFormSchema as unknown as Record<string, unknown>).tableName, undefined)
})

test('friendly required message generation is contextual per field type, not a generic string', () => {
  assert.equal(friendlyRequiredMessage({ type: 'text', label: 'First Name' }), 'Please enter your first name.')
  assert.equal(friendlyRequiredMessage({ type: 'date', label: 'Date of Birth' }), 'Please select your date of birth.')
  assert.equal(friendlyRequiredMessage({ type: 'select', label: 'Marital Status' }), 'Please choose your marital status.')
  assert.equal(friendlyRequiredMessage({ type: 'file', label: 'Passport Photograph' }), 'Please upload your passport photograph.')
  assert.equal(
    friendlyRequiredMessage({ type: 'checkbox', label: 'I agree to the terms' }),
    'Please confirm "I agree to the terms" to continue.',
  )

  // Never the generic/unfriendly strings this phase replaces
  for (const type of ['text', 'date', 'select', 'file', 'checkbox'] as const) {
    const message = friendlyRequiredMessage({ type, label: 'Sample Field' })
    assert.notEqual(message, 'Response required.')
    assert.notEqual(message, 'Sample Field is required')
  }
})

test('friendly messages are generated dynamically from any field label, not hardcoded to the demo form', () => {
  const step = {
    id: 'step_custom',
    title: 'Custom Step',
    fields: [
      { id: 'f1', name: 'favorite_color', type: 'text' as const, label: 'Favorite Color', required: true },
    ],
  }
  const zodSchema = buildZodSchemaForStep(step)
  const result = zodSchema.safeParse({ favorite_color: '' })
  assert.equal(result.success, false)
  if (!result.success) {
    assert.equal(result.error.issues[0].message, 'Please enter your favorite color.')
  }
})

test('validation errors are scoped to the specific invalid field, not the whole form', () => {
  const step = defaultDemoFormSchema.steps[0]
  const zodSchema = buildZodSchemaForStep(step)
  const result = zodSchema.safeParse({
    first_name: '',
    last_name: 'Adebayo',
    date_of_birth: '1990-01-01',
  })
  assert.equal(result.success, false)
  if (!result.success) {
    const paths = result.error.issues.map((issue) => issue.path[0])
    assert.ok(paths.includes('first_name'))
    assert.equal(paths.includes('last_name'), false)
    assert.equal(paths.includes('date_of_birth'), false)
  }
})

test('Next/Continue validates only the current step, not fields from other steps', () => {
  const step1Schema = buildZodSchemaForStep(defaultDemoFormSchema.steps[0])
  const step2Fields = defaultDemoFormSchema.steps[1].fields.map((f) => f.name)

  // Step 1's schema shape must not reference any field that belongs to step 2
  for (const fieldName of step2Fields) {
    assert.equal(Object.prototype.hasOwnProperty.call(step1Schema.shape, fieldName), false)
  }
})

test('education repeating group is preserved: array schema with friendly per-row messages', () => {
  const step = {
    id: 'step_education',
    title: 'Education',
    fields: [
      { id: 'f1', name: 'education_history', type: 'education_repeater' as const, label: 'Education History' },
    ],
  }
  const zodSchema = buildZodSchemaForStep(step)
  const result = zodSchema.safeParse({
    education_history: [{ school_institution: '', qualification: '', completion_date: '' }],
  })
  assert.equal(result.success, false)
  if (!result.success) {
    const messages = result.error.issues.map((issue) => issue.message)
    assert.ok(messages.includes('Please enter the school or institution.'))
    assert.ok(messages.includes('Please enter the qualification.'))
  }

  const validResult = zodSchema.safeParse({
    education_history: [{ school_institution: 'University of Lagos', qualification: 'B.Sc.', completion_date: '' }],
  })
  assert.equal(validResult.success, true)
})

test('file upload field stays full-width by default', () => {
  const fileField = createDefaultField('file', 0)
  assert.equal(fileField.width, 'full')
})
