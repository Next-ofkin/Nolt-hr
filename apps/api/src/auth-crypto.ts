import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
function key() {
  const bytes = Buffer.from(process.env.AUTH_ENCRYPTION_KEY ?? "", "base64");
  if (bytes.length !== 32)
    throw new Error(
      "AUTH_ENCRYPTION_KEY must contain 32 random bytes encoded as Base64.",
    );
  return bytes;
}
export function seal(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const bytes = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    bytes.toString("base64url"),
  ].join(".");
}
export function unseal<T>(value: string): T {
  const [version, iv, tag, body] = value.split(".");
  if (version !== "v1" || !iv || !tag || !body)
    throw new Error("Invalid encrypted auth state.");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url"),
  );
  cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(
    Buffer.concat([
      cipher.update(Buffer.from(body, "base64url")),
      cipher.final(),
    ]).toString("utf8"),
  ) as T;
}
