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
