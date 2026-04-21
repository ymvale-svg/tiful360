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
          company_id: string | null
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
          company_id?: string | null
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
          company_id?: string | null
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
            foreignKeyName: "activity_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_public"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          category: string
          company_id: string | null
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
          company_id?: string | null
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
          company_id?: string | null
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
            foreignKeyName: "alerts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "alerts_related_employee_id_fkey"
            columns: ["related_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_public"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          company_id: string | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          published_at: string
          title: string
        }
        Insert: {
          company_id?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string
          title: string
        }
        Update: {
          company_id?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_categories: {
        Row: {
          category_name: string
          company_id: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          prefix: string
        }
        Insert: {
          category_name: string
          company_id?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          prefix: string
        }
        Update: {
          category_name?: string
          company_id?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_handover_forms: {
        Row: {
          asset_id: string
          attached_document_url: string | null
          company_id: string
          created_at: string
          created_by: string | null
          delivery_method: string
          employee_id: string
          form_snapshot: Json
          id: string
          pdf_url: string | null
          sign_token: string
          signature_data: string | null
          signed_at: string | null
          status: string
        }
        Insert: {
          asset_id: string
          attached_document_url?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          delivery_method?: string
          employee_id: string
          form_snapshot?: Json
          id?: string
          pdf_url?: string | null
          sign_token?: string
          signature_data?: string | null
          signed_at?: string | null
          status?: string
        }
        Update: {
          asset_id?: string
          attached_document_url?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          delivery_method?: string
          employee_id?: string
          form_snapshot?: Json
          id?: string
          pdf_url?: string | null
          sign_token?: string
          signature_data?: string | null
          signed_at?: string | null
          status?: string
        }
        Relationships: []
      }
      assets: {
        Row: {
          asset_code: string
          asset_name: string
          category_id: string
          company_id: string | null
          condition: string
          created_at: string
          current_owner_id: string | null
          custom_fields: Json | null
          expiry_date: string | null
          id: string
          manufacturer_model: string | null
          notes: string | null
          serial_number: string | null
          status: Database["public"]["Enums"]["asset_status"]
          updated_at: string
        }
        Insert: {
          asset_code: string
          asset_name: string
          category_id: string
          company_id?: string | null
          condition?: string
          created_at?: string
          current_owner_id?: string | null
          custom_fields?: Json | null
          expiry_date?: string | null
          id?: string
          manufacturer_model?: string | null
          notes?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["asset_status"]
          updated_at?: string
        }
        Update: {
          asset_code?: string
          asset_name?: string
          category_id?: string
          company_id?: string | null
          condition?: string
          created_at?: string
          current_owner_id?: string | null
          custom_fields?: Json | null
          expiry_date?: string | null
          id?: string
          manufacturer_model?: string | null
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
            foreignKeyName: "assets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_current_owner_id_fkey"
            columns: ["current_owner_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_current_owner_id_fkey"
            columns: ["current_owner_id"]
            isOneToOne: false
            referencedRelation: "employees_public"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_corrections: {
        Row: {
          attachment_url: string | null
          attendance_record_id: string | null
          company_id: string
          correction_date: string
          created_at: string
          employee_id: string
          id: string
          initiated_by: string
          manager_id: string | null
          manager_note: string | null
          original_check_in: string | null
          original_check_out: string | null
          payroll_notified_at: string | null
          reason: string | null
          requested_check_in: string | null
          requested_check_out: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attachment_url?: string | null
          attendance_record_id?: string | null
          company_id: string
          correction_date: string
          created_at?: string
          employee_id: string
          id?: string
          initiated_by?: string
          manager_id?: string | null
          manager_note?: string | null
          original_check_in?: string | null
          original_check_out?: string | null
          payroll_notified_at?: string | null
          reason?: string | null
          requested_check_in?: string | null
          requested_check_out?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attachment_url?: string | null
          attendance_record_id?: string | null
          company_id?: string
          correction_date?: string
          created_at?: string
          employee_id?: string
          id?: string
          initiated_by?: string
          manager_id?: string | null
          manager_note?: string | null
          original_check_in?: string | null
          original_check_out?: string | null
          payroll_notified_at?: string | null
          reason?: string | null
          requested_check_in?: string | null
          requested_check_out?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      attendance_records: {
        Row: {
          check_in: string | null
          check_out: string | null
          company_id: string | null
          created_at: string
          date: string
          employee_id: string
          id: string
          notes: string | null
          source: string
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          company_id?: string | null
          created_at?: string
          date: string
          employee_id: string
          id?: string
          notes?: string | null
          source?: string
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          company_id?: string | null
          created_at?: string
          date?: string
          employee_id?: string
          id?: string
          notes?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_public"
            referencedColumns: ["id"]
          },
        ]
      }
      category_fields: {
        Row: {
          category_id: string
          company_id: string | null
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
          company_id?: string | null
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
          company_id?: string | null
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
          {
            foreignKeyName: "category_fields_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          logo_url: string | null
          name: string
          payroll_emails: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          logo_url?: string | null
          name: string
          payroll_emails?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          payroll_emails?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      digital_access: {
        Row: {
          access_type: string
          company_id: string | null
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
          company_id?: string | null
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
          company_id?: string | null
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
            foreignKeyName: "digital_access_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_access_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_access_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_public"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      employees: {
        Row: {
          balances_source: string | null
          balances_updated_at: string | null
          birth_date: string | null
          company_id: string | null
          contact_sort_order: number | null
          created_at: string
          department: string
          direct_manager_id: string | null
          email: string | null
          employee_code: string
          end_date: string | null
          exclude_from_contacts: boolean
          full_name: string
          id: string
          id_number: string
          linked_user_id: string | null
          phone: string | null
          role: string
          sick_balance: number
          start_date: string
          status: Database["public"]["Enums"]["employee_status"]
          updated_at: string
          vacation_balance: number
        }
        Insert: {
          balances_source?: string | null
          balances_updated_at?: string | null
          birth_date?: string | null
          company_id?: string | null
          contact_sort_order?: number | null
          created_at?: string
          department: string
          direct_manager_id?: string | null
          email?: string | null
          employee_code: string
          end_date?: string | null
          exclude_from_contacts?: boolean
          full_name: string
          id?: string
          id_number: string
          linked_user_id?: string | null
          phone?: string | null
          role: string
          sick_balance?: number
          start_date?: string
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
          vacation_balance?: number
        }
        Update: {
          balances_source?: string | null
          balances_updated_at?: string | null
          birth_date?: string | null
          company_id?: string | null
          contact_sort_order?: number | null
          created_at?: string
          department?: string
          direct_manager_id?: string | null
          email?: string | null
          employee_code?: string
          end_date?: string | null
          exclude_from_contacts?: boolean
          full_name?: string
          id?: string
          id_number?: string
          linked_user_id?: string | null
          phone?: string | null
          role?: string
          sick_balance?: number
          start_date?: string
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
          vacation_balance?: number
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_direct_manager_id_fkey"
            columns: ["direct_manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_direct_manager_id_fkey"
            columns: ["direct_manager_id"]
            isOneToOne: false
            referencedRelation: "employees_public"
            referencedColumns: ["id"]
          },
        ]
      }
      it_tickets: {
        Row: {
          assigned_to: string | null
          checklist: Json | null
          company_id: string | null
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
          company_id?: string | null
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
          company_id?: string | null
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
            foreignKeyName: "it_tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "it_tickets_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "it_tickets_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_public"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base: {
        Row: {
          category: string | null
          company_id: string | null
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
          company_id?: string | null
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
          company_id?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          file_url?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          attachment_url: string | null
          company_id: string
          created_at: string
          employee_id: string
          end_date: string
          id: string
          manager_id: string | null
          manager_note: string | null
          manager_notified_at: string | null
          payroll_notified_at: string | null
          reason: string | null
          request_type: Database["public"]["Enums"]["leave_request_type"]
          reviewed_at: string | null
          reviewed_by: string | null
          signed_pdf_url: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_request_status"]
          total_days: number
          updated_at: string
        }
        Insert: {
          attachment_url?: string | null
          company_id: string
          created_at?: string
          employee_id: string
          end_date: string
          id?: string
          manager_id?: string | null
          manager_note?: string | null
          manager_notified_at?: string | null
          payroll_notified_at?: string | null
          reason?: string | null
          request_type: Database["public"]["Enums"]["leave_request_type"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          signed_pdf_url?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["leave_request_status"]
          total_days?: number
          updated_at?: string
        }
        Update: {
          attachment_url?: string | null
          company_id?: string
          created_at?: string
          employee_id?: string
          end_date?: string
          id?: string
          manager_id?: string | null
          manager_note?: string | null
          manager_notified_at?: string | null
          payroll_notified_at?: string | null
          reason?: string | null
          request_type?: Database["public"]["Enums"]["leave_request_type"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          signed_pdf_url?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["leave_request_status"]
          total_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees_public"
            referencedColumns: ["id"]
          },
        ]
      }
      offboarding_forms: {
        Row: {
          attached_document_url: string | null
          company_id: string
          created_at: string
          created_by: string | null
          employee_id: string
          end_date: string | null
          form_index: number
          form_snapshot: Json
          id: string
          it_ticket_id: string | null
          pdf_url: string | null
          sign_token: string
          signature_data: string | null
          signed_at: string | null
          status: string
        }
        Insert: {
          attached_document_url?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          employee_id: string
          end_date?: string | null
          form_index?: number
          form_snapshot?: Json
          id?: string
          it_ticket_id?: string | null
          pdf_url?: string | null
          sign_token?: string
          signature_data?: string | null
          signed_at?: string | null
          status?: string
        }
        Update: {
          attached_document_url?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string
          end_date?: string | null
          form_index?: number
          form_snapshot?: Json
          id?: string
          it_ticket_id?: string | null
          pdf_url?: string | null
          sign_token?: string
          signature_data?: string | null
          signed_at?: string | null
          status?: string
        }
        Relationships: []
      }
      payslip_batches: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          failed_count: number
          id: string
          matched_count: number
          notes: string | null
          original_filename: string | null
          period_month: number
          period_year: number
          status: string
          total_pages: number
          unmatched_count: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          failed_count?: number
          id?: string
          matched_count?: number
          notes?: string | null
          original_filename?: string | null
          period_month: number
          period_year: number
          status?: string
          total_pages?: number
          unmatched_count?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          failed_count?: number
          id?: string
          matched_count?: number
          notes?: string | null
          original_filename?: string | null
          period_month?: number
          period_year?: number
          status?: string
          total_pages?: number
          unmatched_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "payslip_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payslips: {
        Row: {
          batch_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          employee_id: string | null
          employee_name_detected: string | null
          extraction_notes: string | null
          extraction_status: string
          gross_salary: number | null
          id: string
          id_number_detected: string | null
          net_salary: number | null
          pdf_url: string | null
          period_month: number
          period_year: number
          sick_balance: number | null
          vacation_balance: number | null
          work_days: number | null
          work_hours: number | null
        }
        Insert: {
          batch_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          employee_name_detected?: string | null
          extraction_notes?: string | null
          extraction_status?: string
          gross_salary?: number | null
          id?: string
          id_number_detected?: string | null
          net_salary?: number | null
          pdf_url?: string | null
          period_month: number
          period_year: number
          sick_balance?: number | null
          vacation_balance?: number | null
          work_days?: number | null
          work_hours?: number | null
        }
        Update: {
          batch_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          employee_name_detected?: string | null
          extraction_notes?: string | null
          extraction_status?: string
          gross_salary?: number | null
          id?: string
          id_number_detected?: string | null
          net_salary?: number | null
          pdf_url?: string | null
          period_month?: number
          period_year?: number
          sick_balance?: number | null
          vacation_balance?: number | null
          work_days?: number | null
          work_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payslips_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "payslip_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_public"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_contacts: {
        Row: {
          company_id: string | null
          created_at: string
          department: string
          id: string
          name: string
          phone: string
          role: string
          sort_order: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          department: string
          id?: string
          name: string
          phone: string
          role: string
          sort_order?: number
        }
        Update: {
          company_id?: string | null
          created_at?: string
          department?: string
          id?: string
          name?: string
          phone?: string
          role?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "portal_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_links: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          label: string
          sort_order: number
          url: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          label: string
          sort_order?: number
          url: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_company_access: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_company_access_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
      employees_public: {
        Row: {
          company_id: string | null
          created_at: string | null
          department: string | null
          direct_manager_id: string | null
          employee_code: string | null
          end_date: string | null
          full_name: string | null
          id: string | null
          linked_user_id: string | null
          role: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["employee_status"] | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          department?: string | null
          direct_manager_id?: string | null
          employee_code?: string | null
          end_date?: string | null
          full_name?: string | null
          id?: string | null
          linked_user_id?: string | null
          role?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["employee_status"] | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          department?: string | null
          direct_manager_id?: string | null
          employee_code?: string | null
          end_date?: string | null
          full_name?: string | null
          id?: string | null
          linked_user_id?: string | null
          role?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["employee_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_direct_manager_id_fkey"
            columns: ["direct_manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_direct_manager_id_fkey"
            columns: ["direct_manager_id"]
            isOneToOne: false
            referencedRelation: "employees_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      delete_company_cascade: {
        Args: { _company_id: string }
        Returns: undefined
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_company_birthdays: {
        Args: { _company_id: string }
        Returns: {
          birth_date: string
          full_name: string
          id: string
        }[]
      }
      get_company_contacts: {
        Args: { _company_id: string }
        Returns: {
          contact_sort_order: number
          department: string
          email: string
          full_name: string
          id: string
          phone: string
          role: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_company_admin: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_direct_manager_of: {
        Args: { _employee_id: string; _user_id: string }
        Returns: boolean
      }
      is_my_employee_record: {
        Args: { _employee_id: string; _user_id: string }
        Returns: boolean
      }
      is_operations: { Args: { _user_id: string }; Returns: boolean }
      is_payroll: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      user_company_ids: { Args: { _user_id: string }; Returns: string[] }
    }
    Enums: {
      access_status: "active" | "suspended" | "blocked"
      alert_severity: "critical" | "warning" | "info"
      app_role:
        | "admin"
        | "it_manager"
        | "employee"
        | "super_admin"
        | "direct_manager"
        | "payroll"
        | "operations"
      asset_status: "in_use" | "in_stock" | "in_repair" | "lost"
      employee_status: "active" | "onboarding" | "leaving" | "inactive"
      field_type: "text" | "number" | "date" | "list"
      leave_request_status: "pending" | "approved" | "rejected" | "cancelled"
      leave_request_type: "vacation" | "sick" | "personal" | "other"
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
      app_role: [
        "admin",
        "it_manager",
        "employee",
        "super_admin",
        "direct_manager",
        "payroll",
        "operations",
      ],
      asset_status: ["in_use", "in_stock", "in_repair", "lost"],
      employee_status: ["active", "onboarding", "leaving", "inactive"],
      field_type: ["text", "number", "date", "list"],
      leave_request_status: ["pending", "approved", "rejected", "cancelled"],
      leave_request_type: ["vacation", "sick", "personal", "other"],
      permission_level: ["read", "write", "admin"],
      system_role: ["admin", "it", "employee"],
      ticket_priority: ["critical", "high", "medium", "low"],
      ticket_status: ["open", "in_progress", "done"],
      ticket_type: ["offboarding", "access", "software", "hardware"],
    },
  },
} as const
