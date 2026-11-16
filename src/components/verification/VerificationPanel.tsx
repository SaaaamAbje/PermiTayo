import { AlertTriangle, Bot, UserCheck } from "lucide-react";
import type { ChecklistItem } from "@/lib/documents/queries";
import type { StoredFinding } from "@/lib/database.types";
import { formatDateTime } from "@/lib/format";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  EXTRACTION_LABELS,
  OVERALL_EXPLANATIONS,
  OVERALL_LABELS,
  OVERALL_TONES,
  PROCESSING_LABELS,
  SEVERITY_LABELS,
  SEVERITY_RANK,
  SEVERITY_TONES,
} from "@/lib/verification/labels";
import { Badge } from "@/components/ui/Badge";
import { RunCheckButton } from "./RunCheckButton";

const FIELD_LABELS: Record<string, string> = {
  business_name: "Business name",
  owner_name: "Owner name",
  address: "Address",
  business_address: "Business address",
  reference_number: "Reference number",
  issue_date: "Issue date",
  expiry_date: "Expiry date",
  document_type: "Document type",
};
const fieldLabel = (f: string | null) => (f ? FIELD_LABELS[f] ?? f.replace(/_/g, " ") : null);

function FindingItem({ f }: { f: StoredFinding }) {
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={SEVERITY_TONES[f.severity]} className={f.severity === "critical" ? "font-bold" : undefined}>
          {SEVERITY_LABELS[f.severity]}
        </Badge>
        {fieldLabel(f.field) ? <span className="text-xs font-medium text-slate-500">{fieldLabel(f.field)}</span> : null}
        {f.source_page ? <span className="text-xs text-slate-500">· page {f.source_page}</span> : null}
        <span className="ml-auto text-[11px] uppercase tracking-wide text-slate-400">{f.source === "ai" ? "AI observation" : "Rule check"}</span>
      </div>
      <p className="mt-1.5 text-slate-800">{f.description}</p>
      {f.evidence ? <p className="mt-1 text-xs text-slate-600"><span className="font-medium">Evidence:</span> {f.evidence}</p> : null}
      <p className="mt-1 text-xs text-slate-600"><span className="font-medium">Suggested action:</span> {f.recommendation}</p>
    </li>
  );
}

/**
 * BPLO-only panel with the latest automated check of the current document version.
 * Advisory: the official decision is the manual review form below it.
 */
export function VerificationPanel({ item, applicationId, canRun, aiConfigured }: { item: ChecklistItem; applicationId: string; canRun: boolean; aiConfigured: boolean }) {
  const current = item.current;
  if (!current) return null;
  const attempts = item.verifications[current.id] ?? [];
  const latest = attempts[0];
  const shown = attempts.find((a) => a.processing_status === "completed");
  const findings = [...(shown?.findings ?? [])].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const grouped = CATEGORY_ORDER.map((c) => ({ category: c, items: findings.filter((f) => f.category === c) })).filter((g) => g.items.length > 0);
  const stale = item.latestCheckStale;

  return (
    <section aria-label={`Automated check for ${item.requirement.name}`} className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-brand-900">
          <Bot className="h-4 w-4" aria-hidden="true" /> Automated check (advisory)
          {latest ? <Badge tone="neutral">{PROCESSING_LABELS[latest.processing_status]}{latest.attempt_number > 1 ? ` · attempt ${latest.attempt_number}` : ""}</Badge> : null}
        </p>
        {canRun ? (
          latest?.processing_status === "queued" || stale ? (
            <RunCheckButton applicationId={applicationId} documentId={current.id} queuedVerificationId={latest!.id} label={stale ? "Resume check" : "Run check"} />
          ) : latest?.processing_status === "processing" ? null : (
            <RunCheckButton applicationId={applicationId} documentId={current.id} label={latest ? "Re-run check" : "Run check"} />
          )
        ) : null}
      </div>

      {!aiConfigured ? (
        <p className="text-xs text-amber-800">AI analysis is not configured on the server (GEMINI_API_KEY). Checks still read digital PDFs and run file and readability rules, but results will be inconclusive.</p>
      ) : null}

      {latest?.processing_status === "failed" ? (
        <p role="note" className="flex gap-2 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          The last attempt failed: {latest.error_message ?? latest.error_code}. Earlier results, if any, are shown below. You can re-run the check.
        </p>
      ) : null}
      {latest?.processing_status === "processing" && !stale ? <p className="text-sm text-slate-600">A check is running. Refresh the page in a minute.</p> : null}

      {shown ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={OVERALL_TONES[shown.overall_result!]} className="text-sm">{OVERALL_LABELS[shown.overall_result!]}</Badge>
            <span className="text-xs text-slate-600">{OVERALL_EXPLANATIONS[shown.overall_result!]}</span>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-xs text-slate-500">File</dt><dd className="break-words font-medium text-slate-900">{current.original_filename}</dd></div>
            <div><dt className="text-xs text-slate-500">Expected document</dt><dd className="font-medium text-slate-900">{shown.expected_document_type ?? item.requirement.name}</dd></div>
            <div>
              <dt className="text-xs text-slate-500">Detected document (AI)</dt>
              <dd className="font-medium text-slate-900">
                {shown.detected_document_type ?? "Not determined"}
                {shown.classification_match === false ? <Badge tone="danger" className="ml-1.5">Possible mismatch</Badge> : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">AI confidence</dt>
              <dd className="font-medium text-slate-900">{shown.confidence_score === null ? "Not available" : `${Math.round(shown.confidence_score * 100)}%`} <span className="text-xs font-normal text-slate-500">(informational)</span></dd>
            </div>
            <div><dt className="text-xs text-slate-500">Text source</dt><dd className="font-medium text-slate-900">{EXTRACTION_LABELS[shown.extraction_method ?? "none"]}{shown.page_count ? ` · ${shown.page_count} page${shown.page_count === 1 ? "" : "s"}` : ""}</dd></div>
            <div><dt className="text-xs text-slate-500">Checked</dt><dd className="font-medium text-slate-900">{shown.processed_at ? formatDateTime(shown.processed_at) : ""}</dd></div>
            <div><dt className="text-xs text-slate-500">Engine</dt><dd className="font-medium text-slate-900">{shown.ai_provider ? `${shown.ai_provider} · ${shown.ai_model}` : "Rules only"}</dd></div>
            {shown !== latest && latest ? <div><dt className="text-xs text-slate-500">Showing</dt><dd className="font-medium text-slate-900">Attempt {shown.attempt_number} (latest completed)</dd></div> : null}
          </dl>

          {shown.summary ? <p className="whitespace-pre-line text-sm text-slate-700">{shown.summary}</p> : null}

          {grouped.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">Findings ({findings.length})</h3>
              {grouped.map((g) => (
                <div key={g.category}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{CATEGORY_LABELS[g.category]}</p>
                  <ul className="space-y-2">{g.items.map((f, i) => <FindingItem key={`${g.category}-${i}`} f={f} />)}</ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600">No findings.</p>
          )}

          {shown.extracted_fields.length > 0 ? (
            <details className="rounded-lg border border-slate-200 bg-white">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-brand-700">Extracted information ({shown.extracted_fields.length})</summary>
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Information read from the document</caption>
                <thead><tr className="border-y border-slate-100 bg-slate-50 text-xs text-slate-500"><th scope="col" className="px-3 py-2">Field</th><th scope="col" className="px-3 py-2">Value read from the document</th><th scope="col" className="px-3 py-2">Page</th><th scope="col" className="px-3 py-2">Confidence</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.extracted_fields.map((f, i) => (
                    <tr key={`${f.field}-${i}`}><td className="px-3 py-2 text-slate-500">{fieldLabel(f.field)}</td><td className="break-words px-3 py-2 text-slate-900">{f.value || "—"}</td><td className="px-3 py-2">{f.source_page ?? "—"}</td><td className="px-3 py-2">{Math.round(f.confidence * 100)}%</td></tr>
                  ))}
                </tbody>
              </table>
            </details>
          ) : null}

          {item.extractedText && item.extractedText.length > 0 ? (
            <details className="rounded-lg border border-slate-200 bg-white">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-brand-700">Extracted text (sensitive, BPLO only)</summary>
              <div className="max-h-80 space-y-3 overflow-y-auto border-t border-slate-100 px-3 py-2">
                {item.extractedText.map((p) => (
                  <div key={p.page}>
                    <p className="text-xs font-semibold text-slate-500">Page {p.page} · {p.source === "ocr" ? "OCR" : "PDF text"}</p>
                    <pre className="whitespace-pre-wrap break-words font-sans text-xs text-slate-700">{p.text || "[no readable text]"}</pre>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : !latest || latest.processing_status === "queued" ? (
        <p className="text-sm text-slate-600">Not checked yet.</p>
      ) : null}

      {attempts.length > 1 ? (
        <details className="text-xs text-slate-600">
          <summary className="cursor-pointer font-medium text-brand-700">All attempts ({attempts.length})</summary>
          <ul className="mt-1 space-y-0.5 pl-4">
            {attempts.map((a) => (
              <li key={a.id}>
                Attempt {a.attempt_number}: {PROCESSING_LABELS[a.processing_status]}
                {a.overall_result ? ` · ${OVERALL_LABELS[a.overall_result]}` : ""}
                {a.error_code ? ` · ${a.error_code}` : ""}
                {a.processed_at ? ` · ${formatDateTime(a.processed_at)}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
        Suggestions only. Automated checks cannot confirm that a document, signature or seal is genuine. You make the decision below.
      </p>
    </section>
  );
}
