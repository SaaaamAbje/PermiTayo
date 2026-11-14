"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { fieldErrorsFrom, type FormState } from "@/lib/auth/form-state";
import { dbErrorMessage } from "@/lib/db-errors";
import { DOCUMENT_BUCKET, MIME_EXTENSION, formatFileSize } from "@/lib/documents/constants";
import { detectDocumentType } from "@/lib/documents/file-signature";
import {
  documentAccessSchema,
  finalizeUploadSchema,
  prepareUploadSchema,
  requirementCreateSchema,
  requirementToggleSchema,
  requirementUpdateSchema,
  reviewDocumentSchema,
} from "@/lib/documents/schemas";
import type { DocumentMimeType, RequirementWritable } from "@/lib/database.types";

/**
 * Requirement and document mutations.
 *
 * Uploads go straight from the browser to Supabase Storage (so large files do
 * not pass through a size-limited server function), in two server-checked steps:
 *   1. prepareDocumentUploadAction: checks the caller, the application, the
 *      requirement, the file type and size, then issues a one-time signed upload
 *      URL for a server-generated path. Storage RLS re-checks the path.
 *   2. finalizeDocumentUploadAction: reads the stored file, checks its real
 *      content type from its first bytes, and records it with
 *      register_application_document(), which re-checks size and type from
 *      Storage's own metadata. If anything fails, the file is deleted, so no
 *      misleading record or orphan file is left behind.
 */

const DENIED = "You do not have permission to do that.";
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function text(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

async function activeUser(roles: string[]) {
  const user = await getCurrentUser();
  if (!user || user.status !== "active" || !roles.includes(user.dbRole)) return null;
  return user;
}

// ---------------------------------------------------------------------------
// Requirement configuration (BPLO personnel and administrators)
// ---------------------------------------------------------------------------
function requirementRaw(formData: FormData) {
  return {
    name: text(formData, "name"),
    description: text(formData, "description"),
    applicantInstructions: text(formData, "applicantInstructions"),
    isRequired: text(formData, "isRequired"),
    acceptedFileTypes: formData.getAll("acceptedFileTypes").filter((v): v is string => typeof v === "string"),
    maxFileSizeMb: text(formData, "maxFileSizeMb"),
    displayOrder: text(formData, "displayOrder"),
    isActive: text(formData, "isActive"),
  };
}

function echo(raw: ReturnType<typeof requirementRaw>, extra: Record<string, string> = {}) {
  return {
    ...extra,
    name: raw.name,
    description: raw.description,
    applicantInstructions: raw.applicantInstructions,
    isRequired: raw.isRequired,
    acceptedFileTypes: raw.acceptedFileTypes.join(","),
    maxFileSizeMb: raw.maxFileSizeMb,
    displayOrder: raw.displayOrder,
    isActive: raw.isActive,
  };
}

function toRequirementColumns(d: {
  name: string;
  description: string | null;
  applicantInstructions: string | null;
  isRequired: "required" | "optional";
  acceptedFileTypes: string[];
  maxFileSizeMb: number;
  displayOrder: number;
  isActive: boolean;
}): RequirementWritable {
  return {
    name: d.name,
    description: d.description,
    applicant_instructions: d.applicantInstructions,
    is_required: d.isRequired === "required",
    accepted_file_types: d.acceptedFileTypes as DocumentMimeType[],
    max_file_size: d.maxFileSizeMb,
    display_order: d.displayOrder,
    is_active: d.isActive,
  };
}

const SAMPLE_PREFIX = /^sample:/i;
const SAMPLE_ACTIVE_ERROR = "Rename this sample requirement to the official requirement before activating it.";

function refreshRequirements() {
  for (const role of ["bplo", "admin"]) revalidatePath(`/dashboard/${role}/requirements`, "layout");
  revalidatePath("/dashboard/admin/audit");
}

export async function createRequirementAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await activeUser(["bplo_personnel", "administrator"]);
  if (!user) return { message: DENIED };
  const raw = requirementRaw(formData);
  const permitTypeId = text(formData, "permitTypeId");
  const parsed = requirementCreateSchema.safeParse({ ...raw, permitTypeId });
  if (!parsed.success) {
    return { message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error), values: echo(raw, { permitTypeId }) };
  }
  if (parsed.data.isActive && SAMPLE_PREFIX.test(parsed.data.name)) {
    return { message: SAMPLE_ACTIVE_ERROR, fieldErrors: { name: SAMPLE_ACTIVE_ERROR }, values: echo(raw, { permitTypeId }) };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("permit_requirements")
    .insert({ ...toRequirementColumns(parsed.data), permit_type_id: parsed.data.permitTypeId });
  if (error) {
    const message =
      error.code === "23505" ? "This permit type already has a requirement with that name." : dbErrorMessage(error, "We couldn't save this requirement.");
    return { message, values: echo(raw, { permitTypeId }) };
  }
  refreshRequirements();
  redirect(`/dashboard/${user.roleId}/requirements?type=${parsed.data.permitTypeId}&saved=created`);
}

export async function updateRequirementAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await activeUser(["bplo_personnel", "administrator"]);
  if (!user) return { message: DENIED };
  const raw = requirementRaw(formData);
  const requirementId = text(formData, "requirementId");
  const parsed = requirementUpdateSchema.safeParse({ ...raw, requirementId });
  if (!parsed.success) {
    return { message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error), values: echo(raw) };
  }
  if (parsed.data.isActive && SAMPLE_PREFIX.test(parsed.data.name)) {
    return { message: SAMPLE_ACTIVE_ERROR, fieldErrors: { name: SAMPLE_ACTIVE_ERROR }, values: echo(raw) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("permit_requirements")
    .update(toRequirementColumns(parsed.data))
    .eq("id", parsed.data.requirementId)
    .select("permit_type_id");
  if (error) {
    const message =
      error.code === "23505" ? "This permit type already has a requirement with that name." : dbErrorMessage(error, "We couldn't save your changes.");
    return { message, values: echo(raw) };
  }
  if (!data || data.length === 0) return { message: "This requirement could not be found.", values: echo(raw) };
  refreshRequirements();
  redirect(`/dashboard/${user.roleId}/requirements?type=${data[0].permit_type_id}&saved=updated`);
}

export async function toggleRequirementAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await activeUser(["bplo_personnel", "administrator"]))) return { message: DENIED };
  const parsed = requirementToggleSchema.safeParse({ requirementId: text(formData, "requirementId"), active: text(formData, "active") });
  if (!parsed.success) return { message: "Invalid request." };
  const supabase = await createClient();
  if (parsed.data.active === "true") {
    const { data: current } = await supabase.from("permit_requirements").select("name").eq("id", parsed.data.requirementId).maybeSingle();
    if (current && SAMPLE_PREFIX.test(current.name)) return { message: SAMPLE_ACTIVE_ERROR };
  }
  const { data, error } = await supabase
    .from("permit_requirements")
    .update({ is_active: parsed.data.active === "true" })
    .eq("id", parsed.data.requirementId)
    .select("id");
  if (error || !data || data.length === 0) return { message: "Could not update the requirement." };
  refreshRequirements();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Applicant uploads
// ---------------------------------------------------------------------------
function refreshApplication(applicationId: string) {
  revalidatePath(`/dashboard/applicant/applications/${applicationId}`, "layout");
  revalidatePath("/dashboard/applicant/documents");
  revalidatePath(`/dashboard/bplo/applications/${applicationId}/documents`);
  revalidatePath("/dashboard/bplo/verification");
}

export async function prepareDocumentUploadAction(input: {
  applicationId: string;
  requirementId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}): Promise<Result<{ path: string; token: string; signedUrl: string }>> {
  const user = await activeUser(["applicant"]);
  if (!user) return { ok: false, error: DENIED };
  const parsed = prepareUploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid file." };
  const d = parsed.data;

  const supabase = await createClient();
  const [{ data: requirement }, { data: allowed, error: allowedError }] = await Promise.all([
    supabase.from("permit_requirements").select("id, name, accepted_file_types, max_file_size, is_active").eq("id", d.requirementId).maybeSingle(),
    supabase.rpc("document_upload_allowed", { p_application: d.applicationId, p_requirement: d.requirementId }),
  ]);
  if (!requirement || allowedError) return { ok: false, error: "This requirement is not available for your application." };
  if (!allowed) {
    return {
      ok: false,
      error: "You can't upload this document now. After you submit, you can only add missing documents or replace ones the BPLO asked you to resubmit.",
    };
  }
  if (!requirement.accepted_file_types.includes(d.mimeType as DocumentMimeType)) {
    return { ok: false, error: "That file type is not accepted for this requirement." };
  }
  if (d.fileSize > requirement.max_file_size) {
    return { ok: false, error: `The file is larger than the ${formatFileSize(requirement.max_file_size)} limit for this requirement.` };
  }

  // Generated name: the original filename is never used in the storage path.
  const path = `${user.id}/${d.applicationId}/${d.requirementId}/${randomUUID()}.${MIME_EXTENSION[d.mimeType as DocumentMimeType]}`;
  const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "We couldn't start the upload. Please try again." };
  return { ok: true, path: data.path, token: data.token, signedUrl: data.signedUrl };
}

export async function finalizeDocumentUploadAction(input: {
  applicationId: string;
  requirementId: string;
  path: string;
  fileName: string;
}): Promise<Result> {
  const user = await activeUser(["applicant"]);
  if (!user) return { ok: false, error: DENIED };
  const parsed = finalizeUploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid upload." };
  const d = parsed.data;
  if (!d.path.startsWith(`${user.id}/${d.applicationId}/${d.requirementId}/`)) return { ok: false, error: "Invalid upload." };

  const supabase = await createClient();
  const storage = supabase.storage.from(DOCUMENT_BUCKET);
  const discard = async (error: string): Promise<Result> => {
    await storage.remove([d.path]); // allowed only while the file is unregistered
    return { ok: false, error };
  };

  // Check the real content, not the name or the browser-reported type.
  const { data: blob, error: downloadError } = await storage.download(d.path);
  if (downloadError || !blob) return discard("The upload did not complete. Please try again.");
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const detected = detectDocumentType(head);
  const expected = d.path.endsWith(".pdf") ? "application/pdf" : d.path.endsWith(".png") ? "image/png" : "image/jpeg";
  if (detected !== expected) {
    return discard("This file's content does not match a PDF, JPG or PNG document. Save it again as one of those formats and retry.");
  }

  const { error } = await supabase.rpc("register_application_document", {
    p_application: d.applicationId,
    p_requirement: d.requirementId,
    p_storage_path: d.path,
    p_original_filename: d.fileName,
  });
  if (error) return discard(dbErrorMessage(error, "We couldn't save this document. Please try again."));

  refreshApplication(d.applicationId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Preview / download through short-lived signed URLs
// ---------------------------------------------------------------------------
export async function getDocumentLinkAction(input: { documentId: string; mode: "view" | "download" }): Promise<Result<{ url: string }>> {
  const user = await activeUser(["applicant", "bplo_personnel"]);
  if (!user) return { ok: false, error: DENIED };
  const parsed = documentAccessSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const supabase = await createClient();
  // RLS returns the row only to its owner or to BPLO personnel for submitted applications.
  const { data: doc } = await supabase
    .from("application_documents")
    .select("storage_path, original_filename")
    .eq("id", parsed.data.documentId)
    .maybeSingle();
  if (!doc) return { ok: false, error: "Document not found." };

  const { data, error } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUrl(doc.storage_path, 60, parsed.data.mode === "download" ? { download: doc.original_filename } : undefined);
  if (error || !data) return { ok: false, error: "We couldn't open this document. Please try again." };
  return { ok: true, url: data.signedUrl };
}

// ---------------------------------------------------------------------------
// Manual review (BPLO personnel)
// ---------------------------------------------------------------------------
export async function reviewDocumentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await activeUser(["bplo_personnel"]))) return { message: DENIED };
  const raw = { documentId: text(formData, "documentId"), status: text(formData, "status"), comment: text(formData, "comment") };
  const parsed = reviewDocumentSchema.safeParse(raw);
  if (!parsed.success) return { message: "Check the review details.", fieldErrors: fieldErrorsFrom(parsed.error), values: raw };

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_application_document", {
    p_document: parsed.data.documentId,
    p_status: parsed.data.status,
    p_comment: parsed.data.comment,
  });
  if (error) return { message: dbErrorMessage(error, "We couldn't save the review."), values: raw };

  const applicationId = text(formData, "applicationId");
  if (/^[0-9a-f-]{36}$/i.test(applicationId)) refreshApplication(applicationId);
  return { ok: true, message: "Review saved." };
}
