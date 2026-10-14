import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { createConnection } from "node:net";

export const SIGNATURE_CONSENT_VERSION = "development-confirmation-v1";

export function decodePayload(value: string): Buffer {
  const raw = value.replace(/^data:image\/(?:png|jpeg);base64,/, "");
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      raw,
    ) ||
    !raw.length
  )
    throw new BadRequestException("Invalid base64 payload.");
  return Buffer.from(raw, "base64");
}

// ClamAV INSTREAM: no shell, no temporary files and no success on timeout/error.
export async function scanBytes(data: Buffer): Promise<void> {
  const host = process.env.CLAMAV_HOST;
  if (!host)
    throw new ServiceUnavailableException(
      "Malware scanning is not configured. Upload confirmation is unavailable.",
    );
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({
      host,
      port: Number(process.env.CLAMAV_PORT ?? 3310),
    });
    let result = "";
    const unavailable = () => {
      socket.destroy();
      reject(
        new ServiceUnavailableException(
          "Malware scanner unavailable. File was not confirmed.",
        ),
      );
    };
    socket.setTimeout(8000, unavailable);
    socket.on("error", unavailable);
    socket.on("data", (chunk) => {
      result += chunk.toString();
      if (result.length > 4096) return unavailable();
      if (!result.includes("\0")) return;
      socket.destroy();
      if (result === "stream: OK\0") resolve();
      else if (result.includes(" FOUND\0"))
        reject(new BadRequestException("File rejected by malware scanner."));
      else unavailable();
    });
    socket.on("end", () => {
      if (!result.includes("\0")) unavailable();
    });
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let offset = 0; offset < data.length; offset += 65536) {
        const chunk = data.subarray(offset, offset + 65536);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}

export async function normaliseImage(data: Buffer): Promise<Buffer> {
  try {
    const image = sharp(data, {
      limitInputPixels: 16000000,
      failOn: "warning",
      animated: false,
    });
    const meta = await image.metadata();
    if (!["png", "jpeg"].includes(meta.format ?? "") || (meta.pages ?? 1) !== 1)
      throw new Error("Unsupported image");
    return await image
      .rotate()
      .resize({
        width: 2000,
        height: 2000,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch {
    throw new BadRequestException(
      "Image could not be decoded safely. Use a valid PNG or JPEG.",
    );
  }
}

export function storageClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY)
    throw new ServiceUnavailableException(
      "Private Supabase Storage is not configured.",
    );
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (url, init) =>
          fetch(url, { ...init, signal: AbortSignal.timeout(10000) }),
      },
    },
  );
}
