import "server-only";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_BUCKET } from "@/lib/documents/constants";
import { manilaToday } from "@/lib/business/schemas";
import type { SubmissionSnapshot } from "@/lib/database.types";
import { verifyDocument } from "./pipeline";
import { GeminiClient } from "./providers/gemini";
import { ProviderError, type AnalysisProvider, type OcrProvider } from "./providers/types";

/**
 * Runs one verification attempt on the server, as the signed-in BPLO user:
 *   claim (start_document_verification) -> read records and the file under RLS ->
 *   pipeline (extraction, OCR, AI, rules) -> store (complete_/fail_document_verification).
 *
 * No service-role key is used. Nothing about the document's content is logged.
 * The official document status is never changed here.
 */

export function aiProviders(): { ocr: OcrProvider | null; analysis: AnalysisProvider | null; reason?: string } {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return { ocr: null, analysis: null, reason: "GEMINI_API_KEY is not set on the server" };
  const client = new GeminiClient({ apiKey, model: process.env.GEMINI_MODEL?.trim() || undefined });
  return { ocr: client, analysis: client };
}

export function aiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

type RunResult = { ok: true; overall: string } | { ok: false; error: string };

function safeDbMessage(error: { code?: string; message: string }) {
  return error.code === "P0001" || error.code === "P0002" ? error.message : "The check could not be started.";
}

export async function runVerificationAttempt(verificationId: string): Promise<RunResult> {
  const supabase = await createClient();

  const { error: startError } = await supabase.rpc("start_document_verification", { p_verification: verificationId });
  if (startError) return { ok: false, error: safeDbMessage(startError) };

  const fail = async (code: string, message: string): Promise<RunResult> => {
    await supabase.rpc("fail_document_verification", { p_verification: verificationId, p_error_code: code, p_error_message: message });
    return { ok: false, error: message };
  };

  try {
    const { data: v } = await supabase
      .from("document_verification_results")
      .select("application_document_id")
      .eq("id", verificationId)
      .maybeSingle();
    if (!v) return fail("not_found", "The check could not be loaded.");

    const { data: doc } = await supabase
      .from("application_documents")
      .select("storage_path, mime_type, application_id, permit_requirements(name, description, applicant_instructions)")
      .eq("id", v.application_document_id)
      .maybeSingle();
    if (!doc || !doc.permit_requirements) return fail("not_found", "The document could not be loaded.");

    const { data: app } = await supabase
      .from("permit_applications")
      .select("business_name, business_address, business_id, submission_snapshot, permit_types(name)")
      .eq("id", doc.application_id)
      .maybeSingle();
    if (!app) return fail("not_found", "The application could not be loaded.");

    // Compare with the details frozen at submission; fall back to the live profile.
    let business: Pick<SubmissionSnapshot["business"], "registered_business_name" | "trade_name" | "barangay" | "municipality" | "owner_full_name"> | null =
      app.submission_snapshot?.business ?? null;
    if (!business) {
      const { data } = await supabase
        .from("business_establishments")
        .select("registered_business_name, trade_name, barangay, municipality, owner_full_name")
        .eq("id", app.business_id)
        .maybeSingle();
      business = data;
    }

    const { data: blob, error: downloadError } = await supabase.storage.from(DOCUMENT_BUCKET).download(doc.storage_path);
    if (downloadError || !blob) return fail("file_unavailable", "The file could not be read from storage.");
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const providers = aiProviders();
    const { result, pages } = await verifyDocument({
      bytes,
      declaredMime: doc.mime_type,
      today: manilaToday(),
      requirement: {
        name: doc.permit_requirements.name,
        description: doc.permit_requirements.description,
        applicantInstructions: doc.permit_requirements.applicant_instructions,
      },
      records: {
        registeredBusinessName: business?.registered_business_name ?? null,
        tradeName: business?.trade_name ?? null,
        applicationBusinessName: app.business_name,
        businessAddress: app.business_address,
        barangay: business?.barangay ?? null,
        municipality: business?.municipality ?? null,
        ownerName: business?.owner_full_name ?? null,
        permitType: app.permit_types?.name ?? null,
      },
      ocr: providers.ocr,
      analysis: providers.analysis,
      aiUnavailableReason: providers.reason,
    });

    const { error } = await supabase.rpc("complete_document_verification", {
      p_verification: verificationId,
      p_result: result,
      p_pages: pages,
    });
    if (error) return fail("save_failed", "The result could not be saved.");
    return { ok: true, overall: result.overall_result };
  } catch (err) {
    if (err instanceof ProviderError) return fail(err.code, err.message);
    // Log only the error type, never document content.
    console.error("document verification failed", err instanceof Error ? err.name : "unknown");
    return fail("internal_error", "The automated check failed unexpectedly. Try again later.");
  }
}
