import { z } from "zod";
import { APPLICATION_STATUSES } from "@/lib/applications/constants";

/**
 * Validation for permit applications.
 *
 * Status, reference number and applicant are never accepted from the browser:
 * those fields are not in any schema, so parsing discards them. The database
 * enforces the same rules again (column grants, RLS and definer functions).
 */

const uuid = z.uuid("Invalid identifier.");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .transform((v) => (v === "" ? null : v));

const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `Enter the ${label}.`).min(2, `The ${label} is too short.`).max(max, `Use ${max} characters or fewer.`);

/** Fields of a draft. Only the business and the application type are needed to save one. */
const draftFields = {
  businessId: z.uuid("Select one of your business profiles."),
  permitTypeId: z.uuid("Choose an application type."),
  businessName: optionalText(200),
  businessAddress: optionalText(400),
  natureOfBusiness: optionalText(300),
  businessCategory: optionalText(120),
  applicantRemarks: optionalText(1000),
};

/** Permit application creation (saved as a draft). */
export const applicationCreateSchema = z.object(draftFields);

/** Permit application update (still a draft). */
export const applicationUpdateSchema = applicationCreateSchema.extend({ applicationId: uuid });

/** Everything required before a draft may be submitted. */
export const applicationSubmitSchema = z.object({
  ...draftFields,
  businessName: requiredText("business name", 200),
  businessAddress: requiredText("business address", 400),
  natureOfBusiness: requiredText("nature of business", 300),
  businessCategory: requiredText("business category", 120),
  declaration: z.literal("on", "Confirm that the information is accurate and that you have read the privacy notice."),
});

export const cancelApplicationSchema = z.object({
  applicationId: uuid,
  reason: optionalText(500),
});

export const deleteDraftSchema = z.object({ applicationId: uuid });

export const APPLICATION_FIELDS = [
  "businessId",
  "permitTypeId",
  "businessName",
  "businessAddress",
  "natureOfBusiness",
  "businessCategory",
  "applicantRemarks",
] as const;

/** Search box: reference number or business name. Excludes PostgREST filter syntax (, ( ) * % etc.). */
export const applicationSearchSchema = z
  .string()
  .trim()
  .max(80)
  .regex(/^[\p{L}\p{N} .'&-]*$/u, "Search contains unsupported characters.");

export const applicationStatusFilter = z.enum(APPLICATION_STATUSES as [string, ...string[]]);
export const applicationSortSchema = z.enum(["newest", "oldest"]);
