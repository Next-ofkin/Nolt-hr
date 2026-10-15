import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function databaseConnectionString(env: NodeJS.ProcessEnv) {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  if (env.DEPLOYMENT_ENV !== "staging") return env.DATABASE_URL;
  const url = new URL(env.DATABASE_URL);
  if (url.searchParams.get("sslmode") !== "verify-full")
    throw new Error("Staging database requires verified TLS.");
  const ca = new URL("./certs/supabase-prod-ca-2021.crt", import.meta.url);
  if (!existsSync(ca))
    throw new Error(
      "STAGING_CA_CERT_MISSING: rebuild API with bundled public CA.",
    );
  url.searchParams.set("sslrootcert", fileURLToPath(ca));
  return url.toString();
}
