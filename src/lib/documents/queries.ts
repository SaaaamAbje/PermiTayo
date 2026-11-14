import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole, requireUser } from "@/lib/auth/dal";
import { isUuid } from "@/lib/business/queries";
import type { Database, DbApplicationStatus } from "@/lib/database.types";

/**
 * Read queries for requirements and documents. Every query runs as the signed-in
 * user, so Row Level Security decides what comes back; the role checks here are
 * the first gate, not the only one.
 */

type RequirementRow = Database["public"]["Tables"]["permit_requirements"]["Row"];
type DocumentRow = Database["public"]["Tables"]["application_documents"]["Row"];
type ReviewRow = Database["public"]["Tables"]["document_review_history"]["Row"];

export const VERIFICATION_PAGE_SIZE = 15;

const REQUIREMENT_COLUMNS =
  "id, permit_type_id, name, description, applicant_instructions, is_required, accepted_file_types, max_file_size, display_order, is_active, conditions, created_by, updated_by, created_at, updated_at";
const DOCUMENT_COLUMNS =
  "id, application_id, requirement_id, applicant_id, original_filename, storage_path, mime_type, file_size, submission_version, is_current, document_status, review_comment, last_reviewed_by, last_reviewed_at, uploaded_at, updated_at";

/** BPLO personnel or administrators (requirement configuration). */
export async function requireRequirementManager() {
  const user = await requireUser();
  if (user.dbRole !== "bplo_personnel" && user.dbRole !== "administrator") redirect("/unauthorized");
  return user;
}

// ---------------------------------------------------------------------------
// Requirement configuration
// ---------------------------------------------------------------------------
export async function listPermitTypesForStaff() {
  await requireRequirementManager();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("permit_types")
    .select("id, name, application_code, is_active")
    .order("sort_order")
    .order("name");
  if (error) throw new Error("Could not load permit types.");
  return data ?? [];
}

export async function listRequirementsForType(permitTypeId: string) {
  await requireRequirementManager();
  if (!isUuid(permitTypeId)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("permit_requirements")
    .select(REQUIREMENT_COLUMNS)
    .eq("permit_type_id", permitTypeId)
    .order("display_order")
    .order("name");
  if (error) throw new Error("Could not load requirements.");
  return data ?? [];
}

export async function getRequirementForStaff(id: string) {
  await requireRequirementManager();
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("permit_requirements")
    .select(`${REQUIREMENT_COLUMNS}, permit_types(name)`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Could not load this requirement.");
  return data;
}

// ---------------------------------------------------------------------------
// Checklist (shared by applicant and BPLO views)
// ---------------------------------------------------------------------------
export interface ChecklistItem {
  requirement: RequirementRow;
  current: DocumentRow | null;
  /** Older versions, newest first. */
  previous: DocumentRow[];
  /** Review history per document id, oldest first. */
  reviews: Record<string, ReviewRow[]>;
}

export interface ChecklistSummary {
  requiredTotal: number;
  requiredUploaded: number;
  accepted: number;
  needsResubmission: number;
  awaitingReview: number;
}

async function loadChecklist(applicationId: string, permitTypeId: string) {
  const supabase = await createClient();
  const [reqs, docs] = await Promise.all([
    supabase.from("permit_requirements").select(REQUIREMENT_COLUMNS).eq("permit_type_id", permitTypeId).order("display_order").order("name"),
    supabase
      .from("application_documents")
      .select(DOCUMENT_COLUMNS)
      .eq("application_id", applicationId)
      .order("submission_version", { ascending: false }),
  ]);
  if (reqs.error || docs.error) throw new Error("Could not load the document checklist.");

  const documents = docs.data ?? [];
  const docIds = documents.map((d) => d.id);
  let reviews: ReviewRow[] = [];
  if (docIds.length > 0) {
    const { data, error } = await supabase
      .from("document_review_history")
      .select("id, application_document_id, reviewed_by, previous_status, new_status, review_comment, created_at")
      .in("application_document_id", docIds)
      .order("created_at", { ascending: true });
    if (error) throw new Error("Could not load the review history.");
    reviews = data ?? [];
  }

  const withDocs = new Set(documents.map((d) => d.requirement_id));
  // Active requirements, plus inactive ones this application already has files for.
  const requirements = (reqs.data ?? []).filter((r) => r.is_active || withDocs.has(r.id));

  const items: ChecklistItem[] = requirements.map((requirement) => {
    const versions = documents.filter((d) => d.requirement_id === requirement.id);
    const reviewMap: Record<string, ReviewRow[]> = {};
    for (const v of versions) reviewMap[v.id] = reviews.filter((r) => r.application_document_id === v.id);
    return {
      requirement,
      current: versions.find((d) => d.is_current) ?? null,
      previous: versions.filter((d) => !d.is_current),
      reviews: reviewMap,
    };
  });

  return { items, summary: summarize(items) };
}

export function summarize(items: ChecklistItem[]): ChecklistSummary {
  const required = items.filter((i) => i.requirement.is_required && i.requirement.is_active);
  return {
    requiredTotal: required.length,
    requiredUploaded: required.filter((i) => i.current).length,
    accepted: items.filter((i) => i.current?.document_status === "accepted").length,
    needsResubmission: items.filter((i) => i.current?.document_status === "needs_resubmission").length,
    awaitingReview: items.filter((i) => i.current && (i.current.document_status === "uploaded" || i.current.document_status === "under_review")).length,
  };
}

const APP_COLUMNS =
  "id, reference_number, application_status, permit_type_id, business_name, business_address, submitted_at, created_at, applicant_id, submission_snapshot, permit_types(name)";

/** Applicant: the checklist for one of their own applications. */
export async function getApplicantChecklist(applicationId: string) {
  const user = await requireRole("applicant");
  if (!isUuid(applicationId)) return null;
  const supabase = await createClient();
  const { data: app, error } = await supabase
    .from("permit_applications")
    .select(APP_COLUMNS)
    .eq("id", applicationId)
    .eq("applicant_id", user.id)
    .maybeSingle();
  if (error) throw new Error("Could not load this application.");
  if (!app) return null;
  const checklist = await loadChecklist(app.id, app.permit_type_id);
  return { app, ...checklist };
}

/** BPLO personnel: the checklist of a submitted (or cancelled) application. RLS hides drafts. */
export async function getStaffChecklist(applicationId: string) {
  await requireRole("bplo");
  if (!isUuid(applicationId)) return null;
  const supabase = await createClient();
  const { data: app, error } = await supabase.from("permit_applications").select(APP_COLUMNS).eq("id", applicationId).maybeSingle();
  if (error) throw new Error("Could not load this application.");
  if (!app) return null;
  const checklist = await loadChecklist(app.id, app.permit_type_id);
  return { app, ...checklist };
}

/** Counts for a set of applications, without loading files or history. */
async function documentCounts(apps: { id: string; permit_type_id: string }[]) {
  if (apps.length === 0) return new Map<string, ChecklistSummary>();
  const supabase = await createClient();
  const typeIds = [...new Set(apps.map((a) => a.permit_type_id))];
  const [reqs, docs] = await Promise.all([
    supabase.from("permit_requirements").select("id, permit_type_id, is_required, is_active").in("permit_type_id", typeIds),
    supabase
      .from("application_documents")
      .select("application_id, requirement_id, document_status")
      .in("application_id", apps.map((a) => a.id))
      .eq("is_current", true),
  ]);
  if (reqs.error || docs.error) throw new Error("Could not load document counts.");
  const out = new Map<string, ChecklistSummary>();
  for (const a of apps) {
    const required = (reqs.data ?? []).filter((r) => r.permit_type_id === a.permit_type_id && r.is_required && r.is_active);
    const mine = (docs.data ?? []).filter((d) => d.application_id === a.id);
    out.set(a.id, {
      requiredTotal: required.length,
      requiredUploaded: required.filter((r) => mine.some((d) => d.requirement_id === r.id)).length,
      accepted: mine.filter((d) => d.document_status === "accepted").length,
      needsResubmission: mine.filter((d) => d.document_status === "needs_resubmission").length,
      awaitingReview: mine.filter((d) => d.document_status === "uploaded" || d.document_status === "under_review").length,
    });
  }
  return out;
}

/** BPLO: submitted applications with their document progress. */
export async function listVerificationQueue({ q, page }: { q?: string; page: number }) {
  await requireRole("bplo");
  const supabase = await createClient();
  const from = (page - 1) * VERIFICATION_PAGE_SIZE;
  let query = supabase
    .from("permit_applications")
    .select("id, reference_number, business_name, submitted_at, permit_type_id, permit_types(name)", { count: "exact" })
    .eq("application_status", "submitted")
    .order("submitted_at", { ascending: true })
    .range(from, from + VERIFICATION_PAGE_SIZE - 1);
  // q is pre-restricted to a safe character set by applicationSearchSchema.
  if (q) query = query.or(`reference_number.ilike.%${q}%,business_name.ilike.%${q}%`);
  const { data, count, error } = await query;
  if (error) throw new Error("Could not load submitted applications.");
  const rows = data ?? [];
  const counts = await documentCounts(rows);
  return { rows: rows.map((r) => ({ ...r, counts: counts.get(r.id)! })), total: count ?? 0 };
}

/** Applicant: their non-cancelled applications with document progress (Documents page). */
export async function listApplicantDocumentOverview() {
  const user = await requireRole("applicant");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("permit_applications")
    .select("id, reference_number, business_name, application_status, created_at, permit_type_id, permit_types(name)")
    .eq("applicant_id", user.id)
    .neq("application_status", "cancelled")
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not load your applications.");
  const rows = data ?? [];
  const counts = await documentCounts(rows);
  return rows.map((r) => ({ ...r, application_status: r.application_status as DbApplicationStatus, counts: counts.get(r.id)! }));
}

export type ChecklistData = NonNullable<Awaited<ReturnType<typeof getApplicantChecklist>>>;
export type RequirementForStaff = Awaited<ReturnType<typeof listRequirementsForType>>[number];
