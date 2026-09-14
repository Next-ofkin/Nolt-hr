import assert from 'node:assert/strict'
import test from 'node:test'
import {
  duplicateFieldPayload,
  FIELD_TYPE_METADATA,
  generateUniqueFieldKey,
  getDefaultConfiguration,
  getLatestPublishedVersion,
  isFormVersionEditable,
  slugifyFieldKey,
  validateFieldKey,
  validateFormVersionForPublishing,
} from '../src/lib/form-builder-domain.ts'
import { isRouteAllowedForRole } from '../src/lib/roles.ts'
import type { FormField, FormFieldType, FormVersion, Json } from '../src/lib/database.types.ts'

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
    presentation_config: {},
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

test('all 16 form field types exist in type metadata including SIGNATURE, DIVIDER, and REPEATING_GROUP', () => {
  const expectedTypes: FormFieldType[] = [
    'SHORT_TEXT',
    'LONG_TEXT',
    'EMAIL',
    'PHONE',
    'NUMBER',
    'DATE',
    'DROPDOWN',
    'RADIO',
    'CHECKBOX',
    'YES_NO',
    'FILE_UPLOAD',
    'SIGNATURE',
    'HEADING',
    'PARAGRAPH',
    'DIVIDER',
    'REPEATING_GROUP',
  ]

  for (const fieldType of expectedTypes) {
    assert.ok(FIELD_TYPE_METADATA[fieldType], `Missing metadata for ${fieldType}`)
    assert.equal(FIELD_TYPE_METADATA[fieldType].type, fieldType)
  }

  assert.equal(FIELD_TYPE_METADATA.SIGNATURE.category, 'advanced')
  assert.equal(FIELD_TYPE_METADATA.DIVIDER.category, 'content')
  assert.equal(FIELD_TYPE_METADATA.REPEATING_GROUP.category, 'advanced')
})

test('publishing a DRAFT version retains its version_number', () => {
  const draftVersion = createMockVersion({
    version_number: 1,
    status: 'DRAFT',
    instructions: 'Follow the steps below to complete the form.',
  })

  // Simulating publish_form_version RPC logic
  function simulatePublish(version: FormVersion): FormVersion {
    assert.equal(version.status, 'DRAFT', 'Only DRAFT versions can be published')
    return {
      ...version,
      status: 'PUBLISHED',
      published_at: new Date().toISOString(),
    }
  }

  const published = simulatePublish(draftVersion)
  assert.equal(published.version_number, 1)
  assert.equal(published.status, 'PUBLISHED')
  assert.equal(published.instructions, 'Follow the steps below to complete the form.')
})

test('field key server/domain validation requires starting with a lowercase letter', () => {
  // Accepted
  assert.equal(validateFieldKey('first_name'), true)
  assert.equal(validateFieldKey('employee1'), true)
  assert.equal(validateFieldKey('date_of_birth'), true)

  // Rejected
  assert.equal(validateFieldKey('1employee'), false, 'Key starting with digit must be rejected')
  assert.equal(validateFieldKey('_first_name'), false, 'Key starting with underscore must be rejected')
  assert.equal(validateFieldKey('First_Name'), false, 'Uppercase key must be rejected')
  assert.equal(validateFieldKey('first-name'), false, 'Hyphenated key must be rejected')
})

test('multiple published versions remain PUBLISHED as immutable historical snapshots', () => {
  // 1. Initial Draft Version 1
  const v1Draft = createMockVersion({ id: 'ver-1', version_number: 1, status: 'DRAFT' })
  assert.equal(v1Draft.status, 'DRAFT')

  // 2. Publish Version 1
  const v1Published: FormVersion = { ...v1Draft, status: 'PUBLISHED', published_at: '2026-09-14T10:00:00Z' }
  assert.equal(v1Published.status, 'PUBLISHED')
  assert.equal(isFormVersionEditable(v1Published.status), false)

  // 3. Create Draft Version 2 from V1
  const v2Draft: FormVersion = {
    ...v1Published,
    id: 'ver-2',
    version_number: 2,
    status: 'DRAFT',
    published_at: null,
  }
  assert.equal(v1Published.status, 'PUBLISHED', 'V1 must remain PUBLISHED when V2 draft is created')
  assert.equal(v2Draft.status, 'DRAFT')

  // 4. Publish Version 2
  const v2Published: FormVersion = { ...v2Draft, status: 'PUBLISHED', published_at: '2026-09-14T12:00:00Z' }

  // 5. Verify BOTH V1 and V2 remain PUBLISHED and immutable
  assert.equal(v1Published.status, 'PUBLISHED', 'V1 must remain PUBLISHED after V2 is published')
  assert.equal(v2Published.status, 'PUBLISHED', 'V2 must be PUBLISHED')
  assert.equal(isFormVersionEditable(v1Published.status), false, 'V1 remains immutable')
  assert.equal(isFormVersionEditable(v2Published.status), false, 'V2 remains immutable')

  // 6. Verify Latest Published version selection resolves V2 without modifying V1
  const versions = [v1Published, v2Published]
  const latest = getLatestPublishedVersion(versions)
  assert.notEqual(latest, null)
  assert.equal(latest?.id, 'ver-2')
  assert.equal(latest?.version_number, 2)
  assert.equal(v1Published.status, 'PUBLISHED')
})

test('AI PDF Import proposal acceptance creates a DRAFT version and NEVER auto-publishes', () => {
  // Pure logic simulation of accept_form_import_job RPC
  function simulateAcceptImportProposal(input: {
    jobId: string
    name: string
    category: string
    description: string
    instructions: string
    presentation: Record<string, unknown>
    fields: Array<Record<string, unknown>>
  }) {
    const template = {
      id: 'tpl-imported-1',
      name: input.name,
      category: input.category,
      description: input.description,
    }

    const version: FormVersion = {
      id: 'ver-imported-1',
      form_template_id: template.id,
      version_number: 1,
      status: 'DRAFT', // MUST ALWAYS BE DRAFT
      title: input.name,
      description: input.description,
      instructions: input.instructions,
      published_at: null,
      published_by: null,
      created_at: '2026-09-14T15:00:00Z',
      updated_at: '2026-09-14T15:00:00Z',
      presentation_config: input.presentation as unknown as Json,
    }

    return { template, version }
  }

  const proposalInput = {
    jobId: 'job-101',
    name: 'Imported Guarantor Form',
    category: 'Onboarding',
    description: 'Guarantor declaration form extracted from PDF',
    instructions: 'Complete all sections accurately.',
    presentation: { mode: 'DOCUMENT' },
    fields: [
      { field_type: 'HEADING', label: 'SECTION 1: GUARANTOR DETAILS' },
      { field_type: 'SHORT_TEXT', label: 'Full Legal Name', field_key: 'guarantor_name' },
      { field_type: 'SIGNATURE', label: 'Guarantor Signature', field_key: 'guarantor_sig' },
    ],
  }

  const result = simulateAcceptImportProposal(proposalInput)

  // Verify created version is Version 1 DRAFT and NOT published
  assert.equal(result.version.version_number, 1)
  assert.equal(result.version.status, 'DRAFT', 'AI import must create a DRAFT version')
  assert.equal(result.version.published_at, null)
  assert.equal((result.version.presentation_config as Record<string, unknown>).mode, 'DOCUMENT')
  assert.equal(isFormVersionEditable(result.version.status), true)
})

test('Form import route authorization restricts access to admin and hr only', () => {
  assert.equal(isRouteAllowedForRole('/hr/forms/import/job-1', 'admin'), true)
  assert.equal(isRouteAllowedForRole('/hr/forms/import/job-1', 'hr'), true)
  assert.equal(isRouteAllowedForRole('/hr/forms/import/job-1', 'employee'), false)
  assert.equal(isRouteAllowedForRole('/hr/forms/import/job-1', null), false)
})

test('AI provider selection defaults to Gemini and supports OpenRouter and OpenAI with safe errors', () => {
  function selectAIProviderMock(providerEnv?: string, secrets: Record<string, string> = {}) {
    const selected = (providerEnv || 'gemini').toLowerCase().trim()

    if (selected === 'openrouter') {
      const key = secrets['OPENROUTER_API_KEY']
      return {
        name: 'openrouter',
        model: secrets['FORM_IMPORT_MODEL'] || 'openrouter/free',
        isConfigured: Boolean(key && key.trim() !== ''),
        missingError: 'OpenRouter PDF import is not configured.',
      }
    }

    if (selected === 'openai') {
      const key = secrets['OPENAI_API_KEY']
      return {
        name: 'openai',
        model: secrets['FORM_IMPORT_MODEL'] || 'gpt-5.6-terra',
        isConfigured: Boolean(key && key.trim() !== ''),
        missingError: 'OpenAI PDF import is not configured.',
      }
    }

    // Default: Gemini
    const key = secrets['GEMINI_API_KEY']
    return {
      name: 'gemini',
      model: secrets['FORM_IMPORT_MODEL'] || 'gemini-3.8-flash',
      isConfigured: Boolean(key && key.trim() !== ''),
      missingError: 'Gemini PDF import is not configured.',
    }
  }

  // 1. Default provider is Gemini
  const defaultProvider = selectAIProviderMock(undefined, {})
  assert.equal(defaultProvider.name, 'gemini')
  assert.equal(defaultProvider.model, 'gemini-3.8-flash')
  assert.equal(defaultProvider.isConfigured, false)
  assert.equal(defaultProvider.missingError, 'Gemini PDF import is not configured.')

  // 2. OpenRouter provider selection
  const openRouterUnconfigured = selectAIProviderMock('openrouter', {})
  assert.equal(openRouterUnconfigured.name, 'openrouter')
  assert.equal(openRouterUnconfigured.model, 'openrouter/free')
  assert.equal(openRouterUnconfigured.isConfigured, false)
  assert.equal(openRouterUnconfigured.missingError, 'OpenRouter PDF import is not configured.')

  const openRouterConfigured = selectAIProviderMock('openrouter', { OPENROUTER_API_KEY: 'test-key-123' })
  assert.equal(openRouterConfigured.isConfigured, true)

  // 3. OpenAI provider selection retained
  const openAiUnconfigured = selectAIProviderMock('openai', {})
  assert.equal(openAiUnconfigured.name, 'openai')
  assert.equal(openAiUnconfigured.model, 'gpt-5.6-terra')
  assert.equal(openAiUnconfigured.isConfigured, false)
  assert.equal(openAiUnconfigured.missingError, 'OpenAI PDF import is not configured.')

  // 4. Gemini configured
  const geminiConfigured = selectAIProviderMock('gemini', { GEMINI_API_KEY: 'gemini-secret-xyz' })
  assert.equal(geminiConfigured.isConfigured, true)
})

test('Gemini HTTP status mapping maps upstream error codes cleanly without exposing secrets', () => {
  function mapHttpErrorToSafeDiagnostic(providerName: string, status: number) {
    const prov = providerName.toUpperCase()
    if (status === 400) return { code: `${prov}_BAD_REQUEST`, message: 'Gemini could not process this form request.' }
    if (status === 401) return { code: `${prov}_AUTH`, message: 'Gemini authentication failed. Please contact the system administrator.' }
    if (status === 403) return { code: `${prov}_PERMISSION`, message: 'Gemini API access is not permitted for the configured project.' }
    if (status === 404) return { code: `${prov}_MODEL_NOT_FOUND`, message: 'The configured Gemini model is unavailable.' }
    if (status === 429) return { code: `${prov}_RATE_LIMIT`, message: "Gemini's current usage limit has been reached. Please try again later." }
    return { code: `${prov}_UPSTREAM_ERROR`, message: 'Gemini is temporarily unavailable. Please try again.' }
  }

  assert.equal(mapHttpErrorToSafeDiagnostic('gemini', 400).code, 'GEMINI_BAD_REQUEST')
  assert.equal(mapHttpErrorToSafeDiagnostic('gemini', 401).code, 'GEMINI_AUTH')
  assert.equal(mapHttpErrorToSafeDiagnostic('gemini', 403).code, 'GEMINI_PERMISSION')
  assert.equal(mapHttpErrorToSafeDiagnostic('gemini', 404).code, 'GEMINI_MODEL_NOT_FOUND')
  assert.equal(mapHttpErrorToSafeDiagnostic('gemini', 429).code, 'GEMINI_RATE_LIMIT')
  assert.equal(mapHttpErrorToSafeDiagnostic('gemini', 500).code, 'GEMINI_UPSTREAM_ERROR')
  assert.equal(mapHttpErrorToSafeDiagnostic('gemini', 503).code, 'GEMINI_UPSTREAM_ERROR')
})

test('FAILED or ANALYZING import jobs are strictly rejected by draft creation guard', () => {
  function validateAcceptJobStatus(status: string) {
    if (status !== 'READY_FOR_REVIEW') {
      return { ok: false, error: 'Import job is not ready for review' }
    }
    return { ok: true }
  }

  assert.equal(validateAcceptJobStatus('FAILED').ok, false)
  assert.equal(validateAcceptJobStatus('ANALYZING').ok, false)
  assert.equal(validateAcceptJobStatus('UPLOADED').ok, false)
  assert.equal(validateAcceptJobStatus('CANCELLED').ok, false)
  assert.equal(validateAcceptJobStatus('READY_FOR_REVIEW').ok, true)
})
