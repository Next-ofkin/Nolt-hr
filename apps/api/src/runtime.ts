// Hosted staging is opt-in. This does not authorise production use or real imports.
export function runtimeSettings(env: NodeJS.ProcessEnv) {
  const staging = env.DEPLOYMENT_ENV === "staging";
  if (env.NODE_ENV === "production" && !staging)
    throw new Error(
      "Production release is not enabled. Use explicitly configured staging for testing.",
    );
  if (staging) {
    if (env.NODE_ENV !== "production" || env.LOCAL_DEVELOPMENT !== "false")
      throw new Error(
        "Hosted staging requires production transport settings and LOCAL_DEVELOPMENT=false.",
      );
    const origin = new URL(env.PUBLIC_APP_URL ?? "");
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      throw new Error(
        "Hosted staging requires a HTTPS frontend origin without credentials or paths.",
      );
    if (
      env.AUTH_PROVIDER !== "supabase" ||
      !env.SUPABASE_PUBLISHABLE_KEY ||
      !env.SUPABASE_SECRET_KEY
    )
      throw new Error(
        "Hosted staging requires real Supabase Auth configuration.",
      );
    // The project is whatever the owner configured, but the id and the address must agree,
    // so a typo or a copied setting can never point the API at a different project.
    if (
      !/^[a-z0-9]{20}$/.test(env.SUPABASE_PROJECT_REF ?? "") ||
      env.SUPABASE_URL !== `https://${env.SUPABASE_PROJECT_REF}.supabase.co`
    )
      throw new Error(
        "SUPABASE_PROJECT_REF must be the 20-character project id and SUPABASE_URL must be https://<project id>.supabase.co.",
      );
    if (Buffer.from(env.AUTH_ENCRYPTION_KEY ?? "", "base64").length !== 32)
      throw new Error(
        "Hosted staging requires a 32-byte Base64 auth encryption key.",
      );
    const db = new URL(env.DATABASE_URL ?? "");
    if (
      !decodeURIComponent(db.username).startsWith("nolt_app.") ||
      db.searchParams.get("sslmode") !== "verify-full" ||
      !db.searchParams.get("sslrootcert")
    )
      throw new Error(
        "Staging requires the restricted database role and verified TLS with a CA certificate.",
      );
  }
  const port = Number(env.PORT ?? env.API_PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("API port must be an integer from 1 to 65535.");
  return { port, host: staging ? "0.0.0.0" : "127.0.0.1" };
}
