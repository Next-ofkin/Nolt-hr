import { Client } from "pg";
import { config } from "dotenv";
config({ quiet: true });
if (
  process.env.LOCAL_DEVELOPMENT !== "true" ||
  process.env.NODE_ENV === "production"
)
  throw new Error("Local grants are restricted to development.");
const db = new Client({ connectionString: process.env.DIRECT_DATABASE_URL });
await db.connect();
await db.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO nolt_app;
GRANT SELECT ON "User" TO nolt_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Session" TO nolt_app;
GRANT SELECT, INSERT, UPDATE ON "Form", "FormVersion" TO nolt_app;
GRANT SELECT, INSERT ON "AuditEvent", "OutboxEvent" TO nolt_app;`);
await db.end();
console.log(
  "Restricted runtime grants applied. No audit mutation or schema privileges.",
);
