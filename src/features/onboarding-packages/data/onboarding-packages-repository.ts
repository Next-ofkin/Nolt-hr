import { supabase } from '../../../lib/supabase'
import type { Json, OnboardingPackageItemRow } from '../../../lib/database.types'
import {
  OnboardingPackagePersistenceError,
  mapPackageVersion,
  summarizeOnboardingPackage,
  type CreatePackageDraftResult,
  type CreatePackageResult,
  type OnboardingPackageDetail,
  type OnboardingPackageErrorCode,
  type OnboardingPackageSummary,
  type PackageItemInput,
  type PublishPackageDraftResult,
  type SavePackageDraftResult,
} from './onboarding-packages-types'

type RpcOk = { ok: true } & Record<string, unknown>
type RpcErr = { ok: false; error_code: OnboardingPackageErrorCode; error: string; current_revision?: number }

function unwrapRpc(data: Json | null): RpcOk {
  const result = data as unknown as RpcOk | RpcErr | null
  if (!result || typeof result !== 'object') {
    throw new Error('Unexpected empty response from server.')
  }
  if (!result.ok) {
    const err = result as RpcErr
    throw new OnboardingPackagePersistenceError(err.error_code, err.error, err.current_revision)
  }
  return result
}

export interface PublishedFormVersionOption {
  formVersionId: string
  formDefinitionId: string
  title: string
  versionNumber: number
  publishedAt: string | null
}

export async function listPublishedFormVersions(): Promise<PublishedFormVersionOption[]> {
  const { data, error } = await supabase
    .from('form_definition_versions')
    .select('id, form_definition_id, version_number, published_at, form_definitions(title)')
    .eq('state', 'published')
    .order('published_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((row) => {
    const parent = row.form_definitions as unknown as { title: string } | null
    return {
      formVersionId: row.id,
      formDefinitionId: row.form_definition_id,
      title: parent?.title ?? 'Untitled Form',
      versionNumber: row.version_number,
      publishedAt: row.published_at,
    }
  })
}

export async function listOnboardingPackages(): Promise<OnboardingPackageSummary[]> {
  const [packagesRes, versionsRes, itemsRes] = await Promise.all([
    supabase.from('onboarding_packages').select('*').order('updated_at', { ascending: false }),
    supabase.from('onboarding_package_versions').select('*'),
    supabase.from('onboarding_package_items').select('*'),
  ])

  if (packagesRes.error) throw packagesRes.error
  if (versionsRes.error) throw versionsRes.error
  if (itemsRes.error) throw itemsRes.error

  const packages = packagesRes.data ?? []
  const versions = versionsRes.data ?? []
  const items = itemsRes.data ?? []

  return packages.map((pkg) => summarizeOnboardingPackage(pkg, versions, items))
}

export async function getOnboardingPackage(packageId: string): Promise<OnboardingPackageDetail | null> {
  const [pkgRes, versionsRes] = await Promise.all([
    supabase.from('onboarding_packages').select('*').eq('id', packageId).maybeSingle(),
    supabase.from('onboarding_package_versions').select('*').eq('onboarding_package_id', packageId),
  ])

  if (pkgRes.error) throw pkgRes.error
  if (!pkgRes.data) return null
  if (versionsRes.error) throw versionsRes.error

  const versionIds = (versionsRes.data ?? []).map((v) => v.id)
  let itemRows: OnboardingPackageItemRow[] = []
  if (versionIds.length > 0) {
    const itemsRes = await supabase
      .from('onboarding_package_items')
      .select('*')
      .in('package_version_id', versionIds)
    if (itemsRes.error) throw itemsRes.error
    itemRows = itemsRes.data ?? []
  }


  // Fetch titles for form versions referenced in items
  const formVersionIds = itemRows
    .filter((i) => i.form_version_id)
    .map((i) => i.form_version_id as string)

  const formVersionMap: Record<string, { title: string; versionNumber: number }> = {}
  if (formVersionIds.length > 0) {
    const formVersRes = await supabase
      .from('form_definition_versions')
      .select('id, version_number, form_definitions(title)')
      .in('id', formVersionIds)

    if (!formVersRes.error && formVersRes.data) {
      for (const fv of formVersRes.data) {
        const parent = fv.form_definitions as unknown as { title: string } | null
        formVersionMap[fv.id] = {
          title: parent?.title ?? 'Form',
          versionNumber: fv.version_number,
        }
      }
    }
  }

  const versions = (versionsRes.data ?? [])
    .map((v) => mapPackageVersion(v, itemRows, formVersionMap))
    .sort((a, b) => b.versionNumber - a.versionNumber)

  return {
    id: pkgRes.data.id,
    title: pkgRes.data.title,
    description: pkgRes.data.description,
    archivedAt: pkgRes.data.archived_at,
    versions,
  }
}

export async function createOnboardingPackage(input: {
  title: string
  description?: string | null
}): Promise<CreatePackageResult> {
  const { data, error } = await supabase.rpc('create_onboarding_package', {
    p_title: input.title,
    p_description: input.description ?? '',
  })
  if (error) throw error

  const result = unwrapRpc(data)
  return {
    onboardingPackageId: result.onboarding_package_id as string,
    versionId: result.version_id as string,
    versionNumber: result.version_number as number,
    revision: result.revision as number,
  }
}

export async function saveOnboardingPackageDraft(input: {
  onboardingPackageId: string
  title: string
  description?: string | null
  items: PackageItemInput[]
  expectedRevision: number
}): Promise<SavePackageDraftResult> {
  const payloadItems = input.items.map((item, idx) => {
    if (item.itemType === 'form') {
      return {
        item_type: 'form',
        sort_order: idx,
        required: item.required,
        form_version_id: item.formVersionId,
      }
    }
    return {
      item_type: 'document',
      sort_order: idx,
      required: item.required,
      document_title: item.documentTitle,
      document_description: item.documentDescription ?? '',
    }
  })

  const { data, error } = await supabase.rpc('save_onboarding_package_draft', {
    p_onboarding_package_id: input.onboardingPackageId,
    p_title: input.title,
    p_description: input.description ?? '',
    p_items: payloadItems as unknown as Json,
    p_expected_revision: input.expectedRevision,
  })
  if (error) throw error

  const result = unwrapRpc(data)
  return {
    versionId: result.version_id as string,
    versionNumber: result.version_number as number,
    revision: result.revision as number,
  }
}

export async function publishOnboardingPackageDraft(
  onboardingPackageId: string,
): Promise<PublishPackageDraftResult> {
  const { data, error } = await supabase.rpc('publish_onboarding_package_draft', {
    p_onboarding_package_id: onboardingPackageId,
  })
  if (error) throw error

  const result = unwrapRpc(data)
  return {
    versionId: result.version_id as string,
    versionNumber: result.version_number as number,
  }
}

export async function createOnboardingPackageDraft(
  onboardingPackageId: string,
): Promise<CreatePackageDraftResult> {
  const { data, error } = await supabase.rpc('create_onboarding_package_draft', {
    p_onboarding_package_id: onboardingPackageId,
  })
  if (error) throw error

  const result = unwrapRpc(data)
  return {
    versionId: result.version_id as string,
    versionNumber: result.version_number as number,
    revision: result.revision as number,
    createdNew: result.created_new as boolean,
  }
}

export async function archiveOnboardingPackage(onboardingPackageId: string): Promise<void> {
  const { data, error } = await supabase.rpc('archive_onboarding_package', {
    p_onboarding_package_id: onboardingPackageId,
  })
  if (error) throw error
  unwrapRpc(data)
}
