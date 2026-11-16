import { z } from "zod";

/**
 * Shapes for automated document verification.
 *
 * Everything an AI provider returns is parsed with these schemas before use.
 * Anything that does not match is rejected (never "repaired" by guessing).
 */

export const FINDING_CATEGORIES = ["classification", "completeness", "consistency", "expiration", "readability", "technical"] as const;
export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const OVERALL_RESULTS = ["passed", "needs_review", "failed", "inconclusive"] as const;

export type FindingCategory = (typeof FINDING_CATEGORIES)[number];
export type Severity = (typeof SEVERITIES)[number];
export type OverallResult = (typeof OVERALL_RESULTS)[number];

const text = (max: number) => z.string().transform((v) => v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max));
const optionalText = (max: number) => z.union([text(max), z.null()]).transform((v) => (v === "" ? null : v));
const isoDate = z
  .union([z.string(), z.null()])
  .transform((v) => (typeof v === "string" ? v.trim() : v))
  .refine((v) => v === null || v === "" || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))), "Dates must be YYYY-MM-DD or null.")
  .transform((v) => (v === "" ? null : v));
const page = z.union([z.number().int().min(1).max(10000), z.null()]);
const unit = z.number().min(0).max(1);

export const findingSchema = z.object({
  category: z.enum(FINDING_CATEGORIES),
  severity: z.enum(SEVERITIES),
  field: optionalText(80),
  description: text(500).pipe(z.string().min(1)),
  evidence: optionalText(500),
  recommendation: text(300).pipe(z.string().min(1)),
  source_page: page,
});

export const extractedFieldSchema = z.object({
  field: text(80).pipe(z.string().min(1)),
  value: text(300),
  source_page: page,
  confidence: unit,
});

/** OCR provider output (transcription only, plus visual quality observations). */
export const ocrOutputSchema = z.object({
  pages: z.array(z.object({ page: z.number().int().min(1).max(1000), text: text(20000) })).max(200),
  quality: z.object({
    readable: z.boolean(),
    blurry: z.boolean(),
    rotated: z.boolean(),
    cut_off: z.boolean(),
    notes: optionalText(300),
  }),
});
export type OcrOutput = z.output<typeof ocrOutputSchema>;

/** AI analysis output. The AI does NOT decide the overall result; the rules engine does. */
export const aiAnalysisSchema = z.object({
  detected_document_type: text(200).pipe(z.string().min(1)),
  classification_match: z.boolean(),
  classification_confidence: unit,
  key_fields: z.object({
    business_name: optionalText(300),
    owner_name: optionalText(200),
    address: optionalText(400),
    reference_number: optionalText(100),
    issue_date: isoDate,
    expiry_date: isoDate,
  }),
  expiry_expected: z.boolean(),
  extracted_fields: z.array(extractedFieldSchema).max(40),
  missing_information: z.array(text(200)).max(20),
  findings: z.array(findingSchema).max(20),
  summary: text(1500).pipe(z.string().min(1)),
});
export type AiAnalysis = z.output<typeof aiAnalysisSchema>;

/** A finding as stored. `source` says whether a deterministic rule or the AI produced it. */
export type Finding = z.output<typeof findingSchema> & { source: "rules" | "ai" };
export type ExtractedField = z.output<typeof extractedFieldSchema>;

export interface PageText {
  page: number;
  text: string;
  source: "pdf_text" | "ocr";
}

/** What is saved for one verification attempt (validated again by the database). */
export const verificationResultSchema = z.object({
  overall_result: z.enum(OVERALL_RESULTS),
  detected_document_type: z.string().max(200).nullable(),
  expected_document_type: z.string().max(200).nullable(),
  classification_match: z.boolean().nullable(),
  confidence_score: unit.nullable(),
  extracted_fields: z.array(extractedFieldSchema),
  findings: z.array(findingSchema.extend({ source: z.enum(["rules", "ai"]) })),
  quality: z.record(z.string(), z.unknown()),
  summary: z.string().max(2000),
  extraction_method: z.enum(["pdf_text", "ocr", "pdf_text_and_ocr", "none"]),
  page_count: z.number().int().min(0),
  ai_provider: z.string().max(60).nullable(),
  ai_model: z.string().max(100).nullable(),
});
export type VerificationResult = z.output<typeof verificationResultSchema>;

/** Parse JSON text from a provider and validate it. Never throws for bad input; returns null. */
export function parseProviderJson<T extends z.ZodTypeAny>(schema: T, raw: string): z.output<T> | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = schema.safeParse(data);
  return parsed.success ? parsed.data : null;
}
