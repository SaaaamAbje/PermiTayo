/**
 * Role configuration for Permitayo.
 *
 * RoleId is the URL segment (/dashboard/<RoleId>). DbRole is the value stored in
 * profiles.role. The mapping below is the only place the two meet.
 * Navigation here is for display. Access is enforced on the server and by RLS.
 */

import type { DbRole } from "@/lib/database.types";

export type RoleId = "applicant" | "bplo" | "department" | "department-head" | "admin";

export type IconName =
  | "layout-dashboard"
  | "file-text"
  | "file-plus"
  | "folder-open"
  | "map-pin"
  | "message-square"
  | "user"
  | "inbox"
  | "shield-check"
  | "git-branch"
  | "bar-chart"
  | "clipboard-check"
  | "calendar"
  | "history"
  | "stamp"
  | "gauge"
  | "users"
  | "key"
  | "building"
  | "list-checks"
  | "sparkles"
  | "scroll-text"
  | "settings";

export interface NavItem {
  label: string;
  /** URL segment after /dashboard/[role]. Empty string = overview. */
  slug: string;
  icon: IconName;
  description: string;
  /** Short list shown on not-yet-built section pages. */
  planned: string[];
}

export interface RoleConfig {
  id: RoleId;
  dbRole: DbRole;
  label: string;
  tagline: string;
  nav: NavItem[];
}

const profileItem: NavItem = {
  label: "My Profile",
  slug: "profile",
  icon: "user",
  description: "Your account details.",
  planned: [],
};

export const ROLES: Record<RoleId, RoleConfig> = {
  applicant: {
    id: "applicant",
    dbRole: "applicant",
    label: "Applicant",
    tagline: "Apply for and track your business permit",
    nav: [
      { label: "Overview", slug: "", icon: "layout-dashboard", description: "Your applications at a glance.", planned: [] },
      { label: "My Applications", slug: "applications", icon: "file-text", description: "All of your new and renewal applications.", planned: ["Filter by status and year", "Open an application to see its full history", "Start a renewal from a prior permit"] },
      { label: "New Application", slug: "new-application", icon: "file-plus", description: "Start a new or renewal business permit application.", planned: [] },
      { label: "Documents", slug: "documents", icon: "folder-open", description: "Requirements you have uploaded and their verification status.", planned: ["Upload and replace documents", "See AI pre-check notes per document", "Download submitted copies"] },
      { label: "Status Tracker", slug: "tracking", icon: "map-pin", description: "Follow your application through each office.", planned: [] },
      { label: "Ask Permitayo", slug: "inquiries", icon: "message-square", description: "Ask questions about requirements, fees and next steps.", planned: [] },
      profileItem,
    ],
  },
  bplo: {
    id: "bplo",
    dbRole: "bplo_personnel",
    label: "BPLO Personnel",
    tagline: "Intake, verify and route business permit applications",
    nav: [
      { label: "Overview", slug: "", icon: "layout-dashboard", description: "Today's intake and processing workload.", planned: [] },
      { label: "Application Queue", slug: "queue", icon: "inbox", description: "Newly submitted and in-progress applications.", planned: [] },
      { label: "Requirements Verification", slug: "verification", icon: "shield-check", description: "Verify submitted documents against the checklist.", planned: ["Side-by-side document viewer", "AI pre-check findings with confidence", "Request missing documents from the applicant"] },
      { label: "Departmental Routing", slug: "routing", icon: "git-branch", description: "Send applications to the offices that must review them.", planned: ["AI-suggested routing with rationale", "Manual override with reason", "Parallel and sequential routing views"] },
      { label: "Inquiries", slug: "inquiries", icon: "message-square", description: "Citizen questions that need a human response.", planned: [] },
      { label: "Reports", slug: "reports", icon: "bar-chart", description: "Processing volumes and turnaround times.", planned: ["Daily and monthly processing summary", "Turnaround time per stage", "Export to CSV"] },
      profileItem,
    ],
  },
  department: {
    id: "department",
    dbRole: "department_personnel",
    label: "Department Personnel",
    tagline: "Review applications routed to your office",
    nav: [
      { label: "Overview", slug: "", icon: "layout-dashboard", description: "Your review workload.", planned: [] },
      { label: "Review Queue", slug: "reviews", icon: "inbox", description: "Applications waiting for your office.", planned: [] },
      { label: "Documents", slug: "documents", icon: "folder-open", description: "Documents relevant to your office's review.", planned: ["View applicant submissions", "Annotate and flag issues", "Compare against office requirements"] },
      { label: "Requirement Checklists", slug: "checklists", icon: "clipboard-check", description: "Office-specific checklists per application.", planned: ["Tick requirements met", "Record findings and remarks", "Request clarification"] },
      { label: "Inspections", slug: "inspections", icon: "calendar", description: "Scheduled on-site inspections.", planned: ["Inspection calendar", "Record inspection results", "Reschedule with notice to applicant"] },
      { label: "Decision History", slug: "history", icon: "history", description: "Your past recommendations and remarks.", planned: ["Search past decisions", "Filter by outcome", "View remarks and attachments"] },
      profileItem,
    ],
  },
  "department-head": {
    id: "department-head",
    dbRole: "department_head",
    label: "Department Head",
    tagline: "Oversee reviews and give departmental approval",
    nav: [
      { label: "Overview", slug: "", icon: "layout-dashboard", description: "Department performance and pending approvals.", planned: [] },
      { label: "For Approval", slug: "approvals", icon: "stamp", description: "Applications awaiting your decision.", planned: [] },
      { label: "Performance", slug: "performance", icon: "gauge", description: "Turnaround and workload for your department.", planned: ["Average review time trend", "Backlog ageing", "Compare against service-level targets"] },
      { label: "Reviewers", slug: "reviewers", icon: "users", description: "Reviewers in your department and their workload.", planned: ["Workload balance across reviewers", "Reassign applications", "Reviewer activity summary"] },
      { label: "Reports", slug: "reports", icon: "bar-chart", description: "Departmental reports.", planned: ["Monthly department summary", "Approval and return rates", "Export to PDF"] },
      profileItem,
    ],
  },
  admin: {
    id: "admin",
    dbRole: "administrator",
    label: "Administrator",
    tagline: "Configure Permitayo and manage access",
    nav: [
      { label: "Overview", slug: "", icon: "layout-dashboard", description: "System health and activity.", planned: [] },
      { label: "User Management", slug: "users", icon: "users", description: "Search accounts, change roles and status, and assign departments.", planned: [] },
      { label: "Roles & Access", slug: "access", icon: "key", description: "What each role can see and do.", planned: ["Permission matrix per role", "Department scoping", "Review of privileged accounts"] },
      { label: "Departments", slug: "departments", icon: "building", description: "Offices that participate in permit processing.", planned: [] },
      { label: "Requirement Templates", slug: "requirements", icon: "list-checks", description: "Requirement checklists by business type.", planned: ["Edit requirement lists by business type", "Version history", "Effective dates"] },
      { label: "AI Settings", slug: "ai-settings", icon: "sparkles", description: "Controls for AI assistance. No AI is connected yet.", planned: ["Enable or disable each AI assist", "Confidence thresholds for flagging", "Human review requirements"] },
      { label: "Audit Log", slug: "audit", icon: "scroll-text", description: "A record of significant system activity.", planned: [] },
      { label: "System Settings", slug: "settings", icon: "settings", description: "General configuration.", planned: ["Municipality details and branding", "Notification templates", "Retention policy"] },
      profileItem,
    ],
  },
};

export const ROLE_ORDER: RoleId[] = ["applicant", "bplo", "department", "department-head", "admin"];

export function isRoleId(value: string): value is RoleId {
  return Object.prototype.hasOwnProperty.call(ROLES, value);
}

const DB_TO_ROLE_ID: Record<DbRole, RoleId> = {
  applicant: "applicant",
  bplo_personnel: "bplo",
  department_personnel: "department",
  department_head: "department-head",
  administrator: "admin",
};

export function roleIdFromDbRole(role: DbRole): RoleId {
  return DB_TO_ROLE_ID[role];
}

export const DB_ROLE_LABELS: Record<DbRole, string> = {
  applicant: ROLES.applicant.label,
  bplo_personnel: ROLES.bplo.label,
  department_personnel: ROLES.department.label,
  department_head: ROLES["department-head"].label,
  administrator: ROLES.admin.label,
};

export const ALL_DB_ROLES = Object.keys(DB_ROLE_LABELS) as DbRole[];

export function dashboardHref(role: RoleId, slug = "") {
  return slug ? `/dashboard/${role}/${slug}` : `/dashboard/${role}`;
}
