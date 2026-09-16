import type { FormSchema } from '../../shadcn-form-poc/domain/form-schema'
import type { FormDefinitionVersionRow } from '../../../lib/database.types'

export type FormVersionState = 'draft' | 'published'

export interface FormVersion {
  id: string
  formDefinitionId: string
  versionNumber: number
  state: FormVersionState
  definition: FormSchema
  revision: number
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  publishedBy: string | null
}

/** One row of the forms library list: a form plus its draft/published state at a glance. */
export interface FormDefinitionSummary {
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
}

export interface FormDefinitionDetail {
  id: string
  title: string
  description: string | null
  archivedAt: string | null
  versions: FormVersion[]
}

/** Error codes returned by the form persistence RPCs (see 0015 migration). */
export type FormPersistenceErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_TITLE'
  | 'INVALID_DEFINITION'
  | 'FORM_NOT_FOUND'
  | 'FORM_ARCHIVED'
  | 'NO_DRAFT'
  | 'NO_STEPS'
  | 'NO_PUBLISHED_VERSION'
  | 'FORM_DRAFT_CONFLICT'

export class FormPersistenceError extends Error {
  code: FormPersistenceErrorCode
  currentRevision?: number

  constructor(code: FormPersistenceErrorCode, message: string, currentRevision?: number) {
    super(message)
    this.name = 'FormPersistenceError'
    this.code = code
    this.currentRevision = currentRevision
  }
}

export interface CreateFormDefinitionResult {
  formDefinitionId: string
  versionId: string
  versionNumber: number
  revision: number
}

export interface SaveFormDraftResult {
  versionId: string
  versionNumber: number
  revision: number
}

export interface PublishFormDraftResult {
  versionId: string
  versionNumber: number
}

export interface CreateDraftFromPublishedResult {
  versionId: string
  versionNumber: number
  revision: number
  createdNew: boolean
}

interface FormDefinitionSummaryRow {
  id: string
  title: string
  description: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
}

/** Pure database-row mapping kept outside the Supabase client for focused tests. */
export function mapFormVersion(row: FormDefinitionVersionRow): FormVersion {
  return {
    id: row.id,
    formDefinitionId: row.form_definition_id,
    versionNumber: row.version_number,
    state: row.state as FormVersionState,
    definition: row.definition as unknown as FormSchema,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
  }
}

export function summarizeFormDefinition(
  form: FormDefinitionSummaryRow,
  versions: FormDefinitionVersionRow[],
): FormDefinitionSummary {
  const draft = versions.find((version) => version.state === 'draft')
  const latestPublished = versions
    .filter((version) => version.state === 'published')
    .sort((left, right) => right.version_number - left.version_number)[0]

  return {
    id: form.id,
    title: form.title,
    description: form.description,
    createdAt: form.created_at,
    updatedAt: form.updated_at,
    archivedAt: form.archived_at,
    draftVersionNumber: draft?.version_number ?? null,
    draftRevision: draft?.revision ?? null,
    latestPublishedVersionNumber: latestPublished?.version_number ?? null,
    latestPublishedAt: latestPublished?.published_at ?? null,
  }
}

export function formPersistenceMessage(error: unknown, fallback: string) {
  if (error instanceof FormPersistenceError) {
    if (error.code === 'FORM_DRAFT_CONFLICT') {
      return 'This draft was changed elsewhere. Refresh before saving again.'
    }
    return error.message
  }

  if (error instanceof Error && error.message) return error.message
  return fallback
}
