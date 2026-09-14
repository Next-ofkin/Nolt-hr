import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useAuth } from './useAuth'
import type { Profile, UserRole } from './database.types'

export function useProfile(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      if (!userId) return null
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: Boolean(userId),
  })
}

export function useCurrentProfile() {
  const { user } = useAuth()
  return useProfile(user?.id)
}

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useUpdateProfile(userId: string | null | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (updates: Pick<Profile, 'full_name'>) => {
      if (!userId) throw new Error('Not signed in')
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
      if (error) throw error
      return updates
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile', userId] })
    },
  })
}

export interface InviteUserInput {
  email: string
  full_name: string
  role: UserRole
}

export function useInviteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: InviteUserInput) => {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: input,
      })
      if (error) {
        const response = (error as { context?: { response?: Response } }).context
          ?.response
        if (response) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string
          } | null
          throw new Error(payload?.error ?? error.message)
        }
        throw error
      }
      return data as { ok: boolean }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: UserRole }) => {
      const { error } = await supabase.rpc('update_user_role', {
        p_user_id: userId,
        p_role: role,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}