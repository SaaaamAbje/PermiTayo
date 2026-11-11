import { z } from "zod";
import { ESTABLISHMENT_STATUSES, OWNERSHIP_TYPES, RECORD_STATUSES } from "@/lib/business/constants";

/**
 * Validation for business profiles. Mirrors the database CHECK constraints in
 * supabase/migrations/20261111000001_business_and_application_schema.sql so
 * users get a clear message before the database has to refuse anything.
 *
 * Ownership is never part of these schemas: owner_id comes from the session on
 * the server (and auth.uid() in the database), so any owner/reference/status
 * field in a submitted form is discarded by parsing.
 */

/** Philippine mobile (09XXXXXXXXX) or landline with area code (0XXXXXXXX…), or +63 forms. */
export const PH_CONTACT = /^(\+63|0)[2-9]\d{7,9}$/;

const uuid = z.uuid("Invalid identifier.");

const requiredText = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${label}.`)
    .min(min, `The ${label} is too short.`)
    .max(max, `Use ${max} characters or fewer.`);

/** Empty string becomes null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .transform((v) => (v === "" ? null : v));

const optionalEmail = z
  .string()
  .trim()
  .max(254, "That email address is too long.")
  .transform((v) => v.toLowerCase())
  .refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email address.")
  .transform((v) => (v === "" ? null : v));

const contactNumber = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${label}.`)
    .transform((v) => v.replace(/[\s()-]/g, ""))
    .refine((v) => PH_CONTACT.test(v), "Use a Philippine number with area code, for example 0917 123 4567 or (043) 123 4567.");

const employeeCount = z
  .string()
  .trim()
  .min(1, "Enter the number of employees (0 if none).")
  .regex(/^\d+$/, "Enter a whole number, for example 0 or 12.")
  .transform((v) => Number.parseInt(v, 10))
  .refine((v) => v <= 1_000_000, "That number is too large.");

const estimatedCapital = z
  .string()
  .trim()
  .transform((v) => v.replace(/[,₱\s]/g, ""))
  .refine((v) => v === "" || /^\d{1,13}(\.\d{1,2})?$/.test(v), "Enter an amount in pesos, for example 50000 or 50000.00.")
  .transform((v) => (v === "" ? null : Number(v)));

/** Today's date in Philippine time, as YYYY-MM-DD. */
export function manilaToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

const dateEstablished = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Enter a valid date.")
  .refine((v) => v === "" || !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Enter a valid date.")
  .refine((v) => v === "" || v >= "1900-01-01", "Enter a date after 1900.")
  .refine((v) => v === "" || v <= manilaToday(), "The date established cannot be in the future.")
  .transform((v) => (v === "" ? null : v));

export const businessCreateSchema = z.object({
  // Basic information
  registeredBusinessName: requiredText("registered business name", 2, 200),
  tradeName: optionalText(200),
  businessDescription: optionalText(1000),
  businessType: requiredText("business type", 2, 120),
  ownershipType: z.enum(OWNERSHIP_TYPES as [string, ...string[]], "Choose an ownership type."),
  businessCategory: requiredText("business category", 2, 120),
  businessEmail: optionalEmail,
  businessContactNumber: contactNumber("business contact number"),
  // Address
  province: requiredText("province", 2, 80),
  municipality: requiredText("municipality", 2, 80),
  barangay: requiredText("barangay", 2, 80),
  streetAddress: optionalText(200),
  zipCode: z.string().trim().regex(/^\d{4}$/, "Enter the 4-digit ZIP code."),
  // Owner
  ownerFullName: requiredText("owner's full name", 2, 120),
  ownerEmail: optionalEmail,
  ownerContactNumber: contactNumber("owner's contact number"),
  // Operation
  natureOfBusiness: requiredText("nature of business", 2, 300),
  employeeCount,
  estimatedCapital,
  establishmentStatus: z.enum(ESTABLISHMENT_STATUSES as [string, ...string[]], "Choose the establishment status."),
  dateEstablished,
});

export const businessUpdateSchema = businessCreateSchema.extend({ businessId: uuid });

export type BusinessInput = z.output<typeof businessCreateSchema>;

/** Field names used by the business form (also the keys echoed back on error). */
export const BUSINESS_FIELDS = Object.keys(businessCreateSchema.shape) as (keyof typeof businessCreateSchema.shape)[];

/** Search box on business lists: letters, numbers, spaces and a few safe characters only. */
export const businessSearchSchema = z
  .string()
  .trim()
  .max(80)
  .regex(/^[\p{L}\p{N} .'&-]*$/u, "Search contains unsupported characters.");

export const recordStatusFilter = z.enum(RECORD_STATUSES as [string, ...string[]]);

export const setRecordStatusSchema = z.object({
  businessId: uuid,
  status: z.enum(RECORD_STATUSES as [string, ...string[]], "Choose a record status."),
});
