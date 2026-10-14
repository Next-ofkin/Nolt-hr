// Real scanner acceptance; EICAR is generated in memory and never saved/uploaded.
import assert from "node:assert/strict";
import { scanBytes } from "../apps/api/dist/file-security.js";
process.env.CLAMAV_HOST ??= "127.0.0.1";
process.env.CLAMAV_PORT ??= "3310";
await scanBytes(Buffer.from("NOLT development clean scanner probe"));
console.log("PASS: real ClamAV accepts clean bytes.");
const eicar =
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}" + "$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
assert.equal(Buffer.byteLength(eicar), 68);
await assert.rejects(
  scanBytes(Buffer.from(eicar)),
  (error) =>
    error.getStatus?.() === 400 && /malware scanner/.test(error.message),
);
console.log(
  "PASS: real ClamAV rejects the standard harmless EICAR antivirus test pattern.",
);
