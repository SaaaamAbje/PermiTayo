/** Shared application status types (statuses are used once permit processing opens). */
export type ApplicationStatus =
  | "Draft"
  | "Submitted"
  | "AI Pre-screening"
  | "Under BPLO Review"
  | "Needs Documents"
  | "In Departmental Review"
  | "For Approval"
  | "Approved"
  | "Returned"
  | "Released";

export interface TimelineEvent {
  title: string;
  office: string;
  when: string;
  state: "done" | "current" | "upcoming";
  note?: string;
}

export const statusTone: Record<ApplicationStatus, "neutral" | "info" | "warning" | "success" | "danger" | "brand"> = {
  Draft: "neutral",
  Submitted: "info",
  "AI Pre-screening": "brand",
  "Under BPLO Review": "info",
  "Needs Documents": "warning",
  "In Departmental Review": "info",
  "For Approval": "warning",
  Approved: "success",
  Returned: "danger",
  Released: "success",
};

