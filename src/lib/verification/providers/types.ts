import type { AiAnalysis, OcrOutput, PageText } from "../schemas";

/**
 * Provider interfaces. Swap the OCR or analysis provider without touching the
 * pipeline, the rules engine or persistence.
 */

export type ProviderErrorCode =
  | "not_configured"
  | "rate_limited"
  | "timeout"
  | "auth_error"
  | "blocked"
  | "invalid_response"
  | "provider_error";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  constructor(code: ProviderErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface DocumentFile {
  bytes: Uint8Array;
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
}

export interface OcrProvider {
  readonly name: string;
  readonly model: string;
  ocr(file: DocumentFile): Promise<OcrOutput>;
}

export interface AnalysisInput {
  requirement: { name: string; description: string | null; applicantInstructions: string | null };
  /** Values the document will be compared with (also used by the rules engine). */
  records: {
    registeredBusinessName: string | null;
    tradeName: string | null;
    applicationBusinessName: string | null;
    businessAddress: string | null;
    ownerName: string | null;
    permitType: string | null;
  };
  pages: PageText[];
  today: string;
}

export interface AnalysisProvider {
  readonly name: string;
  readonly model: string;
  analyze(input: AnalysisInput): Promise<AiAnalysis>;
}
