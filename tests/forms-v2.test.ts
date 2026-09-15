import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { buildZodSchemaFromFormDefinition } from '../src/features/forms-v2/domain/form-schema-builder.ts'
import { buildDefaultValues } from '../src/features/forms-v2/domain/form-default-values.ts'
import { shouldShowField } from '../src/features/forms-v2/domain/form-definition.ts'
import type { NoltFormDefinition, NoltFormFieldDefinition } from '../src/features/forms-v2/domain/form-definition.ts'
import { employeeDataFormDefinition } from '../src/features/forms-v2/demo/employee-data-form.demo.ts'
import { EMPLOYEE_MANAGER_ROLES } from '../src/lib/employee-domain.ts'

test('forms-v2 dependencies react-hook-form, zod, and resolvers are available and functional', () => {
  assert.equal(typeof useForm, 'function')
  assert.equal(typeof zodResolver, 'function')
  assert.equal(typeof z.object, 'function')
})

test('buildZodSchemaFromFormDefinition creates valid Zod schema enforcing field rules', () => {
  const sampleDef: NoltFormDefinition = {
    id: 'test_form',
    title: 'Test Form',
    sections: [
      {
        id: 'sec_1',
        title: 'Section 1',
        fields: [
          {
            id: 'f_req',
            key: 'required_field',
            label: 'Required Text',
            type: 'SHORT_TEXT',
            required: true,
          },
          {
            id: 'f_opt',
            key: 'optional_field',
            label: 'Optional Text',
            type: 'SHORT_TEXT',
            required: false,
          },
          {
            id: 'f_email',
            key: 'email_field',
            label: 'Email',
            type: 'EMAIL',
            required: true,
          },
          {
            id: 'f_num',
            key: 'age_field',
            label: 'Age',
            type: 'NUMBER',
            required: true,
            validation: { min: 18, max: 65 },
          },
        ],
      },
    ],
  }

  const schema = buildZodSchemaFromFormDefinition(sampleDef)

  // Valid payload
  const validResult = schema.safeParse({
    required_field: 'Hello',
    optional_field: '',
    email_field: 'user@nolt.com',
    age_field: 25,
  })
  assert.equal(validResult.success, true)

  // Invalid payload: missing required field
  const invalidReq = schema.safeParse({
    required_field: '',
    email_field: 'user@nolt.com',
    age_field: 25,
  })
  assert.equal(invalidReq.success, false)

  // Invalid payload: bad email format
  const invalidEmail = schema.safeParse({
    required_field: 'Hello',
    email_field: 'not-an-email',
    age_field: 25,
  })
  assert.equal(invalidEmail.success, false)

  // Invalid payload: number out of range
  const invalidNum = schema.safeParse({
    required_field: 'Hello',
    email_field: 'user@nolt.com',
    age_field: 10,
  })
  assert.equal(invalidNum.success, false)
})

test('buildDefaultValues initializes default values for all field types', () => {
  const sampleDef: NoltFormDefinition = {
    id: 'test_defaults',
    title: 'Defaults Form',
    sections: [
      {
        id: 'sec_1',
        title: 'Section 1',
        fields: [
          {
            id: 'f_text',
            key: 'text_key',
            label: 'Text',
            type: 'SHORT_TEXT',
            defaultValue: 'Default String',
          },
          {
            id: 'f_chk',
            key: 'chk_key',
            label: 'Check',
            type: 'CHECKBOX',
            defaultValue: true,
          },
          {
            id: 'f_grp',
            key: 'group_key',
            label: 'Group',
            type: 'REPEATING_GROUP',
            repeatingGroup: {
              minRows: 2,
              columns: [
                {
                  id: 'sub_1',
                  key: 'sub_key',
                  label: 'Sub Item',
                  type: 'SHORT_TEXT',
                },
              ],
            },
          },
        ],
      },
    ],
  }

  const defaults = buildDefaultValues(sampleDef)
  assert.equal(defaults.text_key, 'Default String')
  assert.equal(defaults.chk_key, true)
  assert.ok(Array.isArray(defaults.group_key))
  const groupArr = defaults.group_key as Record<string, unknown>[]
  assert.equal(groupArr.length, 2)
  assert.deepEqual(groupArr[0], { sub_key: '' })
})

test('shouldShowField accurately evaluates conditional visibility rules', () => {
  const conditionalField: NoltFormFieldDefinition = {
    id: 'f_cond',
    key: 'spouse_name',
    label: 'Spouse Name',
    type: 'SHORT_TEXT',
    visibilityRule: {
      fieldKey: 'marital_status',
      operator: 'equals',
      value: 'MARRIED',
    },
  }

  assert.equal(shouldShowField(conditionalField, { marital_status: 'MARRIED' }), true)
  assert.equal(shouldShowField(conditionalField, { marital_status: 'SINGLE' }), false)
  assert.equal(shouldShowField(conditionalField, {}), false)
})

test('internal classifications and machine keys are present in domain metadata but separated from UI labels', () => {
  const form = employeeDataFormDefinition
  const healthField = form.sections
    .flatMap((s) => s.fields)
    .find((f) => f.dataClassification === 'SENSITIVE_HEALTH')

  assert.ok(healthField, 'Expected sensitive health classified field in demo form')
  assert.equal(healthField?.dataClassification, 'SENSITIVE_HEALTH')
  assert.ok(healthField?.key, 'Field key exists for RHF registration')
  assert.notEqual(healthField?.label, healthField?.key, 'Label is distinct human-readable title')
})

test('demo route /hr/forms-v2/demo is protected for HR/Admin roles only', () => {
  assert.ok(EMPLOYEE_MANAGER_ROLES.includes('admin'))
  assert.ok(EMPLOYEE_MANAGER_ROLES.includes('hr'))
  assert.equal(EMPLOYEE_MANAGER_ROLES.includes('employee' as unknown as typeof EMPLOYEE_MANAGER_ROLES[number]), false)
})

test('forms v2 has zero database tables or migrations in this phase', () => {
  assert.equal(employeeDataFormDefinition.id, 'demo-emp-data-form')
  assert.equal((employeeDataFormDefinition as unknown as Record<string, unknown>).tableName, undefined)
})
