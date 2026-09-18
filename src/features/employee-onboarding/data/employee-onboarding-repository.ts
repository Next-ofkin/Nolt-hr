import { supabase } from '../../../lib/supabase'
import type { Json } from '../../../lib/database.types'
import type { FormSchema } from '../../shadcn-form-poc/domain/form-schema'
import {
  EmployeeOnboardingPersistenceError,
  mapEmployeeOnboardingAssignment,
  type AssignOnboardingPackageResult,
  type CancelOnboardingAssignmentResult,
  type EmployeeOnboardingAssignment,
  type EmployeeOnboardingErrorCode,
  type SaveOnboardingFormDraftResult,
  type StartMyOnboardingResult,
  type SubmitOnboardingFormResponseResult,
} from './employee-onboarding-types'

type RpcOk = { ok: true } & Record<string, unknown>
type RpcErr = { ok: false; error_code: EmployeeOnboardingErrorCode; error: string }

function unwrapRpc(data: Json | null): RpcOk {
  const result = data as unknown as RpcOk | RpcErr | null
  if (!result || typeof result !== 'object') {
    throw new Error('Unexpected empty response from server.')
  }
  if (!result.ok) {
    const err = result as RpcErr
    throw new EmployeeOnboardingPersistenceError(err.error_code, err.error)
  }
  return result
}

export async function listAssignmentsForEmployee(employeeId: string): Promise<EmployeeOnboardingAssignment[]> {
  const { data: assignmentRows, error: assignmentsError } = await supabase
    .from('employee_onboarding_assignments')
    .select('*')
    .eq('employee_id', employeeId)
    .order('assigned_at', { ascending: false })
  if (assignmentsError) throw assignmentsError

  const rows = assignmentRows ?? []
  if (rows.length === 0) return []

  const assignmentIds = rows.map((row) => row.id)
  const { data: itemRows, error: itemsError } = await supabase
    .from('employee_onboarding_items')
    .select('*')
    .in('assignment_id', assignmentIds)
  if (itemsError) throw itemsError

  return rows.map((row) => mapEmployeeOnboardingAssignment(row, itemRows ?? []))
}

export async function getMyOnboardingAssignments(): Promise<EmployeeOnboardingAssignment[]> {
  const { data: authData } = await supabase.auth.getUser()
  if (!authData.user) return []

  const { data: employee, error: employeeError } = await supabase
    .from('employees')
    .select('id')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle()
  if (employeeError) throw employeeError
  if (!employee) return []

  return listAssignmentsForEmployee(employee.id)
}

export interface PublishedPackageVersionOption {
  packageVersionId: string
  onboardingPackageId: string
  title: string
  versionNumber: number
  publishedAt: string | null
  formsCount: number
  documentsCount: number
}

export async function listPublishedPackageVersions(): Promise<PublishedPackageVersionOption[]> {
  const [versionsRes, itemsRes] = await Promise.all([
    supabase
      .from('onboarding_package_versions')
      .select('id, onboarding_package_id, version_number, published_at, onboarding_packages(title, archived_at)')
      .eq('state', 'published')
      .order('published_at', { ascending: false }),
    supabase.from('onboarding_package_items').select('package_version_id, item_type'),
  ])

  if (versionsRes.error) throw versionsRes.error
  if (itemsRes.error) throw itemsRes.error

  const items = itemsRes.data ?? []

  return (versionsRes.data ?? [])
    .filter((row) => {
      const parent = row.onboarding_packages as unknown as { archived_at: string | null } | null
      return !parent?.archived_at
    })
    .map((row) => {
      const parent = row.onboarding_packages as unknown as { title: string } | null
      const versionItems = items.filter((item) => item.package_version_id === row.id)
      return {
        packageVersionId: row.id,
        onboardingPackageId: row.onboarding_package_id,
        title: parent?.title ?? 'Untitled Package',
        versionNumber: row.version_number,
        publishedAt: row.published_at,
        formsCount: versionItems.filter((item) => item.item_type === 'form').length,
        documentsCount: versionItems.filter((item) => item.item_type === 'document').length,
      }
    })
}

export interface PackageVersionPreviewItem {
  itemType: 'form' | 'document'
  sortOrder: number
  required: boolean
  title: string
  versionNumber: number | null
}

export async function getPackageVersionPreview(packageVersionId: string): Promise<PackageVersionPreviewItem[]> {
  const { data: itemRows, error } = await supabase
    .from('onboarding_package_items')
    .select('item_type, sort_order, required, document_title, form_version_id')
    .eq('package_version_id', packageVersionId)
    .order('sort_order', { ascending: true })
  if (error) throw error

  const formVersionIds = (itemRows ?? [])
    .filter((item) => item.form_version_id)
    .map((item) => item.form_version_id as string)

  const formVersionMap: Record<string, { title: string; versionNumber: number }> = {}
  if (formVersionIds.length > 0) {
    const { data: formRows, error: formError } = await supabase
      .from('form_definition_versions')
      .select('id, version_number, form_definitions(title)')
      .in('id', formVersionIds)
    if (formError) throw formError
    for (const row of formRows ?? []) {
      const parent = row.form_definitions as unknown as { title: string } | null
      formVersionMap[row.id] = { title: parent?.title ?? 'Form', versionNumber: row.version_number }
    }
  }

  return (itemRows ?? []).map((item) => {
    if (item.item_type === 'form') {
      const meta = item.form_version_id ? formVersionMap[item.form_version_id] : undefined
      return {
        itemType: 'form' as const,
        sortOrder: item.sort_order,
        required: item.required,
        title: meta?.title ?? 'Form',
        versionNumber: meta?.versionNumber ?? null,
      }
    }
    return {
      itemType: 'document' as const,
      sortOrder: item.sort_order,
      required: item.required,
      title: item.document_title ?? 'Document Requirement',
      versionNumber: null,
    }
  })
}

export async function assignOnboardingPackage(input: {
  employeeId: string
  packageVersionId: string
  dueDate?: string | null
}): Promise<AssignOnboardingPackageResult> {
  const { data, error } = await supabase.rpc('assign_onboarding_package', {
    p_employee_id: input.employeeId,
    p_package_version_id: input.packageVersionId,
    // The RPC's `p_due_date date` parameter has no SQL default, so
    // supabase gen types marks it non-nullable `string` even though the
    // function body (and Postgres generally) accepts NULL just fine.
    p_due_date: (input.dueDate ?? null) as unknown as string,
  })
  if (error) throw error

  const result = unwrapRpc(data)
  return {
    assignmentId: result.assignment_id as string,
    employeeId: result.employee_id as string,
    packageVersionId: result.package_version_id as string,
    packageTitleSnapshot: result.package_title_snapshot as string,
    packageVersionNumber: result.package_version_number as number,
    state: result.state as AssignOnboardingPackageResult['state'],
    itemCount: result.item_count as number,
  }
}

export async function startMyOnboarding(assignmentId: string): Promise<StartMyOnboardingResult> {
  const { data, error } = await supabase.rpc('start_my_onboarding', {
    p_assignment_id: assignmentId,
  })
  if (error) throw error

  const result = unwrapRpc(data)
  return {
    assignmentId: result.assignment_id as string,
    state: result.state as StartMyOnboardingResult['state'],
    alreadyStarted: Boolean(result.already_started),
  }
}

export async function cancelOnboardingAssignment(input: {
  assignmentId: string
  reason?: string | null
}): Promise<CancelOnboardingAssignmentResult> {
  const { data, error } = await supabase.rpc('cancel_onboarding_assignment', {
    p_assignment_id: input.assignmentId,
    // Same codegen imprecision as p_due_date above — p_reason has no SQL
    // default, so the generated type omits `| null` even though the RPC
    // treats a NULL/empty reason as "no reason given".
    p_reason: (input.reason ?? null) as unknown as string,
  })
  if (error) throw error

  const result = unwrapRpc(data)
  return {
    assignmentId: result.assignment_id as string,
    alreadyCancelled: Boolean(result.already_cancelled),
  }
}

/**
 * Reads the exact published form schema pinned to one of the caller's own
 * checklist items. Relies on the assignment-aware RLS policy added in
 * 0027 — an employee can only read the specific form_definition_versions
 * row tied to something actually assigned to them, never the table at
 * large.
 */
export async function getAssignedFormSchema(formVersionId: string): Promise<FormSchema> {
  const { data, error } = await supabase
    .from('form_definition_versions')
    .select('definition')
    .eq('id', formVersionId)
    .single()
  if (error) throw error
  return data.definition as unknown as FormSchema
}

export async function submitOnboardingFormResponse(input: {
  itemId: string
  responseData: Record<string, unknown>
}): Promise<SubmitOnboardingFormResponseResult> {
  const { data, error } = await supabase.rpc('submit_onboarding_form_response', {
    p_item_id: input.itemId,
    p_response_data: input.responseData as unknown as Json,
  })
  if (error) throw error

  const result = unwrapRpc(data)
  return {
    itemId: result.item_id as string,
    state: result.state as SubmitOnboardingFormResponseResult['state'],
    submittedAt: result.submitted_at as string,
  }
}

/** Saves incomplete progress for an assigned form item; never sets submitted_at. */
export async function saveOnboardingFormDraft(input: {
  itemId: string
  responseData: Record<string, unknown>
}): Promise<SaveOnboardingFormDraftResult> {
  const { data, error } = await supabase.rpc('save_onboarding_form_draft', {
    p_item_id: input.itemId,
    p_response_data: input.responseData as unknown as Json,
  })
  if (error) throw error

  const result = unwrapRpc(data)
  return {
    itemId: result.item_id as string,
    state: result.state as SaveOnboardingFormDraftResult['state'],
  }
}
