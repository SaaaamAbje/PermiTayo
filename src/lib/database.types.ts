/**
 * Hand-written types for the Phase 2 schema (supabase/migrations).
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
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
