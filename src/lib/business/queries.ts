import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole, requireUser } from "@/lib/auth/dal";
import type { BusinessRecordStatus } from "@/lib/database.types";

/**
 * Read queries for business profiles.
 *
 * Applicant functions filter by the signed-in user's id AND run under RLS, so a
 * profile that belongs to someone else is never returned even if a filter were
 * removed. Staff functions require BPLO personnel or an administrator.
 */

export const BUSINESSES_PAGE_SIZE = 15;

const BUSINESS_COLUMNS =
  "id, owner_id, business_reference_number, registered_business_name, trade_name, business_description, business_type, ownership_type, business_category, business_email, business_contact_number, province, municipality, barangay, street_address, zip_code, owner_full_name, owner_email, owner_contact_number, nature_of_business, employee_count, estimated_capital, establishment_status, date_established, record_status, created_at, updated_at";

const HISTORY_COLUMNS =
  "id, reference_number, application_status, business_name, submitted_at, created_at, permit_types(name)";

export interface BusinessFilters {
  q?: string;
  status?: BusinessRecordStatus;
}

/** Search on name, trade name or reference. `q` is pre-restricted to a safe character set. */
function searchFilter(q: string) {
  return `registered_business_name.ilike.%${q}%,trade_name.ilike.%${q}%,business_reference_number.ilike.%${q}%`;
}

// ---------------------------------------------------------------------------
// Applicant
// ---------------------------------------------------------------------------
export async function listMyBusinesses({ q, status }: BusinessFilters = {}) {
  const user = await requireRole("applicant");
  const supabase = await createClient();
  let query = supabase
    .from("business_establishments")
    .select(
      "id, business_reference_number, registered_business_name, trade_name, business_type, business_category, barangay, municipality, province, record_status, establishment_status, created_at, updated_at, permit_applications(count)",
    )
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  if (q) query = query.or(searchFilter(q));
  if (status) query = query.eq("record_status", status);
  const { data, error } = await query;
  if (error) throw new Error("Could not load your business profiles.");
  return data ?? [];
}

export async function getMyBusiness(id: string) {
  const user = await requireRole("applicant");
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_establishments")
    .select(BUSINESS_COLUMNS)
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error) throw new Error("Could not load this business profile.");
  return data;
}

/** Businesses that can be used for a new application (not inactive). */
export async function listSelectableBusinesses() {
  const user = await requireRole("applicant");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_establishments")
    .select(BUSINESS_COLUMNS)
    .eq("owner_id", user.id)
    .neq("record_status", "inactive")
    .order("registered_business_name");
  if (error) throw new Error("Could not load your business profiles.");
  return data ?? [];
}

export async function listBusinessApplications(businessId: string) {
  const user = await requireUser();
  const supabase = await createClient();
  let query = supabase
    .from("permit_applications")
    .select(HISTORY_COLUMNS)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  // Applicants: own rows only (RLS agrees). Staff: RLS already hides drafts.
  if (user.dbRole === "applicant") query = query.eq("applicant_id", user.id);
  const { data, error } = await query;
  if (error) throw new Error("Could not load the application history.");
  return data ?? [];
}

// ---------------------------------------------------------------------------
// BPLO personnel and administrators
// ---------------------------------------------------------------------------
export async function requireBusinessStaff() {
  const user = await requireUser();
  if (user.dbRole !== "bplo_personnel" && user.dbRole !== "administrator") redirect("/unauthorized");
  return user;
}

export async function listBusinessesForStaff({ q, status, page }: BusinessFilters & { page: number }) {
  await requireBusinessStaff();
  const supabase = await createClient();
  const from = (page - 1) * BUSINESSES_PAGE_SIZE;
  let query = supabase
    .from("business_establishments")
    .select(
      "id, business_reference_number, registered_business_name, trade_name, owner_full_name, barangay, municipality, record_status, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, from + BUSINESSES_PAGE_SIZE - 1);
  if (q) query = query.or(searchFilter(q));
  if (status) query = query.eq("record_status", status);
  const { data, count, error } = await query;
  if (error) throw new Error("Could not load business profiles.");
  return { rows: data ?? [], total: count ?? 0 };
}

export async function getBusinessForStaff(id: string) {
  await requireBusinessStaff();
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("business_establishments").select(BUSINESS_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error("Could not load this business profile.");
  return data;
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export type BusinessDetail = NonNullable<Awaited<ReturnType<typeof getMyBusiness>>>;
export type BusinessApplicationRow = Awaited<ReturnType<typeof listBusinessApplications>>[number];
