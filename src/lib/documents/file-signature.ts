import type { DocumentMimeType } from "@/lib/database.types";

/**
 * Identify a file from its first bytes ("magic numbers"), not from its name or
 * the browser-reported type. Returns null for anything that is not a PDF, JPEG
 * or PNG, which also rules out executables and scripts renamed to .pdf.
 */
export function detectDocumentType(head: Uint8Array): DocumentMimeType | null {
  if (head.length >= 5 && head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46 && head[4] === 0x2d) {
    return "application/pdf"; // %PDF-
  }
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return "image/jpeg";
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (head.length >= 8 && png.every((b, i) => head[i] === b)) {
    return "image/png";
  }
  return null;
}
