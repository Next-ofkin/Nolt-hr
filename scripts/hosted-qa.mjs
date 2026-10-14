import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { parse } from "dotenv";
import pg from "pg";
const root = resolve(import.meta.dirname, "..");
const env = {
  ...process.env,
  ...parse(readFileSync(resolve(root, ".env"))),
  ...parse(readFileSync(resolve(root, ".env.supabase"))),
};
const ref = "llslubzdkdnvhbatmfug";
if (
  env.SUPABASE_PROJECT_REF !== ref ||
  env.LOCAL_DEVELOPMENT !== "true" ||
  env.NODE_ENV === "production"
)
  throw new Error(
    "Use the approved development project with loopback transport.",
  );
env.AUTH_PROVIDER = "supabase";
for (const key of ["DATABASE_URL", "DIRECT_DATABASE_URL"]) {
  const u = new URL(env[key]);
  if (
    !u.hostname.endsWith(".pooler.supabase.com") ||
    !decodeURIComponent(u.username).endsWith("." + ref) ||
    u.port !== "5432" ||
    u.searchParams.get("sslmode") !== "verify-full" ||
    !u.searchParams.get("sslrootcert")
  )
    throw new Error("Project target or verified TLS configuration mismatch.");
}
function run(script, args = []) {
  const child = spawn(process.execPath, [resolve(root, script), ...args], {
    cwd: root,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
  child.on("error", () => {
    console.error("Process failed to start.");
    process.exitCode = 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill(signal));
}
const mode = process.argv[2];
if (mode === "api") run("apps/api/dist/main.js");
else if (mode === "worker") run("apps/api/dist/worker.js");
else if (mode === "status" || mode === "migrate")
  run("node_modules/prisma/build/index.js", [
    "migrate",
    mode === "status" ? "status" : "deploy",
    "--config",
    "database/prisma.config.ts",
  ]);
else if (mode === "dev")
  run("node_modules/concurrently/dist/bin/concurrently.js", [
    "-k",
    "-n",
    "api,web",
    "npm run dev -w @nolt/api",
    "npm run dev -w @nolt/web",
  ]);
else if (mode === "preview")
  run("node_modules/concurrently/dist/bin/concurrently.js", [
    "-k",
    "-n",
    "api,web",
    "npm run start -w @nolt/api",
    "npm run start -w @nolt/web",
  ]);
else if (mode === "test") {
  env.AUTH_LIVE_TESTS = "true";
  run("node_modules/tsx/dist/cli.mjs", [
    "--test",
    "--test-concurrency=1",
    ...readdirSync(resolve(root, "tests"))
      .filter((n) => n.endsWith(".test.ts"))
      .map((n) => "tests/" + n),
    "tests/supabase-auth.live.ts",
  ]);
} else if (mode === "e2e") {
  env.AUTH_LIVE_TESTS = "true";
  run("node_modules/@playwright/test/cli.js", [
    "test",
    ...process.argv.slice(3),
  ]);
} else if (mode === "setup" || mode === "verify") {
  const db = new pg.Client({
    connectionString:
      env[mode === "setup" ? "DIRECT_DATABASE_URL" : "DATABASE_URL"],
    options: "-c timezone=UTC",
    connectionTimeoutMillis: 15000,
  });
  try {
    await db.connect();
    if (!db.connection.stream.encrypted || !db.connection.stream.authorized)
      throw new Error("TLS was not authenticated.");
    if (mode === "setup") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.BOOTSTRAP_HR_EMAIL ?? ""))
        throw new Error(
          "Set the approved BOOTSTRAP_HR_EMAIL in .env.supabase.",
        );
      await db.query(
        readFileSync(
          resolve(root, "database/supabase-auth-provisioning.sql"),
          "utf8",
        ),
      );
      await db.query(
        "INSERT INTO nolt_private.bootstrap_hr(email) VALUES ($1) ON CONFLICT(email) DO NOTHING",
        [env.BOOTSTRAP_HR_EMAIL.toLowerCase()],
      );
      await db.query(
        readFileSync(
          resolve(root, "database/supabase-employee-linking.sql"),
          "utf8",
        ),
      );
      console.log(
        "Supabase user provisioning and one-time verified-email HR bootstrap configured.",
      );
    } else {
      const user = (await db.query("SELECT current_user AS role")).rows[0];
      if (user.role !== "nolt_app") throw new Error("Unexpected runtime role.");
      try {
        await db.query('DELETE FROM public."AuditEvent" WHERE false');
        throw new Error("Audit deletion was allowed.");
      } catch (e) {
        if (e.code !== "42501") throw e;
      }
      console.log("Restricted runtime TLS verified; audit deletion denied.");
    }
  } finally {
    await db.end();
  }
  if (mode === "verify") {
    const owner = new pg.Client({
      connectionString: env.DIRECT_DATABASE_URL,
      connectionTimeoutMillis: 15000,
    });
    try {
      await owner.connect();
      const rows = (
        await owner.query(
          "SELECT migration_name,checksum,finished_at,rolled_back_at FROM public._prisma_migrations",
        )
      ).rows;
      const names = readdirSync(resolve(root, "database/migrations"), {
        withFileTypes: true,
      })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
      if (rows.length !== names.length)
        throw new Error("Migration count mismatch.");
      for (const name of names) {
        const row = rows.find((r) => r.migration_name === name);
        const hash = createHash("sha256")
          .update(
            readFileSync(
              resolve(root, "database/migrations", name, "migration.sql"),
            ),
          )
          .digest("hex");
        if (!row?.finished_at || row.rolled_back_at || row.checksum !== hash)
          throw new Error("Migration checksum mismatch: " + name);
      }
      console.log("All hosted Prisma migration checksums match.");
      await owner.query(
        readFileSync(resolve(root, "database/verify-supabase.sql"), "utf8"),
      );
      console.log(
        "Hosted schema, RLS/grants and immutable-form trigger checks passed (rolled back).",
      );
    } finally {
      await owner.end();
    }
  }
} else
  throw new Error(
    "Use api, dev, preview, worker, status, migrate, setup, verify, test or e2e.",
  );
