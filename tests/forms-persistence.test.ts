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
  filterFormsBySearch,
  filterFormsByStatus,
  formatFormDate,
  type FormDefinitionSummary,
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

test('migration 0017 revokes direct table DML and converts RPCs to SECURITY DEFINER', async () => {
  const migration = await readRepositoryFile('supabase/migrations/0017_harden_forms_mutation_boundary.sql')

  assert.match(migration, /revoke insert, update, delete on public\.form_definitions from authenticated, anon, public/i)
  assert.match(migration, /revoke insert, update, delete on public\.form_definition_versions from authenticated, anon, public/i)
  assert.match(migration, /drop policy if exists form_definitions_insert/i)
  assert.match(migration, /drop policy if exists form_definitions_update/i)
  assert.match(migration, /drop policy if exists form_definition_versions_insert/i)
  assert.match(migration, /drop policy if exists form_definition_versions_update/i)

  for (const fn of [
    'create_form_definition',
    'save_form_definition_draft',
    'publish_form_definition_draft',
    'create_form_definition_draft',
  ]) {
    assert.match(migration, new RegExp(`function public\\.${fn}[\\s\\S]*?security definer`, 'i'))
    assert.match(migration, new RegExp(`function public\\.${fn}[\\s\\S]*?set search_path = ''`, 'i'))
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn}`, 'i'))
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}[^;]*to authenticated`, 'i'))
  }
})

test('frontend production code contains no direct form table inserts, updates, or deletes', async () => {
  const browserSource = await readTypeScriptFiles(path.join(repositoryRoot, 'src'))

  assert.doesNotMatch(browserSource, /\.from\(\s*['"]form_definitions['"]\s*\)\s*\.insert/i)
  assert.doesNotMatch(browserSource, /\.from\(\s*['"]form_definitions['"]\s*\)\s*\.update/i)
  assert.doesNotMatch(browserSource, /\.from\(\s*['"]form_definitions['"]\s*\)\s*\.delete/i)
  assert.doesNotMatch(browserSource, /\.from\(\s*['"]form_definition_versions['"]\s*\)\s*\.insert/i)
  assert.doesNotMatch(browserSource, /\.from\(\s*['"]form_definition_versions['"]\s*\)\s*\.update/i)
  assert.doesNotMatch(browserSource, /\.from\(\s*['"]form_definition_versions['"]\s*\)\s*\.delete/i)
})

test('unauthorized error mapping returns user-facing access error message', () => {
  const error = new FormPersistenceError('UNAUTHORIZED', 'Only admin or HR can edit forms.')
  assert.equal(error.code, 'UNAUTHORIZED')
  assert.equal(formPersistenceMessage(error, 'Fallback'), 'Only admin or HR can edit forms.')
})

function sampleFormSummary(overrides: Partial<FormDefinitionSummary> = {}): FormDefinitionSummary {
  return {
    id: 'form-1',
    title: 'Employee Data Form',
    description: 'Standard onboarding paperwork.',
    createdAt: '2026-09-16T10:00:00.000Z',
    updatedAt: '2026-09-16T10:00:00.000Z',
    archivedAt: null,
    draftVersionNumber: null,
    draftRevision: null,
    latestPublishedVersionNumber: null,
    latestPublishedAt: null,
    ...overrides,
  }
}

test('filterFormsBySearch matches title or description, case-insensitively', () => {
  const forms = [
    sampleFormSummary({ id: 'a', title: 'Employee Data Form', description: 'For new hires' }),
    sampleFormSummary({ id: 'b', title: 'Bank Details', description: 'Payroll setup' }),
  ]

  assert.deepEqual(filterFormsBySearch(forms, 'employee').map((f) => f.id), ['a'])
  assert.deepEqual(filterFormsBySearch(forms, 'PAYROLL').map((f) => f.id), ['b'])
  assert.deepEqual(filterFormsBySearch(forms, '').map((f) => f.id), ['a', 'b'])
  assert.deepEqual(filterFormsBySearch(forms, '   ').map((f) => f.id), ['a', 'b'])
  assert.deepEqual(filterFormsBySearch(forms, 'nonexistent'), [])
})

test('filterFormsByStatus separates draft, published-only, and archived forms', () => {
  const forms = [
    sampleFormSummary({ id: 'draft-only', draftVersionNumber: 1 }),
    sampleFormSummary({ id: 'published-only', latestPublishedVersionNumber: 1 }),
    sampleFormSummary({ id: 'draft-with-published-history', draftVersionNumber: 2, latestPublishedVersionNumber: 1 }),
    sampleFormSummary({ id: 'archived-form', archivedAt: '2026-09-10T00:00:00.000Z', latestPublishedVersionNumber: 1 }),
    sampleFormSummary({ id: 'untouched' }),
  ]

  assert.deepEqual(
    filterFormsByStatus(forms, 'draft').map((f) => f.id),
    ['draft-only', 'draft-with-published-history'],
  )
  assert.deepEqual(
    filterFormsByStatus(forms, 'published').map((f) => f.id),
    ['published-only'],
  )
  assert.deepEqual(
    filterFormsByStatus(forms, 'archived').map((f) => f.id),
    ['archived-form'],
  )
  assert.deepEqual(filterFormsByStatus(forms, 'all'), forms)
})

test('formatFormDate renders a readable "16 Sep 2026" style date', () => {
  assert.equal(formatFormDate('2026-09-16T10:00:00.000Z'), '16 Sep 2026')
})

test('forms library page: New Form and Create New Draft actions remain wired to the repository, and no form is hardcoded', async () => {
  const source = await readRepositoryFile('src/features/forms/pages/FormsLibraryPage.tsx')

  assert.match(source, /useCreateFormDefinition\(/)
  assert.match(source, /useCreateDraftFromPublished\(/)
  assert.match(source, /useFormDefinitions\(/)
  assert.match(source, /navigate\(`\/hr\/forms\/\$\{created\.formDefinitionId\}\/edit`\)/)
  assert.match(source, /navigate\(`\/hr\/forms\/\$\{formDefinitionId\}\/edit`\)/)
})

test('forms library page renders no unstyled Tailwind utility classes (this app ships no Tailwind build)', async () => {
  const source = await readRepositoryFile('src/features/forms/pages/FormsLibraryPage.tsx')

  for (const utility of ['bg-indigo-600', 'text-slate-900', 'rounded-2xl', 'rounded-xl', 'max-w-7xl', 'grid-cols-1', 'shadow-sm', 'space-x-', 'space-y-']) {
    assert.doesNotMatch(source, new RegExp(utility))
  }
})

test('form editor: the form title is editable while a draft is open, bound to the same schema that gets saved', async () => {
  const source = await readRepositoryFile('src/features/forms/pages/FormEditorPage.tsx')

  // A real input bound to schema.title, not a static heading, so renaming
  // actually persists (save sends schema.title as p_title).
  assert.match(source, /value=\{schema\.title\}/)
  assert.match(source, /setSchema\(\{ \.\.\.schema, title: event\.target\.value \}\)/)
  assert.match(source, /title: schema\.title/)
})

test('forms library: archive action is wired to the repository and RPC, with a confirmation prompt', async () => {
  const repoSource = await readRepositoryFile('src/features/forms/data/forms-repository.ts')
  assert.match(repoSource, /export async function archiveFormDefinition/)
  assert.match(repoSource, /\.rpc\('archive_form_definition'/)

  const queriesSource = await readRepositoryFile('src/features/forms/data/forms-queries.ts')
  assert.match(queriesSource, /export function useArchiveFormDefinition/)

  const pageSource = await readRepositoryFile('src/features/forms/pages/FormsLibraryPage.tsx')
  assert.match(pageSource, /window\.confirm\(/)
  assert.match(pageSource, /useArchiveFormDefinition\(/)
})

test('migration 0020 archives forms via a SECURITY DEFINER RPC, not a direct table write', async () => {
  const migration = await readRepositoryFile('supabase/migrations/0020_archive_forms_and_packages.sql')

  assert.match(migration, /function public\.archive_form_definition[\s\S]*?security definer/i)
  assert.match(migration, /grant execute on function public\.archive_form_definition\(uuid\) to authenticated/i)
})

test('form version history collapses old published versions behind a toggle, not a database limit', async () => {
  const source = await readRepositoryFile('src/features/forms/components/FormVersionHistory.tsx')

  assert.match(source, /splitVersionsForDisplay\(/)
  assert.match(source, /\$\{hiddenCount\}/)
  // Every published version is still fetched from the server and passed in whole -
  // this is a display-only limit, so nothing is dropped before it reaches the component.
  assert.doesNotMatch(source, /versions\.slice\(/)
})
