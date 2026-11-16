import { aiAnalysisSchema, ocrOutputSchema, parseProviderJson, type AiAnalysis, type OcrOutput } from "../schemas";
import { ANALYSIS_SYSTEM, OCR_SYSTEM, buildAnalysisPrompt } from "../prompts";
import { ProviderError, type AnalysisInput, type AnalysisProvider, type DocumentFile, type OcrProvider } from "./types";

/**
 * Google Gemini (generativelanguage.googleapis.com) via plain server-side fetch.
 * The key is sent in a header, never in a URL, and never reaches the browser.
 * Documents are sent as inline bytes, never as storage URLs.
 */

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

type Fetch = typeof fetch;
type Schema = Record<string, unknown>;

const S = {
  str: { type: "STRING" },
  strN: { type: "STRING", nullable: true },
  bool: { type: "BOOLEAN" },
  num: { type: "NUMBER" },
  intN: { type: "INTEGER", nullable: true },
};

const OCR_RESPONSE_SCHEMA: Schema = {
  type: "OBJECT",
  properties: {
    pages: { type: "ARRAY", items: { type: "OBJECT", properties: { page: { type: "INTEGER" }, text: S.str }, required: ["page", "text"] } },
    quality: {
      type: "OBJECT",
      properties: { readable: S.bool, blurry: S.bool, rotated: S.bool, cut_off: S.bool, notes: S.strN },
      required: ["readable", "blurry", "rotated", "cut_off", "notes"],
    },
  },
  required: ["pages", "quality"],
};

const FINDING = {
  type: "OBJECT",
  properties: {
    category: { type: "STRING", enum: ["classification", "completeness", "consistency", "expiration", "readability", "technical"] },
    severity: { type: "STRING", enum: ["low", "medium", "high", "critical"] },
    field: S.strN,
    description: S.str,
    evidence: S.strN,
    recommendation: S.str,
    source_page: S.intN,
  },
  required: ["category", "severity", "field", "description", "evidence", "recommendation", "source_page"],
};

const ANALYSIS_RESPONSE_SCHEMA: Schema = {
  type: "OBJECT",
  properties: {
    detected_document_type: S.str,
    classification_match: S.bool,
    classification_confidence: S.num,
    key_fields: {
      type: "OBJECT",
      properties: {
        business_name: S.strN,
        owner_name: S.strN,
        address: S.strN,
        reference_number: S.strN,
        issue_date: S.strN,
        expiry_date: S.strN,
      },
      required: ["business_name", "owner_name", "address", "reference_number", "issue_date", "expiry_date"],
    },
    expiry_expected: S.bool,
    extracted_fields: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { field: S.str, value: S.str, source_page: S.intN, confidence: S.num },
        required: ["field", "value", "source_page", "confidence"],
      },
    },
    missing_information: { type: "ARRAY", items: S.str },
    findings: { type: "ARRAY", items: FINDING },
    summary: S.str,
  },
  required: [
    "detected_document_type",
    "classification_match",
    "classification_confidence",
    "key_fields",
    "expiry_expected",
    "extracted_fields",
    "missing_information",
    "findings",
    "summary",
  ],
};

function toBase64(bytes: Uint8Array) {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}

export interface GeminiOptions {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: Fetch;
}

export class GeminiClient implements OcrProvider, AnalysisProvider {
  readonly name = "gemini";
  readonly model: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: Fetch;

  constructor(opts: GeminiOptions) {
    if (!opts.apiKey) throw new ProviderError("not_configured", "The AI provider is not configured.");
    this.apiKey = opts.apiKey;
    this.model = opts.model || DEFAULT_GEMINI_MODEL;
    this.timeoutMs = opts.timeoutMs ?? 25000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** One structured-output call. Returns the raw JSON text from the first candidate. */
  async generate(system: string, parts: Record<string, unknown>[], schema: Schema): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${ENDPOINT}/${encodeURIComponent(this.model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: schema },
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw new ProviderError("timeout", "The AI provider took too long to respond.");
      throw new ProviderError("provider_error", "The AI provider could not be reached.");
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 429) throw new ProviderError("rate_limited", "The AI provider is busy (rate limit). Try again in a minute.");
    if (res.status === 401 || res.status === 403) throw new ProviderError("auth_error", "The AI provider rejected the API key. Check GEMINI_API_KEY.");
    if (res.status === 400) throw new ProviderError("provider_error", "The AI provider could not process this document.");
    if (!res.ok) throw new ProviderError("provider_error", `The AI provider returned an error (${res.status}).`);

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new ProviderError("invalid_response", "The AI provider returned an unreadable response.");
    }
    const b = body as {
      promptFeedback?: { blockReason?: string };
      candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
    };
    if (b.promptFeedback?.blockReason) throw new ProviderError("blocked", "The AI provider declined to process this document.");
    const candidate = b.candidates?.[0];
    if (candidate?.finishReason && !["STOP", "MAX_TOKENS"].includes(candidate.finishReason)) {
      throw new ProviderError("blocked", "The AI provider stopped before finishing.");
    }
    const out = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!out) throw new ProviderError("invalid_response", "The AI provider returned an empty response.");
    return out;
  }

  async ocr(file: DocumentFile): Promise<OcrOutput> {
    const raw = await this.generate(
      OCR_SYSTEM,
      [{ text: "Transcribe this document." }, { inlineData: { mimeType: file.mimeType, data: toBase64(file.bytes) } }],
      OCR_RESPONSE_SCHEMA,
    );
    const parsed = parseProviderJson(ocrOutputSchema, raw);
    if (!parsed) throw new ProviderError("invalid_response", "The OCR result did not have the expected structure.");
    return parsed;
  }

  async analyze(input: AnalysisInput): Promise<AiAnalysis> {
    const raw = await this.generate(ANALYSIS_SYSTEM, [{ text: buildAnalysisPrompt(input) }], ANALYSIS_RESPONSE_SCHEMA);
    const parsed = parseProviderJson(aiAnalysisSchema, raw);
    if (!parsed) throw new ProviderError("invalid_response", "The AI analysis did not have the expected structure.");
    return parsed;
  }
}
