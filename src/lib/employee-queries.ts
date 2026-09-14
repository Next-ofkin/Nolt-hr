import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { employeeMutationError, sanitizeEmployeeSearch, type EmployeeFilters } from './employee-domain'
import type { Employee, EmployeeInsert, EmployeeStatus, EmployeeUpdate } from './database.types'

export const EMPLOYEE_PAGE_SIZE = 20

export function useEmployeeDirectory(filters: EmployeeFilters) {
  return useQuery({
    queryKey: ['employees', 'directory', filters],
    queryFn: async () => {
      const from = (filters.page - 1) * EMPLOYEE_PAGE_SIZE
      let query = supabase
        .from('employees')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, from + EMPLOYEE_PAGE_SIZE - 1)

      const search = sanitizeEmployeeSearch(filters.search)
      if (search) {
        const pattern = `%${search}%`
        query = query.or([
          `first_name.ilike.${pattern}`,
          `middle_name.ilike.${pattern}`,
          `last_name.ilike.${pattern}`,
          `work_email.ilike.${pattern}`,
          `staff_id.ilike.${pattern}`,
        ].join(','))
      }
      if (filters.status) query = query.eq('status', filters.status)

      const { data, error, count } = await query
      if (error) throw error
      return { employees: (data ?? []) as Employee[], count: count ?? 0 }
    },
  })
}

export function useEmployeeStatusCounts(enabled: boolean) {
  return useQuery({
    queryKey: ['employees', 'status-counts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('employees').select('status')
      if (error) throw error
      const counts = {} as Record<EmployeeStatus, number>
      for (const row of data ?? []) {
        counts[row.status] = (counts[row.status] ?? 0) + 1
      }
      const total = data?.length ?? 0
      return { counts, total }
    },
    enabled,
  })
}

export function useRecentEmployees(limit: number, enabled: boolean) {
  return useQuery({
    queryKey: ['employees', 'recent', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as Employee[]
    },
    enabled,
  })
}

export function useEmployee(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['employees', 'detail', employeeId],
    queryFn: async () => {
      if (!employeeId) return null
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('id', employeeId)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: Boolean(employeeId),
  })
}

export function useCreateEmployee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (employee: EmployeeInsert) => {
      const { data, error } = await supabase
        .from('employees')
        .insert(employee)
        .select('id')
        .single()
      if (error) throw new Error(employeeMutationError(error, 'Unable to create employee.'))
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['employees'] })
    },
  })
}

export function useUpdateEmployee(employeeId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (employee: EmployeeUpdate) => {
      if (!employeeId) throw new Error('Employee record not found.')
      const { data, error } = await supabase
        .from('employees')
        .update(employee)
        .eq('id', employeeId)
        .select('id')
        .single()
      if (error) throw new Error(employeeMutationError(error, 'Unable to update employee.'))
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['employees'] })
    },
  })
}
