import type { z } from "zod";

/** Shape returned by server actions used with useActionState. */
export interface FormState {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Non-sensitive values echoed back so the form can repopulate after an error. Never passwords. */
  values?: Record<string, string>;
}

export const initialFormState: FormState = {};

/** First message per field from a failed Zod parse. */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/** Allow only same-site relative paths. Blocks open redirects such as //evil.com. */
export function safeInternalPath(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}
