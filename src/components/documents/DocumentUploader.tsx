"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Upload } from "lucide-react";
import { finalizeDocumentUploadAction, prepareDocumentUploadAction } from "@/lib/documents/actions";
import { acceptAttribute, formatAcceptedTypes, formatFileSize } from "@/lib/documents/constants";
import type { DocumentMimeType } from "@/lib/database.types";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/Progress";

type Phase = "idle" | "checking" | "uploading" | "saving" | "done";

/** Browser-reported type, falling back to the extension (some systems report an empty type). */
function guessType(file: File): DocumentMimeType | null {
  const t = file.type.toLowerCase();
  if (t === "application/pdf" || t === "image/png" || t === "image/jpeg") return t;
  if (t === "image/jpg") return "image/jpeg";
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return null;
}

/** PUT the file to the one-time signed URL so we can report progress. */
function putWithProgress(url: string, file: File, contentType: string, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (anon) xhr.setRequestHeader("apikey", anon);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(String(xhr.status))));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });
}

/**
 * Upload or replace one requirement's document. Checks in the browser are for
 * quick feedback only; the server and database check everything again.
 */
export function DocumentUploader({
  applicationId,
  requirementId,
  requirementName,
  acceptedTypes,
  maxFileSize,
  mode,
}: {
  applicationId: string;
  requirementId: string;
  requirementName: string;
  acceptedTypes: DocumentMimeType[];
  maxFileSize: number;
  mode: "upload" | "replace" | "resubmit";
}) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const busy = phase === "checking" || phase === "uploading" || phase === "saving";

  function reset() {
    if (inputRef.current) inputRef.current.value = "";
    setPending(null);
  }

  function onPick(file: File | undefined) {
    setError(null);
    setPhase("idle");
    if (!file) return;
    const type = guessType(file);
    if (!type || !acceptedTypes.includes(type)) {
      setError(`That file type is not accepted. Use ${formatAcceptedTypes(acceptedTypes)}.`);
      reset();
      return;
    }
    if (file.size === 0) {
      setError("That file is empty.");
      reset();
      return;
    }
    if (file.size > maxFileSize) {
      setError(`That file is ${formatFileSize(file.size)}. The limit for this requirement is ${formatFileSize(maxFileSize)}.`);
      reset();
      return;
    }
    if (mode === "replace") {
      setPending(file);
      confirmRef.current?.showModal();
      return;
    }
    void upload(file);
  }

  async function upload(file: File) {
    const type = guessType(file)!;
    setError(null);
    setProgress(0);
    setPhase("checking");
    try {
      const prepared = await prepareDocumentUploadAction({
        applicationId,
        requirementId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: type,
      });
      if (!prepared.ok) {
        setError(prepared.error);
        setPhase("idle");
        return;
      }
      setPhase("uploading");
      try {
        await putWithProgress(prepared.signedUrl, file, type, setProgress);
      } catch {
        setError("The upload failed. Check your internet connection and try again.");
        setPhase("idle");
        return;
      }
      setPhase("saving");
      const saved = await finalizeDocumentUploadAction({ applicationId, requirementId, path: prepared.path, fileName: file.name });
      if (!saved.ok) {
        setError(saved.error);
        setPhase("idle");
        return;
      }
      setPhase("done");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setPhase("idle");
    } finally {
      reset();
    }
  }

  const label = mode === "upload" ? "Upload document" : mode === "resubmit" ? "Upload corrected document" : "Replace document";

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={acceptAttribute(acceptedTypes)}
        className="sr-only"
        disabled={busy}
        onChange={(e) => onPick(e.target.files?.[0])}
        aria-label={`${label}: ${requirementName}`}
      />
      <Button
        variant={mode === "replace" ? "secondary" : "primary"}
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        aria-busy={busy}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
        {phase === "checking" ? "Checking…" : phase === "uploading" ? `Uploading ${progress}%` : phase === "saving" ? "Saving…" : label}
      </Button>
      {phase === "uploading" ? <ProgressBar value={progress} label={`Uploading ${requirementName}`} className="max-w-xs" /> : null}
      <p className="text-xs text-slate-500">
        {formatAcceptedTypes(acceptedTypes)} · up to {formatFileSize(maxFileSize)}
      </p>
      {phase === "done" ? (
        <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Uploaded. The BPLO will review it.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}

      <dialog
        ref={confirmRef}
        aria-labelledby={`${inputId}-title`}
        onClose={() => setPending(null)}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-raised backdrop:bg-slate-900/50"
      >
        <h2 id={`${inputId}-title`} className="text-lg font-semibold text-slate-900">Replace this document?</h2>
        <p className="mt-2 text-sm text-slate-600">
          {pending ? <><span className="font-medium text-slate-800">{pending.name}</span> will become the current file for </> : "The new file will become the current file for "}
          <span className="font-medium text-slate-800">{requirementName}</span>. The previous file is kept in the history.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              confirmRef.current?.close();
              reset();
            }}
          >
            Keep current file
          </Button>
          <Button
            onClick={() => {
              const file = pending;
              confirmRef.current?.close();
              if (file) void upload(file);
            }}
          >
            Replace
          </Button>
        </div>
      </dialog>
    </div>
  );
}
