import { z } from "zod";
import { ABSOLUTE_MAX_FILE_SIZE, DOCUMENT_MIME_TYPES, MB, MIN_MAX_FILE_SIZE, REVIEW_STATUSES } from "@/lib/documents/constants";

/**
 * Validation for requirements and documents. The database enforces the same
 * limits again (CHECK constraints, register/review functions, storage policies).
 */

const uuid = z.uuid("Invalid identifier.");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .transform((v) => (v === "" ? null : v));

/** Requirement form (strings from FormData; checkboxes send "on"). */
export const requirementFormSchema = z.object({
  name: z.string().trim().min(1, "Enter the requirement name.").min(2, "The name is too short.").max(160, "Use 160 characters or fewer."),
  description: optionalText(1000),
  applicantInstructions: optionalText(1000),
  isRequired: z.enum(["required", "optional"], "Choose whether this document is required."),
  acceptedFileTypes: z
    .array(z.enum(DOCUMENT_MIME_TYPES as [string, ...string[]], "Unsupported file type."))
    .min(1, "Choose at least one accepted file format.")
    .transform((v) => [...new Set(v)]),
  maxFileSizeMb: z
    .string()
    .trim()
    .min(1, "Enter the maximum file size.")
    .regex(/^\d+(\.\d)?$/, "Enter a number of megabytes, for example 5 or 2.5.")
    .transform((v) => Math.round(Number(v) * MB))
    .refine((v) => v >= MIN_MAX_FILE_SIZE && v <= ABSOLUTE_MAX_FILE_SIZE, "Choose a size between 0.1 MB and 10 MB."),
  displayOrder: z
    .string()
    .trim()
    .regex(/^\d{1,5}$/, "Enter a whole number from 0 to 10000.")
    .transform((v) => Number(v))
    .refine((v) => v <= 10000, "Enter a whole number from 0 to 10000."),
  isActive: z.enum(["on", ""]).optional().transform((v) => v === "on"),
});

export const requirementCreateSchema = requirementFormSchema.extend({ permitTypeId: uuid });
export const requirementUpdateSchema = requirementFormSchema.extend({ requirementId: uuid });
export const requirementToggleSchema = z.object({ requirementId: uuid, active: z.enum(["true", "false"]) });

/** First step of an upload: what the browser says it is about to send. */
export const prepareUploadSchema = z.object({
  applicationId: uuid,
  requirementId: uuid,
  fileName: z.string().trim().min(1, "The file has no name.").max(255, "The file name is too long."),
  fileSize: z.number().int().min(1, "The file is empty.").max(ABSOLUTE_MAX_FILE_SIZE, "The file is larger than 10 MB."),
  mimeType: z.enum(DOCUMENT_MIME_TYPES as [string, ...string[]], "Only PDF, JPG and PNG files are accepted."),
});

/** Second step: the object that was uploaded to Storage. The path is re-checked on the server. */
export const finalizeUploadSchema = z.object({
  applicationId: uuid,
  requirementId: uuid,
  path: z
    .string()
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png)$/,
      "Invalid upload.",
    ),
  fileName: z.string().trim().min(1).max(255),
});

export const documentAccessSchema = z.object({ documentId: uuid, mode: z.enum(["view", "download"]) });

export const reviewDocumentSchema = z
  .object({
    documentId: uuid,
    status: z.enum(REVIEW_STATUSES, "Choose a review decision."),
    comment: optionalText(1000),
  })
  .refine((v) => v.status !== "needs_resubmission" || v.comment !== null, {
    path: ["comment"],
    message: "Explain what the applicant needs to fix.",
  });
