import { detectDocumentType } from "@/lib/documents/file-signature";
import { ExtractionError, extractPdfText, imageDimensions, looksScanned, totalChars, MIN_TOTAL_CHARS } from "./extraction";
import { runRules, type RuleContext } from "./rules";
import { verificationResultSchema, type AiAnalysis, type Finding, type OcrOutput, type PageText, type VerificationResult } from "./schemas";
import type { AnalysisProvider, OcrProvider } from "./providers/types";

/**
 * One verification attempt, without any database or storage access:
 *   file validation -> PDF text extraction -> OCR when needed -> AI analysis -> rules -> result.
 * Provider failures (timeout, rate limit, invalid output) are thrown as ProviderError so the
 * caller records a FAILED attempt that can be retried. Problems with the document itself
 * (damaged, unreadable, expired...) produce a COMPLETED attempt with findings.
 */

export interface PipelineInput {
  bytes: Uint8Array;
  declaredMime: "application/pdf" | "image/jpeg" | "image/png";
  today: string;
  requirement: { name: string; description: string | null; applicantInstructions: string | null };
  records: {
    registeredBusinessName: string | null;
    tradeName: string | null;
    applicationBusinessName: string | null;
    businessAddress: string | null;
    barangay: string | null;
    municipality: string | null;
    ownerName: string | null;
    permitType: string | null;
  };
  ocr: OcrProvider | null;
  analysis: AnalysisProvider | null;
  /** Why AI is unavailable (for example, no API key configured). */
  aiUnavailableReason?: string;
}

export interface PipelineOutput {
  result: VerificationResult;
  pages: PageText[];
}

const SUMMARY: Record<VerificationResult["overall_result"], string> = {
  passed: "No issues were found by the automated checks. This is not an official acceptance; personnel decide.",
  needs_review: "The automated checks found points that need a person to look at them.",
  failed: "The document did not pass one or more technical or requirement checks.",
  inconclusive: "There was not enough readable information for a useful automated assessment.",
};

export async function verifyDocument(input: PipelineInput): Promise<PipelineOutput> {
  const detectedMime = detectDocumentType(input.bytes.subarray(0, 16));
  let pages: PageText[] = [];
  let pageCount = 0;
  let extractionMethod: VerificationResult["extraction_method"] = "none";
  let extractionError: RuleContext["file"]["extractionError"] = null;
  let ocrQuality: OcrOutput["quality"] | null = null;
  let imageSize: RuleContext["file"]["imageSize"] = null;
  let ai: AiAnalysis | null = null;
  let aiUnavailableReason: string | null = input.aiUnavailableReason ?? (input.analysis ? null : "no AI provider is configured");
  const usedProviders = new Set<string>();
  let usedModel: string | null = null;

  const fileOk = detectedMime !== null && detectedMime === input.declaredMime;

  if (fileOk && detectedMime === "application/pdf") {
    try {
      const extracted = await extractPdfText(input.bytes);
      pages = extracted.pages;
      pageCount = extracted.pageCount;
      extractionMethod = "pdf_text";
    } catch (err) {
      if (!(err instanceof ExtractionError)) throw err;
      extractionError = { code: err.code, message: err.message };
    }
    if (!extractionError && looksScanned(pages)) {
      if (input.ocr) {
        const hadText = totalChars(pages) > 0;
        const out = await input.ocr.ocr({ bytes: input.bytes, mimeType: "application/pdf" });
        usedProviders.add(input.ocr.name);
        usedModel = input.ocr.model;
        pages = out.pages.map((p) => ({ page: p.page, text: p.text, source: "ocr" as const }));
        pageCount = Math.max(pageCount, pages.length);
        ocrQuality = out.quality;
        extractionMethod = hadText ? "pdf_text_and_ocr" : "ocr";
      } else {
        aiUnavailableReason = aiUnavailableReason ?? "OCR is not configured, and this PDF has no text layer";
      }
    }
  } else if (fileOk) {
    imageSize = imageDimensions(input.bytes, detectedMime!);
    pageCount = 1;
    if (input.ocr) {
      const out = await input.ocr.ocr({ bytes: input.bytes, mimeType: detectedMime! });
      usedProviders.add(input.ocr.name);
      usedModel = input.ocr.model;
      pages = out.pages.map((p) => ({ page: p.page, text: p.text, source: "ocr" as const }));
      ocrQuality = out.quality;
      extractionMethod = "ocr";
    }
  }

  const enoughText = totalChars(pages) >= MIN_TOTAL_CHARS && (!ocrQuality || ocrQuality.readable);
  if (fileOk && !extractionError && enoughText && input.analysis) {
    ai = await input.analysis.analyze({
      requirement: input.requirement,
      records: {
        registeredBusinessName: input.records.registeredBusinessName,
        tradeName: input.records.tradeName,
        applicationBusinessName: input.records.applicationBusinessName,
        businessAddress: input.records.businessAddress,
        ownerName: input.records.ownerName,
        permitType: input.records.permitType,
      },
      pages,
      today: input.today,
    });
    usedProviders.add(input.analysis.name);
    usedModel = input.analysis.model;
  } else if (input.analysis && !aiUnavailableReason) {
    aiUnavailableReason = "the document had too little readable text to analyse";
  }

  const aiFindings: Finding[] = (ai?.findings ?? []).map((f) => ({ ...f, source: "ai" as const }));
  const { findings, overall } = runRules(
    {
      today: input.today,
      file: { declaredMime: input.declaredMime, detectedMime, imageSize, extractionError },
      pages,
      ocrQuality,
      ai,
      aiUnavailableReason,
      requirementName: input.requirement.name,
      records: input.records,
    },
    aiFindings,
  );

  const result = verificationResultSchema.parse({
    overall_result: overall,
    detected_document_type: ai?.detected_document_type ?? null,
    expected_document_type: input.requirement.name.slice(0, 200),
    classification_match: ai ? ai.classification_match : null,
    confidence_score: ai ? ai.classification_confidence : null,
    extracted_fields: ai?.extracted_fields ?? [],
    findings,
    quality: { ocr: ocrQuality, image_size: imageSize, characters: totalChars(pages) },
    summary: ai ? `${ai.summary}\n\n${SUMMARY[overall]}`.slice(0, 2000) : SUMMARY[overall],
    extraction_method: extractionMethod,
    page_count: pageCount,
    ai_provider: usedProviders.size ? [...usedProviders].join("+") : null,
    ai_model: usedModel,
  });
  return { result, pages };
}
