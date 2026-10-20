import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { createHash, randomUUID } from "node:crypto";
import {
  decodePayload,
  normaliseImage,
  scanBytes,
  storageClient,
  SIGNATURE_CONSENT_VERSION,
} from "./file-security.js";

import type { Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import {
  canonicalAnswersJson,
  formContentSchema,
  signatureIntentSchema,
  uploadIntentSchema,
  uploadPayloadSchema,
  type SignatureIntentInput,
  type UploadIntentInput,
  type UploadPayloadInput,
} from "@nolt/form-schemas";
import { Database } from "./database.js";
import { AuthErrorDto, SessionGuard, type AuthRequest } from "./auth.js";
import { digest } from "./security.js";

export class UploadIntentDto {
  @ApiProperty({ format: "uuid" }) fileId!: string;
  @ApiProperty({ format: "uuid" }) requestKey!: string;
  @ApiProperty() storageKey!: string;
  @ApiProperty() expiresAt!: string;
}

export class StoredFileDto {
  @ApiProperty({ format: "uuid" }) fileId!: string;
  @ApiProperty({ format: "uuid" }) assignmentId!: string;
  @ApiProperty({ format: "uuid" }) fieldId!: string;
  @ApiProperty() fileName!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty() byteSize!: number;
  @ApiProperty() sha256!: string;
  @ApiProperty({ enum: ["QUARANTINED", "CLEAN", "REJECTED"] })
  scanStatus!: string;
  @ApiProperty({ enum: ["PENDING", "CONFIRMED", "ABANDONED"] }) status!: string;
  @ApiProperty({ nullable: true }) confirmedAt!: string | null;
}

export class SignatureResultDto {
  @ApiProperty({ format: "uuid" }) signatureId!: string;
  @ApiProperty({ format: "uuid" }) fileId!: string;
  @ApiProperty() contentDigest!: string;
  @ApiProperty() signedAt!: string;
}

@Injectable()
export class FilesStorage {
  async scan(data: Buffer) {
    await scanBytes(data);
  }
  async put(
    bucket: string,
    key: string,
    data: Buffer,
    mimeType: string,
  ): Promise<void> {
    const client = storageClient();
    const { data: info, error: bucketError } =
      await client.storage.getBucket(bucket);
    if (bucketError || !info || info.public)
      throw new ServiceUnavailableException(
        "Configure the private storage bucket before uploading.",
      );
    const { error } = await client.storage
      .from(bucket)
      .upload(key, data, { contentType: mimeType, upsert: false });
    if (error) {
      // A retry after a database rollback can reuse only exactly identical bytes.
      const { data: old } = await client.storage.from(bucket).download(key);
      if (!old || !Buffer.from(await old.arrayBuffer()).equals(data))
        throw new ConflictException(
          "Storage write failed or object already contains different bytes.",
        );
    }
  }
  async get(bucket: string, key: string): Promise<Buffer> {
    const client = storageClient();
    const { data: info, error: bucketError } =
      await client.storage.getBucket(bucket);
    if (bucketError || !info || info.public)
      throw new ServiceUnavailableException(
        "Private storage bucket is unavailable.",
      );
    const { data, error } = await client.storage.from(bucket).download(key);
    if (error || !data)
      throw new NotFoundException("Stored file content was not found.");
    return Buffer.from(await data.arrayBuffer());
  }
}

export function inspectFileHeader(
  buffer: Buffer,
  purpose: string,
  declaredMime: string,
): { clean: boolean; actualMime: string; reason?: string } {
  if (buffer.length === 0) {
    return { clean: false, actualMime: declaredMime, reason: "Empty file." };
  }

  // Reject SVG and script injections
  const headText = buffer
    .subarray(0, Math.min(buffer.length, 2048))
    .toString("utf8");
  if (
    /<\s*svg/i.test(headText) ||
    /<\s*\?xml/i.test(headText) ||
    /<\s*script/i.test(headText) ||
    /<\s*html/i.test(headText)
  ) {
    return {
      clean: false,
      actualMime: "application/octet-stream",
      reason: "Executable, SVG, or script content is strictly prohibited.",
    };
  }

  // Check magic bytes
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;

  // JPEG: FF D8 FF
  const isJpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;

  // PDF: 25 50 44 46 (%PDF)
  const isPdf =
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46;

  if (purpose === "SIGNATURE_IMAGE") {
    if (!isPng && !isJpeg) {
      return {
        clean: false,
        actualMime: "application/octet-stream",
        reason: "Signatures must be valid PNG or JPEG images.",
      };
    }
    return { clean: true, actualMime: isPng ? "image/png" : "image/jpeg" };
  }

  if (isPng) return { clean: true, actualMime: "image/png" };
  if (isJpeg) return { clean: true, actualMime: "image/jpeg" };
  if (isPdf) return { clean: true, actualMime: "application/pdf" };

  return {
    clean: false,
    actualMime: declaredMime,
    reason: "Only verified PDF, PNG, or JPEG documents are permitted.",
  };
}

@Injectable()
export class FilesService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(FilesStorage) private storage: FilesStorage,
  ) {}

  private async assignment(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
  ) {
    const a = await tx.formAssignment.findUnique({
      where: { id },
      include: {
        formVersion: true,
        onboardingCase: { include: { employee: true } },
      },
    });
    if (!a) throw new NotFoundException("Assigned form not found.");
    if (a.onboardingCase.status !== "ACTIVE")
      throw new ConflictException("This onboarding case is closed.");
    if (
      a.formVersion.recipient !== "EMPLOYEE" ||
      a.onboardingCase.employee.userId !== userId
    )
      throw new ForbiddenException("You cannot access this assignment.");
    return a;
  }

  async createUploadIntent(
    userId: string,
    assignmentId: string,
    input: unknown,
  ): Promise<UploadIntentDto> {
    const p = uploadIntentSchema.parse(input);
    return this.db.$transaction(async (tx) => {
      const a = await this.assignment(tx, userId, assignmentId);
      const fields = formContentSchema.parse(a.formVersion).fields;
      const field = fields.find((f) => f.id === p.fieldId);
      if (!field || !["file", "passport_photo", "signature"].includes(field.type)) {
        throw new BadRequestException("Invalid field for upload.");
      }

      if ((field.type !== "file" && field.type !== "passport_photo") || p.purpose !== (field.type === "passport_photo" ? "SUPPORTING_DOCUMENT" : field.attachmentPurpose))
        throw new BadRequestException(
          "Upload purpose does not match the field.",
        );
      if (field.type === "passport_photo" &&
          !["image/jpeg", "image/png"].includes(p.mimeType)) {
        throw new BadRequestException("Passport photos must be JPEG or PNG images.");
      }
      const response = await tx.employeeResponse.findUnique({
        where: { assignmentId },
      });
      if (["SUBMITTED", "APPROVED"].includes(response?.status ?? ""))
        throw new ConflictException("Response is locked.");
      const existing = await tx.storedFile.findUnique({
        where: {
          assignmentId_requestKey: {
            assignmentId,
            requestKey: p.requestKey,
          },
        },
      });
      if (existing) {
        if (
          existing.uploadedBy !== userId ||
          existing.fieldId !== p.fieldId ||
          existing.purpose !== p.purpose ||
          existing.fileName !== p.fileName.slice(0, 200)
        ) {
          throw new ConflictException(
            "This request key was used for another intent.",
          );
        }
        return {
          fileId: existing.id,
          requestKey: existing.requestKey,
          storageKey: existing.storageKey,
          expiresAt: existing.expiresAt.toISOString(),
        };
      }

      const fileId = randomUUID();
      const storageKey = `quarantine/${assignmentId}/${fileId}.bin`;
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      const file = await tx.storedFile.create({
        data: {
          id: fileId,
          assignmentId,
          fieldId: p.fieldId,
          uploadedBy: userId,
          purpose: p.purpose,
          bucket: "nolt-private-documents",
          storageKey,
          fileName: p.fileName.slice(0, 200),
          mimeType: p.mimeType,
          byteSize: p.byteSize,
          sha256: "0".repeat(64), // Pending upload
          scanStatus: "QUARANTINED",
          status: "PENDING",
          requestKey: p.requestKey,
          expiresAt,
        },
      });

      return {
        fileId: file.id,
        requestKey: file.requestKey,
        storageKey: file.storageKey,
        expiresAt: file.expiresAt.toISOString(),
      };
    });
  }

  async uploadFile(
    userId: string,
    assignmentId: string,
    fileId: string,
    input: unknown,
  ): Promise<StoredFileDto> {
    const p = uploadPayloadSchema.parse(input);
    return this.db.$transaction(
      async (tx) => {
        await this.assignment(tx, userId, assignmentId);
        const response = await tx.employeeResponse.findUnique({
          where: { assignmentId },
        });
        if (["SUBMITTED", "APPROVED"].includes(response?.status ?? ""))
          throw new ConflictException("Response is locked.");
        await tx.$queryRaw`SELECT id FROM public."StoredFile" WHERE id=${fileId}::uuid FOR UPDATE`;
        const file = await tx.storedFile.findUnique({
          where: { id: fileId },
        });
        if (!file || file.assignmentId !== assignmentId) {
          throw new NotFoundException("Upload intent not found.");
        }
        if (file.uploadedBy !== userId) {
          throw new ForbiddenException("You cannot upload to this intent.");
        }
        if (file.status === "CONFIRMED") {
          return {
            fileId: file.id,
            assignmentId: file.assignmentId,
            fieldId: file.fieldId,
            fileName: file.fileName,
            mimeType: file.mimeType,
            byteSize: file.byteSize,
            sha256: file.sha256,
            scanStatus: file.scanStatus as StoredFileDto["scanStatus"],
            status: file.status as StoredFileDto["status"],
            confirmedAt: file.confirmedAt
              ? file.confirmedAt.toISOString()
              : null,
          };
        }
        if (file.status === "ABANDONED") {
          throw new GoneException("This upload intent was abandoned.");
        }
        if (new Date() > file.expiresAt) {
          await tx.storedFile.update({
            where: { id: fileId },
            data: { status: "ABANDONED" },
          });
          throw new GoneException("This upload intent has expired.");
        }

        // Decode and verify bytes
        let buffer: Buffer;
        try {
          buffer = decodePayload(p.payloadBase64);
        } catch {
          throw new BadRequestException("Invalid base64 payload.");
        }

        if (buffer.length > 10 * 1024 * 1024) {
          throw new BadRequestException(
            "File exceeds maximum allowed size (10MB).",
          );
        }

        const scan = inspectFileHeader(buffer, file.purpose, file.mimeType);
        if (scan.clean) {
        if (buffer.length !== file.byteSize || scan.actualMime !== file.mimeType)
          throw new BadRequestException("Uploaded bytes do not match the declared size or MIME type.");
          await this.storage.scan(buffer);
          if (scan.actualMime.startsWith("image/")) {
            buffer = await normaliseImage(buffer);
            scan.actualMime = "image/png";
            await this.storage.scan(buffer);
          }
        }
        if (buffer.length > 10 * 1024 * 1024) throw new BadRequestException("Normalised file exceeds the size limit.");
      const sha256 = createHash("sha256").update(buffer).digest("hex");

        if (!scan.clean) {
          await tx.storedFile.update({
            where: { id: fileId },
            data: {
              scanStatus: "REJECTED",
              scanReason: scan.reason ?? "Security scan failed.",
              status: "ABANDONED",
              sha256,
              byteSize: buffer.length,
            },
          });
          throw new BadRequestException({
            message: scan.reason ?? "Security verification failed for file.",
          });
        }

        // Persist in private storage
        await this.storage.put(
          file.bucket,
          file.storageKey,
          buffer,
          scan.actualMime,
        );

        const confirmed = await tx.storedFile.update({
          where: { id: fileId },
          data: {
            mimeType: scan.actualMime,
            byteSize: buffer.length,
            sha256,
            scanStatus: "CLEAN",
            status: "CONFIRMED",
            confirmedAt: new Date(),
          },
        });

        await tx.auditEvent.create({
          data: {
            actorId: userId,
            action: "FILE_UPLOAD_CONFIRMED",
            targetId: fileId,
            metadata: {
              assignmentId,
              fieldId: file.fieldId,
              sha256,
              byteSize: buffer.length,
              mimeType: scan.actualMime,
            },
          },
        });

        await tx.outboxEvent.create({
          data: { type: "FILE_UPLOAD_CONFIRMED", targetId: fileId },
        });
        return {
          fileId: confirmed.id,
          assignmentId: confirmed.assignmentId,
          fieldId: confirmed.fieldId,
          fileName: confirmed.fileName,
          mimeType: confirmed.mimeType,
          byteSize: confirmed.byteSize,
          sha256: confirmed.sha256,
          scanStatus: confirmed.scanStatus as StoredFileDto["scanStatus"],
          status: confirmed.status as StoredFileDto["status"],
          confirmedAt: confirmed.confirmedAt!.toISOString(),
        };
      },
      { timeout: 45000, maxWait: 10000 },
    );
  }

  async captureSignature(
    userId: string,
    assignmentId: string,
    input: unknown,
  ): Promise<SignatureResultDto> {
    const p = signatureIntentSchema.parse(input);
    return this.db.$transaction(
      async (tx) => {
        const a = await this.assignment(tx, userId, assignmentId);
        const fields = formContentSchema.parse(a.formVersion).fields;
        const field = fields.find((f) => f.id === p.fieldId);
        if (!field || field.type !== "signature") {
          throw new BadRequestException("Invalid field for signature.");
        }

        if (
          (field.signatureMethod === "DRAW" && p.signingMethod !== "DRAWN") ||
          (field.signatureMethod === "UPLOAD" &&
            p.signingMethod !== "UPLOADED") ||
          p.signingMethod === "TYPED"
        )
          throw new BadRequestException(
            "Signing method is not permitted by this form. Keyboard users can attach an image when uploads are enabled.",
          );
        if (p.consentVersion !== SIGNATURE_CONSENT_VERSION)
          throw new BadRequestException(
            "Reload the current signature confirmation.",
          );
        await tx.$queryRaw`SELECT c.id FROM public."OnboardingCase" c JOIN public."FormAssignment" a ON a."caseId"=c.id WHERE a.id=${assignmentId}::uuid FOR UPDATE OF c`;
        // Verify revision matches current draft
        const current = await tx.employeeResponse.findUnique({
          where: { assignmentId },
        });
        if (
          (current?.revision ?? 0) !== p.expectedRevision ||
          current?.status === "SUBMITTED" ||
          current?.status === "APPROVED"
        ) {
          throw new ConflictException(
            "Response changed or is locked. Reload before signing.",
          );
        }

        // Compute content digest over current non-signature answers
        const currentAnswers = (current?.answers ?? {}) as Record<
          string,
          string | boolean | null
        >;
        const contentDigest = digest(
          "answers:" + canonicalAnswersJson(fields, currentAnswers),
        );

        const prior = await tx.storedFile.findUnique({
          where: {
            assignmentId_requestKey: { assignmentId, requestKey: p.requestKey },
          },
          include: { signature: true },
        });
        if (prior) {
          const evidence = prior.signature;
          if (
            !evidence ||
            evidence.signerId !== userId ||
            evidence.fieldId !== p.fieldId ||
            evidence.sourceRevision !== p.expectedRevision ||
            evidence.contentDigest !== contentDigest ||
            evidence.signingMethod !== p.signingMethod
          )
            throw new ConflictException(
              "Signature request key was already used for different evidence.",
            );
          return {
            signatureId: evidence.id,
            fileId: prior.id,
            contentDigest,
            signedAt: evidence.signedAt.toISOString(),
          };
        }
        // Decode and verify signature image
        let buffer: Buffer;
        try {
          const raw = p.signatureImageBase64.replace(
            /^data:image\/[a-zA-Z]+;base64,/,
            "",
          );
          buffer = decodePayload(raw);
        } catch {
          throw new BadRequestException("Invalid signature image payload.");
        }

        if (buffer.length < 50 || buffer.length > 2 * 1024 * 1024) {
          throw new BadRequestException("Signature image size is invalid.");
        }

        const scan = inspectFileHeader(buffer, "SIGNATURE_IMAGE", "image/png");
        if (!scan.clean) {
          throw new BadRequestException(
            scan.reason ?? "Invalid signature image.",
          );
        }

        await this.storage.scan(buffer);
        buffer = await normaliseImage(buffer);
        await this.storage.scan(buffer);
        scan.actualMime = "image/png";
        const sha256 = createHash("sha256").update(buffer).digest("hex");
        const fileId = randomUUID();
        const storageKey = `signatures/${assignmentId}/${fileId}.png`;

        // Persist in private storage
        await this.storage.put(
          "nolt-private-documents",
          storageKey,
          buffer,
          scan.actualMime,
        );

        // Create confirmed StoredFile record
        const now = new Date();
        await tx.storedFile.create({
          data: {
            id: fileId,
            assignmentId,
            fieldId: p.fieldId,
            uploadedBy: userId,
            purpose: "SIGNATURE_IMAGE",
            bucket: "nolt-private-documents",
            storageKey,
            fileName: `signature-${p.fieldId}.png`,
            mimeType: scan.actualMime,
            byteSize: buffer.length,
            sha256,
            scanStatus: "CLEAN",
            status: "CONFIRMED",
            requestKey: p.requestKey,
            expiresAt: now,
            confirmedAt: now,
          },
        });

        // Create SignatureEvidence record
        const signatureId = randomUUID();
        const evidence = await tx.signatureEvidence.create({
          data: {
            id: signatureId,
            assignmentId,
            formVersionId: a.formVersionId,
            fieldId: p.fieldId,
            signerId: userId,
            signerRole: "EMPLOYEE",
            signingMethod: p.signingMethod,
            consentVersion: p.consentVersion,
            sourceRevision: p.expectedRevision,
            contentDigest,
            fileId,
            signedAt: now,
          },
        });

        await tx.auditEvent.create({
          data: {
            actorId: userId,
            action: "SIGNATURE_CAPTURED",
            targetId: evidence.id,
            metadata: {
              assignmentId,
              fieldId: p.fieldId,
              signingMethod: p.signingMethod,
              contentDigest,
              sourceRevision: p.expectedRevision,
            },
          },
        });

        await tx.outboxEvent.create({
          data: { type: "SIGNATURE_CAPTURED", targetId: evidence.id },
        });
        return {
          signatureId: evidence.id,
          fileId,
          contentDigest,
          signedAt: evidence.signedAt.toISOString(),
        };
      },
      { timeout: 45000, maxWait: 10000 },
    );
  }

  async downloadFile(
    userId: string,
    fileId: string,
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    // Signatures store a SignatureEvidence ID in form answers, not a StoredFile ID.
    const signature = await this.db.signatureEvidence.findUnique({
      where: { id: fileId }, select: { fileId: true },
    });
    const resolvedFileId = signature?.fileId ?? fileId;
    const file = await this.db.storedFile.findUnique({
      where: { id: resolvedFileId },
      include: {
        assignment: {
          include: {
            onboardingCase: { include: { employee: true } },
          },
        },
      },
    });
    if (!file) throw new NotFoundException("File not found.");

    if (file.status !== "CONFIRMED" || file.scanStatus !== "CLEAN") {
      throw new ForbiddenException(
        "File is currently in quarantine or was rejected.",
      );
    }

    const isOwnEmployee =
      file.assignment.onboardingCase.employee.userId === userId;

    if (!isOwnEmployee) {
      // Check reviewer / HR access
      const isReviewer = await this.db.$queryRaw<{ exists: boolean }[]>`
        SELECT public.can_review_assignment(${userId}::uuid, ${file.assignmentId}::uuid) AS exists
      `;
      if (!isReviewer[0]?.exists) {
        throw new ForbiddenException(
          "You are not authorized to access this file.",
        );
      }
    }

    const buffer = await this.storage.get(file.bucket, file.storageKey);
    if (createHash("sha256").update(buffer).digest("hex") !== file.sha256)
      throw new ConflictException(
        "Stored content does not match confirmed evidence.",
      );
    return {
      buffer,
      fileName: file.fileName,
      mimeType: file.mimeType,
    };
  }
}

const openapi = (s: z.ZodType) =>
  z.toJSONSchema(s, { target: "openapi-3.0", io: "input" }) as any;

@ApiTags("File uploads and signatures")
@ApiUnauthorizedResponse({ type: AuthErrorDto })
@ApiForbiddenResponse({ type: AuthErrorDto })
@ApiNotFoundResponse({ type: AuthErrorDto })
@ApiConflictResponse({ type: AuthErrorDto })
@UseGuards(SessionGuard)
@Controller()
export class FilesController {
  constructor(@Inject(FilesService) private service: FilesService) {}

  @Post("me/assignments/:id/files/intent")
  @ApiBody({ schema: openapi(uploadIntentSchema) })
  @ApiCreatedResponse({ type: UploadIntentDto })
  createIntent(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() b: unknown,
  ) {
    return this.service.createUploadIntent(r.actor.id, id, b);
  }

  @Post("me/assignments/:id/files/:fileId/upload")
  @ApiBody({ schema: openapi(uploadPayloadSchema) })
  @ApiCreatedResponse({ type: StoredFileDto })
  uploadFile(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("fileId", ParseUUIDPipe) fileId: string,
    @Body() b: unknown,
  ) {
    return this.service.uploadFile(r.actor.id, id, fileId, b);
  }

  @Post("me/assignments/:id/signatures")
  @ApiBody({ schema: openapi(signatureIntentSchema) })
  @ApiCreatedResponse({ type: SignatureResultDto })
  captureSignature(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() b: unknown,
  ) {
    return this.service.captureSignature(r.actor.id, id, b);
  }

  @Get("files/:id/preview")
  @ApiOkResponse({ description: "Authenticated inline preview of a clean PDF or image" })
  async preview(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { buffer, fileName, mimeType } = await this.service.downloadFile(r.actor.id, id);
    if (!["application/pdf", "image/png", "image/jpeg"].includes(mimeType))
      throw new ForbiddenException("This attachment cannot be previewed.");
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.send(buffer);
  }

  @Get("files/:id/download")
  @ApiOkResponse({ description: "Streams raw file content" })
  async download(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { buffer, fileName, mimeType } = await this.service.downloadFile(
      r.actor.id,
      id,
    );
    res.setHeader("Content-Type", mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(buffer);
  }
}
