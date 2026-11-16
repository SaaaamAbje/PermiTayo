"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ScanSearch } from "lucide-react";
import { runQueuedVerificationAction } from "@/lib/verification/actions";
import { Button } from "@/components/ui/Button";

/**
 * Runs every queued check of an application, one document per request, in sequence.
 * Leaving the page stops the loop; unfinished checks stay queued (or are reclaimed
 * after 10 minutes if one was mid-way).
 */
export function RunQueuedChecks({ applicationId, queued }: { applicationId: string; queued: { verificationId: string; label: string }[] }) {
  const router = useRouter();
  const [index, setIndex] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  async function runAll() {
    setErrors([]);
    const errs: string[] = [];
    for (let i = 0; i < queued.length; i++) {
      setIndex(i);
      const r = await runQueuedVerificationAction({ verificationId: queued[i].verificationId, applicationId });
      if (!r.ok) errs.push(`${queued[i].label}: ${r.error}`);
    }
    setIndex(null);
    setErrors(errs);
    router.refresh();
  }

  if (queued.length === 0) return null;
  const busy = index !== null;
  return (
    <div className="space-y-2">
      <Button onClick={runAll} disabled={busy} aria-busy={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ScanSearch className="h-4 w-4" aria-hidden="true" />}
        {busy ? `Checking ${index! + 1} of ${queued.length}: ${queued[index!].label}` : `Run automated checks (${queued.length} waiting)`}
      </Button>
      {busy ? <p role="status" className="text-xs text-slate-500">Each document can take up to a minute. Keep this page open.</p> : null}
      {errors.length > 0 ? (
        <ul role="alert" className="list-disc space-y-1 pl-5 text-sm text-red-600">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
