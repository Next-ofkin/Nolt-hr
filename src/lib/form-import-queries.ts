import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { FormImportJob, Json } from './database.types'

export function useFormImportJob(jobId: string | undefined) {
  return useQuery({
    queryKey: ['form_import_jobs', 'detail', jobId],
    queryFn: async () => {
      if (!jobId) return null
      const { data, error } = await supabase
        .from('form_import_jobs')
        .select('*')
        .eq('id', jobId)
        .single()
      if (error) throw error
      return data as FormImportJob
    },
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const data = query.state.data
      if (data && ['UPLOADED', 'ANALYZING'].includes(data.status)) {
        return 2000 // poll while analyzing
      }
      return false
    },
  })
}

export function useUploadAndAnalyzePdf() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      if (file.type !== 'application/pdf') {
        throw new Error('Only PDF documents can be imported.')
      }

      if (file.size > 15 * 1024 * 1024) {
        throw new Error('PDF file size must not exceed 15 MB.')
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('User authentication required.')

      const path = `${user.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`

      // Upload file to private bucket form-imports
      const { error: uploadErr } = await supabase.storage
        .from('form-imports')
        .upload(path, file, {
          contentType: 'application/pdf',
          upsert: false,
        })
      if (uploadErr) throw uploadErr

      // Insert form_import_jobs record
      const { data: job, error: jobErr } = await supabase
        .from('form_import_jobs')
        .insert({
          created_by: user.id,
          original_filename: file.name,
          source_object_path: path,
          status: 'UPLOADED',
        })
        .select()
        .single()

      if (jobErr || !job) throw jobErr || new Error('Failed to create import job record.')

      // Trigger analysis Edge Function asynchronously
      try {
        const { error: funcErr } = await supabase.functions.invoke('analyze-form-pdf', {
          body: { import_job_id: job.id },
        })
        if (funcErr) {
          console.warn('Edge function error:', funcErr)
        }
      } catch (err) {
        console.warn('Edge function invoke error:', err)
      }

      queryClient.invalidateQueries({ queryKey: ['form_import_jobs'] })
      return job as FormImportJob
    },
  })
}

export function useAcceptFormImportJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      jobId: string
      name: string
      category: string
      description: string
      instructions: string
      presentation: Record<string, unknown>
      fields: Array<Record<string, unknown>>
    }) => {
      const { data, error } = await supabase.rpc('accept_form_import_job', {
        p_job_id: payload.jobId,
        p_name: payload.name,
        p_category: payload.category,
        p_description: payload.description,
        p_instructions: payload.instructions,
        p_presentation: payload.presentation as unknown as Json,
        p_fields: payload.fields as unknown as Json,
      })

      if (error) throw error
      const res = data as { ok: boolean; error?: string; template_id?: string; version_id?: string }
      if (!res.ok) throw new Error(res.error || 'Failed to accept import proposal.')

      // Best effort cleanup of source PDF
      const { data: job } = await supabase.from('form_import_jobs').select('source_object_path').eq('id', payload.jobId).single()
      if (job?.source_object_path) {
        await supabase.storage.from('form-imports').remove([job.source_object_path]).catch(() => {})
      }

      queryClient.invalidateQueries({ queryKey: ['form_templates'] })
      return { templateId: res.template_id!, versionId: res.version_id! }
    },
  })
}

export function useCancelFormImportJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (jobId: string) => {
      const { data: job } = await supabase.from('form_import_jobs').select('source_object_path').eq('id', jobId).single()

      await supabase
        .from('form_import_jobs')
        .update({ status: 'CANCELLED', cancelled_at: new Date().toISOString() })
        .eq('id', jobId)

      if (job?.source_object_path) {
        await supabase.storage.from('form-imports').remove([job.source_object_path]).catch(() => {})
      }

      queryClient.invalidateQueries({ queryKey: ['form_import_jobs'] })
    },
  })
}
