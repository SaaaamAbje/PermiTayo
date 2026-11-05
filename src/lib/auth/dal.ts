import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { AccountStatus, DbRole } from "@/lib/database.types";
import { roleIdFromDbRole, type RoleId } from "@/lib/roles";

/**
 * Data Access Layer: the single place that decides who the current user is.
 * Role and status always come from the database (profiles), never from the
 * browser, a cookie value or JWT metadata.
 */

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  dbRole: DbRole;
  roleId: RoleId;
  status: AccountStatus;
  departments: { id: string; name: string; code: string; position: string | null }[];
}

/** Verified user for this request (memoised per request). Null when signed out. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Always resolve per request. Without this, a build that has no Supabase
  // credentials would prerender the "signed out" result into static HTML.
  await connection();
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  // getUser() asks the Auth server to validate the token, so it cannot be spoofed by a cookie.
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone_number, role, account_status")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!profile) return null;

  const { data: memberships } = await supabase
    .from("department_members")
    .select("department_position, departments(id, department_name, department_code)")
    .eq("profile_id", auth.user.id);

  const departments = (memberships ?? []).flatMap((m) =>
    m.departments
      ? [
          {
            id: m.departments.id,
            name: m.departments.department_name,
            code: m.departments.department_code,
            position: m.department_position,
          },
        ]
      : [],
  );

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    phoneNumber: profile.phone_number,
    dbRole: profile.role,
    roleId: roleIdFromDbRole(profile.role),
    status: profile.account_status,
    departments,
  };
});

/** Signed-in user with an active account, or redirect. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?reason=expired");
  if (user.status !== "active") redirect("/unauthorized?reason=inactive");
  return user;
}

/** Signed-in user whose role matches the route, or redirect to the unauthorized page. */
export async function requireRole(roleId: RoleId): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.roleId !== roleId) redirect("/unauthorized");
  return user;
}
