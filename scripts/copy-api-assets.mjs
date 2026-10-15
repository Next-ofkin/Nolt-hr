import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
const source = new URL(
  "../database/certs/supabase-prod-ca-2021.crt",
  import.meta.url,
);
const directory = new URL("../apps/api/dist/certs/", import.meta.url);
// Fail the build if the public trust anchor is missing, malformed or replaced.
const cert = new X509Certificate(readFileSync(source));
if (
  cert.fingerprint256 !==
  "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA"
)
  throw new Error("Unexpected Supabase CA fingerprint.");
mkdirSync(directory, { recursive: true });
copyFileSync(source, new URL("supabase-prod-ca-2021.crt", directory));
console.log("Verified public Supabase CA bundled with compiled API.");
