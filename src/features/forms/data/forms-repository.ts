import { supabase } from '../../../lib/supabase'
import type { Json, FormDefinitionVersionRow } from '../../../lib/database.types'
import type { FormSchema } from '../../shadcn-form-poc/domain/form-schema'
import {
  FormPersistenceError,
  mapFormVersion,
  summarizeFormDefinition,
  type FormDefinitionDetail,
  type FormDefinitionSummary,
  type FormPersistenceErrorCode,
  type FormVersion,
  type CreateFormDefinitionResult,
  type SaveFormDraftResult,
  type PublishFormDraftResult,
  type CreateDraftFromPublishedResult,
} from './forms-types'

type RpcOk = { ok: true } & Record<string, unknown>
type RpcErr = { ok: false; error_code: FormPersistenceErrorCode; error: string; current_revision?: number }

function unwrapRpc(data: Json | null): RpcOk {
  const result = data as unknown as RpcOk | RpcErr | null
  if (!result || typeof result !== 'object') {
    throw new Error('Unexpected empty response from server.')
  }
  if (!result.ok) {
    const err = result as RpcErr
    throw new FormPersistenceError(err.error_code, err.error, err.current_revision)
  }
  return result
}

export async function listFormDefinitions(): Promise<FormDefinitionSummary[]> {
  const { data, error } = await supabase
    .from('form_definitions')
    .select('*, form_definition_versions(*)')
    .order('updated_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((row) =>
    summarizeFormDefinition(row, (row.form_definition_versions ?? []) as FormDefinitionVersionRow[]),
  )
}

export async function getFormDefinition(formDefinitionId: string): Promise<FormDefinitionDetail | null> {
  const { data, error } = await supabase
    .from('form_definitions')
    .select('*, form_definition_versions(*)')
    .eq('id', formDefinitionId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const versions = ((data.form_definition_versions ?? []) as FormDefinitionVersionRow[])
    .map(mapFormVersion)
    .sort((a, b) => b.versionNumber - a.versionNumber)

  return {
    id: data.id,
    title: data.title,
    description: data.description,
    archivedAt: data.archived_at,
    versions,
  }
}

export async function getFormVersions(formDefinitionId: string): Promise<FormVersion[]> {
  const { data, error } = await supabase
    .from('form_definition_versions')
    .select('*')
    .eq('form_definition_id', formDefinitionId)
    .order('version_number', { ascending: false })

  if (error) throw error
  return (data ?? []).map(mapFormVersion)
}

export async function createFormDefinition(input: {
  title: string
  description?: string | null
  definition: FormSchema
}): Promise<CreateFormDefinitionResult> {
  const { data, error } = await supabase.rpc('create_form_definition', {
    p_title: input.title,
    p_description: input.description ?? '',
    p_definition: input.definition as unknown as Json,
  })
  if (error) throw error

  const result = unwrapRpc(data)
  return {
    formDefinitionId: result.form_definition_id as string,
    versionId: result.version_id as string,
    versionNumber: result.version_number as number,
    revision: result.revision as number,
  }
}

export async function saveFormDraft(input: {
  formDefinitionId: string
  definition: FormSchema
  title: string
  description?: string | null
  expectedRevision: number
}): Promise<SaveFormDraftResult> {
  const { data, error } = await supabase.rpc('save_form_definition_draft', {
    p_form_definition_id: input.formDefinitionId,
    p_definition: input.definition as unknown as Json,
    p_title: input.title,
    p_description: input.description ?? '',
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

export async function publishFormDraft(formDefinitionId: string): Promise<PublishFormDraftResult> {
  const { data, error } = await supabase.rpc('publish_form_definition_draft', {
    p_form_definition_id: formDefinitionId,
  })
  if (error) throw error

  const result = unwrapRpc(data)
  return {
    versionId: result.version_id as string,
    versionNumber: result.version_number as number,
  }
}

export async function createDraftFromPublished(formDefinitionId: string): Promise<CreateDraftFromPublishedResult> {
  const { data, error } = await supabase.rpc('create_form_definition_draft', {
    p_form_definition_id: formDefinitionId,
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

export async function archiveFormDefinition(formDefinitionId: string): Promise<void> {
  const { data, error } = await supabase.rpc('archive_form_definition', {
    p_form_definition_id: formDefinitionId,
  })
  if (error) throw error
  unwrapRpc(data)
}
