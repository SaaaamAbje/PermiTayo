/** Document and requirement labels. Safe to import from client components. */
import type { BadgeTone } from "@/components/ui/Badge";
import type { DocumentMimeType, DocumentStatus } from "@/lib/database.types";

/** Private Storage bucket created in Phase 2 and reused for application documents. */
export const DOCUMENT_BUCKET = "permit-documents";

export const MB = 1024 * 1024;
export const DEFAULT_MAX_FILE_SIZE = 5 * MB;
/** The bucket itself refuses anything larger (see supabase/migrations/20261103000003_storage_bucket.sql). */
export const ABSOLUTE_MAX_FILE_SIZE = 10 * MB;
export const MIN_MAX_FILE_SIZE = 100 * 1024;

export const DOCUMENT_MIME_TYPES: DocumentMimeType[] = ["application/pdf", "image/jpeg", "image/png"];

export const MIME_LABELS: Record<DocumentMimeType, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG / JPEG",
  "image/png": "PNG",
};

/** Extension used in generated storage names. */
export const MIME_EXTENSION: Record<DocumentMimeType, "pdf" | "jpg" | "png"> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/** Value for <input accept>. */
export function acceptAttribute(types: readonly DocumentMimeType[]) {
  const ext = types.flatMap((t) => (t === "image/jpeg" ? [".jpg", ".jpeg"] : [`.${MIME_EXTENSION[t]}`]));
  return [...types, ...ext].join(",");
}

/** Shown to users: "Not Uploaded" is the absence of a document, not a stored status. */
export type ChecklistStatus = DocumentStatus | "not_uploaded";

export const DOCUMENT_STATUS_LABELS: Record<ChecklistStatus, string> = {
  not_uploaded: "Not Uploaded",
  uploaded: "Uploaded",
  under_review: "Under Manual Review",
  accepted: "Accepted",
  needs_resubmission: "Needs Resubmission",
};

export const DOCUMENT_STATUS_TONES: Record<ChecklistStatus, BadgeTone> = {
  not_uploaded: "neutral",
  uploaded: "info",
  under_review: "brand",
  accepted: "success",
  needs_resubmission: "warning",
};

export const REVIEW_STATUSES = ["under_review", "accepted", "needs_resubmission"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export function formatFileSize(bytes: number) {
  if (bytes >= MB) return `${(bytes / MB).toFixed(bytes % MB === 0 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatAcceptedTypes(types: readonly DocumentMimeType[]) {
  return types.map((t) => MIME_LABELS[t]).join(", ");
}
