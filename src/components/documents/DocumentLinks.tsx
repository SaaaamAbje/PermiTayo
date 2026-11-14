"use client";

import { useState } from "react";
import { Download, Eye, Loader2 } from "lucide-react";
import { getDocumentLinkAction } from "@/lib/documents/actions";
import { Button } from "@/components/ui/Button";

/** View / download buttons. Each click asks the server for a 60-second signed link. */
export function DocumentLinks({ documentId, label }: { documentId: string; label: string }) {
  const [busy, setBusy] = useState<"view" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open(mode: "view" | "download") {
    setError(null);
    setBusy(mode);
    // Open the tab synchronously so pop-up blockers allow it, then point it at the signed link.
    const tab = mode === "view" ? window.open("", "_blank") : null;
    if (tab) tab.opener = null;
    const result = await getDocumentLinkAction({ documentId, mode });
    setBusy(null);
    if (!result.ok) {
      tab?.close();
      setError(result.error);
      return;
    }
    if (tab) tab.location.href = result.url;
    else window.location.href = result.url;
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Button variant="ghost" size="sm" onClick={() => open("view")} disabled={busy !== null} aria-label={`View ${label}`}>
        {busy === "view" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />} View
      </Button>
      <Button variant="ghost" size="sm" onClick={() => open("download")} disabled={busy !== null} aria-label={`Download ${label}`}>
        {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />} Download
      </Button>
      {error ? <span role="alert" className="text-xs font-medium text-red-600">{error}</span> : null}
    </span>
  );
}
