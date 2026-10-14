"use client";
import React, { useRef, useState, useEffect } from "react";
import { Pen, Keyboard, Upload, CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { api, errorMessage } from "@nolt/api-client";
import { useAuth } from "./auth-provider";

interface SignaturePadProps {
  assignmentId: string;
  fieldId: string;
  allowedMethod?: "DRAW" | "UPLOAD" | "EITHER";
  expectedRevision: number;
  beforeSign?: () => Promise<number>;
  existingSignatureId?: string | null;
  onSigned: (signatureId: string) => void;
  onClear: () => void;
  disabled?: boolean;
}

export function SignaturePad({
  assignmentId,
  fieldId,
  allowedMethod = "EITHER",
  expectedRevision,
  beforeSign,
  existingSignatureId,
  onSigned,
  onClear,
  disabled = false,
}: SignaturePadProps) {
  const { session } = useAuth();
  const [tab, setTab] = useState<"DRAWN" | "TYPED" | "UPLOADED">(
    allowedMethod === "UPLOAD" ? "UPLOADED" : "DRAWN",
  );
  const [typedName, setTypedName] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [uploadedImageBase64, setUploadedImageBase64] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmedSignatureId, setConfirmedSignatureId] = useState<
    string | null
  >(existingSignatureId || null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setConfirmedSignatureId(existingSignatureId || null);
  }, [existingSignatureId]);

  // Canvas drawing setup
  const getCanvasCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled || confirmedSignatureId) return;
    setIsDrawing(true);
    const point = getCanvasCoordinates(e);
    lastPoint.current = point;
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || disabled || confirmedSignatureId) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !lastPoint.current) return;

    const current = getCanvasCoordinates(e);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(current.x, current.y);
    ctx.stroke();

    lastPoint.current = current;
    setHasDrawn(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    lastPoint.current = null;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasDrawn(false);
    setUploadedImageBase64(null);
    setTypedName("");
    setError("");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setError("Please attach a valid PNG or JPEG image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Signature file must be under 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setUploadedImageBase64(reader.result as string);
      setError("");
    };
    reader.readAsDataURL(file);
  };

  const generateSignatureImage = (): string | null => {
    if (tab === "DRAWN") {
      if (!canvasRef.current || !hasDrawn) return null;
      return canvasRef.current.toDataURL("image/png");
    }
    if (tab === "UPLOADED") {
      return uploadedImageBase64;
    }
    if (tab === "TYPED") {
      if (!typedName.trim()) return null;
      // Render typed signature to offscreen canvas
      const offscreen = document.createElement("canvas");
      offscreen.width = 600;
      offscreen.height = 160;
      const ctx = offscreen.getContext("2d");
      if (!ctx) return null;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, offscreen.width, offscreen.height);
      ctx.fillStyle = "#0f172a";
      ctx.font = "italic 44px cursive, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(typedName.trim(), offscreen.width / 2, offscreen.height / 2);

      return offscreen.toDataURL("image/png");
    }
    return null;
  };

  const handleConfirm = async () => {
    if (!session) return;
    if (!consentConfirmed) {
      setError("You must confirm the legal declaration before signing.");
      return;
    }

    const imageBase64 = generateSignatureImage();
    if (!imageBase64) {
      setError(
        tab === "DRAWN"
          ? "Please draw your signature."
          : tab === "TYPED"
            ? "Please enter your name."
            : "Please attach a signature image.",
      );
      return;
    }

    setBusy(true);
    setError("");

    try {
      const savedRevision = beforeSign ? await beforeSign() : expectedRevision;
      const res = await api.POST("/api/v1/me/assignments/{id}/signatures", {
        params: { path: { id: assignmentId } },
        headers: { "x-csrf-token": session.csrfToken },
        body: {
          fieldId,
          signingMethod: tab,
          consentVersion: "development-confirmation-v1",
          consentConfirmed: true,
          expectedRevision: savedRevision,
          typedName: tab === "TYPED" ? typedName.trim() : undefined,
          signatureImageBase64: imageBase64,
          requestKey: crypto.randomUUID(),
        },
      });

      if (res.error) {
        throw new Error(errorMessage(res.error));
      }

      setConfirmedSignatureId(res.data.signatureId);
      onSigned(res.data.signatureId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to capture signature.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => {
    setConfirmedSignatureId(null);
    clearCanvas();
    setConsentConfirmed(false);
    onClear();
  };

  if (confirmedSignatureId) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-emerald-500/30 bg-emerald-50/50 p-4 dark:bg-emerald-950/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
            Signature recorded and cryptographically bound
          </div>
          {!disabled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="h-8 gap-1 text-xs"
            >
              <RotateCcw className="size-3.5" />
              Re-sign
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Your signature records confirmation of the saved answers.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      {/* Method tabs */}
      <div className="flex gap-1 border-b pb-2">
        {(allowedMethod === "DRAW" || allowedMethod === "EITHER") && (
          <button
            type="button"
            onClick={() => {
              setTab("DRAWN");
              clearCanvas();
            }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === "DRAWN"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <Pen className="size-3.5" />
            Draw
          </button>
        )}
        <p className="text-xs text-muted-foreground">
          Keyboard users can attach a signature image when HR enables uploads.
          Contact HR if this form requires drawing.
        </p>
        {(allowedMethod === "UPLOAD" || allowedMethod === "EITHER") && (
          <button
            type="button"
            onClick={() => {
              setTab("UPLOADED");
              clearCanvas();
            }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === "UPLOADED"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <Upload className="size-3.5" />
            Attach Image
          </button>
        )}
      </div>

      {/* Input area */}
      {tab === "DRAWN" && (
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={600}
            height={160}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className="w-full touch-none rounded border border-dashed bg-white dark:bg-slate-950"
            style={{ height: "140px" }}
            aria-label="Draw your signature using mouse or finger"
          />
          {hasDrawn && (
            <button
              type="button"
              onClick={clearCanvas}
              className="absolute right-2 top-2 rounded bg-muted/80 px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              Clear
            </button>
          )}
          {!hasDrawn && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/60">
              Draw your signature here
            </div>
          )}
        </div>
      )}

      {tab === "TYPED" && (
        <div className="flex flex-col gap-2">
          <Input
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder="Type your official full name"
            aria-label="Type your official full name as signature"
            className="text-sm"
          />
          {typedName.trim() && (
            <div className="flex h-20 items-center justify-center rounded border border-dashed bg-muted/20 font-serif text-2xl italic tracking-wide">
              {typedName.trim()}
            </div>
          )}
        </div>
      )}

      {tab === "UPLOADED" && (
        <div className="flex flex-col items-center justify-center gap-2 rounded border border-dashed p-4 text-center">
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={handleFileUpload}
            className="text-xs"
            aria-label="Attach PNG or JPEG signature image"
          />
          {uploadedImageBase64 && (
            <div className="mt-2 flex max-h-24 items-center justify-center overflow-hidden rounded border bg-white p-2">
              <img
                src={uploadedImageBase64}
                alt="Signature preview"
                className="max-h-20 object-contain"
              />
            </div>
          )}
        </div>
      )}

      {/* Legal consent check */}
      <label className="flex items-start gap-2 pt-1 text-xs text-muted-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={consentConfirmed}
          onChange={(e) => setConsentConfirmed(e.target.checked)}
          className="mt-0.5 size-4 rounded border-gray-300 accent-primary"
        />
        <span>
          I confirm that I am providing this signature for the saved answers.
          This development confirmation does not establish legal equivalence.
        </span>
      </label>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button
        type="button"
        size="sm"
        disabled={busy || disabled || !consentConfirmed}
        onClick={handleConfirm}
        className="w-full text-xs font-semibold"
      >
        {busy ? "Securing signature..." : "Confirm & Apply Signature"}
      </Button>
    </div>
  );
}
