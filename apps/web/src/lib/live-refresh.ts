/**
 * The one background-refresh rhythm for the whole app. Every list/detail screen reads its
 * data through TanStack Query, and the query client (workspace-query-provider.tsx) uses this
 * interval for all of them. Hidden tabs never refresh; returning to the tab refreshes at once.
 * Change the number here and every screen follows.
 */
export const LIVE_REFRESH_MS = 10_000;
