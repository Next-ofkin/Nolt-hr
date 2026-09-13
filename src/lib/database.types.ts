export type UserRole = 'admin' | 'hr' | 'employee'

export type PublicSchema = {
  Tables: {
    profiles: {
      Row: {
        id: string
        email: string
        full_name: string | null
        role: UserRole
        created_at: string
        updated_at: string
      }
      Insert: {
        id: string
        email: string
        full_name?: string | null
        role?: UserRole
        created_at?: string
        updated_at?: string
      }
      Update: {
        id?: string
        email?: string
        full_name?: string | null
        role?: UserRole
        created_at?: string
        updated_at?: string
      }
      Relationships: []
    }
  }
  Views: Record<string, never>
  Functions: {
    update_user_role: {
      Args: {
        p_user_id: string
        p_role: string
      }
      Returns: undefined
    }
  }
  Enums: {
    user_role: UserRole
  }
  CompositeTypes: {
    [_ in never]: never
  }
}

export type Database = {
  public: PublicSchema
}

export type Profile = PublicSchema['Tables']['profiles']['Row']