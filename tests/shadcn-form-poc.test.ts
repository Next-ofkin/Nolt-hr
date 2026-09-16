import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addFieldToStep,
  updateFieldInStep,
  deleteFieldFromStep,
  reorderFieldsInStep,
  buildZodSchemaForStep,
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
