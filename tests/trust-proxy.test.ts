import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";

// The API trusts exactly one proxy hop (Railway). The visitor address must come from
// the entry the proxy added, never from a value the visitor typed into X-Forwarded-For.
test("with one trusted proxy hop, req.ip ignores spoofed X-Forwarded-For entries", async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.get("/ip", (req, res) => res.json({ ip: req.ip }));
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address() as { port: number };
  try {
    const res = await fetch(`http://127.0.0.1:${port}/ip`, {
      headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.7" },
    });
    assert.equal((await res.json()).ip, "203.0.113.7");
  } finally {
    server.close();
  }
});
