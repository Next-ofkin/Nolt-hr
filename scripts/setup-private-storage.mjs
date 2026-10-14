// Explicit hosted-development setup. No application deployment or employee import.
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { createClient } from "@supabase/supabase-js";
const env = { ...process.env, ...parse(readFileSync(".env.supabase")) };
if (
  env.SUPABASE_PROJECT_REF !== "llslubzdkdnvhbatmfug" ||
  env.NODE_ENV === "production"
)
  throw new Error("Use the approved development project only.");
if (!env.SUPABASE_SECRET_KEY)
  throw new Error("Server-only Supabase key is missing.");
const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (url, init) =>
      fetch(url, { ...init, signal: AbortSignal.timeout(15000) }),
  },
});
const bucket = "nolt-private-documents";
const { data: buckets, error: listError } = await client.storage.listBuckets();
if (listError) throw new Error("Unable to inspect storage buckets.");
const existing = buckets.find((b) => b.id === bucket);
if (existing?.public)
  throw new Error("Existing bucket is public. Refusing to use it.");
if (!existing) {
  const { error } = await client.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: 10485760,
    allowedMimeTypes: ["application/pdf", "image/png", "image/jpeg"],
  });
  if (error) throw new Error("Private bucket creation failed.");
}
const { data, error } = await client.storage.getBucket(bucket);
if (error || !data || data.public)
  throw new Error("Private bucket verification failed.");
console.log(
  "Approved development storage bucket verified private. Scanner and browser acceptance remain separate checks.",
);
