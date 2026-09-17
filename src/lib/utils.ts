import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * How many non-draft versions (published + superseded) the Version
 * History view shows by default, for Forms and Onboarding Packages
 * alike. This is a display limit only - every version stays in the
 * database forever, it's just collapsed behind "Show older versions"
 * once there are more than this many.
 */
export const VISIBLE_PUBLISHED_VERSION_LIMIT = 3

/**
 * Splits a version list (already containing at most one draft) into what
 * to show by default vs. what to collapse behind "Show older versions".
 * The open draft always shows; published and superseded versions
 * together count toward the limit (only one can ever be 'published' at
 * a time - older ones become 'superseded', not deleted), and the most
 * recent ones are kept visible.
 */
export function splitVersionsForDisplay<T extends { state: string; versionNumber: number }>(
  versions: T[],
  showAll: boolean,
): { visible: T[]; hiddenCount: number } {
  const drafts = versions.filter((v) => v.state === 'draft')
  const rest = [...versions.filter((v) => v.state !== 'draft')].sort(
    (a, b) => b.versionNumber - a.versionNumber,
  )
  const hiddenCount = Math.max(0, rest.length - VISIBLE_PUBLISHED_VERSION_LIMIT)
  const visibleRest = showAll ? rest : rest.slice(0, VISIBLE_PUBLISHED_VERSION_LIMIT)
  const visible = [...drafts, ...visibleRest].sort((a, b) => b.versionNumber - a.versionNumber)
  return { visible, hiddenCount }
}
