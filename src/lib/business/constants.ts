/**
 * Business profile labels and options. Safe to import from client components.
 *
 * Only the ownership types, establishment statuses and record statuses below are
 * fixed values. Business type and business category are free text on purpose:
 * Permitayo does not invent official business classifications or tax categories.
 */
import type { BadgeTone } from "@/components/ui/Badge";
import type { BusinessRecordStatus, EstablishmentStatus, OwnershipType } from "@/lib/database.types";

export const OWNERSHIP_TYPE_LABELS: Record<OwnershipType, string> = {
  sole_proprietorship: "Sole Proprietorship",
  partnership: "Partnership",
  corporation: "Corporation",
  cooperative: "Cooperative",
  other: "Other",
};
export const OWNERSHIP_TYPES = Object.keys(OWNERSHIP_TYPE_LABELS) as OwnershipType[];

export const ESTABLISHMENT_STATUS_LABELS: Record<EstablishmentStatus, string> = {
  not_yet_operating: "Not yet operating",
  operating: "Operating",
  temporarily_closed: "Temporarily closed",
  permanently_closed: "Permanently closed",
};
export const ESTABLISHMENT_STATUSES = Object.keys(ESTABLISHMENT_STATUS_LABELS) as EstablishmentStatus[];

export const RECORD_STATUS_LABELS: Record<BusinessRecordStatus, string> = {
  pending_verification: "Pending Verification",
  active: "Active",
  inactive: "Inactive",
};
export const RECORD_STATUSES = Object.keys(RECORD_STATUS_LABELS) as BusinessRecordStatus[];

export const RECORD_STATUS_TONES: Record<BusinessRecordStatus, BadgeTone> = {
  pending_verification: "warning",
  active: "success",
  inactive: "neutral",
};

/** Default address. Editable on every profile. */
export const DEFAULT_PROVINCE = "Batangas";
export const DEFAULT_MUNICIPALITY = "Rosario";

/** One-line address used to prefill applications and on summaries. */
export function formatBusinessAddress(b: {
  street_address: string | null;
  barangay: string;
  municipality: string;
  province: string;
  zip_code: string;
}) {
  const parts = [b.street_address?.trim(), b.barangay ? `Brgy. ${b.barangay}` : "", b.municipality, b.province].filter(Boolean);
  return `${parts.join(", ")}${b.zip_code ? ` ${b.zip_code}` : ""}`;
}

export function formatPeso(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}
