import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/dal";
import type { AccountStatus, DbRole } from "@/lib/database.types";

/**
 * Read queries for the administrator screens.
 * Each function re-verifies the caller is an active administrator, and RLS
 * would return nothing to anyone else even if that check were skipped.
 */

export const USERS_PAGE_SIZE = 15;
export const AUDIT_PAGE_SIZE = 25;

export interface UserFilters {
  q?: string;
  role?: DbRole;
  status?: AccountStatus;
  page: number;
}

export async function listUsers({ q, role, status, page }: UserFilters) {
  await requireRole("admin");
  const supabase = await createClient();
  const from = (page - 1) * USERS_PAGE_SIZE;

  let query = supabase
    .from("profiles")
    .select(
      "id, full_name, email, phone_number, role, account_status, created_at, department_members(id, department_position, departments(department_code))",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, from + USERS_PAGE_SIZE - 1);

  // q has already been restricted to a safe character set by userSearchSchema.
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  if (role) query = query.eq("role", role);
  if (status) query = query.eq("account_status", status);

  const { data, count, error } = await query;
  if (error) throw new Error("Could not load users.");
  return { rows: data ?? [], total: count ?? 0 };
}

export async function getUserDetail(id: string) {
  await requireRole("admin");
  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, phone_number, role, account_status, privacy_notice_accepted_at, created_at, updated_at, department_members(id, department_position, created_at, departments(id, department_name, department_code))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Could not load this user.");
  if (!profile) return null;

  const { data: activity } = await supabase
    .from("audit_logs")
    .select("id, action, description, created_at, actor:profiles(full_name)")
    .eq("entity_id", id)
    .order("created_at", { ascending: false })
    .limit(15);

  return { profile, activity: activity ?? [] };
}

export async function listDepartments() {
  await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("departments")
    .select("id, department_name, department_code, description, is_active, department_members(count)")
    .order("department_name");
  if (error) throw new Error("Could not load departments.");
  return data ?? [];
}

export async function listAuditLogs(page: number) {
  await requireRole("admin");
  const supabase = await createClient();
  const from = (page - 1) * AUDIT_PAGE_SIZE;
  const { data, count, error } = await supabase
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, description, created_at, actor:profiles(full_name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + AUDIT_PAGE_SIZE - 1);
  if (error) throw new Error("Could not load the audit log.");
  return { rows: data ?? [], total: count ?? 0 };
}

export async function getAdminStats() {
  await requireRole("admin");
  const supabase = await createClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const head = { count: "exact", head: true } as const;

  const [total, notActive, activeDepartments, events, recent] = await Promise.all([
    supabase.from("profiles").select("id", head),
    supabase.from("profiles").select("id", head).neq("account_status", "active"),
    supabase.from("departments").select("id", head).eq("is_active", true),
    supabase.from("audit_logs").select("id", head).gte("created_at", since),
    supabase
      .from("audit_logs")
      .select("id, action, description, created_at, actor:profiles(full_name)")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  return {
    totalAccounts: total.count ?? 0,
    notActiveAccounts: notActive.count ?? 0,
    activeDepartments: activeDepartments.count ?? 0,
    events24h: events.count ?? 0,
    recent: recent.data ?? [],
  };
}
