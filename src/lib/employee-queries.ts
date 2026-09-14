import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import {
  employeeMutationError,
  sanitizeEmployeeSearch,
  type EmployeeFilters,
  type EmployeeWithRelations,
} from './employee-domain'
import type { EmployeeInsert, EmployeeUpdate } from './database.types'

export const EMPLOYEE_PAGE_SIZE = 20

const employeeSelection = `
  *,
  department:departments!employees_department_id_fkey(id, name),
  employment_type:employment_types!employees_employment_type_id_fkey(id, name)
`

export function useDepartments() {
  return useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .order('name')
      if (error) throw error
      return data
    },
  })
}

export function useEmploymentTypes() {
  return useQuery({
    queryKey: ['employment-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employment_types')
        .select('*')
        .order('name')
      if (error) throw error
      return data
    },
  })
}

export function useEmployeeDirectory(filters: EmployeeFilters) {
  return useQuery({
    queryKey: ['employees', 'directory', filters],
    queryFn: async () => {
      const from = (filters.page - 1) * EMPLOYEE_PAGE_SIZE
      let query = supabase
        .from('employees')
        .select(employeeSelection, { count: 'exact' })
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
      if (filters.departmentId) query = query.eq('department_id', filters.departmentId)
      if (filters.employmentTypeId) {
        query = query.eq('employment_type_id', filters.employmentTypeId)
      }
      if (filters.status) query = query.eq('status', filters.status)

      const { data, error, count } = await query
      if (error) throw error
      return { employees: (data ?? []) as EmployeeWithRelations[], count: count ?? 0 }
    },
  })
}

export function useEmployee(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['employees', 'detail', employeeId],
    queryFn: async () => {
      if (!employeeId) return null
      const { data, error } = await supabase
        .from('employees')
        .select(employeeSelection)
        .eq('id', employeeId)
        .maybeSingle()
      if (error) throw error
      return data as EmployeeWithRelations | null
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
