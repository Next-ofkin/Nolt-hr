import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * How many published versions the Version History view shows by default,
 * for Forms and Onboarding Packages alike. This is a display limit only -
 * every published version stays in the database forever (a package may
 * still be pinned to an older one), it's just collapsed behind "Show
 * older versions" once there are more than this many.
 */
export const VISIBLE_PUBLISHED_VERSION_LIMIT = 3

/**
 * Splits a version list (already containing at most one draft) into what
 * to show by default vs. what to collapse behind "Show older versions".
 * Drafts always show; only published versions count toward the limit,
 * and the most recent ones are kept visible.
 */
export function splitVersionsForDisplay<T extends { state: string; versionNumber: number }>(
  versions: T[],
  showAll: boolean,
): { visible: T[]; hiddenCount: number } {
  const drafts = versions.filter((v) => v.state !== 'published')
  const published = [...versions.filter((v) => v.state === 'published')].sort(
    (a, b) => b.versionNumber - a.versionNumber,
  )
  const hiddenCount = Math.max(0, published.length - VISIBLE_PUBLISHED_VERSION_LIMIT)
  const visiblePublished = showAll ? published : published.slice(0, VISIBLE_PUBLISHED_VERSION_LIMIT)
  const visible = [...drafts, ...visiblePublished].sort((a, b) => b.versionNumber - a.versionNumber)
  return { visible, hiddenCount }
}
