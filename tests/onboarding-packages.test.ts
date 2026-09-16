import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  OnboardingPackagePersistenceError,
  onboardingPackagePersistenceMessage,
  mapPackageItem,
  mapPackageVersion,
  summarizeOnboardingPackage,
  filterOnboardingPackagesBySearch,
  filterOnboardingPackagesByStatus,
  formatPackageDate,
  type OnboardingPackageSummary,
} from '../src/features/onboarding-packages/data/onboarding-packages-types.ts'
import type {
  OnboardingPackageItemRow,
  OnboardingPackageRow,
  OnboardingPackageVersionRow,
} from '../src/lib/database.types.ts'
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

function samplePackageRow(overrides: Partial<OnboardingPackageRow> = {}): OnboardingPackageRow {
  return {
    id: 'pkg-1',
    title: 'New Starter Package',
    description: 'Standard onboarding package',
    created_by: 'user-1',
    updated_by: 'user-1',
    created_at: '2026-09-16T10:00:00.000Z',
    updated_at: '2026-09-16T10:00:00.000Z',
    archived_at: null,
    archived_by: null,
    ...overrides,
  }
}

function sampleVersionRow(overrides: Partial<OnboardingPackageVersionRow> = {}): OnboardingPackageVersionRow {
  return {
    id: 'ver-1',
    onboarding_package_id: 'pkg-1',
    version_number: 1,
    state: 'draft',
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

function sampleFormItemRow(overrides: Partial<OnboardingPackageItemRow> = {}): OnboardingPackageItemRow {
  return {
    id: 'item-1',
    package_version_id: 'ver-1',
    item_type: 'form',
    sort_order: 0,
    required: true,
    form_version_id: 'form-ver-1',
    document_title: null,
    document_description: null,
    created_at: '2026-09-16T10:00:00.000Z',
    ...overrides,
  }
}

function sampleDocItemRow(overrides: Partial<OnboardingPackageItemRow> = {}): OnboardingPackageItemRow {
  return {
    id: 'item-2',
    package_version_id: 'ver-1',
    item_type: 'document',
    sort_order: 1,
    required: true,
    form_version_id: null,
    document_title: 'Passport Photograph',
    document_description: 'Upload photo page',
    created_at: '2026-09-16T10:00:00.000Z',
    ...overrides,
  }
}

test('mapPackageItem correctly maps form and document items with metadata', () => {
  const formItem = mapPackageItem(sampleFormItemRow(), { title: 'Employee Data Form', versionNumber: 2 })
  assert.equal(formItem.id, 'item-1')
  assert.equal(formItem.itemType, 'form')
  assert.equal(formItem.formVersionId, 'form-ver-1')
  assert.equal(formItem.formTitle, 'Employee Data Form')
  assert.equal(formItem.formVersionNumber, 2)

  const docItem = mapPackageItem(sampleDocItemRow())
  assert.equal(docItem.id, 'item-2')
  assert.equal(docItem.itemType, 'document')
  assert.equal(docItem.documentTitle, 'Passport Photograph')
  assert.equal(docItem.documentDescription, 'Upload photo page')
})

test('mapPackageVersion maps version row and sorts child items by sort_order', () => {
  const versionRow = sampleVersionRow({ revision: 3 })
  const items = [sampleDocItemRow({ sort_order: 1 }), sampleFormItemRow({ sort_order: 0 })]
  const mapped = mapPackageVersion(versionRow, items, {
    'form-ver-1': { title: 'Employee Data Form', versionNumber: 1 },
  })

  assert.equal(mapped.id, 'ver-1')
  assert.equal(mapped.versionNumber, 1)
  assert.equal(mapped.revision, 3)
  assert.equal(mapped.items.length, 2)
  assert.equal(mapped.items[0].itemType, 'form')
  assert.equal(mapped.items[1].itemType, 'document')
})

test('summarizeOnboardingPackage calculates item counts and latest version state', () => {
  const packageRow = samplePackageRow()
  const versions = [
    sampleVersionRow({ id: 'ver-1', version_number: 1, state: 'published', published_at: '2026-09-15T10:00:00Z' }),
    sampleVersionRow({ id: 'ver-2', version_number: 2, state: 'draft', revision: 2 }),
  ]
  const items = [
    sampleFormItemRow({ package_version_id: 'ver-2', sort_order: 0 }),
    sampleDocItemRow({ package_version_id: 'ver-2', sort_order: 1 }),
  ]

  const summary = summarizeOnboardingPackage(packageRow, versions, items)
  assert.equal(summary.id, 'pkg-1')
  assert.equal(summary.draftVersionNumber, 2)
  assert.equal(summary.draftRevision, 2)
  assert.equal(summary.latestPublishedVersionNumber, 1)
  assert.equal(summary.totalFormsCount, 1)
  assert.equal(summary.totalDocumentsCount, 1)
})

test('onboardingPackagePersistenceMessage formats domain errors and conflict warnings', () => {
  const conflictErr = new OnboardingPackagePersistenceError('PACKAGE_DRAFT_CONFLICT', 'Conflict', 5)
  assert.equal(
    onboardingPackagePersistenceMessage(conflictErr),
    'This package draft was changed elsewhere. Refresh before saving again.',
  )

  const invalidFormErr = new OnboardingPackagePersistenceError('INVALID_FORM_VERSION', 'Form draft error')
  assert.equal(
    onboardingPackagePersistenceMessage(invalidFormErr),
    'Only published form versions can be added to an onboarding package.',
  )

  const duplicateErr = new OnboardingPackagePersistenceError('DUPLICATE_FORM_ITEM', 'Dup error')
  assert.equal(
    onboardingPackagePersistenceMessage(duplicateErr),
    'A package cannot contain the same form version multiple times.',
  )
})

test('onboarding packages routes are admin/HR-only', () => {
  for (const route of ['/hr/onboarding-packages', '/hr/onboarding-packages/pkg-1/edit']) {
    assert.equal(isRouteAllowedForRole(route, 'admin'), true)
    assert.equal(isRouteAllowedForRole(route, 'hr'), true)
    assert.equal(isRouteAllowedForRole(route, 'employee'), false)
    assert.equal(isRouteAllowedForRole(route, null), false)
  }
})

test('onboarding packages repository exports required RPC API functions', async () => {
  const source = await readRepositoryFile('src/features/onboarding-packages/data/onboarding-packages-repository.ts')

  for (const fn of [
    'listPublishedFormVersions',
    'listOnboardingPackages',
    'getOnboardingPackage',
    'createOnboardingPackage',
    'saveOnboardingPackageDraft',
    'publishOnboardingPackageDraft',
    'createOnboardingPackageDraft',
  ]) {
    assert.match(source, new RegExp(`export async function ${fn}\\b`))
  }

  assert.match(source, /\.rpc\('create_onboarding_package'/)
  assert.match(source, /\.rpc\('save_onboarding_package_draft'/)
  assert.match(source, /\.rpc\('publish_onboarding_package_draft'/)
  assert.match(source, /\.rpc\('create_onboarding_package_draft'/)
})

test('migration 0018 configures onboarding tables, one-draft index, immutability, and SECURITY DEFINER RPCs', async () => {
  const migration = await readRepositoryFile('supabase/migrations/0018_onboarding_package_versioning.sql')

  assert.match(migration, /create table public\.onboarding_packages/i)
  assert.match(migration, /create table public\.onboarding_package_versions/i)
  assert.match(migration, /create table public\.onboarding_package_items/i)
  assert.match(migration, /unique index onboarding_package_versions_one_draft_per_package[\s\S]*where state = 'draft'/i)
  assert.match(migration, /unique index onboarding_package_items_unique_form_per_version[\s\S]*where form_version_id is not null/i)
  assert.match(migration, /enforce_onboarding_package_version_immutability/i)
  assert.match(migration, /enforce_onboarding_package_item_immutability/i)

  assert.match(migration, /revoke all on public\.onboarding_packages, public\.onboarding_package_versions, public\.onboarding_package_items from anon, authenticated, public/i)
  assert.match(migration, /grant select on public\.onboarding_packages, public\.onboarding_package_versions, public\.onboarding_package_items to authenticated/i)

  for (const fn of [
    'create_onboarding_package',
    'save_onboarding_package_draft',
    'publish_onboarding_package_draft',
    'create_onboarding_package_draft',
  ]) {
    assert.match(migration, new RegExp(`function public\\.${fn}[\\s\\S]*?security definer`, 'i'))
    assert.match(migration, new RegExp(`function public\\.${fn}[\\s\\S]*?set search_path = ''`, 'i'))
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn}`, 'i'))
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}[^;]*to authenticated`, 'i'))
  }
})

test('browser code contains no direct package table DML and no service-role key', async () => {
  const browserSource = await readTypeScriptFiles(path.join(repositoryRoot, 'src'))

  assert.doesNotMatch(browserSource, /\.from\(\s*['"]onboarding_packages['"]\s*\)\s*\.insert/i)
  assert.doesNotMatch(browserSource, /\.from\(\s*['"]onboarding_packages['"]\s*\)\s*\.update/i)
  assert.doesNotMatch(browserSource, /\.from\(\s*['"]onboarding_packages['"]\s*\)\s*\.delete/i)
  assert.doesNotMatch(browserSource, /\.from\(\s*['"]onboarding_package_versions['"]\s*\)\s*\.insert/i)
  assert.doesNotMatch(browserSource, /\.from\(\s*['"]onboarding_package_versions['"]\s*\)\s*\.update/i)
  assert.doesNotMatch(browserSource, /\.from\(\s*['"]onboarding_package_versions['"]\s*\)\s*\.delete/i)
  assert.doesNotMatch(browserSource, /\.from\(\s*['"]onboarding_package_items['"]\s*\)\s*\.insert/i)
  assert.doesNotMatch(browserSource, /\.from\(\s*['"]onboarding_package_items['"]\s*\)\s*\.update/i)
  assert.doesNotMatch(browserSource, /\.from\(\s*['"]onboarding_package_items['"]\s*\)\s*\.delete/i)

  assert.doesNotMatch(browserSource, /SUPABASE_SERVICE_ROLE_KEY/i)
})

function sampleSummary(overrides: Partial<OnboardingPackageSummary> = {}): OnboardingPackageSummary {
  return {
    id: 'pkg-1',
    title: 'New Starter Package',
    description: 'Standard onboarding package for new employees.',
    createdAt: '2026-09-16T10:00:00.000Z',
    updatedAt: '2026-09-16T10:00:00.000Z',
    archivedAt: null,
    draftVersionNumber: null,
    draftRevision: null,
    latestPublishedVersionNumber: null,
    latestPublishedAt: null,
    totalFormsCount: 0,
    totalDocumentsCount: 0,
    ...overrides,
  }
}

test('filterOnboardingPackagesBySearch matches title or description, case-insensitively', () => {
  const packages = [
    sampleSummary({ id: 'a', title: 'New Starter Package', description: 'For engineers' }),
    sampleSummary({ id: 'b', title: 'Contractor Pack', description: 'Short-term hires' }),
  ]

  assert.deepEqual(filterOnboardingPackagesBySearch(packages, 'starter').map((p) => p.id), ['a'])
  assert.deepEqual(filterOnboardingPackagesBySearch(packages, 'ENGINEERS').map((p) => p.id), ['a'])
  assert.deepEqual(filterOnboardingPackagesBySearch(packages, '').map((p) => p.id), ['a', 'b'])
  assert.deepEqual(filterOnboardingPackagesBySearch(packages, '   ').map((p) => p.id), ['a', 'b'])
  assert.deepEqual(filterOnboardingPackagesBySearch(packages, 'nonexistent'), [])
})

test('filterOnboardingPackagesByStatus separates draft (open draft) from published-only packages', () => {
  const packages = [
    sampleSummary({ id: 'draft-only', draftVersionNumber: 1 }),
    sampleSummary({ id: 'published-only', latestPublishedVersionNumber: 1 }),
    sampleSummary({ id: 'draft-with-published-history', draftVersionNumber: 2, latestPublishedVersionNumber: 1 }),
    sampleSummary({ id: 'untouched' }),
  ]

  assert.deepEqual(
    filterOnboardingPackagesByStatus(packages, 'draft').map((p) => p.id),
    ['draft-only', 'draft-with-published-history'],
  )
  assert.deepEqual(
    filterOnboardingPackagesByStatus(packages, 'published').map((p) => p.id),
    ['published-only'],
  )
  assert.deepEqual(filterOnboardingPackagesByStatus(packages, 'all'), packages)
})

test('formatPackageDate renders a readable "16 Sep 2026" style date', () => {
  assert.equal(formatPackageDate('2026-09-16T10:00:00.000Z'), '16 Sep 2026')
})

test('onboarding packages list page: New Package action creates a draft and navigates to its editor', async () => {
  const source = await readRepositoryFile('src/features/onboarding-packages/pages/OnboardingPackagesPage.tsx')

  assert.match(source, /createOnboardingPackage\(/)
  assert.match(source, /navigate\(`\/hr\/onboarding-packages\/\$\{result\.onboardingPackageId\}\/edit`\)/)
})

test('onboarding packages list page: card renders title, status badges, form/document counts, and links Manage Package to the right package', async () => {
  const source = await readRepositoryFile('src/features/onboarding-packages/pages/OnboardingPackagesPage.tsx')

  assert.match(source, /pkg\.title/)
  assert.match(source, /Draft V\{pkg\.draftVersionNumber\}/)
  assert.match(source, /Published V\{pkg\.latestPublishedVersionNumber\}/)
  assert.match(source, /pkg\.totalFormsCount/)
  assert.match(source, /pkg\.totalDocumentsCount/)
  assert.match(source, /navigate\(`\/hr\/onboarding-packages\/\$\{pkg\.id\}\/edit`\)/)
  assert.match(source, /Manage Package/)
})

test('onboarding packages list page: uses Draft/Published terminology, never the ambiguous "V1 Live"', async () => {
  const source = await readRepositoryFile('src/features/onboarding-packages/pages/OnboardingPackagesPage.tsx')

  assert.doesNotMatch(source, /Live/)
})

test('onboarding packages list page: no hardcoded package data, always sourced from the repository', async () => {
  const source = await readRepositoryFile('src/features/onboarding-packages/pages/OnboardingPackagesPage.tsx')

  assert.match(source, /listOnboardingPackages\(\)/)
  assert.doesNotMatch(source, /Integrity Test Package/)
})

test('onboarding packages list page renders no unstyled Tailwind utility classes (this app ships no Tailwind build)', async () => {
  const source = await readRepositoryFile('src/features/onboarding-packages/pages/OnboardingPackagesPage.tsx')

  // A handful of Tailwind utilities that would silently do nothing without a Tailwind build.
  for (const utility of ['bg-indigo-600', 'text-slate-900', 'rounded-2xl', 'rounded-xl', 'max-w-7xl', 'grid-cols-1', 'shadow-sm', 'space-x-2', 'space-y-']) {
    assert.doesNotMatch(source, new RegExp(utility))
  }
})

test('onboarding package editor page and its components render no unstyled Tailwind utility classes', async () => {
  const editorFiles = [
    'src/features/onboarding-packages/pages/OnboardingPackageEditorPage.tsx',
    'src/features/onboarding-packages/components/PackageEditor.tsx',
    'src/features/onboarding-packages/components/PackageItemsList.tsx',
    'src/features/onboarding-packages/components/PackageFormPicker.tsx',
    'src/features/onboarding-packages/components/PackageDocumentModal.tsx',
    'src/features/onboarding-packages/components/PackagePublishDialog.tsx',
    'src/features/onboarding-packages/components/PackageVersionHistory.tsx',
    'src/features/onboarding-packages/components/PackagePreviewModal.tsx',
  ]

  for (const file of editorFiles) {
    const source = await readRepositoryFile(file)
    for (const utility of ['bg-indigo-600', 'text-slate-900', 'rounded-2xl', 'rounded-xl', 'max-w-7xl', 'grid-cols-1', 'shadow-sm', 'space-x-', 'space-y-', 'backdrop-blur', 'z-50']) {
      assert.doesNotMatch(source, new RegExp(utility), `${file} should not contain unstyled Tailwind utility "${utility}"`)
    }
  }
})

test('onboarding package editor: save draft, publish, and create-new-draft actions remain wired to the repository', async () => {
  const source = await readRepositoryFile('src/features/onboarding-packages/components/PackageEditor.tsx')

  assert.match(source, /saveOnboardingPackageDraft\(/)
  assert.match(source, /publishOnboardingPackageDraft\(/)
  assert.match(source, /createOnboardingPackageDraft\(/)
})

test('filterOnboardingPackagesByStatus also isolates archived packages', () => {
  const packages = [
    sampleSummary({ id: 'active-draft', draftVersionNumber: 1 }),
    sampleSummary({ id: 'archived-one', archivedAt: '2026-09-10T00:00:00.000Z', latestPublishedVersionNumber: 1 }),
    sampleSummary({ id: 'archived-two', archivedAt: '2026-09-11T00:00:00.000Z', draftVersionNumber: 2 }),
  ]

  assert.deepEqual(
    filterOnboardingPackagesByStatus(packages, 'archived').map((p) => p.id),
    ['archived-one', 'archived-two'],
  )
  // Archived packages are excluded from draft/published filters even if they'd otherwise match.
  assert.deepEqual(
    filterOnboardingPackagesByStatus(packages, 'draft').map((p) => p.id),
    ['active-draft'],
  )
})

test('onboarding package editor: preview-form action is wired to fetch the schema and open the preview modal', async () => {
  const editorSource = await readRepositoryFile('src/features/onboarding-packages/components/PackageEditor.tsx')

  assert.match(editorSource, /handlePreviewFormItem/)
  assert.match(editorSource, /onPreviewForm=\{.*handlePreviewFormItem/)
  assert.match(editorSource, /from\('form_definition_versions'\)/)

  const previewModalSource = await readRepositoryFile('src/features/onboarding-packages/components/PackagePreviewModal.tsx')
  assert.match(previewModalSource, /initialFocus/)
})

test('onboarding package: archive action is wired to the repository and RPC, with a confirmation prompt', async () => {
  const repoSource = await readRepositoryFile('src/features/onboarding-packages/data/onboarding-packages-repository.ts')
  assert.match(repoSource, /export async function archiveOnboardingPackage/)
  assert.match(repoSource, /\.rpc\('archive_onboarding_package'/)

  const pageSource = await readRepositoryFile('src/features/onboarding-packages/pages/OnboardingPackagesPage.tsx')
  assert.match(pageSource, /window\.confirm\(/)
  assert.match(pageSource, /archiveOnboardingPackage\(/)
})

test('migration 0020 archives forms and packages via SECURITY DEFINER RPCs, not direct table writes', async () => {
  const migration = await readRepositoryFile('supabase/migrations/0020_archive_forms_and_packages.sql')

  assert.match(migration, /function public\.archive_form_definition[\s\S]*?security definer/i)
  assert.match(migration, /function public\.archive_onboarding_package[\s\S]*?security definer/i)
  assert.match(migration, /grant execute on function public\.archive_form_definition\(uuid\) to authenticated/i)
  assert.match(migration, /grant execute on function public\.archive_onboarding_package\(uuid\) to authenticated/i)
})
