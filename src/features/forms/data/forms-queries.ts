import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  archiveFormDefinition,
  createDraftFromPublished,
  createFormDefinition,
  getFormDefinition,
  listFormDefinitions,
  publishFormDraft,
  saveFormDraft,
} from './forms-repository'

export const formQueryKeys = {
  all: ['forms'] as const,
  library: ['forms', 'library'] as const,
  detail: (formDefinitionId: string | undefined) => ['forms', 'detail', formDefinitionId] as const,
}

export function useFormDefinitions() {
  return useQuery({
    queryKey: formQueryKeys.library,
    queryFn: listFormDefinitions,
  })
}

export function useFormDefinition(formDefinitionId: string | undefined) {
  return useQuery({
    queryKey: formQueryKeys.detail(formDefinitionId),
    queryFn: () => (formDefinitionId ? getFormDefinition(formDefinitionId) : null),
    enabled: Boolean(formDefinitionId),
  })
}

export function useCreateFormDefinition() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createFormDefinition,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: formQueryKeys.all })
    },
  })
}

export function useSaveFormDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: saveFormDraft,
    onSuccess: (_, input) => {
      void queryClient.invalidateQueries({ queryKey: formQueryKeys.library })
      void queryClient.invalidateQueries({ queryKey: formQueryKeys.detail(input.formDefinitionId) })
    },
  })
}

export function usePublishFormDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: publishFormDraft,
    onSuccess: (_, formDefinitionId) => {
      void queryClient.invalidateQueries({ queryKey: formQueryKeys.library })
      void queryClient.invalidateQueries({ queryKey: formQueryKeys.detail(formDefinitionId) })
    },
  })
}

export function useCreateDraftFromPublished() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createDraftFromPublished,
    onSuccess: (_, formDefinitionId) => {
      void queryClient.invalidateQueries({ queryKey: formQueryKeys.library })
      void queryClient.invalidateQueries({ queryKey: formQueryKeys.detail(formDefinitionId) })
    },
  })
}

export function useArchiveFormDefinition() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: archiveFormDefinition,
    onSuccess: (_, formDefinitionId) => {
      void queryClient.invalidateQueries({ queryKey: formQueryKeys.library })
      void queryClient.invalidateQueries({ queryKey: formQueryKeys.detail(formDefinitionId) })
    },
  })
}
