import { AlertTriangle, FileText, MessageSquareText } from "lucide-react";
import type { ChecklistData, ChecklistItem } from "@/lib/documents/queries";
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_TONES,
  formatAcceptedTypes,
  formatFileSize,
  type ChecklistStatus,
} from "@/lib/documents/constants";
import type { DbApplicationStatus } from "@/lib/database.types";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/Progress";
import { DocumentLinks } from "./DocumentLinks";
import { DocumentUploader } from "./DocumentUploader";
import { ReviewForm } from "./ReviewForm";

export function DocumentStatusBadge({ status }: { status: ChecklistStatus }) {
  return <Badge tone={DOCUMENT_STATUS_TONES[status]}>{DOCUMENT_STATUS_LABELS[status]}</Badge>;
}

/** Same rule as public.document_upload_allowed() in the database (which is what actually decides). */
function applicantUploadMode(item: ChecklistItem, appStatus: DbApplicationStatus): "upload" | "replace" | "resubmit" | null {
  if (!item.requirement.is_active || appStatus === "cancelled") return null;
  if (!item.current) return "upload";
  if (appStatus === "draft") return "replace";
  if (item.current.document_status === "needs_resubmission") return "resubmit";
  return null;
}

function lockedReason(item: ChecklistItem, appStatus: DbApplicationStatus) {
  if (appStatus === "cancelled") return "This application was cancelled, so documents can no longer be changed.";
  if (!item.requirement.is_active) return "This requirement is no longer in use. Your earlier upload is kept for the record.";
  return "This document is locked because the application was submitted. You can replace it only if the BPLO asks for a resubmission.";
}

export function ChecklistSummaryBar({ summary }: { summary: ChecklistData["summary"] }) {
  const pct = summary.requiredTotal === 0 ? 100 : Math.round((summary.requiredUploaded / summary.requiredTotal) * 100);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-slate-900">
          {summary.requiredTotal === 0
            ? "No required documents for this application type yet"
            : `${summary.requiredUploaded} of ${summary.requiredTotal} required documents uploaded`}
        </span>
        <span className="text-slate-500">
          {summary.accepted} accepted · {summary.awaitingReview} awaiting review · {summary.needsResubmission} need resubmission
        </span>
      </div>
      {summary.requiredTotal > 0 ? <ProgressBar value={pct} label="Required documents uploaded" /> : null}
    </div>
  );
}

function reviewerLabel(id: string | null, viewerId: string) {
  return id === viewerId ? "You" : "BPLO personnel";
}

export function DocumentChecklist({
  data,
  mode,
  viewerId,
}: {
  data: ChecklistData;
  mode: "applicant" | "bplo";
  viewerId: string;
}) {
  const { app, items } = data;
  const appStatus = app.application_status;

  if (items.length === 0) {
    return (
      <Card>
        <CardBody className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <FileText className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="text-base font-semibold text-slate-900">No document requirements yet</h2>
          <p className="max-w-md text-sm text-slate-600">
            {mode === "applicant"
              ? "The BPLO has not published the document requirements for this application type yet. Check again later."
              : "No active requirements are configured for this permit type. Add them under Permit Requirements."}
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <ol className="space-y-4" aria-label="Document checklist">
      {items.map((item, index) => {
        const { requirement: r, current } = item;
        const status: ChecklistStatus = current ? current.document_status : "not_uploaded";
        const uploadMode = mode === "applicant" ? applicantUploadMode(item, appStatus) : null;
        const historyCount = item.previous.length + Object.values(item.reviews).reduce((n, list) => n + list.length, 0);
        return (
          <li key={r.id}>
            <Card className={status === "needs_resubmission" ? "border-amber-300" : undefined}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-900">
                    <span className="text-slate-400">{index + 1}.</span> {r.name}
                  </h2>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge tone={r.is_required ? "brand" : "neutral"}>{r.is_required ? "Required" : "Optional"}</Badge>
                    {!r.is_active ? <Badge tone="neutral">No longer in use</Badge> : null}
                  </div>
                </div>
                <DocumentStatusBadge status={status} />
              </div>
              <CardBody className="space-y-4">
                {r.description ? <p className="text-sm text-slate-700">{r.description}</p> : null}
                {r.applicant_instructions ? (
                  <p className="text-sm text-slate-600">
                    <span className="font-medium text-slate-800">Instructions:</span> {r.applicant_instructions}
                  </p>
                ) : null}

                {current ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-4 py-3">
                    <div className="min-w-0 text-sm">
                      <p className="truncate font-medium text-slate-900" title={current.original_filename}>{current.original_filename}</p>
                      <p className="text-xs text-slate-500">
                        Version {current.submission_version} · {formatFileSize(current.file_size)} · uploaded {formatDateTime(current.uploaded_at)}
                      </p>
                    </div>
                    <DocumentLinks documentId={current.id} label={`${r.name}, version ${current.submission_version}`} />
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No file uploaded yet.</p>
                )}

                {current?.review_comment ? (
                  <div
                    className={
                      status === "needs_resubmission"
                        ? "flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
                        : "flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
                    }
                  >
                    {status === "needs_resubmission" ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    )}
                    <div>
                      <p className="font-semibold">{status === "needs_resubmission" ? "Please upload a corrected document" : "Reviewer comment"}</p>
                      <p className="mt-0.5 whitespace-pre-line">{current.review_comment}</p>
                      {current.last_reviewed_at ? (
                        <p className="mt-1 text-xs opacity-80">
                          {reviewerLabel(current.last_reviewed_by, viewerId)} · {formatDateTime(current.last_reviewed_at)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {mode === "applicant" ? (
                  uploadMode ? (
                    <DocumentUploader
                      applicationId={app.id}
                      requirementId={r.id}
                      requirementName={r.name}
                      acceptedTypes={r.accepted_file_types}
                      maxFileSize={r.max_file_size}
                      mode={uploadMode}
                    />
                  ) : (
                    <p className="text-sm text-slate-500">
                      {status === "accepted" ? "Accepted by the BPLO. No action needed." : lockedReason(item, appStatus)}
                    </p>
                  )
                ) : (
                  <>
                    <p className="text-xs text-slate-500">
                      Accepted: {formatAcceptedTypes(r.accepted_file_types)} · up to {formatFileSize(r.max_file_size)}
                    </p>
                    {current && appStatus === "submitted" ? (
                      <ReviewForm key={`${current.id}-${current.document_status}`} documentId={current.id} applicationId={app.id} current={current.document_status} />
                    ) : !current ? (
                      <p className="text-sm font-medium text-amber-800">Not uploaded yet{r.is_required ? " (required)" : ""}.</p>
                    ) : null}
                  </>
                )}

                {historyCount > 0 ? (
                  <details className="group rounded-lg border border-slate-200">
                    <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-brand-700">
                      History ({item.previous.length} earlier {item.previous.length === 1 ? "version" : "versions"}, {Object.values(item.reviews).reduce((n, l) => n + l.length, 0)} review actions)
                    </summary>
                    <div className="space-y-4 border-t border-slate-100 px-4 py-3">
                      {[...(current ? [current] : []), ...item.previous].map((v) => (
                        <div key={v.id} className="text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium text-slate-900">
                              Version {v.submission_version}
                              {v.is_current ? " (current)" : ""} · <span className="font-normal text-slate-600">{v.original_filename}</span>
                            </p>
                            {!v.is_current ? <DocumentLinks documentId={v.id} label={`${r.name}, version ${v.submission_version}`} /> : null}
                          </div>
                          <p className="text-xs text-slate-500">
                            Uploaded {formatDateTime(v.uploaded_at)} · {formatFileSize(v.file_size)} · {v.is_current ? "Status" : "Final status"}:{" "}
                            {DOCUMENT_STATUS_LABELS[v.document_status]}
                          </p>
                          {(item.reviews[v.id] ?? []).length > 0 ? (
                            <ul className="mt-2 space-y-1.5 border-l-2 border-slate-200 pl-3">
                              {(item.reviews[v.id] ?? []).map((h) => (
                                <li key={h.id} className="text-xs text-slate-600">
                                  <span className="font-medium text-slate-800">
                                    {DOCUMENT_STATUS_LABELS[h.previous_status]} → {DOCUMENT_STATUS_LABELS[h.new_status]}
                                  </span>{" "}
                                  · {reviewerLabel(h.reviewed_by, viewerId)} · {formatDateTime(h.created_at)}
                                  {h.review_comment ? <span className="block whitespace-pre-line text-slate-600">“{h.review_comment}”</span> : null}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </CardBody>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}
