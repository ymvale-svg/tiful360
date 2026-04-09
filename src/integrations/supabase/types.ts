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
      activity_log: {
        Row: {
          action: string
          created_at: string
          details: string | null
          employee_id: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          performed_by: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: string | null
          employee_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          performed_by?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: string | null
          employee_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          category: string
          created_at: string
          id: string
          is_resolved: boolean
          related_asset_id: string | null
          related_employee_id: string | null
          resolved_at: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          target_date: string | null
          title: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          is_resolved?: boolean
          related_asset_id?: string | null
          related_employee_id?: string | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          target_date?: string | null
          title: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_resolved?: boolean
          related_asset_id?: string | null
          related_employee_id?: string | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          target_date?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_related_asset_id_fkey"
            columns: ["related_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_related_employee_id_fkey"
            columns: ["related_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          published_at: string
          title: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string
          title: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string
          title?: string
        }
        Relationships: []
      }
      asset_categories: {
        Row: {
          category_name: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          prefix: string
        }
        Insert: {
          category_name: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          prefix: string
        }
        Update: {
          category_name?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          prefix?: string
        }
        Relationships: []
      }
      assets: {
        Row: {
          asset_code: string
          asset_name: string
          category_id: string
          created_at: string
          current_owner_id: string | null
          custom_fields: Json | null
          expiry_date: string | null
          id: string
          notes: string | null
          serial_number: string | null
          status: Database["public"]["Enums"]["asset_status"]
          updated_at: string
        }
        Insert: {
          asset_code: string
          asset_name: string
          category_id: string
          created_at?: string
          current_owner_id?: string | null
          custom_fields?: Json | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["asset_status"]
          updated_at?: string
        }
        Update: {
          asset_code?: string
          asset_name?: string
          category_id?: string
          created_at?: string
          current_owner_id?: string | null
          custom_fields?: Json | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["asset_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "asset_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_current_owner_id_fkey"
            columns: ["current_owner_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      category_fields: {
        Row: {
          category_id: string
          created_at: string
          field_name: string
          field_options: Json | null
          field_type: Database["public"]["Enums"]["field_type"]
          id: string
          is_required: boolean
          sort_order: number
        }
        Insert: {
          category_id: string
          created_at?: string
          field_name: string
          field_options?: Json | null
          field_type?: Database["public"]["Enums"]["field_type"]
          id?: string
          is_required?: boolean
          sort_order?: number
        }
        Update: {
          category_id?: string
          created_at?: string
          field_name?: string
          field_options?: Json | null
          field_type?: Database["public"]["Enums"]["field_type"]
          id?: string
          is_required?: boolean
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "category_fields_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "asset_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_access: {
        Row: {
          access_type: string
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          permission_level: Database["public"]["Enums"]["permission_level"]
          resource_path: string
          status: Database["public"]["Enums"]["access_status"]
          updated_at: string
        }
        Insert: {
          access_type: string
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          permission_level?: Database["public"]["Enums"]["permission_level"]
          resource_path: string
          status?: Database["public"]["Enums"]["access_status"]
          updated_at?: string
        }
        Update: {
          access_type?: string
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          permission_level?: Database["public"]["Enums"]["permission_level"]
          resource_path?: string
          status?: Database["public"]["Enums"]["access_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "digital_access_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string
          department: string
          direct_manager_id: string | null
          email: string | null
          employee_code: string
          end_date: string | null
          full_name: string
          id: string
          id_number: string
          linked_user_id: string | null
          phone: string | null
          role: string
          start_date: string
          status: Database["public"]["Enums"]["employee_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          department: string
          direct_manager_id?: string | null
          email?: string | null
          employee_code: string
          end_date?: string | null
          full_name: string
          id?: string
          id_number: string
          linked_user_id?: string | null
          phone?: string | null
          role: string
          start_date?: string
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string
          direct_manager_id?: string | null
          email?: string | null
          employee_code?: string
          end_date?: string | null
          full_name?: string
          id?: string
          id_number?: string
          linked_user_id?: string | null
          phone?: string | null
          role?: string
          start_date?: string
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_direct_manager_id_fkey"
            columns: ["direct_manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      it_tickets: {
        Row: {
          assigned_to: string | null
          checklist: Json | null
          created_at: string
          employee_id: string
          id: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          resolved_at: string | null
          resolved_by: string | null
          sla_deadline: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          ticket_code: string
          ticket_type: Database["public"]["Enums"]["ticket_type"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          checklist?: Json | null
          created_at?: string
          employee_id: string
          id?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolved_at?: string | null
          resolved_by?: string | null
          sla_deadline?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_code: string
          ticket_type: Database["public"]["Enums"]["ticket_type"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          checklist?: Json | null
          created_at?: string
          employee_id?: string
          id?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolved_at?: string | null
          resolved_by?: string | null
          sla_deadline?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_code?: string
          ticket_type?: Database["public"]["Enums"]["ticket_type"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "it_tickets_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base: {
        Row: {
          category: string | null
          content: string | null
          created_at: string
          created_by: string | null
          file_url: string | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          file_url?: string | null
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          file_url?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          system_role: Database["public"]["Enums"]["system_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          system_role?: Database["public"]["Enums"]["system_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          system_role?: Database["public"]["Enums"]["system_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      access_status: "active" | "suspended" | "blocked"
      alert_severity: "critical" | "warning" | "info"
      app_role: "admin" | "it_manager" | "employee" | "super_admin"
      asset_status: "in_use" | "in_stock" | "in_repair" | "lost"
      employee_status: "active" | "onboarding" | "leaving" | "inactive"
      field_type: "text" | "number" | "date" | "list"
      permission_level: "read" | "write" | "admin"
      system_role: "admin" | "it" | "employee"
      ticket_priority: "critical" | "high" | "medium" | "low"
      ticket_status: "open" | "in_progress" | "done"
      ticket_type: "offboarding" | "access" | "software" | "hardware"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      access_status: ["active", "suspended", "blocked"],
      alert_severity: ["critical", "warning", "info"],
      app_role: ["admin", "it_manager", "employee", "super_admin"],
      asset_status: ["in_use", "in_stock", "in_repair", "lost"],
      employee_status: ["active", "onboarding", "leaving", "inactive"],
      field_type: ["text", "number", "date", "list"],
      permission_level: ["read", "write", "admin"],
      system_role: ["admin", "it", "employee"],
      ticket_priority: ["critical", "high", "medium", "low"],
      ticket_status: ["open", "in_progress", "done"],
      ticket_type: ["offboarding", "access", "software", "hardware"],
    },
  },
} as const
