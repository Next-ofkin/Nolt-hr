export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      departments: {
        Row: {
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      employee_invitations: {
        Row: {
          accepted_at: string | null
          auth_user_id: string | null
          created_at: string
          email: string
          employee_id: string
          failed_at: string | null
          failure_code: string | null
          id: string
          invited_by: string | null
          revoked_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["employee_invitation_status"]
        }
        Insert: {
          accepted_at?: string | null
          auth_user_id?: string | null
          created_at?: string
          email: string
          employee_id: string
          failed_at?: string | null
          failure_code?: string | null
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          sent_at?: string | null
          status: Database["public"]["Enums"]["employee_invitation_status"]
        }
        Update: {
          accepted_at?: string | null
          auth_user_id?: string | null
          created_at?: string
          email?: string
          employee_id?: string
          failed_at?: string | null
          failure_code?: string | null
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["employee_invitation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "employee_invitations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_onboarding_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          created_at: string
          due_date: string | null
          employee_id: string
          id: string
          package_description_snapshot: string | null
          package_title_snapshot: string
          package_version_id: string
          package_version_number: number
          started_at: string | null
          state: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          assigned_by: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          employee_id: string
          id?: string
          package_description_snapshot?: string | null
          package_title_snapshot: string
          package_version_id: string
          package_version_number: number
          started_at?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          employee_id?: string
          id?: string
          package_description_snapshot?: string | null
          package_title_snapshot?: string
          package_version_id?: string
          package_version_number?: number
          started_at?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_onboarding_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_onboarding_assignments_package_version_id_fkey"
            columns: ["package_version_id"]
            isOneToOne: false
            referencedRelation: "onboarding_package_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_onboarding_items: {
        Row: {
          assignment_id: string
          completed_at: string | null
          created_at: string
          document_description: string | null
          document_title: string | null
          form_title_snapshot: string | null
          form_version_id: string | null
          form_version_number: number | null
          id: string
          item_type: string
          required: boolean
          sort_order: number
          source_package_item_id: string
          started_at: string | null
          state: string
          updated_at: string
        }
        Insert: {
          assignment_id: string
          completed_at?: string | null
          created_at?: string
          document_description?: string | null
          document_title?: string | null
          form_title_snapshot?: string | null
          form_version_id?: string | null
          form_version_number?: number | null
          id?: string
          item_type: string
          required: boolean
          sort_order: number
          source_package_item_id: string
          started_at?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          completed_at?: string | null
          created_at?: string
          document_description?: string | null
          document_title?: string | null
          form_title_snapshot?: string | null
          form_version_id?: string | null
          form_version_number?: number | null
          id?: string
          item_type?: string
          required?: boolean
          sort_order?: number
          source_package_item_id?: string
          started_at?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_onboarding_items_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "employee_onboarding_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_onboarding_items_form_version_id_fkey"
            columns: ["form_version_id"]
            isOneToOne: false
            referencedRelation: "form_definition_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_onboarding_items_source_package_item_id_fkey"
            columns: ["source_package_item_id"]
            isOneToOne: false
            referencedRelation: "onboarding_package_items"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          account_activated_at: string | null
          auth_user_id: string | null
          created_at: string
          department_id: string | null
          employment_type_id: string | null
          first_name: string
          id: string
          invited_at: string | null
          invited_by: string | null
          job_title: string | null
          last_name: string
          middle_name: string | null
          phone: string | null
          staff_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["employee_status"]
          updated_at: string
          work_email: string
        }
        Insert: {
          account_activated_at?: string | null
          auth_user_id?: string | null
          created_at?: string
          department_id?: string | null
          employment_type_id?: string | null
          first_name: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          job_title?: string | null
          last_name: string
          middle_name?: string | null
          phone?: string | null
          staff_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
          work_email: string
        }
        Update: {
          account_activated_at?: string | null
          auth_user_id?: string | null
          created_at?: string
          department_id?: string | null
          employment_type_id?: string | null
          first_name?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          job_title?: string | null
          last_name?: string
          middle_name?: string | null
          phone?: string | null
          staff_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
          work_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_employment_type_id_fkey"
            columns: ["employment_type_id"]
            isOneToOne: false
            referencedRelation: "employment_types"
            referencedColumns: ["id"]
          },
        ]
      }
      employment_types: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      form_definition_versions: {
        Row: {
          created_at: string
          created_by: string
          definition: Json
          form_definition_id: string
          id: string
          published_at: string | null
          published_by: string | null
          revision: number
          schema_version: number
          state: string
          updated_at: string
          updated_by: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by: string
          definition: Json
          form_definition_id: string
          id?: string
          published_at?: string | null
          published_by?: string | null
          revision?: number
          schema_version?: number
          state: string
          updated_at?: string
          updated_by: string
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string
          definition?: Json
          form_definition_id?: string
          id?: string
          published_at?: string | null
          published_by?: string | null
          revision?: number
          schema_version?: number
          state?: string
          updated_at?: string
          updated_by?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "form_definition_versions_form_definition_id_fkey"
            columns: ["form_definition_id"]
            isOneToOne: false
            referencedRelation: "form_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_definitions: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          title: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          title: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          title?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: []
      }
      onboarding_package_items: {
        Row: {
          created_at: string
          document_description: string | null
          document_title: string | null
          form_version_id: string | null
          id: string
          item_type: string
          package_version_id: string
          required: boolean
          sort_order: number
        }
        Insert: {
          created_at?: string
          document_description?: string | null
          document_title?: string | null
          form_version_id?: string | null
          id?: string
          item_type: string
          package_version_id: string
          required?: boolean
          sort_order: number
        }
        Update: {
          created_at?: string
          document_description?: string | null
          document_title?: string | null
          form_version_id?: string | null
          id?: string
          item_type?: string
          package_version_id?: string
          required?: boolean
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_package_items_form_version_id_fkey"
            columns: ["form_version_id"]
            isOneToOne: false
            referencedRelation: "form_definition_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_package_items_package_version_id_fkey"
            columns: ["package_version_id"]
            isOneToOne: false
            referencedRelation: "onboarding_package_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_package_versions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          onboarding_package_id: string
          published_at: string | null
          published_by: string | null
          revision: number
          state: string
          updated_at: string
          updated_by: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          onboarding_package_id: string
          published_at?: string | null
          published_by?: string | null
          revision?: number
          state: string
          updated_at?: string
          updated_by: string
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          onboarding_package_id?: string
          published_at?: string | null
          published_by?: string | null
          revision?: number
          state?: string
          updated_at?: string
          updated_by?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_package_versions_onboarding_package_id_fkey"
            columns: ["onboarding_package_id"]
            isOneToOne: false
            referencedRelation: "onboarding_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_packages: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          title: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          title: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          title?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_my_employee_account: { Args: never; Returns: Json }
      archive_form_definition: {
        Args: { p_form_definition_id: string }
        Returns: Json
      }
      archive_onboarding_package: {
        Args: { p_onboarding_package_id: string }
        Returns: Json
      }
      assign_onboarding_package: {
        Args: {
          p_due_date: string
          p_employee_id: string
          p_package_version_id: string
        }
        Returns: Json
      }
      cancel_onboarding_assignment: {
        Args: { p_assignment_id: string; p_reason: string }
        Returns: Json
      }
      create_form_definition: {
        Args: { p_definition: Json; p_description: string; p_title: string }
        Returns: Json
      }
      create_form_definition_draft: {
        Args: { p_form_definition_id: string }
        Returns: Json
      }
      create_onboarding_package: {
        Args: { p_description: string; p_title: string }
        Returns: Json
      }
      create_onboarding_package_draft: {
        Args: { p_onboarding_package_id: string }
        Returns: Json
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      delete_form_definition: {
        Args: { p_form_definition_id: string }
        Returns: Json
      }
      delete_onboarding_package: {
        Args: { p_onboarding_package_id: string }
        Returns: Json
      }
      finalize_employee_invitation: {
        Args: {
          p_auth_user_id: string
          p_employee_id: string
          p_invitation_id: string
          p_invited_by: string
        }
        Returns: undefined
      }
      publish_form_definition_draft: {
        Args: { p_form_definition_id: string }
        Returns: Json
      }
      publish_onboarding_package_draft: {
        Args: { p_onboarding_package_id: string }
        Returns: Json
      }
      save_form_definition_draft: {
        Args: {
          p_definition: Json
          p_description: string
          p_expected_revision: number
          p_form_definition_id: string
          p_title: string
        }
        Returns: Json
      }
      save_onboarding_package_draft: {
        Args: {
          p_description: string
          p_expected_revision: number
          p_items: Json
          p_onboarding_package_id: string
          p_title: string
        }
        Returns: Json
      }
      start_my_onboarding: { Args: { p_assignment_id: string }; Returns: Json }
      unarchive_form_definition: {
        Args: { p_form_definition_id: string }
        Returns: Json
      }
      unarchive_onboarding_package: {
        Args: { p_onboarding_package_id: string }
        Returns: Json
      }
      unpublish_onboarding_package_draft: {
        Args: { p_onboarding_package_id: string }
        Returns: Json
      }
      update_user_role: {
        Args: { p_role: string; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      employee_invitation_status:
        | "CREATING"
        | "PENDING"
        | "ACCEPTED"
        | "FAILED"
        | "REVOKED"
      employee_status:
        | "DRAFT"
        | "INVITED"
        | "PRE_ONBOARDING"
        | "HR_REVIEW"
        | "READY_TO_RESUME"
        | "POST_ONBOARDING"
        | "COMPLETED"
        | "SUSPENDED"
        | "ARCHIVED"
      user_role: "admin" | "hr" | "employee"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      employee_invitation_status: [
        "CREATING",
        "PENDING",
        "ACCEPTED",
        "FAILED",
        "REVOKED",
      ],
      employee_status: [
        "DRAFT",
        "INVITED",
        "PRE_ONBOARDING",
        "HR_REVIEW",
        "READY_TO_RESUME",
        "POST_ONBOARDING",
        "COMPLETED",
        "SUSPENDED",
        "ARCHIVED",
      ],
      user_role: ["admin", "hr", "employee"],
    },
  },
} as const

// Convenience aliases
export type UserRole = Database["public"]["Enums"]["user_role"]
export type EmployeeStatus = Database["public"]["Enums"]["employee_status"]
export type EmployeeInvitationStatus = Database["public"]["Enums"]["employee_invitation_status"]

export type Profile = Database["public"]["Tables"]["profiles"]["Row"]
export type Department = Database["public"]["Tables"]["departments"]["Row"]
export type EmploymentType = Database["public"]["Tables"]["employment_types"]["Row"]
export type Employee = Database["public"]["Tables"]["employees"]["Row"]
export type EmployeeInsert = Database["public"]["Tables"]["employees"]["Insert"]
export type EmployeeUpdate = Database["public"]["Tables"]["employees"]["Update"]
export type EmployeeInvitation = Database["public"]["Tables"]["employee_invitations"]["Row"]
export type EmployeeInvitationInsert = Database["public"]["Tables"]["employee_invitations"]["Insert"]
export type EmployeeInvitationUpdate = Database["public"]["Tables"]["employee_invitations"]["Update"]

export type FormDefinitionRow = Database["public"]["Tables"]["form_definitions"]["Row"]
export type FormDefinitionInsert = Database["public"]["Tables"]["form_definitions"]["Insert"]
export type FormDefinitionUpdate = Database["public"]["Tables"]["form_definitions"]["Update"]
export type FormDefinitionVersionRow = Database["public"]["Tables"]["form_definition_versions"]["Row"]

export type OnboardingPackageRow = Database["public"]["Tables"]["onboarding_packages"]["Row"]
export type OnboardingPackageInsert = Database["public"]["Tables"]["onboarding_packages"]["Insert"]
export type OnboardingPackageUpdate = Database["public"]["Tables"]["onboarding_packages"]["Update"]
export type OnboardingPackageVersionRow = Database["public"]["Tables"]["onboarding_package_versions"]["Row"]
export type OnboardingPackageItemRow = Database["public"]["Tables"]["onboarding_package_items"]["Row"]

export type EmployeeOnboardingAssignmentRow = Database["public"]["Tables"]["employee_onboarding_assignments"]["Row"]
export type EmployeeOnboardingItemRow = Database["public"]["Tables"]["employee_onboarding_items"]["Row"]
