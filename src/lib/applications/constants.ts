/** Application status labels for Phase 3. Safe to import from client components. */
import type { BadgeTone } from "@/components/ui/Badge";
import type { DbApplicationStatus } from "@/lib/database.types";

export const APPLICATION_STATUS_LABELS: Record<DbApplicationStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  cancelled: "Cancelled",
};
export const APPLICATION_STATUSES = Object.keys(APPLICATION_STATUS_LABELS) as DbApplicationStatus[];

export const APPLICATION_STATUS_TONES: Record<DbApplicationStatus, BadgeTone> = {
  draft: "neutral",
  submitted: "info",
  cancelled: "danger",
};

export const APPLICATIONS_PAGE_SIZE = 15;
