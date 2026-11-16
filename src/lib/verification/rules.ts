import type { AiAnalysis, Finding, OcrOutput, OverallResult, PageText } from "./schemas";
import { MIN_TOTAL_CHARS, totalChars } from "./extraction";

/**
 * Deterministic verification rules. They run on every attempt, with or without
 * AI output, and they alone decide the overall result:
 *
 *   failed       a critical finding (file cannot be processed, or the document appears expired)
 *   inconclusive too little readable text, AI analysis unavailable, or validity cannot be determined
 *   needs_review any high or medium finding (from rules or AI)
 *   passed       nothing above low severity. NOT an official acceptance.
 *
 * The AI's confidence score is stored for information only and never decides anything.
 */

export interface RuleContext {
  today: string; // YYYY-MM-DD, Philippine time
  file: {
    declaredMime: string;
    detectedMime: string | null;
    imageSize: { width: number; height: number } | null;
    extractionError: { code: string; message: string } | null;
  };
  pages: PageText[];
  ocrQuality: OcrOutput["quality"] | null;
  ai: AiAnalysis | null;
  aiUnavailableReason: string | null;
  requirementName: string;
  records: {
    registeredBusinessName: string | null;
    tradeName: string | null;
    applicationBusinessName: string | null;
    barangay: string | null;
    municipality: string | null;
    ownerName: string | null;
  };
}

type Rule = (ctx: RuleContext) => Finding[];

const finding = (f: Omit<Finding, "source" | "field" | "evidence" | "source_page"> & Partial<Pick<Finding, "field" | "evidence" | "source_page">>): Finding => ({
  field: null,
  evidence: null,
  source_page: null,
  ...f,
  source: "rules",
});

// ---------------------------------------------------------------------------
// Text comparison helpers
// ---------------------------------------------------------------------------
const SUFFIXES = new Set(["inc", "incorporated", "corp", "corporation", "co", "company", "ltd", "opc", "enterprise", "enterprises", "trading", "store"]);

export function normalizeName(v: string) {
  return v
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t && !SUFFIXES.has(t))
    .join(" ");
}

/** True when two names are the same after normalisation, or one clearly contains the other / most tokens overlap. */
export function namesMatch(a: string, b: string) {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const ta = new Set(x.split(" "));
  const tb = new Set(y.split(" "));
  const shared = [...ta].filter((t) => tb.has(t)).length;
  return shared / Math.max(ta.size, tb.size) >= 0.75;
}

export function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------
const fileIntegrity: Rule = ({ file }) => {
  const out: Finding[] = [];
  if (!file.detectedMime) {
    out.push(finding({ category: "technical", severity: "critical", description: "The file's content is not a readable PDF, JPEG or PNG.", recommendation: "Ask the applicant to upload the document again as a PDF, JPG or PNG." }));
  } else if (file.detectedMime !== file.declaredMime) {
    out.push(finding({ category: "technical", severity: "critical", description: "The file's content does not match its recorded file type.", evidence: `Recorded ${file.declaredMime}, content looks like ${file.detectedMime}.`, recommendation: "Ask the applicant to upload the document again." }));
  }
  if (file.extractionError) {
    out.push(finding({ category: "technical", severity: "critical", description: file.extractionError.message, recommendation: "Ask the applicant for an unprotected, undamaged copy." }));
  }
  return out;
};

const readability: Rule = ({ pages, file }) => {
  if (file.extractionError || !file.detectedMime) return [];
  const out: Finding[] = [];
  if (totalChars(pages) < MIN_TOTAL_CHARS) {
    out.push(finding({ category: "readability", severity: "high", description: "Little or no readable text could be extracted from this document.", recommendation: "Open the file and check it manually. Ask for a clearer copy if needed." }));
  } else {
    for (const p of pages) {
      if (p.text.replace(/\[unreadable\]/gi, "").trim().length === 0 && pages.length > 1) {
        out.push(finding({ category: "completeness", severity: "low", description: `Page ${p.page} has no readable text.`, source_page: p.page, recommendation: "Check whether this page is blank, a photo, or missing content." }));
      }
    }
    const unreadable = pages.reduce((n, p) => n + (p.text.match(/\[unreadable\]/gi)?.length ?? 0), 0);
    if (unreadable >= 3) {
      out.push(finding({ category: "readability", severity: "medium", description: `Parts of the document could not be read (${unreadable} unreadable sections).`, recommendation: "Check the original file for the unreadable parts." }));
    }
  }
  return out;
};

const imageQuality: Rule = ({ file, ocrQuality }) => {
  const out: Finding[] = [];
  if (file.imageSize && Math.min(file.imageSize.width, file.imageSize.height) < 500) {
    out.push(finding({ category: "readability", severity: "medium", description: "The image resolution is low, so small text may be hard to read.", evidence: `${file.imageSize.width} x ${file.imageSize.height} pixels.`, recommendation: "Ask for a sharper photo or scan if details cannot be read." }));
  }
  if (ocrQuality) {
    if (!ocrQuality.readable) out.push(finding({ category: "readability", severity: "high", description: "The automated reader judged the document as not readable.", evidence: ocrQuality.notes, recommendation: "Check the original file manually." }));
    if (ocrQuality.blurry) out.push(finding({ category: "readability", severity: "medium", description: "The document appears blurry (automated observation).", evidence: ocrQuality.notes, recommendation: "Ask for a clearer copy if details cannot be read." }));
    if (ocrQuality.rotated) out.push(finding({ category: "readability", severity: "low", description: "The document appears rotated or poorly oriented (automated observation).", recommendation: "Rotate the preview when reviewing; ask for a corrected copy only if it cannot be read." }));
    if (ocrQuality.cut_off) out.push(finding({ category: "completeness", severity: "medium", description: "Parts of the document appear cut off at the edges (automated observation).", recommendation: "Check that no required information is missing." }));
  }
  return out;
};

const aiAvailability: Rule = ({ ai, aiUnavailableReason }) =>
  ai
    ? []
    : [finding({ category: "technical", severity: "low", description: `Automated content analysis was not performed: ${aiUnavailableReason ?? "unavailable"}.`, recommendation: "Review the document manually." })];

const classification: Rule = ({ ai, requirementName }) => {
  if (!ai || ai.classification_match) return [];
  return [
    finding({
      category: "classification",
      severity: "high",
      field: "document_type",
      description: "The document may not be the type of document this requirement asks for.",
      evidence: `Requirement: ${requirementName}. Document appears to be: ${ai.detected_document_type}.`,
      recommendation: "Confirm the document type manually. Ask for the correct document if it is wrong.",
    }),
  ];
};

const businessName: Rule = ({ ai, records }) => {
  const found = ai?.key_fields.business_name;
  const known = [records.registeredBusinessName, records.tradeName, records.applicationBusinessName].filter((v): v is string => Boolean(v));
  if (!found || known.length === 0 || known.some((k) => namesMatch(found, k))) return [];
  return [
    finding({
      category: "consistency",
      severity: "medium",
      field: "business_name",
      description: "The business name on the document differs from the business name on record.",
      evidence: `Document: "${found}". On record: "${known.join('" / "')}".`,
      recommendation: "Confirm which name is correct. This may be a spelling difference, a trade name, or a different business.",
    }),
  ];
};

const ownerName: Rule = ({ ai, records }) => {
  const found = ai?.key_fields.owner_name;
  if (!found || !records.ownerName || namesMatch(found, records.ownerName)) return [];
  return [
    finding({
      category: "consistency",
      severity: "medium",
      field: "owner_name",
      description: "The person's name on the document differs from the owner's name on record.",
      evidence: `Document: "${found}". On record: "${records.ownerName}".`,
      recommendation: "Confirm the person named on the document is the owner or an authorised representative.",
    }),
  ];
};

const address: Rule = ({ ai, records }) => {
  const found = ai?.key_fields.address;
  if (!found) return [];
  const a = normalizeName(found);
  const out: Finding[] = [];
  if (records.barangay && !a.includes(normalizeName(records.barangay))) {
    out.push(finding({ category: "consistency", severity: "medium", field: "address", description: "The barangay on the document differs from the business address on record.", evidence: `Document: "${found}". On record: Brgy. ${records.barangay}.`, recommendation: "Confirm the business location." }));
  }
  if (records.municipality && !a.includes(normalizeName(records.municipality))) {
    out.push(finding({ category: "consistency", severity: "low", field: "address", description: "The municipality is not mentioned in the address on the document, or differs from the record.", evidence: `Document: "${found}". On record: ${records.municipality}.`, recommendation: "Confirm the business location." }));
  }
  return out;
};

/** Expiry: distinguishes "appears expired" (critical) from "cannot be determined" (validity unknown). */
const expiration: Rule = ({ ai, today }) => {
  if (!ai) return [];
  const { issue_date, expiry_date } = ai.key_fields;
  const out: Finding[] = [];
  if (expiry_date) {
    if (expiry_date < today) {
      out.push(finding({ category: "expiration", severity: "critical", field: "expiry_date", description: `The document appears to have expired on ${expiry_date}.`, evidence: `Expiry date read from the document: ${expiry_date}. Today: ${today}.`, recommendation: "Check the date on the original. If it is expired, ask for a current document." }));
    } else if (expiry_date <= addDaysIso(today, 30)) {
      out.push(finding({ category: "expiration", severity: "low", field: "expiry_date", description: `The document expires soon (${expiry_date}).`, recommendation: "Note the expiry date when processing the application." }));
    }
  } else if (ai.expiry_expected) {
    out.push(finding({ category: "expiration", severity: "medium", field: "expiry_date", description: "This kind of document usually shows a validity or expiry date, but none could be read. Its validity cannot be determined automatically.", recommendation: "Check the validity date on the original document." }));
  }
  if (issue_date && issue_date > today) {
    out.push(finding({ category: "expiration", severity: "medium", field: "issue_date", description: `The issue date (${issue_date}) is in the future.`, recommendation: "Check the date on the original; it may have been misread." }));
  }
  return out;
};

const missingInformation: Rule = ({ ai }) =>
  (ai?.missing_information ?? []).slice(0, 10).map((m) =>
    finding({ category: "completeness", severity: "medium", description: `Missing or unreadable: ${m}`, recommendation: "Check the original document for this information." }),
  );

/** Every rule, in order. Add a rule here; nothing else needs to change. */
export const RULES: Rule[] = [fileIntegrity, readability, imageQuality, aiAvailability, classification, businessName, ownerName, address, expiration, missingInformation];

export function runRules(ctx: RuleContext, aiFindings: Finding[] = []) {
  const findings = [...RULES.flatMap((rule) => rule(ctx)), ...aiFindings];
  return { findings, overall: decideOverall(ctx, findings) };
}

export function decideOverall(ctx: RuleContext, findings: Finding[]): OverallResult {
  if (findings.some((f) => f.severity === "critical")) return "failed";
  const tooLittleText = totalChars(ctx.pages) < MIN_TOTAL_CHARS || (ctx.ocrQuality && !ctx.ocrQuality.readable);
  const validityUnknown = findings.some((f) => f.source === "rules" && f.category === "expiration" && f.field === "expiry_date" && f.severity === "medium");
  if (tooLittleText || !ctx.ai || validityUnknown) return "inconclusive";
  if (findings.some((f) => f.severity === "high" || f.severity === "medium")) return "needs_review";
  return "passed";
}
