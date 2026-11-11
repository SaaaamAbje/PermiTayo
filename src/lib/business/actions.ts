"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { fieldErrorsFrom, type FormState } from "@/lib/auth/form-state";
import { dbErrorMessage } from "@/lib/db-errors";
import {
  BUSINESS_FIELDS,
  businessCreateSchema,
  businessUpdateSchema,
  setRecordStatusSchema,
  type BusinessInput,
} from "@/lib/business/schemas";
import type { BusinessWritable, OwnershipType, EstablishmentStatus } from "@/lib/database.types";

/**
 * Business profile mutations.
 *   1. The caller is re-verified on the server (active applicant, or BPLO/admin for record status).
 *   2. Input is validated with Zod; unknown fields such as owner_id are discarded.
 *   3. The owner is never taken from the form. The database sets owner_id = auth.uid(),
 *      and RLS, column grants and a guard trigger reject any attempt to change it.
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

function rawBusiness(formData: FormData) {
  return Object.fromEntries(BUSINESS_FIELDS.map((k) => [k, text(formData, k)])) as Record<string, string>;
}

function toColumns(d: BusinessInput): BusinessWritable {
  return {
    registered_business_name: d.registeredBusinessName,
    trade_name: d.tradeName,
    business_description: d.businessDescription,
    business_type: d.businessType,
    ownership_type: d.ownershipType as OwnershipType,
    business_category: d.businessCategory,
    business_email: d.businessEmail,
    business_contact_number: d.businessContactNumber,
    province: d.province,
    municipality: d.municipality,
    barangay: d.barangay,
    street_address: d.streetAddress,
    zip_code: d.zipCode,
    owner_full_name: d.ownerFullName,
    owner_email: d.ownerEmail,
    owner_contact_number: d.ownerContactNumber,
    nature_of_business: d.natureOfBusiness,
    employee_count: d.employeeCount,
    estimated_capital: d.estimatedCapital,
    establishment_status: d.establishmentStatus as EstablishmentStatus,
    date_established: d.dateEstablished,
  };
}

function refresh(id?: string) {
  revalidatePath("/dashboard/applicant");
  revalidatePath("/dashboard/applicant/businesses");
  if (id) revalidatePath(`/dashboard/applicant/businesses/${id}`);
}

export async function createBusinessAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await activeApplicant())) return DENIED;
  const raw = rawBusiness(formData);
  const parsed = businessCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error), values: raw };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_establishments")
    .insert(toColumns(parsed.data))
    .select("id")
    .single();
  if (error || !data) {
    return { message: dbErrorMessage(error, "We couldn't save this business profile. Please try again."), values: raw };
  }

  refresh(data.id);
  revalidatePath("/dashboard/applicant/new-application");
  if (text(formData, "returnTo") === "new-application") {
    redirect(`/dashboard/applicant/new-application?business=${data.id}`);
  }
  redirect(`/dashboard/applicant/businesses/${data.id}?saved=created`);
}

export async function updateBusinessAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await activeApplicant();
  if (!user) return DENIED;
  const raw = { ...rawBusiness(formData), businessId: text(formData, "businessId") };
  const parsed = businessUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return { message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error), values: raw };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_establishments")
    .update(toColumns(parsed.data))
    .eq("id", parsed.data.businessId)
    .eq("owner_id", user.id)
    .select("id");
  if (error) {
    return { message: dbErrorMessage(error, "We couldn't save your changes. Please try again."), values: raw };
  }
  if (!data || data.length === 0) {
    // Not found, not owned by this user, or inactive (RLS filters all three).
    return { message: "This business profile can't be edited. It may be inactive or no longer available.", values: raw };
  }

  refresh(parsed.data.businessId);
  redirect(`/dashboard/applicant/businesses/${parsed.data.businessId}?saved=updated`);
}

export async function setBusinessRecordStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active" || (user.dbRole !== "bplo_personnel" && user.dbRole !== "administrator")) return DENIED;
  const parsed = setRecordStatusSchema.safeParse({ businessId: text(formData, "businessId"), status: text(formData, "status") });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_business_record_status", {
    p_business: parsed.data.businessId,
    p_status: parsed.data.status,
  });
  if (error) return { message: dbErrorMessage(error) };

  for (const role of ["bplo", "admin"]) {
    revalidatePath(`/dashboard/${role}/businesses`);
    revalidatePath(`/dashboard/${role}/businesses/${parsed.data.businessId}`);
  }
  revalidatePath("/dashboard/admin/audit");
  return { ok: true, message: "Record status updated." };
}
