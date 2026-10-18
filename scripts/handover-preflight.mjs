#!/usr/bin/env node
/**
 * Read-only handover/deployment preflight. No network, secrets, migrations,
 * external service creations or Git writes are performed.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
const root = resolve(import.meta.dirname, "..");
const issues = [];
const notes = [];
function git(...args) {
  try { return execFileSync("git", args, { cwd: root, encoding: "utf8", timeout: 10000 }).trim(); }
  catch { return null; }
}
function check(condition, message) {
  if (!condition) issues.push(message);
}
const nodeMajor = Number(process.versions.node.split(".")[0]);
check(nodeMajor === 24, "Node.js 24 is required.");
const branch = git("branch", "--show-current");
notes.push(`Branch: ${branch || "unknown"}`);
const dirty = git("status", "--porcelain");
if (dirty === null) issues.push("Cannot inspect Git worktree.");
else if (dirty) notes.push("Local uncommitted files exist; review before handover.");
const config = resolve(root, "database/schema.prisma");
check(existsSync(config), "Missing Prisma schema.");
for (const file of ["package-lock.json","apps/web/src/lib/brand.ts","railway.toml","docs/BRANDING_AND_DEPLOYMENT.md"]) {
  check(existsSync(resolve(root, file)), `Missing ${file}`);
}
const migrations = [
  "20261018100000_pack_templates",
  "20261018110000_pack_assignments",
  "20261018120000_pack_approval",
  "20261018130000_pack_deadline_history",
  "20261018140000_pack_version_lineage",
  "20261018150000_pack_immutability",
];
for (const id of migrations) {
  const path = resolve(root, "database/migrations", id, "migration.sql");
  check(existsSync(path), `Missing SQL migration ${id}`);
  if (!existsSync(path)) continue;
  const sql = readFileSync(path, "utf8");
  check(sql.includes("BEGIN;") && sql.includes("COMMIT;"), `Review transaction boundaries in ${id}`);
}
const grantFile = resolve(root, "database/migrations/20261018120000_pack_approval/migration.sql");
if (existsSync(grantFile)) {
  const sql = readFileSync(grantFile, "utf8");
  check(/DO \$tag\$[\s\S]*END \$tag\$;/m.test(sql), "Pack approval migration DO block requires valid PostgreSQL dollar quoting.");
}
const logoPath = process.env.NEXT_PUBLIC_BRAND_LOGO_PATH;
if (logoPath) {
  check(/^\/branding\/[a-zA-Z0-9_-]+\.(png|webp|jpg|jpeg)$/.test(logoPath),
    "Invalid logo path; use /branding/company-logo.png (or webp/jpg/jpeg).");
  if (/^\/branding\/[a-zA-Z0-9_-]+\.(png|webp|jpg|jpeg)$/.test(logoPath)) {
    check(existsSync(resolve(root,"apps/web/public",logoPath.slice(1))), "Brand logo file is not in apps/web/public.");
  }
}
const colour = process.env.NEXT_PUBLIC_BRAND_PRIMARY;
if (colour) check(/^#[0-9a-fA-F]{6}$/.test(colour), "Primary brand colour must be a six-digit hex value.");
console.log("NOLT HR — read-only handover preflight");
for (const note of notes) console.log("INFO:", note);
console.log("This does NOT verify DB migrations, credentials, live hosting, authentication or end-to-end workflows.");
if (issues.length) {
  for (const issue of issues) console.error("CHECK:", issue);
  process.exitCode = 1;
} else {
  console.log("PASS: local handover files and basic format checks are present.");
  console.log("NEXT: run npm run typecheck, npm test, npm run build; review migrations against an isolated database.");
}
