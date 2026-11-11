"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { fieldErrorsFrom, type FormState } from "@/lib/auth/form-state";
import { dbErrorMessage } from "@/lib/db-errors";
import {
  APPLICATION_FIELDS,
  applicationCreateSchema,
  applicationSubmitSchema,
  cancelApplicationSchema,
  deleteDraftSchema,
} from "@/lib/applications/schemas";
import type { ApplicationWritable } from "@/lib/database.types";

/**
 * Permit application mutations.
 *
 * The browser can only ever send draft content. Status, reference number,
 * applicant and timestamps are set by the database:
 *   - drafts are written under RLS + column grants (applicant_id = auth.uid()),
 *   - submission calls submit_permit_application(), which assigns the
 *     PTY-YYYY-NNNNNN reference and freezes a snapshot,
 *   - cancellation calls cancel_permit_application().
 * Ownership of the business and application is checked here AND in the database.
 */

const DENIED: FormState = { message: "You do not have permission to do that." };

function text(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

async function activeApplicant() {
  const user = await getCurrentUser();
  if (!user || user.status !== "active" || user.dbRole !== "applicant") return null;
  return user;
}

function refresh(applicationId?: string) {
  revalidatePath("/dashboard/applicant");
  revalidatePath("/dashboard/applicant/applications");
  revalidatePath("/dashboard/applicant/businesses", "layout");
  if (applicationId) revalidatePath(`/dashboard/applicant/applications/${applicationId}`);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Save a draft (intent=draft) or save and submit it (intent=submit).
 * Creates the draft if no applicationId is given.
 */
export async function saveApplicationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await activeApplicant();
  if (!user) return DENIED;

  const intent = text(formData, "intent") === "submit" ? "submit" : "draft";
  const existingId = text(formData, "applicationId");
  const raw: Record<string, string> = Object.fromEntries(APPLICATION_FIELDS.map((k) => [k, text(formData, k)]));
  const echo = { ...raw, applicationId: existingId };

  if (existingId && !UUID.test(existingId)) return { message: "Invalid request.", values: echo };

  const parsed =
    intent === "submit"
      ? applicationSubmitSchema.safeParse({ ...raw, declaration: text(formData, "declaration") })
      : applicationCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      message: intent === "submit" ? "Complete the required information before submitting." : "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: echo,
    };
  }
  const d = parsed.data;

  const supabase = await createClient();

  // Ownership checks on the server (RLS repeats them in the database).
  const [{ data: business }, { data: permitType }] = await Promise.all([
    supabase
      .from("business_establishments")
      .select("id, record_status")
      .eq("id", d.businessId)
      .eq("owner_id", user.id)
      .maybeSingle(),
    supabase.from("permit_types").select("id").eq("id", d.permitTypeId).eq("is_active", true).maybeSingle(),
  ]);
  if (!business) {
    return { message: "Select one of your own business profiles.", fieldErrors: { businessId: "Select one of your business profiles." }, values: echo };
  }
  if (business.record_status === "inactive") {
    return { message: "That business profile is inactive and cannot be used for new applications.", fieldErrors: { businessId: "This business profile is inactive." }, values: echo };
  }
  if (!permitType) {
    return { message: "Choose an available application type.", fieldErrors: { permitTypeId: "Choose an application type." }, values: echo };
  }

  const columns: ApplicationWritable = {
    business_id: d.businessId,
    permit_type_id: d.permitTypeId,
    business_name: d.businessName,
    business_address: d.businessAddress,
    nature_of_business: d.natureOfBusiness,
    business_category: d.businessCategory,
    applicant_remarks: d.applicantRemarks,
  };

  let applicationId = existingId;
  if (applicationId) {
    const { data, error } = await supabase
      .from("permit_applications")
      .update(columns)
      .eq("id", applicationId)
      .eq("applicant_id", user.id)
      .eq("application_status", "draft")
      .select("id");
    if (error) return { message: dbErrorMessage(error, "We couldn't save your draft. Please try again."), values: echo };
    if (!data || data.length === 0) {
      return { message: "This application is no longer a draft, so it can't be changed here.", values: echo };
    }
  } else {
    const { data, error } = await supabase.from("permit_applications").insert(columns).select("id").single();
    if (error || !data) return { message: dbErrorMessage(error, "We couldn't save your draft. Please try again."), values: echo };
    applicationId = data.id;
  }

  if (intent === "submit") {
    const { error } = await supabase.rpc("submit_permit_application", { p_application: applicationId });
    if (error) {
      refresh(applicationId);
      // The draft is saved; keep its id so a retry updates it instead of creating another.
      return {
        message: `Your draft was saved, but it could not be submitted: ${dbErrorMessage(error)}`,
        values: { ...echo, applicationId },
      };
    }
  }

  refresh(applicationId);
  redirect(`/dashboard/applicant/applications/${applicationId}?saved=${intent === "submit" ? "submitted" : "draft"}`);
}

export async function cancelApplicationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await activeApplicant())) return DENIED;
  const parsed = cancelApplicationSchema.safeParse({ applicationId: text(formData, "applicationId"), reason: text(formData, "reason") });
  if (!parsed.success) return { message: "Check the reason and try again.", fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_permit_application", {
    p_application: parsed.data.applicationId,
    p_reason: parsed.data.reason,
  });
  if (error) return { message: dbErrorMessage(error, "We couldn't cancel this application. Please try again.") };

  refresh(parsed.data.applicationId);
  return { ok: true, message: "The application was cancelled. Its record has been kept." };
}

export async function deleteDraftAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await activeApplicant();
  if (!user) return DENIED;
  const parsed = deleteDraftSchema.safeParse({ applicationId: text(formData, "applicationId") });
  if (!parsed.success) return { message: "Invalid request." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("permit_applications")
    .delete()
    .eq("id", parsed.data.applicationId)
    .eq("applicant_id", user.id)
    .eq("application_status", "draft")
    .select("id");
  if (error) return { message: dbErrorMessage(error, "We couldn't delete this draft. Please try again.") };
  if (!data || data.length === 0) return { message: "Only your own drafts can be deleted." };

  refresh();
  redirect("/dashboard/applicant/applications?deleted=1");
}
