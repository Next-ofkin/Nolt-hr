import test from "node:test";
import assert from "node:assert/strict";
import {
  DRAFT_MAX_AGE_MS, backupDiffers, clearAllBackups, clearBackup, readBackup, saveBackup, typedOnly,
} from "../apps/web/src/lib/draft-backup.js";

const fields = [
  { id: "name", type: "text" },
  { id: "agree", type: "checkbox" },
  { id: "photo", type: "passport_photo" },
  { id: "sig", type: "signature" },
];
function fakeStorage() {
  const m = new Map<string, string>();
  const s = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    keys: () => [...m.keys()],
  };
  return new Proxy(s, { ownKeys: () => s.keys(), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
}
test.beforeEach(() => {
  (globalThis as unknown as { window: unknown }).window = { localStorage: fakeStorage() };
});

test("files and signatures are never kept, blanks are dropped", () => {
  assert.deepEqual(typedOnly({ name: "Ada", agree: false, photo: "f1", sig: "s1" }, fields), { name: "Ada" });
});
test("a backup is restored while fresh and removed when old", () => {
  saveBackup("a", { name: "Ada", photo: "f1" }, fields, 1000);
  assert.deepEqual(readBackup("a", 2000)?.answers, { name: "Ada" });
  assert.equal(readBackup("a", 1000 + DRAFT_MAX_AGE_MS + 1), null);
  assert.equal(readBackup("a", 2000), null);
});
test("clearing one or all backups", () => {
  saveBackup("a", { name: "x" }, fields);
  saveBackup("b", { name: "y" }, fields);
  clearBackup("a");
  assert.equal(readBackup("a"), null);
  assert.ok(readBackup("b"));
  clearAllBackups();
  assert.equal(readBackup("b"), null);
});
test("only a real difference counts", () => {
  const b = { answers: { name: "Ada" }, savedAt: 1 };
  assert.equal(backupDiffers(b, { name: "Ada", photo: "f1" }, fields), false);
  assert.equal(backupDiffers(b, { name: "Ade" }, fields), true);
  assert.equal(backupDiffers(b, {}, fields), true);
});
test("broken storage never throws", () => {
  (globalThis as unknown as { window: unknown }).window = {
    get localStorage(): never { throw new Error("blocked"); },
  };
  saveBackup("a", { name: "x" }, fields);
  assert.equal(readBackup("a"), null);
  clearAllBackups();
});
