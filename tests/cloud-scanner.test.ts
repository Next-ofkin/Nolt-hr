import test from "node:test";
import assert from "node:assert/strict";
import { scanBytes } from "../apps/api/dist/file-security.js";

test("cloud scanner fails closed unless the scan returns CleanResult true", async () => {
  const original = { fetch: globalThis.fetch, provider: process.env.MALWARE_SCANNER_PROVIDER, key: process.env.CLOUDMERSIVE_API_KEY };
  try {
    process.env.MALWARE_SCANNER_PROVIDER = "cloudmersive";
    process.env.CLOUDMERSIVE_API_KEY = "test-key";
    const bytes = Buffer.from("test");
    globalThis.fetch = async () => Response.json({ CleanResult: true, FoundViruses: null });
    await scanBytes(bytes);
    globalThis.fetch = async () => Response.json({ CleanResult: false, FoundViruses: ["example"] });
    await assert.rejects(scanBytes(bytes), /File rejected/);
    globalThis.fetch = async () => Response.json({});
    await assert.rejects(scanBytes(bytes), /invalid result/);
    globalThis.fetch = async () => new Response("rate limited", { status: 429 });
    await assert.rejects(scanBytes(bytes), /unavailable/);
    globalThis.fetch = async () => { throw new Error("network error"); };
    await assert.rejects(scanBytes(bytes), /unavailable/);
    delete process.env.CLOUDMERSIVE_API_KEY;
    await assert.rejects(scanBytes(bytes), /not configured/);
  } finally {
    globalThis.fetch = original.fetch;
    if (original.provider === undefined) delete process.env.MALWARE_SCANNER_PROVIDER;
    else process.env.MALWARE_SCANNER_PROVIDER = original.provider;
    if (original.key === undefined) delete process.env.CLOUDMERSIVE_API_KEY;
    else process.env.CLOUDMERSIVE_API_KEY = original.key;
  }
});
