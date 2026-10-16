// Offline, read-only HR activation preflight. No promotion, invitation consumption,
// Supabase API calls, or application sessions. Never import into the API runtime.
import { Client } from "pg";
import { config } from "dotenv";
import { pathToFileURL } from "node:url";

export function validateOfflineActivationEnvironment(env, args, allowApply = false) {
  if (env.NODE_ENV === "production") throw new Error("Run from an approved operator workstation.");
  if (!env.DIRECT_DATABASE_URL) throw new Error("Operator owner connection is required.");
  if (env.DATABASE_URL && env.DIRECT_DATABASE_URL === env.DATABASE_URL)
    throw new Error("Never use the application database credential as an owner credential.");
  if (env.SUPABASE_PROJECT_REF !== "llslubzdkdnvhbatmfug")
    throw new Error("Unexpected Supabase project.");
  if (args.length !== 3 || !args.every((value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)))
    throw new Error("Usage: npm run auth:hr:preflight -- <invitation-uuid> <subject-uuid> <flow-uuid>");
  if (!allowApply && process.argv.includes("--apply")) throw new Error("This utility has no apply mode.");
  return args;
}

export async function hrActivationPreflight(client, invitationId, subjectId, flowId) {
  const result = await client.query(
    `SELECT h.id, h.state, h.email, h."expiresAt", h."revokedAt",
       h."creationSubject", h."providerSubject",
       u.id AS "userId", u.role, u.active, u."authVersion",
       af.id AS "flowId", af.kind AS "flowKind", af."hrInvitationId",
       af."hrSubject", af."hrPasswordConfirmedAt", af."createdAt" AS "flowCreatedAt",
       af."expiresAt" AS "flowExpiresAt"
     FROM public."HrInvitation" h
     LEFT JOIN public."User" u ON u.id=$2::uuid
     LEFT JOIN public."AuthFlow" af ON af.id=$3::uuid
     WHERE h.id=$1::uuid`,
    [invitationId, subjectId, flowId],
  );
  const row = result.rows[0];
  const now = Date.now();
  const ready = Boolean(
    row && ["SENT", "UNCERTAIN"].includes(row.state) &&
    row.expiresAt && new Date(row.expiresAt).getTime() > now &&
    !row.revokedAt && row.creationSubject === subjectId &&
    row.providerSubject === subjectId &&
    row.userId === subjectId && row.role === "EMPLOYEE" && row.active &&
    row.authVersion === 1 &&
    row.flowId === flowId && row.flowKind === "HR_INVITATION" &&
    row.hrInvitationId === invitationId && row.hrSubject === subjectId &&
    row.hrPasswordConfirmedAt &&
    new Date(row.hrPasswordConfirmedAt).getTime() >= new Date(row.flowCreatedAt).getTime() &&
    new Date(row.hrPasswordConfirmedAt).getTime() < new Date(row.flowExpiresAt).getTime() &&
    new Date(row.hrPasswordConfirmedAt).getTime() <= now &&
    new Date(row.flowExpiresAt).getTime() > now,
  );
  // A matching database snapshot never substitutes for active provider AAL2.
  return { databasePrerequisitesMet: ready, providerAal2Verified: false, activationAllowed: false };
}

async function main() {
  config({ quiet: true });
  const [invitationId, subjectId, flowId] = validateOfflineActivationEnvironment(
    process.env, process.argv.slice(2),
  );
  const db = new Client({ connectionString: process.env.DIRECT_DATABASE_URL, connectionTimeoutMillis: 15000 });
  try {
    await db.connect();
    const tls = db.connection.stream;
    if (!tls?.encrypted || !tls?.authorized)
      throw new Error("Owner connection requires verified TLS.");
    const identity = await db.query("SELECT current_user AS name");
    if (!identity.rows[0] || identity.rows[0].name === "nolt_app")
      throw new Error("Application database role cannot run the offline preflight.");
    const result = await hrActivationPreflight(db, invitationId, subjectId, flowId);
    process.stdout.write(JSON.stringify(result) + "\n");
    if (!result.databasePrerequisitesMet) process.exitCode = 1;
  } finally { await db.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => { process.stderr.write(error.message + "\n"); process.exitCode = 1; });
