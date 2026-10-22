/** "9+" keeps the red dot small. */
export function badgeText(count: number): string {
  return count > 9 ? "9+" : String(count);
}
export function kindLabel(kind: string): string {
  return kind === "late" ? "Overdue" : kind === "action" ? "To do" : "For your information";
}
/** Read ?open= or ?employee= from the address, only if it looks like an id. */
export function idFromSearch(search: string, key: "open" | "employee"): string | null {
  const v = new URLSearchParams(search).get(key);
  return v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null;
}
