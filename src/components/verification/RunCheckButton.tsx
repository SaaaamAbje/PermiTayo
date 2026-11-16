"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ScanSearch } from "lucide-react";
import { recheckDocumentAction, runQueuedVerificationAction } from "@/lib/verification/actions";
import { OVERALL_LABELS } from "@/lib/verification/labels";
import type { VerificationOverallResult } from "@/lib/database.types";
import { Button } from "@/components/ui/Button";

/** Runs (or re-runs) the automated check for one document. One request per document. */
export function RunCheckButton({
  applicationId,
  documentId,
  queuedVerificationId,
  label,
}: {
  applicationId: string;
  documentId: string;
  /** When set, runs this queued attempt instead of requesting a new one. */
  queuedVerificationId?: string;
  label: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    const result = queuedVerificationId
      ? await runQueuedVerificationAction({ verificationId: queuedVerificationId, applicationId })
      : await recheckDocumentAction({ documentId, applicationId });
    setBusy(false);
    setMessage(
      result.ok
        ? { ok: true, text: `Check finished: ${OVERALL_LABELS[result.overall as VerificationOverallResult] ?? result.overall}.` }
        : { ok: false, text: result.error },
    );
    router.refresh();
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" onClick={run} disabled={busy} aria-busy={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ScanSearch className="h-4 w-4" aria-hidden="true" />}
        {busy ? "Checking… (up to a minute)" : label}
      </Button>
      {message ? (
        <span role={message.ok ? "status" : "alert"} className={message.ok ? "text-xs font-medium text-emerald-700" : "text-xs font-medium text-red-600"}>
          {message.text}
        </span>
      ) : null}
    </span>
  );
}
