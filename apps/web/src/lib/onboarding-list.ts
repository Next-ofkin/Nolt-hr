import { splitAssignmentsByPack } from "./split-assignments-by-pack";

export type Bucket = "todo" | "waiting" | "done";
export type ListItem = {
  id: string;
  title: string;
  status: string;
  required: boolean;
  dueDate?: string | null;
};
export type PackLike = {
  id: string;
  packName: string;
  forms: { assignmentId: string }[];
};

export function bucketOf(status: string): Bucket {
  if (status === "APPROVED") return "done";
  if (status === "SUBMITTED" || status === "EXTERNAL_SUBMITTED") return "waiting";
  return "todo";
}

// Work HR sent back comes first, then half-finished work, then untouched forms.
const rank: Record<string, number> = { CHANGES_REQUIRED: 0, DRAFT: 1, NOT_STARTED: 2 };

export function sortForDisplay<T extends ListItem>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      (rank[a.status] ?? 3) - (rank[b.status] ?? 3) ||
      Number(b.required) - Number(a.required) ||
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
      a.title.localeCompare(b.title),
  );
}

export function sections<T extends ListItem>(items: T[]) {
  const sorted = sortForDisplay(items);
  return {
    todo: sorted.filter((i) => bucketOf(i.status) === "todo"),
    waiting: sorted.filter((i) => bucketOf(i.status) === "waiting"),
    done: sorted.filter((i) => bucketOf(i.status) === "done"),
  };
}

/** One group per pack (in the order HR assigned them), then everything else. */
export function groupForDisplay<T extends ListItem, P extends PackLike>(assignments: T[], packs: P[]) {
  const { assignmentsById, standalone } = splitAssignmentsByPack(assignments, packs);
  const used = new Set<string>();
  const groups: { key: string; pack: P | null; items: T[] }[] = [];
  for (const pack of packs) {
    const items = pack.forms
      .map((f) => assignmentsById.get(f.assignmentId))
      .filter((a): a is T => !!a && !used.has(a.id));
    items.forEach((a) => used.add(a.id));
    if (items.length) groups.push({ key: pack.id, pack, items });
  }
  if (standalone.length) groups.push({ key: "other", pack: null, items: standalone });
  return groups;
}

export function needsAttention(items: ListItem[]) {
  return items.filter((i) => i.status === "CHANGES_REQUIRED").length;
}
