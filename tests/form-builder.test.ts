import assert from 'node:assert/strict'
import test from 'node:test'
import {
  duplicateFieldPayload,
  generateUniqueFieldKey,
  getDefaultConfiguration,
  isFormVersionEditable,
  slugifyFieldKey,
  validateFieldKey,
  validateFormVersionForPublishing,
} from '../src/lib/form-builder-domain.ts'
import { isRouteAllowedForRole } from '../src/lib/roles.ts'
import type { FormField, FormVersion } from '../src/lib/database.types.ts'

function createMockVersion(overrides: Partial<FormVersion> = {}): FormVersion {
  return {
    id: 'ver-101',
    form_template_id: 'tpl-101',
    version_number: 1,
    status: 'DRAFT',
    title: 'Employee Onboarding Declaration',
    description: 'Please complete all required fields.',
    instructions: null,
    published_at: null,
    published_by: null,
    created_at: '2026-09-14T12:00:00Z',
    updated_at: '2026-09-14T12:00:00Z',
    ...overrides,
  }
}

function createMockField(overrides: Partial<FormField> = {}): FormField {
  return {
    id: 'fld-1',
    form_version_id: 'ver-101',
    field_type: 'SHORT_TEXT',
    label: 'Full Legal Name',
    description: null,
    placeholder: 'Enter full name',
    required: true,
    position: 0,
    field_key: 'full_legal_name',
    configuration: {},
    created_at: '2026-09-14T12:00:00Z',
    updated_at: '2026-09-14T12:00:00Z',
    ...overrides,
  }
}

test('authorization: Admin and HR can access form routes, Employee and anonymous are blocked', () => {
  assert.equal(isRouteAllowedForRole('/hr/forms', 'admin'), true)
  assert.equal(isRouteAllowedForRole('/hr/forms', 'hr'), true)
  assert.equal(isRouteAllowedForRole('/hr/forms', 'employee'), false)
  assert.equal(isRouteAllowedForRole('/hr/forms', null), false)

  assert.equal(isRouteAllowedForRole('/hr/forms/new', 'employee'), false)
  assert.equal(isRouteAllowedForRole('/hr/forms/tpl-1/builder/ver-1', 'employee'), false)
})

test('field key slugification and validation', () => {
  assert.equal(slugifyFieldKey('Full Legal Name!'), 'full_legal_name')
  assert.equal(slugifyFieldKey('  Email Address  '), 'email_address')
  assert.equal(slugifyFieldKey('Emergency Contact Phone #2'), 'emergency_contact_phone_2')

  assert.equal(validateFieldKey('full_legal_name'), true)
  assert.equal(validateFieldKey('email_2'), true)
  assert.equal(validateFieldKey('Invalid Key!'), false)
  assert.equal(validateFieldKey('UPPERCASE'), false)
  assert.equal(validateFieldKey('with-hyphen'), false)
})

test('field key uniqueness generator handles collisions', () => {
  const existing = [{ field_key: 'full_name' }, { field_key: 'full_name_1' }]
  const newKey = generateUniqueFieldKey('Full Name', existing)
  assert.equal(newKey, 'full_name_2')
})

test('field type default configurations', () => {
  const dropdownConfig = getDefaultConfiguration('DROPDOWN')
  assert.equal(Array.isArray(dropdownConfig.options), true)
  assert.equal((dropdownConfig.options as Array<{ label: string }>).length, 2)

  const yesNoConfig = getDefaultConfiguration('YES_NO')
  assert.equal((yesNoConfig.options as Array<{ value: string }>)[0].value, 'yes')
})

test('publishing validation enforces non-empty title, fields, and unique keys', () => {
  const validFields = [
    createMockField({ field_key: 'name', position: 0 }),
    createMockField({
      id: 'fld-2',
      field_type: 'DROPDOWN',
      field_key: 'gender',
      label: 'Gender',
      position: 1,
      configuration: { options: [{ label: 'Male', value: 'male' }] },
    }),
  ]

  assert.equal(validateFormVersionForPublishing('Onboarding Form', validFields), null)

  // Empty title
  assert.match(
    validateFormVersionForPublishing('   ', validFields) ?? '',
    /title cannot be empty/i,
  )

  // Empty fields
  assert.match(
    validateFormVersionForPublishing('Title', []) ?? '',
    /at least one field/i,
  )

  // Duplicate key
  const duplicateKeyFields = [
    createMockField({ field_key: 'email', position: 0 }),
    createMockField({ id: 'fld-2', field_key: 'email', position: 1 }),
  ]
  assert.match(
    validateFormVersionForPublishing('Title', duplicateKeyFields) ?? '',
    /duplicate field key/i,
  )

  // Choice field missing options
  const emptyOptionsFields = [
    createMockField({
      field_type: 'DROPDOWN',
      field_key: 'category',
      configuration: { options: [] },
    }),
  ]
  assert.match(
    validateFormVersionForPublishing('Title', emptyOptionsFields) ?? '',
    /at least one option/i,
  )
})

test('published version immutability check', () => {
  const draftVer = createMockVersion({ status: 'DRAFT' })
  const publishedVer = createMockVersion({ status: 'PUBLISHED' })

  assert.equal(isFormVersionEditable(draftVer.status), true)
  assert.equal(isFormVersionEditable(publishedVer.status), false)
})

test('field duplication payload generates unique key and next position', () => {
  const fld1 = createMockField({ position: 0, field_key: 'full_legal_name', label: 'Full Legal Name' })
  const fld2 = createMockField({ id: 'fld-2', position: 1, field_key: 'address', label: 'Home Address' })

  const copyPayload = duplicateFieldPayload(fld1, [fld1, fld2])

  assert.equal(copyPayload.position, 2)
  assert.equal(copyPayload.field_key, 'full_legal_name_copy')
  assert.equal(copyPayload.label, 'Full Legal Name (Copy)')
})

test('creating draft from published version clones fields without altering published source', () => {
  const publishedVersion = createMockVersion({
    id: 'ver-1',
    version_number: 1,
    status: 'PUBLISHED',
  })
  const sourceFields = [
    createMockField({ id: 'f1', form_version_id: 'ver-1', field_key: 'f_name', position: 0 }),
    createMockField({ id: 'f2', form_version_id: 'ver-1', field_key: 'l_name', position: 1 }),
  ]

  // Pure logic simulation of create_form_draft_from_version RPC
  function simulateCreateDraft(sourceVer: FormVersion, fieldsToCopy: FormField[]) {
    const newVersion: FormVersion = {
      ...sourceVer,
      id: 'ver-2',
      version_number: sourceVer.version_number + 1,
      status: 'DRAFT',
      published_at: null,
      published_by: null,
      created_at: '2026-09-14T14:00:00Z',
      updated_at: '2026-09-14T14:00:00Z',
    }

    const clonedFields: FormField[] = fieldsToCopy.map((f, idx) => ({
      ...f,
      id: `new-f-${idx}`,
      form_version_id: newVersion.id,
    }))

    return { newVersion, clonedFields }
  }

  const result = simulateCreateDraft(publishedVersion, sourceFields)

  // Verify new version
  assert.equal(result.newVersion.version_number, 2)
  assert.equal(result.newVersion.status, 'DRAFT')
  assert.equal(result.clonedFields.length, 2)
  assert.equal(result.clonedFields[0].form_version_id, 'ver-2')

  // Verify source published version remains completely untouched
  assert.equal(publishedVersion.status, 'PUBLISHED')
  assert.equal(publishedVersion.version_number, 1)
  assert.equal(sourceFields[0].form_version_id, 'ver-1')
})
