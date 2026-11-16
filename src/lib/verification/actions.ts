"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { runVerificationAttempt } from "./service";

/**
 * Automated checks are run by BPLO personnel, one document per request so each
 * call stays within the hosting time limit. Results are advisory: nothing here
 * changes a document's official status.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result = { ok: true; overall: string } | { ok: false; error: string };

async function bploOnly() {
  const user = await getCurrentUser();
  return Boolean(user && user.status === "active" && user.dbRole === "bplo_personnel");
}

function refresh(applicationId: string) {
  if (UUID.test(applicationId)) revalidatePath(`/dashboard/bplo/applications/${applicationId}/documents`);
  revalidatePath("/dashboard/bplo/verification");
}

/** Run a queued check (or reclaim an abandoned one). */
export async function runQueuedVerificationAction(input: { verificationId: string; applicationId: string }): Promise<Result> {
  if (!(await bploOnly())) return { ok: false, error: "You do not have permission to do that." };
  if (!UUID.test(input.verificationId)) return { ok: false, error: "Invalid request." };
  const result = await runVerificationAttempt(input.verificationId);
  refresh(input.applicationId);
  return result;
}

/** Request a new attempt for a document (re-check) and run it. Never creates duplicates of a queued check. */
export async function recheckDocumentAction(input: { documentId: string; applicationId: string }): Promise<Result> {
  if (!(await bploOnly())) return { ok: false, error: "You do not have permission to do that." };
  if (!UUID.test(input.documentId)) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("request_document_verification", { p_document: input.documentId });
  if (error || !id) {
    return { ok: false, error: error?.code === "P0001" ? error.message : "The check could not be requested." };
  }
  const result = await runVerificationAttempt(id);
  refresh(input.applicationId);
  return result;
}
