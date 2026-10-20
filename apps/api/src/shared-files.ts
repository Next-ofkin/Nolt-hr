import { Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Query, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import { Database } from "./database.js";
import { FilesStorage } from "./files.js";

const TTL = 7 * 24 * 60 * 60;
function hmac(id: string, digest: string, expiry: number) {
  const secret = Buffer.from(process.env.AUTH_ENCRYPTION_KEY ?? "", "base64");
  if (secret.length !== 32) throw new Error("AUTH_ENCRYPTION_KEY is required.");
  return createHmac("sha256", secret).update(`nolt-shared-file-v1\n${id}\n${digest}\n${expiry}`).digest();
}
export function createFileShareToken(id: string, digest: string, now = Date.now()) {
  const expiry = Math.floor(now / 1000) + TTL;
  return `${expiry}.${hmac(id, digest, expiry).toString("base64url")}`;
}
export function verifyFileShareToken(id: string, digest: string, token: unknown, now = Date.now()) {
  if (typeof token !== "string" || token.length > 128) return false;
  const match = /^(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const expiry = Number(match[1]), current = Math.floor(now / 1000);
  if (!Number.isSafeInteger(expiry) || expiry <= current || expiry > current + TTL) return false;
  const actual = Buffer.from(match[2], "base64url");
  return actual.length === 32 && timingSafeEqual(hmac(id, digest, expiry), actual);
}

@ApiTags("Shareable attachments")
@Controller("shared-files")
export class SharedFilesController {
  constructor(@Inject(Database) private db: Database, @Inject(FilesStorage) private storage: FilesStorage) {}
  // No session required: the signed link grants read-only access to one file.
  @Get(":id")
  async view(@Param("id", ParseUUIDPipe) id: string, @Query("token") token: unknown, @Res() res: Response) {
    const file = await this.db.storedFile.findUnique({
      where: { id }, select: { id:true, sha256:true, status:true, scanStatus:true,
        bucket:true, storageKey:true, mimeType:true, fileName:true },
    });
    if (!file || file.status !== "CONFIRMED" || file.scanStatus !== "CLEAN" ||
        !verifyFileShareToken(id, file.sha256, token))
      throw new NotFoundException("Document link invalid or expired.");
    const bytes = await this.storage.get(file.bucket, file.storageKey);
    if (createHash("sha256").update(bytes).digest("hex") !== file.sha256)
      throw new NotFoundException("Document unavailable.");
    const inline = ["application/pdf","image/jpeg","image/png"].includes(file.mimeType);
    res.setHeader("Content-Type", inline ? file.mimeType : "application/octet-stream");
    res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(file.fileName)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.send(bytes);
  }
}
