/**
 * Hand-written types for the Phase 2 and Phase 3 schema (supabase/migrations).
 * Replace with generated types (`supabase gen types typescript`) once a
 * project is linked; the shape below matches that output.
 */

export type DbRole =
  | "applicant"
  | "bplo_personnel"
  | "department_personnel"
  | "department_head"
  | "administrator";

export type AccountStatus = "active" | "inactive" | "suspended" | "pending";

export type OwnershipType = "sole_proprietorship" | "partnership" | "corporation" | "cooperative" | "other";
export type EstablishmentStatus = "not_yet_operating" | "operating" | "temporarily_closed" | "permanently_closed";
export type BusinessRecordStatus = "pending_verification" | "active" | "inactive";
export type DbApplicationStatus = "draft" | "submitted" | "cancelled";

/** Columns an applicant may write on business_establishments (enforced by column grants). */
export type BusinessWritable = {
  registered_business_name: string;
  trade_name: string | null;
  business_description: string | null;
  business_type: string;
  ownership_type: OwnershipType;
  business_category: string;
  business_email: string | null;
  business_contact_number: string;
  province: string;
  municipality: string;
  barangay: string;
  street_address: string | null;
  zip_code: string;
  owner_full_name: string;
  owner_email: string | null;
  owner_contact_number: string;
  nature_of_business: string;
  employee_count: number;
  estimated_capital: number | null;
  establishment_status: EstablishmentStatus;
  date_established: string | null;
};

/** Columns an applicant may write on permit_applications while it is a draft. */
export type ApplicationWritable = {
  business_id: string;
  permit_type_id: string;
  business_name: string | null;
  business_address: string | null;
  nature_of_business: string | null;
  business_category: string | null;
  applicant_remarks: string | null;
};

/** Frozen copy stored on submission (see submit_permit_application). */
export type SubmissionSnapshot = {
  applicant: { full_name: string; email: string; phone_number: string | null };
  permit_type: { name: string; application_code: string };
  business: Omit<BusinessWritable, "estimated_capital"> & {
    id: string;
    business_reference_number: string;
    record_status: BusinessRecordStatus;
    estimated_capital: number | string | null;
    created_at: string;
    updated_at: string;
  };
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          phone_number: string | null;
          role: DbRole;
          account_status: AccountStatus;
          privacy_notice_accepted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        // Browsers may only update these two columns (enforced by column grants).
        Insert: never;
        Update: { full_name?: string; phone_number?: string | null };
        Relationships: [];
      };
      departments: {
        Row: {
          id: string;
          department_name: string;
          department_code: string;
          description: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          department_name: string;
          department_code: string;
          description?: string | null;
          is_active?: boolean;
        };
        Update: {
          department_name?: string;
          department_code?: string;
          description?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
      department_members: {
        Row: {
          id: string;
          profile_id: string;
          department_id: string;
          department_position: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "department_members_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "department_members_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          description: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      permit_types: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          application_code: string;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: { name: string; application_code: string; description?: string | null; is_active?: boolean; sort_order?: number };
        Update: { name?: string; description?: string | null; is_active?: boolean; sort_order?: number };
        Relationships: [];
      };
      business_establishments: {
        Row: BusinessWritable & {
          id: string;
          owner_id: string;
          business_reference_number: string;
          record_status: BusinessRecordStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<BusinessWritable> &
          Pick<
            BusinessWritable,
            | "registered_business_name"
            | "business_type"
            | "ownership_type"
            | "business_category"
            | "business_contact_number"
            | "barangay"
            | "zip_code"
            | "owner_full_name"
            | "owner_contact_number"
            | "nature_of_business"
            | "establishment_status"
          >;
        Update: Partial<BusinessWritable>;
        Relationships: [
          {
            foreignKeyName: "business_establishments_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      permit_applications: {
        Row: ApplicationWritable & {
          id: string;
          reference_number: string | null;
          applicant_id: string;
          application_status: DbApplicationStatus;
          submission_snapshot: SubmissionSnapshot | null;
          cancellation_reason: string | null;
          cancelled_by: string | null;
          submitted_at: string | null;
          cancelled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<ApplicationWritable> & Pick<ApplicationWritable, "business_id" | "permit_type_id">;
        Update: Partial<ApplicationWritable>;
        Relationships: [
          {
            foreignKeyName: "permit_applications_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "business_establishments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "permit_applications_permit_type_id_fkey";
            columns: ["permit_type_id"];
            isOneToOne: false;
            referencedRelation: "permit_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "permit_applications_applicant_id_fkey";
            columns: ["applicant_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      application_status_history: {
        Row: {
          id: string;
          application_id: string;
          previous_status: DbApplicationStatus | null;
          new_status: DbApplicationStatus;
          changed_by: string | null;
          remarks: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "application_status_history_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "permit_applications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "application_status_history_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      log_self_event: { Args: { p_action: string }; Returns: undefined };
      admin_set_user_role: { Args: { p_target: string; p_role: string }; Returns: undefined };
      admin_set_account_status: { Args: { p_target: string; p_status: string }; Returns: undefined };
      admin_assign_department: {
        Args: { p_profile: string; p_department: string; p_position?: string | null };
        Returns: undefined;
      };
      admin_remove_department_assignment: { Args: { p_member: string }; Returns: undefined };
      submit_permit_application: { Args: { p_application: string }; Returns: string };
      cancel_permit_application: { Args: { p_application: string; p_reason?: string | null }; Returns: undefined };
      set_business_record_status: { Args: { p_business: string; p_status: string }; Returns: undefined };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
