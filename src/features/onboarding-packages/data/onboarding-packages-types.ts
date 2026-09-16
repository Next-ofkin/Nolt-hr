import type {
  OnboardingPackageRow,
  OnboardingPackageVersionRow,
  OnboardingPackageItemRow,
} from '../../../lib/database.types'

export type OnboardingPackageErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_TITLE'
  | 'PACKAGE_NOT_FOUND'
  | 'PACKAGE_ARCHIVED'
  | 'NO_DRAFT'
  | 'INVALID_ITEMS'
  | 'INVALID_ITEM_TYPE'
  | 'MISSING_FORM_VERSION'
  | 'FORM_VERSION_NOT_FOUND'
  | 'INVALID_FORM_VERSION'
  | 'INVALID_DOCUMENT_TITLE'
  | 'DUPLICATE_FORM_ITEM'
  | 'PACKAGE_DRAFT_CONFLICT'
  | 'NO_ITEMS'
  | 'UNPUBLISHED_FORM_ITEM'
  | 'NO_PUBLISHED_VERSION'
  | (string & {})

export class OnboardingPackagePersistenceError extends Error {
  readonly code: OnboardingPackageErrorCode
  readonly currentRevision?: number

  constructor(code: OnboardingPackageErrorCode, message: string, currentRevision?: number) {
    super(message)
    this.name = 'OnboardingPackagePersistenceError'
    this.code = code
    this.currentRevision = currentRevision
  }
}

export function onboardingPackagePersistenceMessage(
  error: unknown,
  fallbackMessage = 'An unexpected error occurred while saving the onboarding package.',
): string {
  if (error instanceof OnboardingPackagePersistenceError) {
    if (error.code === 'PACKAGE_DRAFT_CONFLICT') {
      return 'This package draft was changed elsewhere. Refresh before saving again.'
    }
    if (error.code === 'INVALID_FORM_VERSION') {
      return 'Only published form versions can be added to an onboarding package.'
    }
    if (error.code === 'DUPLICATE_FORM_ITEM') {
      return 'A package cannot contain the same form version multiple times.'
    }
    if (error.code === 'NO_ITEMS') {
      return 'Onboarding package must contain at least one form or document requirement before publishing.'
    }
    if (error.message) return error.message
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallbackMessage
}

export interface BasePackageItemInput {
  id?: string
  itemType: 'form' | 'document'
  sortOrder: number
  required: boolean
}

export interface PackageFormItemInput extends BasePackageItemInput {
  itemType: 'form'
  formVersionId: string
  formTitle?: string
  formVersionNumber?: number
}

export interface PackageDocumentItemInput extends BasePackageItemInput {
  itemType: 'document'
  documentTitle: string
  documentDescription?: string | null
}

export type PackageItemInput = PackageFormItemInput | PackageDocumentItemInput

export interface PackageFormItem {
  id: string
  packageVersionId: string
  itemType: 'form'
  sortOrder: number
  required: boolean
  formVersionId: string
  formTitle: string
  formVersionNumber: number
}

export interface PackageDocumentItem {
  id: string
  packageVersionId: string
  itemType: 'document'
  sortOrder: number
  required: boolean
  documentTitle: string
  documentDescription: string | null
}

export type PackageItem = PackageFormItem | PackageDocumentItem

export interface PackageVersion {
  id: string
  onboardingPackageId: string
  versionNumber: number
  state: 'draft' | 'published'
  revision: number
  createdBy: string
  updatedBy: string
  publishedBy: string | null
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  items: PackageItem[]
}

export interface OnboardingPackageSummary {
  id: string
  title: string
  description: string | null
  createdAt: string
  updatedAt: string
  archivedAt: string | null
  draftVersionNumber: number | null
  draftRevision: number | null
  latestPublishedVersionNumber: number | null
  latestPublishedAt: string | null
  totalFormsCount: number
  totalDocumentsCount: number
}

export interface OnboardingPackageDetail {
  id: string
  title: string
  description: string | null
  archivedAt: string | null
  versions: PackageVersion[]
}

export interface CreatePackageResult {
  onboardingPackageId: string
  versionId: string
  versionNumber: number
  revision: number
}

export interface SavePackageDraftResult {
  versionId: string
  versionNumber: number
  revision: number
}

export interface PublishPackageDraftResult {
  versionId: string
  versionNumber: number
}

export interface CreatePackageDraftResult {
  versionId: string
  versionNumber: number
  revision: number
  createdNew: boolean
}

export function mapPackageItem(
  row: OnboardingPackageItemRow,
  formVersionMeta?: { title: string; versionNumber: number },
): PackageItem {
  if (row.item_type === 'form') {
    return {
      id: row.id,
      packageVersionId: row.package_version_id,
      itemType: 'form',
      sortOrder: row.sort_order,
      required: row.required,
      formVersionId: row.form_version_id as string,
      formTitle: formVersionMeta?.title ?? 'Form',
      formVersionNumber: formVersionMeta?.versionNumber ?? 1,
    }
  }
  return {
    id: row.id,
    packageVersionId: row.package_version_id,
    itemType: 'document',
    sortOrder: row.sort_order,
    required: row.required,
    documentTitle: row.document_title ?? 'Document Requirement',
    documentDescription: row.document_description,
  }
}

export function mapPackageVersion(
  row: OnboardingPackageVersionRow,
  itemRows: OnboardingPackageItemRow[],
  formVersionMap?: Record<string, { title: string; versionNumber: number }>,
): PackageVersion {
  const versionItems = itemRows
    .filter((item) => item.package_version_id === row.id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => mapPackageItem(item, item.form_version_id ? formVersionMap?.[item.form_version_id] : undefined))

  return {
    id: row.id,
    onboardingPackageId: row.onboarding_package_id,
    versionNumber: row.version_number,
    state: row.state as 'draft' | 'published',
    revision: row.revision,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    publishedBy: row.published_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    items: versionItems,
  }
}

export function summarizeOnboardingPackage(
  packageRow: OnboardingPackageRow,
  versionRows: OnboardingPackageVersionRow[],
  itemRows: OnboardingPackageItemRow[],
): OnboardingPackageSummary {
  const packageVersions = versionRows.filter((v) => v.onboarding_package_id === packageRow.id)

  const draft = packageVersions.find((v) => v.state === 'draft')

  const publishedVersions = packageVersions
    .filter((v) => v.state === 'published')
    .sort((a, b) => b.version_number - a.version_number)
  const latestPublished = publishedVersions[0]

  const activeVersion = draft ?? latestPublished
  const activeItems = activeVersion ? itemRows.filter((i) => i.package_version_id === activeVersion.id) : []

  const totalFormsCount = activeItems.filter((i) => i.item_type === 'form').length
  const totalDocumentsCount = activeItems.filter((i) => i.item_type === 'document').length

  return {
    id: packageRow.id,
    title: packageRow.title,
    description: packageRow.description,
    createdAt: packageRow.created_at,
    updatedAt: packageRow.updated_at,
    archivedAt: packageRow.archived_at,
    draftVersionNumber: draft?.version_number ?? null,
    draftRevision: draft?.revision ?? null,
    latestPublishedVersionNumber: latestPublished?.version_number ?? null,
    latestPublishedAt: latestPublished?.published_at ?? null,
    totalFormsCount,
    totalDocumentsCount,
  }
}
