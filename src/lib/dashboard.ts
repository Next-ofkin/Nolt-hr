import { EMPLOYEE_STATUS_LABELS } from './employee-domain.ts'
import type { EmployeeStatus } from './database.types.ts'

const ATTENTION_STATUSES = ['DRAFT', 'HR_REVIEW'] as const satisfies readonly EmployeeStatus[]

export function getGreeting(date: Date, firstName?: string | null) {
  const hour = date.getHours()
  const period = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  const trimmedName = firstName?.trim()
  return trimmedName ? `Good ${period}, ${trimmedName}` : `Good ${period}`
}

export interface NeedsAttentionEntry {
  status: EmployeeStatus
  count: number
  message: string
}

export function deriveNeedsAttention(
  counts: Partial<Record<EmployeeStatus, number>>,
): NeedsAttentionEntry[] {
  return ATTENTION_STATUSES.map((status) => {
    const count = counts[status] ?? 0
    return {
      status,
      count,
      message: `${count} employee${count === 1 ? '' : 's'} in ${EMPLOYEE_STATUS_LABELS[status]}`,
    }
  }).filter((entry) => entry.count > 0)
}
