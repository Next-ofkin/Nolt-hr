import EmbeddedPostgres from "embedded-postgres";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const databaseDir = resolve(".local/postgres");
mkdirSync(resolve(".local"), { recursive: true });
const server = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: "local-owner-password",
  port: 54329,
  persistent: true,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: (message) => console.error(String(message)),
});
if (!existsSync(resolve(databaseDir, "PG_VERSION"))) await server.initialise();
await server.start();
const client = server.getPgClient();
await client.connect();
if (
  !(await client.query("SELECT 1 FROM pg_database WHERE datname='nolt_hr'"))
    .rowCount
)
  await client.query("CREATE DATABASE nolt_hr");
if (
  !(await client.query("SELECT 1 FROM pg_roles WHERE rolname='nolt_app'"))
    .rowCount
)
  await client.query(
    "CREATE ROLE nolt_app LOGIN PASSWORD 'local-app-password' NOSUPERUSER NOCREATEDB NOCREATEROLE",
  );
await client.end();
console.log(
  "Local PostgreSQL ready at 127.0.0.1:54329. Synthetic development data only. Ctrl+C to stop.",
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await server.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 60000);
