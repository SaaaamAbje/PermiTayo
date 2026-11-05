import { z } from "zod";
import { ALL_DB_ROLES } from "@/lib/roles";

/** Philippine mobile number after spaces and dashes are removed. */
const PH_MOBILE = /^(\+63|0)9\d{9}$/;

const email = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .max(254, "That email address is too long.")
  .pipe(z.email("Enter a valid email address."))
  .transform((v) => v.toLowerCase());

const phone = z
  .string()
  .trim()
  .min(1, "Enter your mobile number.")
  .transform((v) => v.replace(/[\s-]/g, ""))
  .refine((v) => PH_MOBILE.test(v), "Use a Philippine mobile number, for example 0917 123 4567.");

// 72 is the practical bcrypt limit used by Supabase Auth.
const newPassword = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use 72 characters or fewer.")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Include at least one letter and one number.");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password.").max(72, "Use 72 characters or fewer."),
});

export const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Enter your full name.")
      .max(120, "Use 120 characters or fewer."),
    email,
    phone,
    password: newPassword,
    confirm: z.string().min(1, "Confirm your password."),
    privacy: z.literal("on", "You need to accept the privacy notice to continue."),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Passwords do not match.",
  });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password: newPassword, confirm: z.string().min(1, "Confirm your password.") })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match." });

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(120, "Use 120 characters or fewer."),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .refine((v) => v === "" || PH_MOBILE.test(v), "Use a Philippine mobile number, for example 0917 123 4567."),
});

// ---- Administrator operations ----------------------------------------------
const uuid = z.uuid("Invalid identifier.");

export const changeRoleSchema = z.object({
  userId: uuid,
  role: z.enum(ALL_DB_ROLES as [string, ...string[]], "Choose a role."),
});

export const changeStatusSchema = z.object({
  userId: uuid,
  status: z.enum(["active", "inactive", "suspended", "pending"], "Choose a status."),
});

export const assignDepartmentSchema = z.object({
  userId: uuid,
  departmentId: uuid,
  position: z.string().trim().max(80, "Use 80 characters or fewer.").optional(),
});

export const removeAssignmentSchema = z.object({ memberId: uuid, userId: uuid });

export const departmentActiveSchema = z.object({
  departmentId: uuid,
  active: z.enum(["true", "false"]),
});

/** Search box on the user list: letters, numbers, spaces and a few email characters only. */
export const userSearchSchema = z
  .string()
  .trim()
  .max(80)
  .regex(/^[\p{L}\p{N} @._+'-]*$/u, "Search contains unsupported characters.");

export const userRoleFilter = z.enum(ALL_DB_ROLES as [string, ...string[]]);
export const userStatusFilter = z.enum(["active", "inactive", "suspended", "pending"]);
