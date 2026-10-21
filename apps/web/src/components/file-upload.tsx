"use client";
import React, { useState, useEffect } from "react";
import { FileUp, CheckCircle2, X, AlertCircle, Camera } from "lucide-react";
import { Button } from "./ui/button";
import { api, errorMessage } from "@nolt/api-client";
import { useAuth } from "./auth-provider";

interface FileUploadProps {
  assignmentId: string;
  /** Set for guarantor and reference forms, which use their own session. */
  externalCsrfToken?: string;
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
  if (file.size < 300_000) return file;
  if (typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { return file; }
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, file.type === "image/png" ? "image/png" : "image/jpeg", 0.86));
    if (!blob || blob.size >= file.size) return file;
    const ext = file.type === "image/png" ? ".png" : ".jpg";
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ext, { type: file.type });
  } finally { bitmap.close(); }
}

export function FileUpload({
  assignmentId,
  externalCsrfToken,
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
  const [phase, setPhase] = useState<"preparing" | "uploading" | "verifying" | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    setFileId(existingFileId || null);
  }, [existingFileId]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const handleSelectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const csrf = externalCsrfToken ?? session?.csrfToken;
    if (!file || !csrf) return;

    if (file.size > (file.type.startsWith("image/") ? 25 : 5) * 1024 * 1024) {
      setError("This file is too big. Photos are shrunk for you, but a PDF must be under 5 MB.");
      return;
    }
    if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type)) {
      setError("Please choose a JPG, PNG or PDF file.");
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
    setPhase("preparing");
    setError("");

    try {
      // Resize photographs before transfer; backend still independently validates and scans.
      const prepared = file.type === "image/jpeg" || file.type === "image/png"
        ? await compressImage(file)
        : file;
      if (prepared.size > 5 * 1024 * 1024) throw new Error("This file is still over 5 MB. Please use a smaller photo or PDF.");
      setPhase("uploading");
      // 1. Create upload intent
      const intentBody = {
        fieldId,
        purpose,
        fileName: prepared.name,
        mimeType: prepared.type || "application/octet-stream",
        byteSize: prepared.size,
        requestKey: crypto.randomUUID(),
      };
      const headers = { "x-csrf-token": csrf };
      const intentRes = externalCsrfToken
        ? await api.POST("/api/v1/external/request/files/intent", { headers, body: intentBody })
        : await api.POST("/api/v1/me/assignments/{id}/files/intent", {
            params: { path: { id: assignmentId } },
            headers,
            body: intentBody,
          });

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

      setPhase("verifying");
      // 3. Upload and confirm
      const uploadBody = { requestKey: crypto.randomUUID(), payloadBase64 };
      const uploadRes = externalCsrfToken
        ? await api.POST("/api/v1/external/request/files/{fileId}/upload", {
            params: { path: { fileId: newFileId } },
            headers,
            body: uploadBody,
          })
        : await api.POST("/api/v1/me/assignments/{id}/files/{fileId}/upload", {
            params: { path: { id: assignmentId, fileId: newFileId } },
            headers,
            body: uploadBody,
          });

      if (uploadRes.error) {
        throw new Error(errorMessage(uploadRes.error));
      }

      setFileId(newFileId);
      setFileName(file.name);
      setPreviewUrl(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
      onUploaded(newFileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      setPhase(null);
    }
  };

  const handleRemove = () => {
    setFileId(null);
    setFileName("");
    setPreviewUrl(null);
    setError("");
    onClear();
  };

  if (fileId) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-700 dark:bg-emerald-950/30">
        {previewUrl ? (
          <img src={previewUrl} alt="Uploaded document preview" className="h-16 w-16 flex-none rounded-xl object-cover" />
        ) : (
          <CheckCircle2 className="size-6 flex-none text-emerald-600" />
        )}
        <div className="min-w-0 flex-1 text-sm text-emerald-900 dark:text-emerald-200">
          <p className="truncate font-semibold">{fileName || "Document attached"}</p>
          <p className="text-xs">Uploaded and checked</p>
        </div>
        {!disabled && (
          <Button type="button" variant="outline" size="sm" onClick={handleRemove} className="h-11 flex-none gap-1 px-3">
            <X className="size-4" />
            Replace
          </Button>
        )}
      </div>
    );
  }

  const busyText =
    phase === "preparing" ? "Shrinking the photo…" : phase === "uploading" ? "Uploading safely…" : "Checking the file…";
  const accept = passportPhoto ? "image/jpeg,image/png" : "application/pdf,image/jpeg,image/png";
  return (
    <div className="flex flex-col gap-2">
      <label
        className={`flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-[#a9bde0] bg-[#f7faff] p-4 text-center transition-colors active:bg-[#e6f1ff] dark:bg-muted/20 ${busy || disabled ? "pointer-events-none opacity-70" : ""}`}
      >
        <FileUp className="size-6 text-primary" aria-hidden="true" />
        <span className="text-[15px] font-semibold text-primary">
          {busy ? busyText : passportPhoto ? "Choose a photo" : "Choose a file or take a photo"}
        </span>
        <span className="text-xs text-muted-foreground">
          {passportPhoto ? "JPG or PNG" : "JPG, PNG or PDF"}, up to 5 MB. Big photos are shrunk for you.
        </span>
        <input type="file" accept={accept} disabled={busy || disabled} onChange={handleSelectFile} className="sr-only" />
      </label>
      {!busy && !disabled && (
        <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-input bg-background text-[15px] font-semibold active:bg-muted">
          <Camera className="size-5" aria-hidden="true" />
          Take a photo now
          <input
            type="file"
            accept="image/*"
            capture={passportPhoto ? "user" : "environment"}
            className="sr-only"
            onChange={handleSelectFile}
          />
        </label>
      )}
      {busy && (
        <div className="space-y-1" role="status">
          <div className="h-2 overflow-hidden rounded-full bg-[#d6e4f8]">
            <div className="h-2 animate-pulse rounded-full bg-primary" style={{ width: phase === "preparing" ? "25%" : phase === "uploading" ? "65%" : "90%" }} />
          </div>
          <p className="text-xs text-muted-foreground">Please keep this page open until it finishes.</p>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 size-4 flex-none" />
          <span>{error} You can try again.</span>
        </div>
      )}
    </div>
  );
}
