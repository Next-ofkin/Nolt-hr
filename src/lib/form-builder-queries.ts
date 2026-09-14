import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type {
  FormField,
  FormFieldInsert,
  FormFieldUpdate,
  FormTemplate,
  FormVersion,
} from './database.types'

export function useFormTemplates() {
  return useQuery({
    queryKey: ['form_templates', 'list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_templates')
        .select('*')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as FormTemplate[]
    },
  })
}

export interface FormTemplateDetail extends FormTemplate {
  versions: FormVersion[]
}

export function useFormTemplate(templateId: string | undefined) {
  return useQuery({
    queryKey: ['form_templates', 'detail', templateId],
    queryFn: async () => {
      if (!templateId) return null
      const { data: template, error: tErr } = await supabase
        .from('form_templates')
        .select('*')
        .eq('id', templateId)
        .single()
      if (tErr) throw tErr

      const { data: versions, error: vErr } = await supabase
        .from('form_versions')
        .select('*')
        .eq('form_template_id', templateId)
        .order('version_number', { ascending: false })
      if (vErr) throw vErr

      return {
        ...template,
        versions: (versions ?? []) as FormVersion[],
      } as FormTemplateDetail
    },
    enabled: Boolean(templateId),
  })
}

export function useFormVersion(versionId: string | undefined) {
  return useQuery({
    queryKey: ['form_versions', 'detail', versionId],
    queryFn: async () => {
      if (!versionId) return null
      const { data, error } = await supabase
        .from('form_versions')
        .select('*')
        .eq('id', versionId)
        .single()
      if (error) throw error
      return data as FormVersion
    },
    enabled: Boolean(versionId),
  })
}

export function useFormFields(versionId: string | undefined) {
  return useQuery({
    queryKey: ['form_fields', 'list', versionId],
    queryFn: async () => {
      if (!versionId) return []
      const { data, error } = await supabase
        .from('form_fields')
        .select('*')
        .eq('form_version_id', versionId)
        .order('position', { ascending: true })
      if (error) throw error
      return (data ?? []) as FormField[]
    },
    enabled: Boolean(versionId),
  })
}

export interface CreateFormPayload {
  name: string
  category?: string
  description?: string
}

export function useCreateFormTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateFormPayload) => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id ?? null

      // 1. Insert Template
      const { data: template, error: tErr } = await supabase
        .from('form_templates')
        .insert({
          name: payload.name.trim(),
          category: payload.category?.trim() || null,
          description: payload.description?.trim() || null,
          created_by: userId,
        })
        .select('id')
        .single()
      if (tErr) throw new Error(tErr.message || 'Unable to create form template.')

      // 2. Insert Version 1 DRAFT
      const { data: version, error: vErr } = await supabase
        .from('form_versions')
        .insert({
          form_template_id: template.id,
          version_number: 1,
          status: 'DRAFT',
          title: payload.name.trim(),
          description: payload.description?.trim() || null,
        })
        .select('id')
        .single()
      if (vErr) throw new Error(vErr.message || 'Unable to create initial form version.')

      return { templateId: template.id, versionId: version.id }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['form_templates'] })
    },
  })
}

export function useUpdateFormVersion(versionId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (updates: { title?: string; description?: string; instructions?: string }) => {
      if (!versionId) throw new Error('Form version missing')
      const { data, error } = await supabase
        .from('form_versions')
        .update(updates)
        .eq('id', versionId)
        .select('id')
        .single()
      if (error) throw new Error(error.message || 'Failed to update form version details')
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['form_versions', 'detail', versionId] })
      void queryClient.invalidateQueries({ queryKey: ['form_templates'] })
    },
  })
}

export function useCreateFormField() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (field: FormFieldInsert) => {
      const { data, error } = await supabase
        .from('form_fields')
        .insert(field)
        .select('*')
        .single()
      if (error) throw new Error(error.message || 'Failed to add field to form.')
      return data as FormField
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['form_fields', 'list', data.form_version_id] })
    },
  })
}

export function useUpdateFormField(versionId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ fieldId, updates }: { fieldId: string; updates: FormFieldUpdate }) => {
      const { data, error } = await supabase
        .from('form_fields')
        .update(updates)
        .eq('id', fieldId)
        .select('*')
        .single()
      if (error) throw new Error(error.message || 'Failed to update field.')
      return data as FormField
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['form_fields', 'list', versionId] })
    },
  })
}

export function useDeleteFormField(versionId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (fieldId: string) => {
      const { error } = await supabase.from('form_fields').delete().eq('id', fieldId)
      if (error) throw new Error(error.message || 'Failed to delete field.')
      return fieldId
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['form_fields', 'list', versionId] })
    },
  })
}

export function useReorderFormFields(versionId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (orderedFieldIds: string[]) => {
      if (!versionId) return
      // Update position for each field
      const updates = orderedFieldIds.map((id, index) =>
        supabase.from('form_fields').update({ position: index }).eq('id', id),
      )
      const results = await Promise.all(updates)
      const err = results.find((r) => r.error)
      if (err?.error) throw new Error(err.error.message || 'Failed to reorder fields')
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['form_fields', 'list', versionId] })
    },
  })
}

export function usePublishFormVersion(versionId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!versionId) throw new Error('Form version missing')
      const { data, error } = await supabase.rpc('publish_form_version', {
        p_form_version_id: versionId,
      })
      if (error) throw new Error(error.message || 'Failed to publish form version')
      const result = data as { ok: boolean; error?: string }
      if (!result.ok) throw new Error(result.error || 'Failed to publish form version')
      return result
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['form_versions', 'detail', versionId] })
      void queryClient.invalidateQueries({ queryKey: ['form_templates'] })
    },
  })
}

export function useCreateFormDraftFromVersion(templateId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (sourceVersionId: string) => {
      const { data, error } = await supabase.rpc('create_form_draft_from_version', {
        p_form_version_id: sourceVersionId,
      })
      if (error) throw new Error(error.message || 'Failed to create new draft version')
      const result = data as { ok: boolean; new_version_id?: string; error?: string }
      if (!result.ok || !result.new_version_id) {
        throw new Error(result.error || 'Failed to create new draft version')
      }
      return result.new_version_id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['form_templates', 'detail', templateId] })
      void queryClient.invalidateQueries({ queryKey: ['form_templates'] })
    },
  })
}

export function useArchiveFormTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase
        .from('form_templates')
        .update({ is_active: false })
        .eq('id', templateId)
      if (error) throw new Error(error.message || 'Failed to archive form template')
      return templateId
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['form_templates'] })
    },
  })
}
