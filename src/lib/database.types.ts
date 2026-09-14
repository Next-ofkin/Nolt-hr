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
      form_fields: {
        Row: {
          configuration: Json
          created_at: string
          description: string | null
          field_key: string
          field_type: Database["public"]["Enums"]["form_field_type"]
          form_version_id: string
          id: string
          label: string | null
          placeholder: string | null
          position: number
          required: boolean
          updated_at: string
        }
        Insert: {
          configuration?: Json
          created_at?: string
          description?: string | null
          field_key: string
          field_type: Database["public"]["Enums"]["form_field_type"]
          form_version_id: string
          id?: string
          label?: string | null
          placeholder?: string | null
          position: number
          required?: boolean
          updated_at?: string
        }
        Update: {
          configuration?: Json
          created_at?: string
          description?: string | null
          field_key?: string
          field_type?: Database["public"]["Enums"]["form_field_type"]
          form_version_id?: string
          id?: string
          label?: string | null
          placeholder?: string | null
          position?: number
          required?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_fields_form_version_id_fkey"
            columns: ["form_version_id"]
            isOneToOne: false
            referencedRelation: "form_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_templates: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      form_versions: {
        Row: {
          created_at: string
          description: string | null
          form_template_id: string
          id: string
          instructions: string | null
          published_at: string | null
          published_by: string | null
          status: Database["public"]["Enums"]["form_version_status"]
          title: string
          updated_at: string
          version_number: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          form_template_id: string
          id?: string
          instructions?: string | null
          published_at?: string | null
          published_by?: string | null
          status?: Database["public"]["Enums"]["form_version_status"]
          title: string
          updated_at?: string
          version_number: number
        }
        Update: {
          created_at?: string
          description?: string | null
          form_template_id?: string
          id?: string
          instructions?: string | null
          published_at?: string | null
          published_by?: string | null
          status?: Database["public"]["Enums"]["form_version_status"]
          title?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "form_versions_form_template_id_fkey"
            columns: ["form_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
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
      activate_my_employee_account: {
        Args: Record<string, never>
        Returns: Json
      }
      create_form_draft_from_version: {
        Args: { p_form_version_id: string }
        Returns: Json
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      finalize_employee_invitation: {
        Args: {
          p_employee_id: string
          p_invitation_id: string
          p_auth_user_id: string
          p_invited_by: string
        }
        Returns: undefined
      }
      publish_form_version: {
        Args: { p_form_version_id: string }
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
      form_field_type:
        | "SHORT_TEXT"
        | "LONG_TEXT"
        | "EMAIL"
        | "PHONE"
        | "NUMBER"
        | "DATE"
        | "DROPDOWN"
        | "RADIO"
        | "CHECKBOX"
        | "YES_NO"
        | "FILE_UPLOAD"
        | "SIGNATURE"
        | "HEADING"
        | "PARAGRAPH"
        | "DIVIDER"
        | "REPEATING_GROUP"
      form_version_status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
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
      form_field_type: [
        "SHORT_TEXT",
        "LONG_TEXT",
        "EMAIL",
        "PHONE",
        "NUMBER",
        "DATE",
        "DROPDOWN",
        "RADIO",
        "CHECKBOX",
        "YES_NO",
        "FILE_UPLOAD",
        "SIGNATURE",
        "HEADING",
        "PARAGRAPH",
        "DIVIDER",
        "REPEATING_GROUP",
      ],
      form_version_status: ["DRAFT", "PUBLISHED", "ARCHIVED"],
      user_role: ["admin", "hr", "employee"],
    },
  },
} as const

// Convenience aliases
export type UserRole = Database["public"]["Enums"]["user_role"]
export type EmployeeStatus = Database["public"]["Enums"]["employee_status"]
export type EmployeeInvitationStatus = Database["public"]["Enums"]["employee_invitation_status"]
export type FormFieldType = Database["public"]["Enums"]["form_field_type"]
export type FormVersionStatus = Database["public"]["Enums"]["form_version_status"]

export type Profile = Database["public"]["Tables"]["profiles"]["Row"]
export type Department = Database["public"]["Tables"]["departments"]["Row"]
export type EmploymentType = Database["public"]["Tables"]["employment_types"]["Row"]
export type Employee = Database["public"]["Tables"]["employees"]["Row"]
export type EmployeeInsert = Database["public"]["Tables"]["employees"]["Insert"]
export type EmployeeUpdate = Database["public"]["Tables"]["employees"]["Update"]
export type EmployeeInvitation = Database["public"]["Tables"]["employee_invitations"]["Row"]
export type EmployeeInvitationInsert = Database["public"]["Tables"]["employee_invitations"]["Insert"]
export type EmployeeInvitationUpdate = Database["public"]["Tables"]["employee_invitations"]["Update"]

export type FormTemplate = Database["public"]["Tables"]["form_templates"]["Row"]
export type FormTemplateInsert = Database["public"]["Tables"]["form_templates"]["Insert"]
export type FormTemplateUpdate = Database["public"]["Tables"]["form_templates"]["Update"]

export type FormVersion = Database["public"]["Tables"]["form_versions"]["Row"]
export type FormVersionInsert = Database["public"]["Tables"]["form_versions"]["Insert"]
export type FormVersionUpdate = Database["public"]["Tables"]["form_versions"]["Update"]

export type FormField = Database["public"]["Tables"]["form_fields"]["Row"]
export type FormFieldInsert = Database["public"]["Tables"]["form_fields"]["Insert"]
export type FormFieldUpdate = Database["public"]["Tables"]["form_fields"]["Update"]
