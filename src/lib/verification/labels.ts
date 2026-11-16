/** Labels for automated document checks. Safe to import from client components. */
import type { BadgeTone } from "@/components/ui/Badge";
import type { DocumentStatus, StoredFinding, VerificationOverallResult, VerificationProcessingStatus } from "@/lib/database.types";

export const OVERALL_LABELS: Record<VerificationOverallResult, string> = {
  passed: "No issues detected",
  needs_review: "Needs review",
  failed: "Failed checks",
  inconclusive: "Inconclusive",
};
export const OVERALL_TONES: Record<VerificationOverallResult, BadgeTone> = {
  passed: "success",
  needs_review: "warning",
  failed: "danger",
  inconclusive: "neutral",
};
export const OVERALL_EXPLANATIONS: Record<VerificationOverallResult, string> = {
  passed: "The configured automated checks found no issues. This is not an official acceptance.",
  needs_review: "Possible issues were found that need a person to assess them.",
  failed: "The document did not satisfy one or more technical or requirement checks.",
  inconclusive: "There was not enough readable information for a useful automated assessment.",
};

export const PROCESSING_LABELS: Record<VerificationProcessingStatus, string> = {
  queued: "Waiting to be checked",
  processing: "Checking",
  completed: "Checked",
  failed: "Check failed",
};

export const CATEGORY_LABELS: Record<StoredFinding["category"], string> = {
  classification: "Classification",
  completeness: "Completeness",
  consistency: "Consistency",
  expiration: "Expiration",
  readability: "Readability",
  technical: "Technical validation",
};
export const CATEGORY_ORDER: StoredFinding["category"][] = ["technical", "classification", "expiration", "consistency", "completeness", "readability"];

export const SEVERITY_LABELS: Record<StoredFinding["severity"], string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };
export const SEVERITY_TONES: Record<StoredFinding["severity"], BadgeTone> = { low: "neutral", medium: "warning", high: "danger", critical: "danger" };
export const SEVERITY_RANK: Record<StoredFinding["severity"], number> = { critical: 0, high: 1, medium: 2, low: 3 };

export const EXTRACTION_LABELS: Record<string, string> = {
  pdf_text: "PDF text layer",
  ocr: "OCR",
  pdf_text_and_ocr: "PDF text layer + OCR",
  none: "No text extracted",
};

/**
 * What an applicant sees: a simplified status only. Never findings, AI results or extracted text,
 * and never "accepted" because of an automated result.
 */
export function applicantProcessingLabel(check: VerificationProcessingStatus | null, documentStatus: DocumentStatus): string {
  if (documentStatus === "needs_resubmission") return "Replacement required";
  if (documentStatus === "accepted") return "Accepted by the BPLO";
  if (check === "queued") return "Document uploaded · automated check pending";
  if (check === "processing") return "Document processing";
  if (check === "completed" || check === "failed") return "Verification completed · manual review pending";
  return "Manual review pending";
}
