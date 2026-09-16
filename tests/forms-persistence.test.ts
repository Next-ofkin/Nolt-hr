import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createBlankFormSchema, type FormSchema } from '../src/features/shadcn-form-poc/domain/form-schema.ts'
import {
  FormPersistenceError,
  formPersistenceMessage,
  mapFormVersion,
  summarizeFormDefinition,
} from '../src/features/forms/data/forms-types.ts'
import type { FormDefinitionVersionRow } from '../src/lib/database.types.ts'
import { isRouteAllowedForRole } from '../src/lib/roles.ts'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

async function readRepositoryFile(relativePath: string) {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8')
}

async function readTypeScriptFiles(directory: string): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true })
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) return readTypeScriptFiles(entryPath)
      if (!entry.isFile() || !/\.(?:ts|tsx)$/.test(entry.name)) return ''
      return readFile(entryPath, 'utf8')
    }),
  )
  return contents.join('\n')
}

const persistedDefinition: FormSchema = {
  title: 'Persisted employee form',
  description: 'Loaded from a version row',
  steps: [
    {
      id: 'step_identity',
      title: 'Identity',
      fields: [
        {
          id: 'field_first_name',
          name: 'first_name',
          type: 'text',
          label: 'First name',
          required: true,
        },
      ],
    },
  ],
}

function versionRow(overrides: Partial<FormDefinitionVersionRow> = {}): FormDefinitionVersionRow {
  return {
    id: 'version-1',
    form_definition_id: 'form-1',
    version_number: 1,
    state: 'draft',
    definition: persistedDefinition as unknown as FormDefinitionVersionRow['definition'],
    schema_version: 1,
    revision: 1,
    created_by: 'user-1',
    updated_by: 'user-1',
    published_by: null,
    created_at: '2026-09-16T10:00:00.000Z',
    updated_at: '2026-09-16T10:00:00.000Z',
    published_at: null,
    ...overrides,
  }
}

test('new production forms start with one empty section and no demo fields', () => {
  const schema = createBlankFormSchema()

  assert.equal(schema.title, 'Untitled Form')
  assert.equal(schema.description, '')
  assert.equal(schema.steps.length, 1)
  assert.equal(schema.steps[0].title, 'Section 1')
  assert.ok(schema.steps[0].id.trim())
  assert.deepEqual(schema.steps[0].fields, [])
  assert.deepEqual(JSON.parse(JSON.stringify(schema)), schema)
})

test('database version mapping preserves the exact persisted form schema', () => {
  const row = versionRow({ revision: 4 })
  const mapped = mapFormVersion(row)

  assert.equal(mapped.id, row.id)
  assert.equal(mapped.formDefinitionId, row.form_definition_id)
  assert.equal(mapped.versionNumber, 1)
  assert.equal(mapped.state, 'draft')
  assert.equal(mapped.revision, 4)
  assert.strictEqual(mapped.definition, persistedDefinition)
  assert.deepEqual(mapped.definition, persistedDefinition)
})

test('form summaries select the draft and highest published version independent of row order', () => {
  const versions = [
    versionRow({ id: 'published-v1', state: 'published', published_at: '2026-09-14T10:00:00.000Z' }),
    versionRow({ id: 'draft-v3', version_number: 3, revision: 2 }),
    versionRow({
      id: 'published-v2',
      version_number: 2,
      state: 'published',
      published_at: '2026-09-15T10:00:00.000Z',
    }),
  ]

  const summary = summarizeFormDefinition(
    {
      id: 'form-1',
      title: 'Persisted form',
      description: null,
      created_at: '2026-09-14T09:00:00.000Z',
      updated_at: '2026-09-16T09:00:00.000Z',
      archived_at: null,
    },
    versions,
  )

  assert.equal(summary.draftVersionNumber, 3)
  assert.equal(summary.draftRevision, 2)
  assert.equal(summary.latestPublishedVersionNumber, 2)
  assert.equal(summary.latestPublishedAt, '2026-09-15T10:00:00.000Z')
  assert.deepEqual(versions.map((version) => version.id), ['published-v1', 'draft-v3', 'published-v2'])
})

test('revision conflicts retain server revision metadata and use the required UX copy', () => {
  const error = new FormPersistenceError(
    'FORM_DRAFT_CONFLICT',
    'Database conflict detail',
    7,
  )

  assert.equal(error.code, 'FORM_DRAFT_CONFLICT')
  assert.equal(error.currentRevision, 7)
  assert.equal(
    formPersistenceMessage(error, 'Fallback'),
    'This draft was changed elsewhere. Refresh before saving again.',
  )
})

test('production forms routes are admin/HR-only through the shared route authorization', () => {
  for (const route of ['/hr/forms', '/hr/forms/form-1/edit']) {
    assert.equal(isRouteAllowedForRole(route, 'admin'), true)
    assert.equal(isRouteAllowedForRole(route, 'hr'), true)
    assert.equal(isRouteAllowedForRole(route, 'employee'), false)
    assert.equal(isRouteAllowedForRole(route, null), false)
  }
})

test('forms repository exposes the required API and sends optimistic revision to the save RPC', async () => {
  const source = await readRepositoryFile('src/features/forms/data/forms-repository.ts')

  for (const functionName of [
    'listFormDefinitions',
    'getFormDefinition',
    'getFormVersions',
    'createFormDefinition',
    'saveFormDraft',
    'publishFormDraft',
    'createDraftFromPublished',
  ]) {
    assert.match(source, new RegExp(`export async function ${functionName}\\b`))
  }

  assert.match(source, /\.rpc\('save_form_definition_draft'/)
  assert.match(source, /p_expected_revision:\s*input\.expectedRevision/)
  assert.match(source, /new FormPersistenceError\(err\.error_code, err\.error, err\.current_revision\)/)
  assert.match(source, /\.order\('version_number',\s*\{\s*ascending:\s*false\s*\}\)/)
})

test('migration enforces version uniqueness, one draft, JSON shape, and published immutability', async () => {
  const migration = await readRepositoryFile('supabase/migrations/0015_form_definition_versioning.sql')

  assert.match(migration, /unique\s*\(form_definition_id,\s*version_number\)/i)
  assert.match(migration, /unique index form_definition_versions_one_draft_per_form[\s\S]*where state = 'draft'/i)
  assert.match(migration, /jsonb_typeof\(definition\) = 'object'/i)
  assert.match(migration, /jsonb_typeof\(definition -> 'steps'\) = 'array'/i)
  assert.match(migration, /if OLD\.state = 'published'/)
  assert.match(migration, /before update or delete on public\.form_definition_versions/i)
})

test('migration performs revision checks and clones the latest published JSON into the next draft', async () => {
  const migration = await readRepositoryFile('supabase/migrations/0015_form_definition_versioning.sql')

  assert.match(migration, /state = 'draft'[\s\S]*for update/i)
  assert.match(migration, /v_draft\.revision <> p_expected_revision/i)
  assert.match(migration, /FORM_DRAFT_CONFLICT/)
  assert.match(migration, /revision = revision \+ 1/i)
  assert.match(migration, /state = 'published'[\s\S]*order by version_number desc[\s\S]*limit 1/i)
  assert.match(migration, /v_latest_published\.definition/)
})

test('migration keeps authoring tables private to authenticated admin/HR users', async () => {
  const migration = await readRepositoryFile('supabase/migrations/0015_form_definition_versioning.sql')

  assert.match(migration, /alter table public\.form_definitions enable row level security/i)
  assert.match(migration, /alter table public\.form_definition_versions enable row level security/i)
  assert.match(migration, /current_user_role\(\)\) in \('admin', 'hr'\)/i)
  assert.match(migration, /revoke all on public\.form_definitions, public\.form_definition_versions from anon/i)
  assert.doesNotMatch(migration, /grant\s+[^;]*delete[^;]*to authenticated/i)
})

test('browser code contains no service-role credential or privileged client', async () => {
  const browserSource = await readTypeScriptFiles(path.join(repositoryRoot, 'src'))

  assert.doesNotMatch(browserSource, /SUPABASE_SERVICE_ROLE_KEY/i)
  assert.doesNotMatch(browserSource, /service[_-]?role/i)
})

test('production forms persistence code has no SurveyJS or Google Forms dependency', async () => {
  const phaseSource = [
    await readTypeScriptFiles(path.join(repositoryRoot, 'src', 'features', 'forms')),
    await readRepositoryFile('src/features/shadcn-form-poc/builder/FormBuilder.tsx'),
    await readRepositoryFile('src/features/shadcn-form-poc/domain/form-schema.ts'),
  ].join('\n')

  assert.doesNotMatch(phaseSource, /survey(?:js|-core|-react)/i)
  assert.doesNotMatch(phaseSource, /google[\s_-]*forms/i)
})
