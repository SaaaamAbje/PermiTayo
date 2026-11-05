"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/dal";
import {
  assignDepartmentSchema,
  changeRoleSchema,
  changeStatusSchema,
  departmentActiveSchema,
  removeAssignmentSchema,
} from "@/lib/auth/schemas";
import { fieldErrorsFrom, type FormState } from "@/lib/auth/form-state";

/**
 * Administrator operations. Every action:
 *   1. re-verifies on the server that the caller is an active administrator,
 *   2. validates input with Zod,
 *   3. calls a database function that checks the caller again and writes the audit entry.
 * Nothing the browser sends (including a "role") is trusted for authorization.
 */

const DENIED: FormState = { message: "You do not have permission to do that." };

function text(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

async function adminOnly() {
  const user = await getCurrentUser();
  if (!user || user.status !== "active" || user.dbRole !== "administrator") return null;
  return user;
}

function dbMessage(error: { code?: string; message: string }): string {
  switch (error.code) {
    case "42501":
      return DENIED.message!;
    case "P0001":
      // Messages raised by our own functions are written for end users.
      return error.message;
    case "22023":
      return "That value is not valid.";
    default:
      return "Something went wrong. Please try again.";
  }
}

function refresh(userId?: string) {
  revalidatePath("/dashboard/admin/users");
  if (userId) revalidatePath(`/dashboard/admin/users/${userId}`);
  revalidatePath("/dashboard/admin/audit");
  revalidatePath("/dashboard/admin");
}

export async function changeRoleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await adminOnly())) return DENIED;
  const parsed = changeRoleSchema.safeParse({ userId: text(formData, "userId"), role: text(formData, "role") });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_user_role", { p_target: parsed.data.userId, p_role: parsed.data.role });
  if (error) return { message: dbMessage(error) };
  refresh(parsed.data.userId);
  return { ok: true, message: "Role updated." };
}

export async function changeStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await adminOnly())) return DENIED;
  const parsed = changeStatusSchema.safeParse({ userId: text(formData, "userId"), status: text(formData, "status") });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_account_status", { p_target: parsed.data.userId, p_status: parsed.data.status });
  if (error) return { message: dbMessage(error) };
  refresh(parsed.data.userId);
  return { ok: true, message: "Account status updated." };
}

export async function assignDepartmentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await adminOnly())) return DENIED;
  const parsed = assignDepartmentSchema.safeParse({
    userId: text(formData, "userId"),
    departmentId: text(formData, "departmentId"),
    position: text(formData, "position"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_assign_department", {
    p_profile: parsed.data.userId,
    p_department: parsed.data.departmentId,
    p_position: parsed.data.position || null,
  });
  if (error) return { message: dbMessage(error) };
  refresh(parsed.data.userId);
  return { ok: true, message: "Department assignment saved." };
}

export async function removeAssignmentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await adminOnly())) return DENIED;
  const parsed = removeAssignmentSchema.safeParse({ memberId: text(formData, "memberId"), userId: text(formData, "userId") });
  if (!parsed.success) return { message: "Invalid request." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_remove_department_assignment", { p_member: parsed.data.memberId });
  if (error) return { message: dbMessage(error) };
  refresh(parsed.data.userId);
  return { ok: true, message: "Assignment removed." };
}

export async function setDepartmentActiveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await adminOnly())) return DENIED;
  const parsed = departmentActiveSchema.safeParse({
    departmentId: text(formData, "departmentId"),
    active: text(formData, "active"),
  });
  if (!parsed.success) return { message: "Invalid request." };

  const supabase = await createClient();
  // Allowed by RLS for administrators only; the change is audited by a database trigger.
  const { data, error } = await supabase
    .from("departments")
    .update({ is_active: parsed.data.active === "true" })
    .eq("id", parsed.data.departmentId)
    .select("id");
  if (error || !data || data.length === 0) return { message: "Could not update the department." };

  revalidatePath("/dashboard/admin/departments");
  revalidatePath("/dashboard/admin/audit");
  return { ok: true };
}
