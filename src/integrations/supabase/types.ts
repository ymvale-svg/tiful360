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
          default_notification_days_before: number | null
          description: string | null
          domain: string
          icon: string | null
          id: string
          is_assignable: boolean
          prefix: string
          protocol_type: Database["public"]["Enums"]["protocol_domain"]
          signing_protocol: string | null
          skip_handover_form: boolean
          skip_return_form: boolean
          sort_order: number
        }
        Insert: {
          category_name: string
          company_id?: string | null
          created_at?: string
          default_notification_days_before?: number | null
          description?: string | null
          domain?: string
          icon?: string | null
          id?: string
          is_assignable?: boolean
          prefix: string
          protocol_type?: Database["public"]["Enums"]["protocol_domain"]
          signing_protocol?: string | null
          skip_handover_form?: boolean
          skip_return_form?: boolean
          sort_order?: number
        }
        Update: {
          category_name?: string
          company_id?: string | null
          created_at?: string
          default_notification_days_before?: number | null
          description?: string | null
          domain?: string
          icon?: string | null
          id?: string
          is_assignable?: boolean
          prefix?: string
          protocol_type?: Database["public"]["Enums"]["protocol_domain"]
          signing_protocol?: string | null
          skip_handover_form?: boolean
          skip_return_form?: boolean
          sort_order?: number
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
      asset_documents: {
        Row: {
          asset_id: string
          company_id: string
          document_label: string | null
          document_type: string
          expiry_date: string | null
          file_name: string
          file_size_bytes: number | null
          file_url: string
          id: string
          notes: string | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          asset_id: string
          company_id: string
          document_label?: string | null
          document_type?: string
          expiry_date?: string | null
          file_name: string
          file_size_bytes?: number | null
          file_url: string
          id?: string
          notes?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          asset_id?: string
          company_id?: string
          document_label?: string | null
          document_type?: string
          expiry_date?: string | null
          file_name?: string
          file_size_bytes?: number | null
          file_url?: string
          id?: string
          notes?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      asset_groups: {
        Row: {
          category_id: string
          company_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id: string
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_groups_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "asset_categories"
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
          protocol_subtype: string | null
          protocol_type: string
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
          protocol_subtype?: string | null
          protocol_type?: string
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
          protocol_subtype?: string | null
          protocol_type?: string
          sign_token?: string
          signature_data?: string | null
          signed_at?: string | null
          status?: string
        }
        Relationships: []
      }
      assets: {
        Row: {
          account_url: string | null
          account_username: string | null
          asset_code: string
          asset_name: string
          category_id: string
          company_id: string | null
          condition: string
          created_at: string
          current_km: number | null
          current_owner_id: string | null
          custom_fields: Json | null
          expiry_date: string | null
          fuel_type: string | null
          group_id: string | null
          id: string
          insurance_company: string | null
          insurance_expiry: string | null
          insurance_policy_number: string | null
          license_expires_at: string | null
          license_expiry: string | null
          license_plate: string | null
          manufacturer_model: string | null
          mfa_enabled: boolean | null
          notes: string | null
          notification_days_before: number | null
          password_expires_at: string | null
          serial_number: string | null
          status: Database["public"]["Enums"]["asset_status"]
          test_expiry: string | null
          updated_at: string
          vehicle_type: string | null
          year_of_manufacture: number | null
        }
        Insert: {
          account_url?: string | null
          account_username?: string | null
          asset_code: string
          asset_name: string
          category_id: string
          company_id?: string | null
          condition?: string
          created_at?: string
          current_km?: number | null
          current_owner_id?: string | null
          custom_fields?: Json | null
          expiry_date?: string | null
          fuel_type?: string | null
          group_id?: string | null
          id?: string
          insurance_company?: string | null
          insurance_expiry?: string | null
          insurance_policy_number?: string | null
          license_expires_at?: string | null
          license_expiry?: string | null
          license_plate?: string | null
          manufacturer_model?: string | null
          mfa_enabled?: boolean | null
          notes?: string | null
          notification_days_before?: number | null
          password_expires_at?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["asset_status"]
          test_expiry?: string | null
          updated_at?: string
          vehicle_type?: string | null
          year_of_manufacture?: number | null
        }
        Update: {
          account_url?: string | null
          account_username?: string | null
          asset_code?: string
          asset_name?: string
          category_id?: string
          company_id?: string | null
          condition?: string
          created_at?: string
          current_km?: number | null
          current_owner_id?: string | null
          custom_fields?: Json | null
          expiry_date?: string | null
          fuel_type?: string | null
          group_id?: string | null
          id?: string
          insurance_company?: string | null
          insurance_expiry?: string | null
          insurance_policy_number?: string | null
          license_expires_at?: string | null
          license_expiry?: string | null
          license_plate?: string | null
          manufacturer_model?: string | null
          mfa_enabled?: boolean | null
          notes?: string | null
          notification_days_before?: number | null
          password_expires_at?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["asset_status"]
          test_expiry?: string | null
          updated_at?: string
          vehicle_type?: string | null
          year_of_manufacture?: number | null
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
          {
            foreignKeyName: "assets_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "asset_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_agent_heartbeats: {
        Row: {
          agent_version: string | null
          clock_ip: string | null
          clock_reachable: boolean | null
          company_id: string
          created_at: string
          device_key: string
          id: string
          last_error: string | null
          last_seen_at: string
          last_success_at: string | null
          updated_at: string
        }
        Insert: {
          agent_version?: string | null
          clock_ip?: string | null
          clock_reachable?: boolean | null
          company_id: string
          created_at?: string
          device_key?: string
          id?: string
          last_error?: string | null
          last_seen_at?: string
          last_success_at?: string | null
          updated_at?: string
        }
        Update: {
          agent_version?: string | null
          clock_ip?: string | null
          clock_reachable?: boolean | null
          company_id?: string
          created_at?: string
          device_key?: string
          id?: string
          last_error?: string | null
          last_seen_at?: string
          last_success_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_agent_heartbeats_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_corrections: {
        Row: {
          applied_at: string | null
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
          applied_at?: string | null
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
          applied_at?: string | null
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
      attendance_punches: {
        Row: {
          company_id: string
          created_at: string
          direction: string
          employee_code_raw: string
          employee_id: string | null
          id: string
          processed_at: string | null
          processed_by: string | null
          punch_at: string
          raw_payload: Json | null
          source: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          direction?: string
          employee_code_raw: string
          employee_id?: string | null
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          punch_at: string
          raw_payload?: Json | null
          source?: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          direction?: string
          employee_code_raw?: string
          employee_id?: string | null
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          punch_at?: string
          raw_payload?: Json | null
          source?: string
          status?: string
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
          is_expiry_field: boolean
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
          is_expiry_field?: boolean
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
          is_expiry_field?: boolean
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
          attendance_corrections_auto_approve: boolean
          created_at: string
          created_by: string | null
          expiry_notification_emails: string | null
          git_base_url: string | null
          git_custname: string | null
          git_default_site_code: string | null
          git_enabled: boolean
          git_password_encrypted: string | null
          git_username: string | null
          id: string
          it_emails: string | null
          logo_url: string | null
          name: string
          operations_emails: string | null
          payroll_emails: string | null
          portal_logo_url: string | null
          portal_name: string | null
          portal_primary_color: string | null
          updated_at: string
        }
        Insert: {
          attendance_corrections_auto_approve?: boolean
          created_at?: string
          created_by?: string | null
          expiry_notification_emails?: string | null
          git_base_url?: string | null
          git_custname?: string | null
          git_default_site_code?: string | null
          git_enabled?: boolean
          git_password_encrypted?: string | null
          git_username?: string | null
          id?: string
          it_emails?: string | null
          logo_url?: string | null
          name: string
          operations_emails?: string | null
          payroll_emails?: string | null
          portal_logo_url?: string | null
          portal_name?: string | null
          portal_primary_color?: string | null
          updated_at?: string
        }
        Update: {
          attendance_corrections_auto_approve?: boolean
          created_at?: string
          created_by?: string | null
          expiry_notification_emails?: string | null
          git_base_url?: string | null
          git_custname?: string | null
          git_default_site_code?: string | null
          git_enabled?: boolean
          git_password_encrypted?: string | null
          git_username?: string | null
          id?: string
          it_emails?: string | null
          logo_url?: string | null
          name?: string
          operations_emails?: string | null
          payroll_emails?: string | null
          portal_logo_url?: string | null
          portal_name?: string | null
          portal_primary_color?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_email_templates: {
        Row: {
          body_html: string
          company_id: string
          created_at: string
          id: string
          subject: string
          template_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body_html: string
          company_id: string
          created_at?: string
          id?: string
          subject: string
          template_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body_html?: string
          company_id?: string
          created_at?: string
          id?: string
          subject?: string
          template_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      company_holidays: {
        Row: {
          company_id: string
          created_at: string
          holiday_date: string
          id: string
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          holiday_date: string
          id?: string
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          holiday_date?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_holidays_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_access: {
        Row: {
          access_type: string
          company_id: string | null
          created_at: string
          employee_id: string
          id: string
          license_expires_at: string | null
          notes: string | null
          password_expires_at: string | null
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
          license_expires_at?: string | null
          notes?: string | null
          password_expires_at?: string | null
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
          license_expires_at?: string | null
          notes?: string | null
          password_expires_at?: string | null
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
      document_protocols: {
        Row: {
          body_template: string
          category_id: string | null
          company_id: string | null
          created_at: string
          display_name: string
          id: string
          protocol_type: string
          requires_employee_sig: boolean
          requires_issuer_sig: boolean
          updated_at: string
          validity_days: number | null
        }
        Insert: {
          body_template: string
          category_id?: string | null
          company_id?: string | null
          created_at?: string
          display_name: string
          id?: string
          protocol_type: string
          requires_employee_sig?: boolean
          requires_issuer_sig?: boolean
          updated_at?: string
          validity_days?: number | null
        }
        Update: {
          body_template?: string
          category_id?: string | null
          company_id?: string | null
          created_at?: string
          display_name?: string
          id?: string
          protocol_type?: string
          requires_employee_sig?: boolean
          requires_issuer_sig?: boolean
          updated_at?: string
          validity_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_protocols_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "asset_categories"
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
      employee_dependents: {
        Row: {
          birth_date: string | null
          company_id: string | null
          created_at: string
          employee_id: string
          full_name: string
          id: string
          id_number: string | null
          is_in_custody: boolean
          receives_allowance: boolean
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          company_id?: string | null
          created_at?: string
          employee_id: string
          full_name: string
          id?: string
          id_number?: string | null
          is_in_custody?: boolean
          receives_allowance?: boolean
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          company_id?: string | null
          created_at?: string
          employee_id?: string
          full_name?: string
          id?: string
          id_number?: string | null
          is_in_custody?: boolean
          receives_allowance?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          aliyah_date: string | null
          balances_source: string | null
          balances_updated_at: string | null
          birth_date: string | null
          birthday_calendar_preference: Database["public"]["Enums"]["birthday_calendar_pref"]
          can_remote_punch: boolean
          city: string | null
          company_id: string | null
          contact_sort_order: number | null
          country_of_birth: string | null
          created_at: string
          department: string
          direct_manager_id: string | null
          email: string | null
          employee_code: string
          end_date: string | null
          exclude_from_contacts: boolean
          full_name: string
          gender: string | null
          health_fund_member: boolean | null
          hebrew_birth_day: number | null
          hebrew_birth_month: number | null
          hebrew_birth_year: number | null
          house_number: string | null
          id: string
          id_number: string
          is_israeli_resident: boolean | null
          linked_user_id: string | null
          marital_status: string | null
          phone: string | null
          po_box: string | null
          postal_code: string | null
          role: string
          sick_balance: number
          start_date: string
          status: Database["public"]["Enums"]["employee_status"]
          street: string | null
          sub_employer_id: string | null
          tracks_attendance: boolean
          updated_at: string
          vacation_balance: number
          work_days: number[]
        }
        Insert: {
          aliyah_date?: string | null
          balances_source?: string | null
          balances_updated_at?: string | null
          birth_date?: string | null
          birthday_calendar_preference?: Database["public"]["Enums"]["birthday_calendar_pref"]
          can_remote_punch?: boolean
          city?: string | null
          company_id?: string | null
          contact_sort_order?: number | null
          country_of_birth?: string | null
          created_at?: string
          department: string
          direct_manager_id?: string | null
          email?: string | null
          employee_code: string
          end_date?: string | null
          exclude_from_contacts?: boolean
          full_name: string
          gender?: string | null
          health_fund_member?: boolean | null
          hebrew_birth_day?: number | null
          hebrew_birth_month?: number | null
          hebrew_birth_year?: number | null
          house_number?: string | null
          id?: string
          id_number: string
          is_israeli_resident?: boolean | null
          linked_user_id?: string | null
          marital_status?: string | null
          phone?: string | null
          po_box?: string | null
          postal_code?: string | null
          role: string
          sick_balance?: number
          start_date?: string
          status?: Database["public"]["Enums"]["employee_status"]
          street?: string | null
          sub_employer_id?: string | null
          tracks_attendance?: boolean
          updated_at?: string
          vacation_balance?: number
          work_days?: number[]
        }
        Update: {
          aliyah_date?: string | null
          balances_source?: string | null
          balances_updated_at?: string | null
          birth_date?: string | null
          birthday_calendar_preference?: Database["public"]["Enums"]["birthday_calendar_pref"]
          can_remote_punch?: boolean
          city?: string | null
          company_id?: string | null
          contact_sort_order?: number | null
          country_of_birth?: string | null
          created_at?: string
          department?: string
          direct_manager_id?: string | null
          email?: string | null
          employee_code?: string
          end_date?: string | null
          exclude_from_contacts?: boolean
          full_name?: string
          gender?: string | null
          health_fund_member?: boolean | null
          hebrew_birth_day?: number | null
          hebrew_birth_month?: number | null
          hebrew_birth_year?: number | null
          house_number?: string | null
          id?: string
          id_number?: string
          is_israeli_resident?: boolean | null
          linked_user_id?: string | null
          marital_status?: string | null
          phone?: string | null
          po_box?: string | null
          postal_code?: string | null
          role?: string
          sick_balance?: number
          start_date?: string
          status?: Database["public"]["Enums"]["employee_status"]
          street?: string | null
          sub_employer_id?: string | null
          tracks_attendance?: boolean
          updated_at?: string
          vacation_balance?: number
          work_days?: number[]
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
          {
            foreignKeyName: "employees_sub_employer_id_fkey"
            columns: ["sub_employer_id"]
            isOneToOne: false
            referencedRelation: "sub_employers"
            referencedColumns: ["id"]
          },
        ]
      }
      expiry_notifications_sent: {
        Row: {
          asset_id: string
          company_id: string
          expiry_date: string
          field_key: string
          id: string
          sent_at: string
        }
        Insert: {
          asset_id: string
          company_id: string
          expiry_date: string
          field_key?: string
          id?: string
          sent_at?: string
        }
        Update: {
          asset_id?: string
          company_id?: string
          expiry_date?: string
          field_key?: string
          id?: string
          sent_at?: string
        }
        Relationships: []
      }
      git_lookups_cache: {
        Row: {
          company_id: string
          data: Json
          fetched_at: string
          id: string
          lookup_key: string
          lookup_type: string
        }
        Insert: {
          company_id: string
          data?: Json
          fetched_at?: string
          id?: string
          lookup_key?: string
          lookup_type: string
        }
        Update: {
          company_id?: string
          data?: Json
          fetched_at?: string
          id?: string
          lookup_key?: string
          lookup_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "git_lookups_cache_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          external_source: string
          git_sernum: string | null
          git_site_code: string | null
          git_sservname: string | null
          git_sync_error: string | null
          git_sync_status: string
          git_synced_at: string | null
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
          external_source?: string
          git_sernum?: string | null
          git_site_code?: string | null
          git_sservname?: string | null
          git_sync_error?: string | null
          git_sync_status?: string
          git_synced_at?: string | null
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
          external_source?: string
          git_sernum?: string | null
          git_site_code?: string | null
          git_sservname?: string | null
          git_sync_error?: string | null
          git_sync_status?: string
          git_synced_at?: string | null
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
      offboarding_items: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          item_type: string
          notes: string | null
          owner_role: string
          process_id: string
          ref_id: string | null
          signed_document_id: string | null
          status: string
          title: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          item_type: string
          notes?: string | null
          owner_role: string
          process_id: string
          ref_id?: string | null
          signed_document_id?: string | null
          status?: string
          title: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          item_type?: string
          notes?: string | null
          owner_role?: string
          process_id?: string
          ref_id?: string | null
          signed_document_id?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "offboarding_items_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "offboarding_processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offboarding_items_signed_document_id_fkey"
            columns: ["signed_document_id"]
            isOneToOne: false
            referencedRelation: "signed_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      offboarding_processes: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          last_working_day: string
          pdf_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          last_working_day: string
          pdf_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          last_working_day?: string
          pdf_url?: string | null
          status?: string
          updated_at?: string
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
          page_indices: number[] | null
          pdf_url: string | null
          period_month: number
          period_year: number
          sick_balance: number | null
          source_pdf_url: string | null
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
          page_indices?: number[] | null
          pdf_url?: string | null
          period_month: number
          period_year: number
          sick_balance?: number | null
          source_pdf_url?: string | null
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
          page_indices?: number[] | null
          pdf_url?: string | null
          period_month?: number
          period_year?: number
          sick_balance?: number | null
          source_pdf_url?: string | null
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
          email: string | null
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
          email?: string | null
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
          email?: string | null
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
      signed_documents: {
        Row: {
          asset_id: string | null
          attached_doc_url: string | null
          company_id: string
          created_at: string
          employee_id: string | null
          employee_signature: string | null
          form_snapshot: Json
          id: string
          issued_at: string
          issuer_signature: string | null
          method: string
          notes: string | null
          pdf_url: string | null
          protocol_type: string
          returned_at: string | null
          signed_by: string | null
          training_id: string | null
        }
        Insert: {
          asset_id?: string | null
          attached_doc_url?: string | null
          company_id: string
          created_at?: string
          employee_id?: string | null
          employee_signature?: string | null
          form_snapshot?: Json
          id?: string
          issued_at?: string
          issuer_signature?: string | null
          method?: string
          notes?: string | null
          pdf_url?: string | null
          protocol_type: string
          returned_at?: string | null
          signed_by?: string | null
          training_id?: string | null
        }
        Update: {
          asset_id?: string | null
          attached_doc_url?: string | null
          company_id?: string
          created_at?: string
          employee_id?: string | null
          employee_signature?: string | null
          form_snapshot?: Json
          id?: string
          issued_at?: string
          issuer_signature?: string | null
          method?: string
          notes?: string | null
          pdf_url?: string | null
          protocol_type?: string
          returned_at?: string | null
          signed_by?: string | null
          training_id?: string | null
        }
        Relationships: []
      }
      sub_employers: {
        Row: {
          address: string | null
          city: string | null
          company_id: string
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          legal_name: string
          phone: string | null
          postal_code: string | null
          tax_id: string
          updated_at: string
          withholding_file_number: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          company_id: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name: string
          phone?: string | null
          postal_code?: string | null
          tax_id: string
          updated_at?: string
          withholding_file_number?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          company_id?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string
          phone?: string | null
          postal_code?: string | null
          tax_id?: string
          updated_at?: string
          withholding_file_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sub_employers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
      tax_form_101: {
        Row: {
          access_token: string | null
          company_id: string
          created_at: string
          created_by: string | null
          employee_id: string
          form_data: Json
          id: string
          pdf_url: string | null
          sent_at: string | null
          sent_to: string[] | null
          signature_data: string | null
          signed_at: string | null
          status: string
          sub_employer_id: string | null
          tax_year: number
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          employee_id: string
          form_data?: Json
          id?: string
          pdf_url?: string | null
          sent_at?: string | null
          sent_to?: string[] | null
          signature_data?: string | null
          signed_at?: string | null
          status?: string
          sub_employer_id?: string | null
          tax_year: number
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string
          form_data?: Json
          id?: string
          pdf_url?: string | null
          sent_at?: string | null
          sent_to?: string[] | null
          signature_data?: string | null
          signed_at?: string | null
          status?: string
          sub_employer_id?: string | null
          tax_year?: number
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_form_101_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_form_101_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_form_101_sub_employer_id_fkey"
            columns: ["sub_employer_id"]
            isOneToOne: false
            referencedRelation: "sub_employers"
            referencedColumns: ["id"]
          },
        ]
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
      apply_attendance_correction: {
        Args: { _correction_id: string }
        Returns: undefined
      }
      classify_existing_punches: {
        Args: { _company_id: string }
        Returns: number
      }
      complete_offboarding_item: {
        Args: {
          _item_id: string
          _notes?: string
          _signed_document_id?: string
        }
        Returns: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          item_type: string
          notes: string | null
          owner_role: string
          process_id: string
          ref_id: string | null
          signed_document_id: string | null
          status: string
          title: string
        }
        SetofOptions: {
          from: "*"
          to: "offboarding_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_offboarding_checklist: {
        Args: { _process_id: string }
        Returns: number
      }
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
      get_attendance_agent_status: {
        Args: { _company_id: string }
        Returns: {
          agent_version: string
          clock_ip: string
          clock_reachable: boolean
          device_key: string
          last_error: string
          last_seen_at: string
          last_success_at: string
        }[]
      }
      get_attendance_flow_stats: {
        Args: { _company_id: string }
        Returns: {
          count_5min: number
          count_hour: number
          count_today: number
          last_punch_at: string
        }[]
      }
      get_attendance_gaps: {
        Args: { _company_id: string; _from: string; _to: string }
        Returns: {
          email: string
          employee_id: string
          full_name: string
          gap_date: string
          gap_type: string
          punch_count: number
          punch_times: string
        }[]
      }
      get_company_birthdays: {
        Args: { _company_id: string }
        Returns: {
          birth_date: string
          birthday_calendar_preference: Database["public"]["Enums"]["birthday_calendar_pref"]
          full_name: string
          hebrew_birth_day: number
          hebrew_birth_month: number
          hebrew_birth_year: number
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
      get_company_routing_emails: {
        Args: { _company_id: string }
        Returns: {
          expiry_notification_emails: string
          it_emails: string
          operations_emails: string
          payroll_emails: string
        }[]
      }
      get_employee_holdings: {
        Args: { _employee_id: string }
        Returns: {
          assigned_at: string
          category_name: string
          display_code: string
          display_name: string
          domain: string
          expiry_date: string
          expiry_label: string
          icon: string
          item_id: string
          status: string
        }[]
      }
      get_expiring_assets: {
        Args: { _company_id: string; _days_ahead?: number }
        Returns: {
          asset_code: string
          asset_id: string
          asset_name: string
          assignee_role: string
          category_id: string
          category_name: string
          category_prefix: string
          current_owner_id: string
          custom_fields: Json
          days_left: number
          domain: string
          expiry_date: string
          expiry_type: string
          field_key: string
          field_label: string
          is_assignable: boolean
          owner_name: string
          source_id: string
          source_type: string
        }[]
      }
      get_handover_form_by_token: {
        Args: { _token: string }
        Returns: {
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
          protocol_subtype: string | null
          protocol_type: string
          sign_token: string
          signature_data: string | null
          signed_at: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "asset_handover_forms"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_live_employee_locations: {
        Args: { _company_id: string }
        Returns: {
          accuracy: number
          department: string
          direction: string
          employee_id: string
          full_name: string
          lat: number
          lng: number
          punch_at: string
          punch_id: string
          role: string
        }[]
      }
      get_offboarding_form_by_token: {
        Args: { _token: string }
        Returns: {
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
        }[]
        SetofOptions: {
          from: "*"
          to: "offboarding_forms"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_subordinate_employee_ids: {
        Args: { _manager_user_id: string }
        Returns: {
          employee_id: string
        }[]
      }
      get_tax_form_101_by_token: {
        Args: { _token: string }
        Returns: {
          access_token: string | null
          company_id: string
          created_at: string
          created_by: string | null
          employee_id: string
          form_data: Json
          id: string
          pdf_url: string | null
          sent_at: string | null
          sent_to: string[] | null
          signature_data: string | null
          signed_at: string | null
          status: string
          sub_employer_id: string | null
          tax_year: number
          token_expires_at: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tax_form_101"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      git_decrypt_password: {
        Args: { _cipher: string; _key: string }
        Returns: string
      }
      git_encrypt_password: {
        Args: { _key: string; _plain: string }
        Returns: string
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
      is_legal: { Args: { _user_id: string }; Returns: boolean }
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
      set_company_attendance_auto_approve: {
        Args: { _company_id: string; _value: boolean }
        Returns: boolean
      }
      set_company_routing_emails: {
        Args: { _column: string; _company_id: string; _emails: string }
        Returns: undefined
      }
      set_employee_remote_punch: {
        Args: { _employee_id: string; _value: boolean }
        Returns: {
          aliyah_date: string | null
          balances_source: string | null
          balances_updated_at: string | null
          birth_date: string | null
          birthday_calendar_preference: Database["public"]["Enums"]["birthday_calendar_pref"]
          can_remote_punch: boolean
          city: string | null
          company_id: string | null
          contact_sort_order: number | null
          country_of_birth: string | null
          created_at: string
          department: string
          direct_manager_id: string | null
          email: string | null
          employee_code: string
          end_date: string | null
          exclude_from_contacts: boolean
          full_name: string
          gender: string | null
          health_fund_member: boolean | null
          hebrew_birth_day: number | null
          hebrew_birth_month: number | null
          hebrew_birth_year: number | null
          house_number: string | null
          id: string
          id_number: string
          is_israeli_resident: boolean | null
          linked_user_id: string | null
          marital_status: string | null
          phone: string | null
          po_box: string | null
          postal_code: string | null
          role: string
          sick_balance: number
          start_date: string
          status: Database["public"]["Enums"]["employee_status"]
          street: string | null
          sub_employer_id: string | null
          tracks_attendance: boolean
          updated_at: string
          vacation_balance: number
          work_days: number[]
        }
        SetofOptions: {
          from: "*"
          to: "employees"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sign_handover_form_by_token: {
        Args: {
          _attached_url: string
          _form_snapshot: Json
          _pdf_url: string
          _signature: string
          _token: string
        }
        Returns: {
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
          protocol_subtype: string | null
          protocol_type: string
          sign_token: string
          signature_data: string | null
          signed_at: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "asset_handover_forms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sign_offboarding_form_by_token: {
        Args: {
          _attached_url: string
          _form_snapshot: Json
          _pdf_url: string
          _signature: string
          _token: string
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "offboarding_forms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_tax_form_101_by_token: {
        Args: {
          _form_data: Json
          _pdf_url: string
          _signature: string
          _token: string
        }
        Returns: {
          access_token: string | null
          company_id: string
          created_at: string
          created_by: string | null
          employee_id: string
          form_data: Json
          id: string
          pdf_url: string | null
          sent_at: string | null
          sent_to: string[] | null
          signature_data: string | null
          signed_at: string | null
          status: string
          sub_employer_id: string | null
          tax_year: number
          token_expires_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tax_form_101"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_my_birthday_preference: {
        Args: {
          _hebrew_day?: number
          _hebrew_month?: number
          _hebrew_year?: number
          _preference: Database["public"]["Enums"]["birthday_calendar_pref"]
        }
        Returns: {
          aliyah_date: string | null
          balances_source: string | null
          balances_updated_at: string | null
          birth_date: string | null
          birthday_calendar_preference: Database["public"]["Enums"]["birthday_calendar_pref"]
          can_remote_punch: boolean
          city: string | null
          company_id: string | null
          contact_sort_order: number | null
          country_of_birth: string | null
          created_at: string
          department: string
          direct_manager_id: string | null
          email: string | null
          employee_code: string
          end_date: string | null
          exclude_from_contacts: boolean
          full_name: string
          gender: string | null
          health_fund_member: boolean | null
          hebrew_birth_day: number | null
          hebrew_birth_month: number | null
          hebrew_birth_year: number | null
          house_number: string | null
          id: string
          id_number: string
          is_israeli_resident: boolean | null
          linked_user_id: string | null
          marital_status: string | null
          phone: string | null
          po_box: string | null
          postal_code: string | null
          role: string
          sick_balance: number
          start_date: string
          status: Database["public"]["Enums"]["employee_status"]
          street: string | null
          sub_employer_id: string | null
          tracks_attendance: boolean
          updated_at: string
          vacation_balance: number
          work_days: number[]
        }
        SetofOptions: {
          from: "*"
          to: "employees"
          isOneToOne: true
          isSetofReturn: false
        }
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
        | "finance"
        | "legal"
      asset_status: "in_use" | "in_stock" | "in_repair" | "lost"
      birthday_calendar_pref: "gregorian" | "hebrew"
      employee_status: "active" | "onboarding" | "leaving" | "inactive"
      field_type: "text" | "number" | "date" | "list" | "list_multi"
      leave_request_status: "pending" | "approved" | "rejected" | "cancelled"
      leave_request_type: "vacation" | "sick" | "personal" | "other"
      permission_level: "read" | "write" | "admin"
      protocol_domain:
        | "physical"
        | "vehicle"
        | "digital"
        | "license"
        | "insurance"
        | "training"
        | "real_estate"
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
        "finance",
        "legal",
      ],
      asset_status: ["in_use", "in_stock", "in_repair", "lost"],
      birthday_calendar_pref: ["gregorian", "hebrew"],
      employee_status: ["active", "onboarding", "leaving", "inactive"],
      field_type: ["text", "number", "date", "list", "list_multi"],
      leave_request_status: ["pending", "approved", "rejected", "cancelled"],
      leave_request_type: ["vacation", "sick", "personal", "other"],
      permission_level: ["read", "write", "admin"],
      protocol_domain: [
        "physical",
        "vehicle",
        "digital",
        "license",
        "insurance",
        "training",
        "real_estate",
      ],
      system_role: ["admin", "it", "employee"],
      ticket_priority: ["critical", "high", "medium", "low"],
      ticket_status: ["open", "in_progress", "done"],
      ticket_type: ["offboarding", "access", "software", "hardware"],
    },
  },
} as const
