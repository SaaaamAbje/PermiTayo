import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/dal";
import { APPLICATIONS_PAGE_SIZE } from "@/lib/applications/constants";
import { isUuid } from "@/lib/business/queries";
import type { DbApplicationStatus } from "@/lib/database.types";

/**
 * Read queries for an applicant's own permit applications.
 * Every query filters by the signed-in applicant's id and runs under RLS.
 */

const LIST_COLUMNS =
  "id, reference_number, application_status, business_name, submitted_at, created_at, updated_at, permit_type_id, permit_types(name), business_establishments(registered_business_name)";

export interface ApplicationFilters {
  q?: string;
  typeId?: string;
  status?: DbApplicationStatus;
  sort: "newest" | "oldest";
  page: number;
}

export async function listPermitTypes() {
  await requireRole("applicant");
  const supabase = await createClient();
  // RLS returns only active types to applicants.
  const { data, error } = await supabase
    .from("permit_types")
    .select("id, name, description, application_code")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  if (error) throw new Error("Could not load application types.");
  return data ?? [];
}

export async function listMyApplications({ q, typeId, status, sort, page }: ApplicationFilters) {
  const user = await requireRole("applicant");
  const supabase = await createClient();
  const from = (page - 1) * APPLICATIONS_PAGE_SIZE;
  let query = supabase
    .from("permit_applications")
    .select(LIST_COLUMNS, { count: "exact" })
    .eq("applicant_id", user.id)
    .order("created_at", { ascending: sort === "oldest" })
    .range(from, from + APPLICATIONS_PAGE_SIZE - 1);
  // q is pre-restricted to a safe character set by applicationSearchSchema.
  if (q) query = query.or(`reference_number.ilike.%${q}%,business_name.ilike.%${q}%`);
  if (typeId) query = query.eq("permit_type_id", typeId);
  if (status) query = query.eq("application_status", status);
  const { data, count, error } = await query;
  if (error) throw new Error("Could not load your applications.");
  return { rows: data ?? [], total: count ?? 0 };
}

export async function getApplicantDashboard() {
  const user = await requireRole("applicant");
  const supabase = await createClient();
  const head = { count: "exact", head: true } as const;

  const [businesses, total, drafts, submitted, recent] = await Promise.all([
    supabase.from("business_establishments").select("id", head).eq("owner_id", user.id),
    supabase.from("permit_applications").select("id", head).eq("applicant_id", user.id),
    supabase.from("permit_applications").select("id", head).eq("applicant_id", user.id).eq("application_status", "draft"),
    supabase.from("permit_applications").select("id", head).eq("applicant_id", user.id).eq("application_status", "submitted"),
    supabase
      .from("permit_applications")
      .select(LIST_COLUMNS)
      .eq("applicant_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const failed = [businesses, total, drafts, submitted, recent].find((r) => r.error);
  if (failed) throw new Error("Could not load your dashboard.");

  return {
    businessCount: businesses.count ?? 0,
    applicationCount: total.count ?? 0,
    draftCount: drafts.count ?? 0,
    submittedCount: submitted.count ?? 0,
    recent: recent.data ?? [],
  };
}

export async function getMyApplication(id: string) {
  const user = await requireRole("applicant");
  if (!isUuid(id)) return null;
  const supabase = await createClient();

  const { data: app, error } = await supabase
    .from("permit_applications")
    .select(
      "id, reference_number, application_status, business_id, permit_type_id, business_name, business_address, nature_of_business, business_category, applicant_remarks, submission_snapshot, cancellation_reason, cancelled_by, submitted_at, cancelled_at, created_at, updated_at, permit_types(name, application_code, description), business_establishments(id, business_reference_number, registered_business_name, trade_name, record_status, ownership_type, owner_full_name, business_contact_number, business_email)",
    )
    .eq("id", id)
    .eq("applicant_id", user.id)
    .maybeSingle();
  if (error) throw new Error("Could not load this application.");
  if (!app) return null;

  const { data: history, error: historyError } = await supabase
    .from("application_status_history")
    .select("id, previous_status, new_status, remarks, changed_by, created_at")
    .eq("application_id", id)
    .order("created_at", { ascending: true });
  if (historyError) throw new Error("Could not load this application's history.");

  return { app, history: history ?? [], applicantId: user.id };
}

export type ApplicationListRow = Awaited<ReturnType<typeof listMyApplications>>["rows"][number];
export type ApplicationDetail = NonNullable<Awaited<ReturnType<typeof getMyApplication>>>;
