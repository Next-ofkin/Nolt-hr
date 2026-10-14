import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createField,
  validateAnswers,
  canonicalAnswersJson,
  uploadIntentSchema,
  signatureIntentSchema,
} from "@nolt/form-schemas";
import { inspectFileHeader } from "../apps/api/dist/files.js";

test("header screening identifies candidate types but does not constitute scanning", () => {
  // Headers identify only a candidate type; decoding/scanning is tested separately.
  const validPng = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
  ]);
  const pngResult = inspectFileHeader(
    validPng,
    "SUPPORTING_DOCUMENT",
    "image/png",
  );
  assert.equal(pngResult.clean, true);
  assert.equal(pngResult.actualMime, "image/png");

  // 2. Valid PDF passes
  const validPdf = Buffer.from("%PDF-1.7 header content here");
  const pdfResult = inspectFileHeader(
    validPdf,
    "SUPPORTING_DOCUMENT",
    "application/pdf",
  );
  assert.equal(pdfResult.clean, true);
  assert.equal(pdfResult.actualMime, "application/pdf");

  // 3. SVG is strictly blocked even if disguised
  const disguisedSvg = Buffer.from(
    "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>",
  );
  const svgResult = inspectFileHeader(
    disguisedSvg,
    "SUPPORTING_DOCUMENT",
    "image/png",
  );
  assert.equal(svgResult.clean, false);
  assert.match(
    svgResult.reason ?? "",
    /Executable, SVG, or script content is strictly prohibited/,
  );

  // 4. XML / HTML injection is strictly blocked
  const htmlDoc = Buffer.from("<html><body>Malicious</body></html>");
  const htmlResult = inspectFileHeader(
    htmlDoc,
    "SUPPORTING_DOCUMENT",
    "application/pdf",
  );
  assert.equal(htmlResult.clean, false);

  // 5. Empty buffer is rejected
  const emptyResult = inspectFileHeader(
    Buffer.alloc(0),
    "SUPPORTING_DOCUMENT",
    "image/png",
  );
  assert.equal(emptyResult.clean, false);

  // 6. Signatures require genuine PNG or JPEG
  const invalidSig = Buffer.from("NotAnImageFormatAtAll");
  const sigResult = inspectFileHeader(
    invalidSig,
    "SIGNATURE_IMAGE",
    "image/png",
  );
  assert.equal(sigResult.clean, false);
});

test("canonicalAnswersJson sorts non-signature fields and detects any answer changes", () => {
  const f1 = createField("text", "00000000-0000-4000-8000-000000000001");
  const f2 = createField("text", "00000000-0000-4000-8000-000000000002");
  const sigField = createField(
    "signature",
    "00000000-0000-4000-8000-000000000003",
  );

  const fields = [sigField, f2, f1]; // Mixed order

  const answers1 = {
    [f1.id]: "Answer One",
    [f2.id]: "Answer Two",
    [sigField.id]: randomUUID(),
  };

  const json1 = canonicalAnswersJson(fields, answers1);
  assert.ok(
    !json1.includes(sigField.id),
    "Signature field must be omitted from content digest",
  );

  // Alter answer 1
  const answers2 = {
    ...answers1,
    [f1.id]: "Changed Answer",
  };
  const json2 = canonicalAnswersJson(fields, answers2);
  assert.notEqual(
    json1,
    json2,
    "Digest content must change when answers change",
  );
});

test("validateAnswers accepts valid file/signature UUID references and rejects malformed values", () => {
  const fileField = {
    ...createField("file", randomUUID()),
    required: true,
  };
  const sigField = {
    ...createField("signature", randomUUID()),
    required: true,
  };
  const fields = [fileField, sigField];

  // 1. Missing required file & signature in final validation fails
  const res1 = validateAnswers(fields, {}, true);
  assert.equal(res1.issues.length, 2);

  // 2. Non-UUID strings fail
  const res2 = validateAnswers(
    fields,
    {
      [fileField.id]: "not-a-uuid",
      [sigField.id]: "data:image/png;base64,inlinePayloadNotAllowed",
    },
    true,
  );
  assert.equal(res2.issues.length, 2);
  assert.match(res2.issues[0].message, /Invalid attachment reference/);
  assert.match(res2.issues[1].message, /Invalid signature reference/);

  // 3. Valid UUID references pass validation
  const validFileId = randomUUID();
  const validSigId = randomUUID();
  const res3 = validateAnswers(
    fields,
    {
      [fileField.id]: validFileId,
      [sigField.id]: validSigId,
    },
    true,
  );
  assert.equal(res3.issues.length, 0);
  assert.equal(res3.answers[fileField.id], validFileId);
  assert.equal(res3.answers[sigField.id], validSigId);
});

test("uploadIntentSchema and signatureIntentSchema enforce bounds and required fields", () => {
  const validIntent = {
    fieldId: randomUUID(),
    purpose: "SUPPORTING_DOCUMENT",
    fileName: "passport.pdf",
    mimeType: "application/pdf",
    byteSize: 1024 * 1024,
    requestKey: randomUUID(),
  };
  assert.equal(uploadIntentSchema.safeParse(validIntent).success, true);

  // Oversized byte declaration fails
  assert.equal(
    uploadIntentSchema.safeParse({ ...validIntent, byteSize: 20 * 1024 * 1024 })
      .success,
    false,
  );

  const validSig = {
    fieldId: randomUUID(),
    signingMethod: "DRAWN",
    consentVersion: "v1.0",
    consentConfirmed: true,
    expectedRevision: 1,
    signatureImageBase64: Buffer.from("fake-sig").toString("base64"),
    requestKey: randomUUID(),
  };
  assert.equal(signatureIntentSchema.safeParse(validSig).success, true);

  // Missing consent fails
  assert.equal(
    signatureIntentSchema.safeParse({ ...validSig, consentConfirmed: false })
      .success,
    false,
  );
});

import sharp from "sharp";
import {
  normaliseImage,
  decodePayload,
  scanBytes,
} from "../apps/api/dist/file-security.js";
import { createServer } from "node:net";

test("normalisation rejects forged image headers and re-encodes actual image pixels", async () => {
  await assert.rejects(
    normaliseImage(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  );
  const original = await sharp({
    create: { width: 20, height: 10, channels: 4, background: "black" },
  })
    .png()
    .toBuffer();
  const result = await normaliseImage(original);
  assert.equal((await sharp(result).metadata()).format, "png");
  assert.throws(() => decodePayload("@@@@"));
  assert.deepEqual(decodePayload(original.toString("base64")), original);
});

test("scanner fails closed when unconfigured and accepts only explicit ClamAV success", async () => {
  const oldHost = process.env.CLAMAV_HOST,
    oldPort = process.env.CLAMAV_PORT;
  delete process.env.CLAMAV_HOST;
  await assert.rejects(scanBytes(Buffer.from("test")), /not configured/);
  const server = createServer((socket) => {
    let input = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      input = Buffer.concat([input, chunk]);
      if (input.length >= 19) socket.end("stream: OK\0");
    });
  });
  try {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    process.env.CLAMAV_HOST = "127.0.0.1";
    process.env.CLAMAV_PORT = String(
      (server.address() as { port: number }).port,
    );
    await scanBytes(Buffer.from("test"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (oldHost === undefined) delete process.env.CLAMAV_HOST;
    else process.env.CLAMAV_HOST = oldHost;
    if (oldPort === undefined) delete process.env.CLAMAV_PORT;
    else process.env.CLAMAV_PORT = oldPort;
  }
});
