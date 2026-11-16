import { extractText, getDocumentProxy } from "unpdf";
import type { PageText } from "./schemas";

/**
 * Text extraction from digital PDFs (no AI involved). Scanned PDFs return pages
 * with little or no text; the pipeline then sends the file to an OCR provider.
 * Text is returned to the caller only and is never logged.
 */

export class ExtractionError extends Error {
  readonly code: "corrupt_file" | "encrypted_file" | "too_many_pages";
  constructor(code: ExtractionError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export const MAX_PAGES = 50;
/** Below this many characters per page on average, a PDF is treated as scanned. */
export const MIN_CHARS_PER_PAGE = 40;
/** Below this total, the document cannot be meaningfully assessed. */
export const MIN_TOTAL_CHARS = 60;

export async function extractPdfText(bytes: Uint8Array): Promise<{ pages: PageText[]; pageCount: number }> {
  let pdf;
  try {
    // verbosity 0: pdf.js must not print anything about the document.
    pdf = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "PasswordException") throw new ExtractionError("encrypted_file", "The PDF is password-protected.");
    throw new ExtractionError("corrupt_file", "The PDF could not be opened. It may be damaged.");
  }
  if (pdf.numPages > MAX_PAGES) {
    throw new ExtractionError("too_many_pages", `The PDF has ${pdf.numPages} pages; automated checks support up to ${MAX_PAGES}.`);
  }
  try {
    const { text } = await extractText(pdf, { mergePages: false });
    return {
      pageCount: pdf.numPages,
      pages: text.map((t, i) => ({ page: i + 1, text: normalizeText(t), source: "pdf_text" as const })),
    };
  } catch {
    throw new ExtractionError("corrupt_file", "Text could not be read from the PDF. It may be damaged.");
  }
}

export function normalizeText(t: string) {
  return t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function totalChars(pages: PageText[]) {
  return pages.reduce((n, p) => n + p.text.length, 0);
}

/** True when a PDF's text layer is too thin to rely on (likely a scan). */
export function looksScanned(pages: PageText[]) {
  if (pages.length === 0) return true;
  return totalChars(pages) / pages.length < MIN_CHARS_PER_PAGE;
}

/** Width and height of a PNG or JPEG from its header, or null if it cannot be read. */
export function imageDimensions(bytes: Uint8Array, mime: string): { width: number; height: number } | null {
  if (mime === "image/png") {
    if (bytes.length < 24) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mime === "image/jpeg") {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC) carry the frame size.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
      }
      i += 2 + len;
    }
    return null;
  }
  return null;
}
