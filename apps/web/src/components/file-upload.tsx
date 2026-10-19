"use client";
import React, { useState, useEffect } from "react";
import { FileUp, CheckCircle2, X, AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { api, errorMessage } from "@nolt/api-client";
import { useAuth } from "./auth-provider";

interface FileUploadProps {
  assignmentId: string;
  fieldId: string;
  purpose?: "SUPPORTING_DOCUMENT" | "SIGNED_DOCUMENT";
  passportPhoto?: boolean;
  existingFileId?: string | null;
  onUploaded: (fileId: string) => void;
  onClear: () => void;
  disabled?: boolean;
}

// Client-side optimisation reduces mobile data usage; original files are never modified.
async function compressImage(file: File): Promise<File> {
  if (file.size < 350_000) return file;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.84));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } finally { bitmap.close(); }
}

export function FileUpload({
  assignmentId,
  fieldId,
  purpose = "SUPPORTING_DOCUMENT",
  passportPhoto = false,
  existingFileId,
  onUploaded,
  onClear,
  disabled = false,
}: FileUploadProps) {
  const { session } = useAuth();
  const [fileId, setFileId] = useState<string | null>(existingFileId || null);
  const [fileName, setFileName] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setFileId(existingFileId || null);
  }, [existingFileId]);

  const handleSelectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session) return;

    if (file.size > 10 * 1024 * 1024) {
      setError("File exceeds 10MB limit.");
      return;
    }

    // Reject SVG
    if (file.type === "image/svg+xml" || file.name.endsWith(".svg")) {
      setError("SVG files are not permitted for security.");
      return;
    }

    if (passportPhoto && !["image/jpeg", "image/png"].includes(file.type)) {
      setError("Choose a JPEG or PNG passport photograph.");
      return;
    }
    setBusy(true);
    setError("");

    try {
      // Resize photographs before transfer; backend still independently validates and scans.
      const prepared = file.type === "image/jpeg" || file.type === "image/png"
        ? await compressImage(file)
        : file;
      // 1. Create upload intent
      const intentRes = await api.POST(
        "/api/v1/me/assignments/{id}/files/intent",
        {
          params: { path: { id: assignmentId } },
          headers: { "x-csrf-token": session.csrfToken },
          body: {
            fieldId,
            purpose,
            fileName: prepared.name,
            mimeType: prepared.type || "application/octet-stream",
            byteSize: prepared.size,
            requestKey: crypto.randomUUID(),
          },
        },
      );

      if (intentRes.error) {
        throw new Error(errorMessage(intentRes.error));
      }

      const newFileId = intentRes.data.fileId;

      // 2. Read file as base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const res = reader.result as string;
          const base64 = res.includes(",") ? res.split(",")[1] : res;
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(prepared);
      const payloadBase64 = await base64Promise;

      // 3. Upload and confirm
      const uploadRes = await api.POST(
        "/api/v1/me/assignments/{id}/files/{fileId}/upload",
        {
          params: { path: { id: assignmentId, fileId: newFileId } },
          headers: { "x-csrf-token": session.csrfToken },
          body: {
            requestKey: crypto.randomUUID(),
            payloadBase64,
          },
        },
      );

      if (uploadRes.error) {
        throw new Error(errorMessage(uploadRes.error));
      }

      setFileId(newFileId);
      setFileName(file.name);
      onUploaded(newFileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = () => {
    setFileId(null);
    setFileName("");
    setError("");
    onClear();
  };

  if (fileId) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-50/50 p-3 dark:bg-emerald-950/20">
        <div className="flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          <span className="font-medium truncate max-w-xs">
            {fileName || "Document attached & verified"}
          </span>
        </div>
        {!disabled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            className="size-7 p-0 text-muted-foreground hover:text-destructive"
          >
            <X className="size-4" />
            <span className="sr-only">Remove file</span>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-center cursor-pointer hover:bg-muted/30 transition-colors">
        <FileUp className="size-5 text-primary" />
        <span className="text-xs font-medium">
          {busy
            ? "Verifying & uploading document..."
            : purpose === "SIGNED_DOCUMENT"
              ? "Attach signed document (PDF, PNG, JPEG)"
              : passportPhoto ? "Take or upload passport photograph" : "Attach document (PDF, PNG, JPEG)"}
        </span>
        <span className="text-[11px] text-muted-foreground">
          Maximum file size 10MB
        </span>
        <input
          type="file"
          accept={passportPhoto ? "image/jpeg,image/png" : ".pdf,image/png,image/jpeg"}
          disabled={busy || disabled}
          onChange={handleSelectFile}
          className="sr-only"
        />
      </label>
      {passportPhoto && <label className="flex cursor-pointer items-center justify-center rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted/30">Take photo with camera<input type="file" accept="image/jpeg,image/png" capture="user" className="sr-only" disabled={busy || disabled} onChange={handleSelectFile}/></label>}
      {error && (
        <div className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="size-3.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
