// A safety copy of typed answers kept on the person's own phone or laptop, so a
// refresh or a hung phone does not lose their work. Only typed answers are kept.
// Files and signatures are never stored here; they live on the server once uploaded.
export const DRAFT_PREFIX = "nolt-draft:";
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SKIP_TYPES = new Set(["file", "passport_photo", "signature"]);

type Value = string | boolean | null | undefined;
export type DraftAnswers = Record<string, Value>;
type Field = { id: string; type: string };
export type Backup = { answers: Record<string, string | boolean>; savedAt: number };

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Keep only answers the person typed or ticked, dropping file and signature ids and blanks. */
export function typedOnly(answers: DraftAnswers, fields: Field[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const f of fields) {
    if (SKIP_TYPES.has(f.type)) continue;
    const v = answers[f.id];
    if (v === undefined || v === null || v === "" || v === false) continue;
    out[f.id] = v;
  }
  return out;
}

export function saveBackup(key: string, answers: DraftAnswers, fields: Field[], now = Date.now()) {
  try {
    store()?.setItem(DRAFT_PREFIX + key, JSON.stringify({ answers: typedOnly(answers, fields), savedAt: now }));
  } catch {
    /* storage full or blocked: the server copy still works */
  }
}

export function readBackup(key: string, now = Date.now()): Backup | null {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(DRAFT_PREFIX + key);
    if (!raw) return null;
    const b = JSON.parse(raw) as Backup;
    if (!b || typeof b.savedAt !== "number" || typeof b.answers !== "object" || b.answers === null) {
      s.removeItem(DRAFT_PREFIX + key);
      return null;
    }
    if (now - b.savedAt > DRAFT_MAX_AGE_MS) {
      s.removeItem(DRAFT_PREFIX + key);
      return null;
    }
    return b;
  } catch {
    return null;
  }
}

export function clearBackup(key: string) {
  try {
    store()?.removeItem(DRAFT_PREFIX + key);
  } catch {
    /* ignore */
  }
}

export function clearAllBackups() {
  const s = store();
  if (!s) return;
  try {
    for (const k of Object.keys(s)) if (k.startsWith(DRAFT_PREFIX)) s.removeItem(k);
  } catch {
    /* ignore */
  }
}

/** True when the backup holds typed answers the server copy does not have. */
export function backupDiffers(backup: Backup, server: DraftAnswers, fields: Field[]): boolean {
  const theirs = typedOnly(server, fields);
  const mine = backup.answers;
  const keys = new Set([...Object.keys(theirs), ...Object.keys(mine)]);
  for (const k of keys) if (theirs[k] !== mine[k]) return true;
  return false;
}
