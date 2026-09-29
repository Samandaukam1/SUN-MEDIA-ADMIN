export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      announcement_reads: {
        Row: {
          announcement_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience_roles: string[] | null
          author_id: string | null
          body: string
          created_at: string
          deleted_at: string | null
          expires_at: string | null
          id: string
          is_pinned: boolean
          published_at: string
          title: string
          updated_at: string
        }
        Insert: {
          audience_roles?: string[] | null
          author_id?: string | null
          body: string
          created_at?: string
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          is_pinned?: boolean
          published_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          audience_roles?: string[] | null
          author_id?: string | null
          body?: string
          created_at?: string
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          is_pinned?: boolean
          published_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      attendance: {
        Row: {
          arrived_at: string | null
          created_at: string
          id: string
          late_minutes: number
          marked_at: string
          marked_by: string | null
          note: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
          user_id: string
          work_date: string
        }
        Insert: {
          arrived_at?: string | null
          created_at?: string
          id?: string
          late_minutes?: number
          marked_at?: string
          marked_by?: string | null
          note?: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          user_id: string
          work_date: string
        }
        Update: {
          arrived_at?: string | null
          created_at?: string
          id?: string
          late_minutes?: number
          marked_at?: string
          marked_by?: string | null
          note?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          user_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["user_id"]
          },
        ]
      }
      attendance_history: {
        Row: {
          attendance_id: string | null
          changed_at: string
          changed_by: string | null
          id: number
          kind: string
          new_late_minutes: number | null
          new_status: string
          note: string | null
          old_late_minutes: number | null
          old_status: string | null
          shooting_id: string | null
          user_id: string
          work_date: string
        }
        Insert: {
          attendance_id?: string | null
          changed_at?: string
          changed_by?: string | null
          id?: never
          kind: string
          new_late_minutes?: number | null
          new_status: string
          note?: string | null
          old_late_minutes?: number | null
          old_status?: string | null
          shooting_id?: string | null
          user_id: string
          work_date: string
        }
        Update: {
          attendance_id?: string | null
          changed_at?: string
          changed_by?: string | null
          id?: never
          kind?: string
          new_late_minutes?: number | null
          new_status?: string
          note?: string | null
          old_late_minutes?: number | null
          old_status?: string | null
          shooting_id?: string | null
          user_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_history_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_history_shooting_id_fkey"
            columns: ["shooting_id"]
            isOneToOne: false
            referencedRelation: "shootings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_roles: string[]
          client_id: string | null
          entity_id: string | null
          entity_type: string
          id: number
          metadata: Json
          new_values: Json | null
          occurred_at: string
          old_values: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_roles?: string[]
          client_id?: string | null
          entity_id?: string | null
          entity_type: string
          id?: never
          metadata?: Json
          new_values?: Json | null
          occurred_at?: string
          old_values?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_roles?: string[]
          client_id?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: never
          metadata?: Json
          new_values?: Json | null
          occurred_at?: string
          old_values?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_members: {
        Row: {
          is_admin: boolean
          joined_at: string
          last_read_at: string
          muted_until: string | null
          room_id: string
          user_id: string
        }
        Insert: {
          is_admin?: boolean
          joined_at?: string
          last_read_at?: string
          muted_until?: string | null
          room_id: string
          user_id: string
        }
        Update: {
          is_admin?: boolean
          joined_at?: string
          last_read_at?: string
          muted_until?: string | null
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_rooms: {
        Row: {
          archived_at: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean
          kind: Database["public"]["Enums"]["chat_room_kind"]
          last_message_at: string | null
          name: string
          project_id: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          kind: Database["public"]["Enums"]["chat_room_kind"]
          last_message_at?: string | null
          name: string
          project_id?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          kind?: Database["public"]["Enums"]["chat_room_kind"]
          last_message_at?: string | null
          name?: string
          project_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_rooms_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_rooms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_rooms_project_id_client_id_fkey"
            columns: ["project_id", "client_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "client_id"]
          },
        ]
      }
      client_approvals: {
        Row: {
          client_id: string
          comment: string | null
          content_id: string
          decided_at: string
          decided_by: string | null
          decision: Database["public"]["Enums"]["approval_decision"]
          id: string
          stage: Database["public"]["Enums"]["approval_stage"]
          version_id: string
        }
        Insert: {
          client_id: string
          comment?: string | null
          content_id: string
          decided_at?: string
          decided_by?: string | null
          decision: Database["public"]["Enums"]["approval_decision"]
          id?: string
          stage: Database["public"]["Enums"]["approval_stage"]
          version_id: string
        }
        Update: {
          client_id?: string
          comment?: string | null
          content_id?: string
          decided_at?: string
          decided_by?: string | null
          decision?: Database["public"]["Enums"]["approval_decision"]
          id?: string
          stage?: Database["public"]["Enums"]["approval_stage"]
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_approvals_content_id_client_id_fkey"
            columns: ["content_id", "client_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "client_approvals_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_approvals_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "content_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string
          created_at: string
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          is_primary: boolean
          phone: string | null
          position: string | null
          telegram: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_primary?: boolean
          phone?: string | null
          position?: string | null
          telegram?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_primary?: boolean
          phone?: string | null
          position?: string | null
          telegram?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_crm_settings: {
        Row: {
          auto_deliver: boolean
          client_id: string
          created_at: string
          field_map: Json
          template: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auto_deliver?: boolean
          client_id: string
          created_at?: string
          field_map?: Json
          template?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auto_deliver?: boolean
          client_id?: string
          created_at?: string
          field_map?: Json
          template?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_crm_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_crm_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_member_permissions: {
        Row: {
          client_id: string
          created_at: string
          granted_by: string | null
          permission_key: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          granted_by?: string | null
          permission_key: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          granted_by?: string | null
          permission_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_member_permissions_client_id_user_id_fkey"
            columns: ["client_id", "user_id"]
            isOneToOne: false
            referencedRelation: "client_members"
            referencedColumns: ["client_id", "user_id"]
          },
          {
            foreignKeyName: "client_member_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_member_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      client_members: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          role_id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          role_id: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          role_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_members_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_plan_usage: {
        Row: {
          client_id: string
          content_id: string | null
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          occurred_on: string
          quantity: number
          service_key: string
          shooting_id: string | null
          source: Database["public"]["Enums"]["usage_source"]
          subscription_id: string | null
        }
        Insert: {
          client_id: string
          content_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          occurred_on?: string
          quantity: number
          service_key: string
          shooting_id?: string | null
          source?: Database["public"]["Enums"]["usage_source"]
          subscription_id?: string | null
        }
        Update: {
          client_id?: string
          content_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          occurred_on?: string
          quantity?: number
          service_key?: string
          shooting_id?: string | null
          source?: Database["public"]["Enums"]["usage_source"]
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_plan_usage_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_plan_usage_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_plan_usage_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_plan_usage_service_key_fkey"
            columns: ["service_key"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "client_plan_usage_shooting_id_fkey"
            columns: ["shooting_id"]
            isOneToOne: false
            referencedRelation: "shootings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_plan_usage_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "client_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_plan_usage_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscription_usage_summary"
            referencedColumns: ["subscription_id"]
          },
        ]
      }
      client_subscriptions: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          currency: string
          ends_on: string
          id: string
          notes: string | null
          plan_id: string
          price: number
          starts_on: string
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          ends_on: string
          id?: string
          notes?: string | null
          plan_id: string
          price: number
          starts_on: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          ends_on?: string
          id?: string
          notes?: string | null
          plan_id?: string
          price?: number
          starts_on?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_subscriptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      client_team_members: {
        Row: {
          assigned_by: string | null
          client_id: string
          created_at: string
          team_role: Database["public"]["Enums"]["team_role"]
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          client_id: string
          created_at?: string
          team_role: Database["public"]["Enums"]["team_role"]
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          client_id?: string
          created_at?: string
          team_role?: Database["public"]["Enums"]["team_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_team_members_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_team_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          brand_color: string | null
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          home_logo_url: string | null
          id: string
          industry: string | null
          legal_name: string | null
          logo_url: string | null
          name: string
          status: Database["public"]["Enums"]["client_status"]
          timezone: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          brand_color?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          home_logo_url?: string | null
          id?: string
          industry?: string | null
          legal_name?: string | null
          logo_url?: string | null
          name: string
          status?: Database["public"]["Enums"]["client_status"]
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          brand_color?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          home_logo_url?: string | null
          id?: string
          industry?: string | null
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          status?: Database["public"]["Enums"]["client_status"]
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_events: {
        Row: {
          all_day: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          ends_at: string
          id: string
          kind: string
          location: string | null
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          ends_at: string
          id?: string
          kind?: string
          location?: string | null
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          ends_at?: string
          id?: string
          kind?: string
          location?: string | null
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_assignments: {
        Row: {
          assigned_by: string | null
          content_id: string
          created_at: string
          role: Database["public"]["Enums"]["team_role"]
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          content_id: string
          created_at?: string
          role: Database["public"]["Enums"]["team_role"]
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          content_id?: string
          created_at?: string
          role?: Database["public"]["Enums"]["team_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_assignments_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_comments: {
        Row: {
          author_id: string
          body: string
          client_id: string
          content_id: string
          created_at: string
          deleted_at: string | null
          id: string
          parent_id: string | null
          updated_at: string
          visibility: Database["public"]["Enums"]["visibility_level"]
        }
        Insert: {
          author_id: string
          body: string
          client_id: string
          content_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          parent_id?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility_level"]
        }
        Update: {
          author_id?: string
          body?: string
          client_id?: string
          content_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          parent_id?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility_level"]
        }
        Relationships: [
          {
            foreignKeyName: "content_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_comments_content_id_client_id_fkey"
            columns: ["content_id", "client_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "content_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "content_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      content_counters: {
        Row: {
          client_id: string
          content_type: Database["public"]["Enums"]["content_type"]
          last_number: number
        }
        Insert: {
          client_id: string
          content_type: Database["public"]["Enums"]["content_type"]
          last_number?: number
        }
        Update: {
          client_id?: string
          content_type?: Database["public"]["Enums"]["content_type"]
          last_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_counters_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      content_items: {
        Row: {
          approved_at: string | null
          caption: string | null
          client_approval_due_at: string | null
          client_id: string
          content_type: Database["public"]["Enums"]["content_type"]
          counts_toward_plan: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_at: string | null
          hashtags: string[]
          id: string
          is_client_visible: boolean
          music_reference: string | null
          number: number
          plan_month: string
          priority: Database["public"]["Enums"]["priority_level"]
          project_id: string | null
          published_at: string | null
          reference_links: Json
          revision_count: number
          script: string | null
          shooting_id: string | null
          status: Database["public"]["Enums"]["content_status"]
          status_changed_at: string
          thumbnail_file_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          caption?: string | null
          client_approval_due_at?: string | null
          client_id: string
          content_type: Database["public"]["Enums"]["content_type"]
          counts_toward_plan?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          hashtags?: string[]
          id?: string
          is_client_visible?: boolean
          music_reference?: string | null
          number?: number
          plan_month?: string
          priority?: Database["public"]["Enums"]["priority_level"]
          project_id?: string | null
          published_at?: string | null
          reference_links?: Json
          revision_count?: number
          script?: string | null
          shooting_id?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          status_changed_at?: string
          thumbnail_file_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          caption?: string | null
          client_approval_due_at?: string | null
          client_id?: string
          content_type?: Database["public"]["Enums"]["content_type"]
          counts_toward_plan?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          hashtags?: string[]
          id?: string
          is_client_visible?: boolean
          music_reference?: string | null
          number?: number
          plan_month?: string
          priority?: Database["public"]["Enums"]["priority_level"]
          project_id?: string | null
          published_at?: string | null
          reference_links?: Json
          revision_count?: number
          script?: string | null
          shooting_id?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          status_changed_at?: string
          thumbnail_file_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_project_id_client_id_fkey"
            columns: ["project_id", "client_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "content_items_shooting_id_client_id_fkey"
            columns: ["shooting_id", "client_id"]
            isOneToOne: false
            referencedRelation: "shootings"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "content_items_thumbnail_file_fk"
            columns: ["thumbnail_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      content_metrics: {
        Row: {
          captured_at: string
          client_id: string
          comments: number | null
          content_id: string
          created_at: string
          entered_by: string | null
          id: string
          likes: number | null
          publication_id: string
          reach: number | null
          saves: number | null
          shares: number | null
          source: Database["public"]["Enums"]["metric_source"]
          updated_at: string
          views: number | null
        }
        Insert: {
          captured_at?: string
          client_id: string
          comments?: number | null
          content_id: string
          created_at?: string
          entered_by?: string | null
          id?: string
          likes?: number | null
          publication_id: string
          reach?: number | null
          saves?: number | null
          shares?: number | null
          source: Database["public"]["Enums"]["metric_source"]
          updated_at?: string
          views?: number | null
        }
        Update: {
          captured_at?: string
          client_id?: string
          comments?: number | null
          content_id?: string
          created_at?: string
          entered_by?: string | null
          id?: string
          likes?: number | null
          publication_id?: string
          reach?: number | null
          saves?: number | null
          shares?: number | null
          source?: Database["public"]["Enums"]["metric_source"]
          updated_at?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_metrics_content_id_client_id_fkey"
            columns: ["content_id", "client_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "content_metrics_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_metrics_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: true
            referencedRelation: "content_publications"
            referencedColumns: ["id"]
          },
        ]
      }
      content_publications: {
        Row: {
          client_id: string
          content_id: string
          created_at: string
          external_post_id: string | null
          id: string
          notes: string | null
          platform: Database["public"]["Enums"]["social_platform"]
          post_url: string | null
          published_at: string | null
          published_by: string | null
          scheduled_at: string | null
          social_account_id: string | null
          status: Database["public"]["Enums"]["publication_status"]
          updated_at: string
        }
        Insert: {
          client_id: string
          content_id: string
          created_at?: string
          external_post_id?: string | null
          id?: string
          notes?: string | null
          platform: Database["public"]["Enums"]["social_platform"]
          post_url?: string | null
          published_at?: string | null
          published_by?: string | null
          scheduled_at?: string | null
          social_account_id?: string | null
          status?: Database["public"]["Enums"]["publication_status"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          content_id?: string
          created_at?: string
          external_post_id?: string | null
          id?: string
          notes?: string | null
          platform?: Database["public"]["Enums"]["social_platform"]
          post_url?: string | null
          published_at?: string | null
          published_by?: string | null
          scheduled_at?: string | null
          social_account_id?: string | null
          status?: Database["public"]["Enums"]["publication_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_publications_content_id_client_id_fkey"
            columns: ["content_id", "client_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "content_publications_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_publications_social_account_fk"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      content_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          client_id: string
          content_id: string
          from_status: Database["public"]["Enums"]["content_status"] | null
          id: number
          note: string | null
          to_status: Database["public"]["Enums"]["content_status"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          client_id: string
          content_id: string
          from_status?: Database["public"]["Enums"]["content_status"] | null
          id?: never
          note?: string | null
          to_status: Database["public"]["Enums"]["content_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          client_id?: string
          content_id?: string
          from_status?: Database["public"]["Enums"]["content_status"] | null
          id?: never
          note?: string | null
          to_status?: Database["public"]["Enums"]["content_status"]
        }
        Relationships: [
          {
            foreignKeyName: "content_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_status_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_status_history_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      content_versions: {
        Row: {
          client_id: string
          content_id: string
          created_at: string
          decided_at: string | null
          file_id: string
          id: string
          notes: string | null
          sent_to_client_at: string | null
          status: Database["public"]["Enums"]["version_status"]
          submitted_at: string
          submitted_by: string | null
          updated_at: string
          version_number: number
        }
        Insert: {
          client_id: string
          content_id: string
          created_at?: string
          decided_at?: string | null
          file_id: string
          id?: string
          notes?: string | null
          sent_to_client_at?: string | null
          status: Database["public"]["Enums"]["version_status"]
          submitted_at?: string
          submitted_by?: string | null
          updated_at?: string
          version_number: number
        }
        Update: {
          client_id?: string
          content_id?: string
          created_at?: string
          decided_at?: string | null
          file_id?: string
          id?: string
          notes?: string | null
          sent_to_client_at?: string | null
          status?: Database["public"]["Enums"]["version_status"]
          submitted_at?: string
          submitted_by?: string | null
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_versions_content_id_client_id_fkey"
            columns: ["content_id", "client_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "content_versions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_versions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          amount: number | null
          client_id: string
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          ends_on: string | null
          file_id: string | null
          id: string
          notes: string | null
          number: string
          signed_on: string | null
          starts_on: string
          status: Database["public"]["Enums"]["contract_status"]
          title: string | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          client_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          ends_on?: string | null
          file_id?: string | null
          id?: string
          notes?: string | null
          number: string
          signed_on?: string | null
          starts_on: string
          status?: Database["public"]["Enums"]["contract_status"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          ends_on?: string | null
          file_id?: string | null
          id?: string
          notes?: string | null
          number?: string
          signed_on?: string | null
          starts_on?: string
          status?: Database["public"]["Enums"]["contract_status"]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_reports: {
        Row: {
          client_id: string
          data: Json
          id: string
          kind: string
          note: string | null
          period_end: string
          period_start: string
          sent_at: string
          sent_by: string | null
        }
        Insert: {
          client_id: string
          data: Json
          id?: string
          kind: string
          note?: string | null
          period_end: string
          period_start: string
          sent_at?: string
          sent_by?: string | null
        }
        Update: {
          client_id?: string
          data?: Json
          id?: string
          kind?: string
          note?: string | null
          period_end?: string
          period_start?: string
          sent_at?: string
          sent_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_reports_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deadline_alert_log: {
        Row: {
          due_at: string
          entity_id: string
          rule_id: string
          sent_at: string
        }
        Insert: {
          due_at: string
          entity_id: string
          rule_id: string
          sent_at?: string
        }
        Update: {
          due_at?: string
          entity_id?: string
          rule_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deadline_alert_log_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "deadline_alert_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      deadline_alert_rules: {
        Row: {
          body_template: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          offset_minutes: number
          priority: Database["public"]["Enums"]["notification_priority"]
          recipients: string[]
          target: string
          task_types: Database["public"]["Enums"]["task_type"][] | null
          title_template: string
          updated_at: string
        }
        Insert: {
          body_template?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          offset_minutes: number
          priority?: Database["public"]["Enums"]["notification_priority"]
          recipients: string[]
          target: string
          task_types?: Database["public"]["Enums"]["task_type"][] | null
          title_template: string
          updated_at?: string
        }
        Update: {
          body_template?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          offset_minutes?: number
          priority?: Database["public"]["Enums"]["notification_priority"]
          recipients?: string[]
          target?: string
          task_types?: Database["public"]["Enums"]["task_type"][] | null
          title_template?: string
          updated_at?: string
        }
        Relationships: []
      }
      employee_performance: {
        Row: {
          computed_at: string
          metrics: Json
          period_month: string
          user_id: string
        }
        Insert: {
          computed_at?: string
          metrics: Json
          period_month: string
          user_id: string
        }
        Update: {
          computed_at?: string
          metrics?: Json
          period_month?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_performance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string
          department: string | null
          employee_code: string | null
          employment_type: Database["public"]["Enums"]["employment_type"]
          hired_on: string | null
          job_title: string | null
          status: Database["public"]["Enums"]["employee_status"]
          terminated_on: string | null
          updated_at: string
          user_id: string
          work_days: number[]
          work_end_time: string
          work_start_time: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          employee_code?: string | null
          employment_type?: Database["public"]["Enums"]["employment_type"]
          hired_on?: string | null
          job_title?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          terminated_on?: string | null
          updated_at?: string
          user_id: string
          work_days?: number[]
          work_end_time?: string
          work_start_time?: string
        }
        Update: {
          created_at?: string
          department?: string | null
          employee_code?: string | null
          employment_type?: Database["public"]["Enums"]["employment_type"]
          hired_on?: string | null
          job_title?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          terminated_on?: string | null
          updated_at?: string
          user_id?: string
          work_days?: number[]
          work_end_time?: string
          work_start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          bucket: string | null
          chat_room_id: string | null
          client_id: string | null
          content_id: string | null
          created_at: string
          deleted_at: string | null
          duration_ms: number | null
          external_url: string | null
          folder_id: string | null
          height: number | null
          id: string
          kind: Database["public"]["Enums"]["file_kind"]
          mime_type: string | null
          name: string
          size_bytes: number | null
          status: Database["public"]["Enums"]["file_status"]
          storage_path: string | null
          task_id: string | null
          updated_at: string
          uploaded_at: string | null
          uploaded_by: string | null
          visibility: Database["public"]["Enums"]["visibility_level"]
          width: number | null
        }
        Insert: {
          bucket?: string | null
          chat_room_id?: string | null
          client_id?: string | null
          content_id?: string | null
          created_at?: string
          deleted_at?: string | null
          duration_ms?: number | null
          external_url?: string | null
          folder_id?: string | null
          height?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["file_kind"]
          mime_type?: string | null
          name: string
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["file_status"]
          storage_path?: string | null
          task_id?: string | null
          updated_at?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
          visibility?: Database["public"]["Enums"]["visibility_level"]
          width?: number | null
        }
        Update: {
          bucket?: string | null
          chat_room_id?: string | null
          client_id?: string | null
          content_id?: string | null
          created_at?: string
          deleted_at?: string | null
          duration_ms?: number | null
          external_url?: string | null
          folder_id?: string | null
          height?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["file_kind"]
          mime_type?: string | null
          name?: string
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["file_status"]
          storage_path?: string | null
          task_id?: string | null
          updated_at?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
          visibility?: Database["public"]["Enums"]["visibility_level"]
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "files_chat_room_id_fkey"
            columns: ["chat_room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_content_id_client_id_fkey"
            columns: ["content_id", "client_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "files_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      folders: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_system: boolean
          kind: Database["public"]["Enums"]["folder_kind"]
          name: string
          parent_id: string | null
          updated_at: string
          visibility: Database["public"]["Enums"]["visibility_level"]
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_system?: boolean
          kind?: Database["public"]["Enums"]["folder_kind"]
          name: string
          parent_id?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility_level"]
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_system?: boolean
          kind?: Database["public"]["Enums"]["folder_kind"]
          name?: string
          parent_id?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility_level"]
        }
        Relationships: [
          {
            foreignKeyName: "folders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      game_attempts: {
        Row: {
          error_ratio: number | null
          hit: boolean | null
          n: number
          params: Json
          session_id: string
          started_at: string
          submitted_at: string | null
          tap_ms: number | null
          valid: boolean | null
          zone: number | null
        }
        Insert: {
          error_ratio?: number | null
          hit?: boolean | null
          n: number
          params: Json
          session_id: string
          started_at?: string
          submitted_at?: string | null
          tap_ms?: number | null
          valid?: boolean | null
          zone?: number | null
        }
        Update: {
          error_ratio?: number | null
          hit?: boolean | null
          n?: number
          params?: Json
          session_id?: string
          started_at?: string
          submitted_at?: string | null
          tap_ms?: number | null
          valid?: boolean | null
          zone?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_attempts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      game_campaigns: {
        Row: {
          attempts: number
          brand: Json
          client_id: string
          cooldown_minutes: number
          created_at: string
          created_by: string | null
          difficulty: string
          ends_at: string | null
          guarantee_next: boolean
          id: string
          is_active: boolean
          max_rewards_total: number | null
          max_sessions_per_day: number
          max_wins_per_user: number
          reward_days: number
          reward_plan: string
          rewards_given: number
          rules: string | null
          starts_at: string
          subtitle: string | null
          target_score: number
          template: string
          title: string
          updated_at: string
          win_mode: string
          win_probability: number
        }
        Insert: {
          attempts?: number
          brand?: Json
          client_id: string
          cooldown_minutes?: number
          created_at?: string
          created_by?: string | null
          difficulty?: string
          ends_at?: string | null
          guarantee_next?: boolean
          id?: string
          is_active?: boolean
          max_rewards_total?: number | null
          max_sessions_per_day?: number
          max_wins_per_user?: number
          reward_days?: number
          reward_plan?: string
          rewards_given?: number
          rules?: string | null
          starts_at?: string
          subtitle?: string | null
          target_score?: number
          template: string
          title: string
          updated_at?: string
          win_mode?: string
          win_probability?: number
        }
        Update: {
          attempts?: number
          brand?: Json
          client_id?: string
          cooldown_minutes?: number
          created_at?: string
          created_by?: string | null
          difficulty?: string
          ends_at?: string | null
          guarantee_next?: boolean
          id?: string
          is_active?: boolean
          max_rewards_total?: number | null
          max_sessions_per_day?: number
          max_wins_per_user?: number
          reward_days?: number
          reward_plan?: string
          rewards_given?: number
          rules?: string | null
          starts_at?: string
          subtitle?: string | null
          target_score?: number
          template?: string
          title?: string
          updated_at?: string
          win_mode?: string
          win_probability?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_campaigns_reward_plan_fkey"
            columns: ["reward_plan"]
            isOneToOne: false
            referencedRelation: "saas_plans"
            referencedColumns: ["key"]
          },
        ]
      }
      game_rewards: {
        Row: {
          campaign_id: string
          claimed_at: string
          days: number
          id: string
          plan_key: string
          session_id: string
          subscription_id: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          campaign_id: string
          claimed_at?: string
          days: number
          id?: string
          plan_key: string
          session_id: string
          subscription_id?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          campaign_id?: string
          claimed_at?: string
          days?: number
          id?: string
          plan_key?: string
          session_id?: string
          subscription_id?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_rewards_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "game_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_rewards_plan_key_fkey"
            columns: ["plan_key"]
            isOneToOne: false
            referencedRelation: "saas_plans"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "game_rewards_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_rewards_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "workspace_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_rewards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_rewards_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      game_sessions: {
        Row: {
          attempts_used: number
          box_index: number | null
          campaign_id: string
          client_id: string
          eligible: boolean
          expires_at: string
          finished_at: string | null
          flagged_reason: string | null
          guaranteed: boolean
          id: string
          invalid_taps: number
          score: number
          started_at: string
          status: string
          user_id: string
          won: boolean | null
          workspace_id: string
        }
        Insert: {
          attempts_used?: number
          box_index?: number | null
          campaign_id: string
          client_id: string
          eligible: boolean
          expires_at?: string
          finished_at?: string | null
          flagged_reason?: string | null
          guaranteed?: boolean
          id?: string
          invalid_taps?: number
          score?: number
          started_at?: string
          status?: string
          user_id: string
          won?: boolean | null
          workspace_id: string
        }
        Update: {
          attempts_used?: number
          box_index?: number | null
          campaign_id?: string
          client_id?: string
          eligible?: boolean
          expires_at?: string
          finished_at?: string | null
          flagged_reason?: string | null
          guaranteed?: boolean
          id?: string
          invalid_taps?: number
          score?: number
          started_at?: string
          status?: string
          user_id?: string
          won?: boolean | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_sessions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "game_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_deliveries: {
        Row: {
          automatic: boolean
          client_id: string
          created_at: string
          delivered_by: string | null
          id: string
          lead_count: number
        }
        Insert: {
          automatic?: boolean
          client_id: string
          created_at?: string
          delivered_by?: string | null
          id?: string
          lead_count: number
        }
        Update: {
          automatic?: boolean
          client_id?: string
          created_at?: string
          delivered_by?: string | null
          id?: string
          lead_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_deliveries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_deliveries_delivered_by_fkey"
            columns: ["delivered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          ad_account_id: string | null
          ad_id: string | null
          ad_name: string | null
          admin_notified_at: string | null
          adset_id: string | null
          adset_name: string | null
          campaign_id: string | null
          campaign_name: string | null
          client_id: string
          created_at: string
          delivered_at: string | null
          delivered_by: string | null
          delivery_id: string | null
          delivery_status: Database["public"]["Enums"]["lead_delivery_status"]
          discarded_reason: string | null
          email: string | null
          fetch_attempts: number
          fetch_error: string | null
          fetch_status: Database["public"]["Enums"]["lead_fetch_status"]
          fields: Json
          form_id: string | null
          form_name: string | null
          full_name: string | null
          id: string
          lead_at: string | null
          meta_created_at: string | null
          meta_lead_id: string
          page_id: string | null
          page_name: string | null
          phone: string | null
          platform: string | null
          received_at: string
          source: string
          updated_at: string
        }
        Insert: {
          ad_account_id?: string | null
          ad_id?: string | null
          ad_name?: string | null
          admin_notified_at?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          client_id: string
          created_at?: string
          delivered_at?: string | null
          delivered_by?: string | null
          delivery_id?: string | null
          delivery_status?: Database["public"]["Enums"]["lead_delivery_status"]
          discarded_reason?: string | null
          email?: string | null
          fetch_attempts?: number
          fetch_error?: string | null
          fetch_status?: Database["public"]["Enums"]["lead_fetch_status"]
          fields?: Json
          form_id?: string | null
          form_name?: string | null
          full_name?: string | null
          id?: string
          lead_at?: string | null
          meta_created_at?: string | null
          meta_lead_id: string
          page_id?: string | null
          page_name?: string | null
          phone?: string | null
          platform?: string | null
          received_at?: string
          source?: string
          updated_at?: string
        }
        Update: {
          ad_account_id?: string | null
          ad_id?: string | null
          ad_name?: string | null
          admin_notified_at?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          client_id?: string
          created_at?: string
          delivered_at?: string | null
          delivered_by?: string | null
          delivery_id?: string | null
          delivery_status?: Database["public"]["Enums"]["lead_delivery_status"]
          discarded_reason?: string | null
          email?: string | null
          fetch_attempts?: number
          fetch_error?: string | null
          fetch_status?: Database["public"]["Enums"]["lead_fetch_status"]
          fields?: Json
          form_id?: string | null
          form_name?: string | null
          full_name?: string | null
          id?: string
          lead_at?: string | null
          meta_created_at?: string | null
          meta_lead_id?: string
          page_id?: string | null
          page_name?: string | null
          phone?: string | null
          platform?: string | null
          received_at?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_delivered_by_fkey"
            columns: ["delivered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "lead_deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          file_id: string
          message_id: string
        }
        Insert: {
          file_id: string
          message_id: string
        }
        Update: {
          file_id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          is_directive: boolean
          is_system: boolean
          reply_to_id: string | null
          room_id: string
          sender_id: string | null
          sender_label: string | null
        }
        Insert: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_directive?: boolean
          is_system?: boolean
          reply_to_id?: string | null
          room_id: string
          sender_id?: string | null
          sender_label?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_directive?: boolean
          is_system?: boolean
          reply_to_id?: string | null
          room_id?: string
          sender_id?: string | null
          sender_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_assets: {
        Row: {
          asset_type: Database["public"]["Enums"]["meta_asset_type"]
          client_id: string
          connection_id: string | null
          created_at: string
          created_by: string | null
          details: Json
          external_id: string
          id: string
          last_synced_at: string | null
          name: string
          parent_external_id: string | null
          social_account_id: string | null
          status: Database["public"]["Enums"]["integration_status"]
          sync_error: string | null
          updated_at: string
          webhook_subscribed_at: string | null
        }
        Insert: {
          asset_type: Database["public"]["Enums"]["meta_asset_type"]
          client_id: string
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          details?: Json
          external_id: string
          id?: string
          last_synced_at?: string | null
          name?: string
          parent_external_id?: string | null
          social_account_id?: string | null
          status?: Database["public"]["Enums"]["integration_status"]
          sync_error?: string | null
          updated_at?: string
          webhook_subscribed_at?: string | null
        }
        Update: {
          asset_type?: Database["public"]["Enums"]["meta_asset_type"]
          client_id?: string
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          details?: Json
          external_id?: string
          id?: string
          last_synced_at?: string | null
          name?: string
          parent_external_id?: string | null
          social_account_id?: string | null
          status?: Database["public"]["Enums"]["integration_status"]
          sync_error?: string | null
          updated_at?: string
          webhook_subscribed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_assets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_assets_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "meta_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_assets_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_connections: {
        Row: {
          connected_by: string | null
          created_at: string
          id: string
          last_error: string | null
          meta_user_id: string
          name: string
          scopes: string[]
          status: Database["public"]["Enums"]["integration_status"]
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          connected_by?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          meta_user_id: string
          name?: string
          scopes?: string[]
          status?: Database["public"]["Enums"]["integration_status"]
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          connected_by?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          meta_user_id?: string
          name?: string
          scopes?: string[]
          status?: Database["public"]["Enums"]["integration_status"]
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_connections_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_report_metrics: {
        Row: {
          label: string
          metric_key: string
          position: number
          previous_value: number | null
          report_id: string
          section: string
          target_value: number | null
          unit: string | null
          value: number | null
          visibility: Database["public"]["Enums"]["visibility_level"]
        }
        Insert: {
          label: string
          metric_key: string
          position?: number
          previous_value?: number | null
          report_id: string
          section: string
          target_value?: number | null
          unit?: string | null
          value?: number | null
          visibility?: Database["public"]["Enums"]["visibility_level"]
        }
        Update: {
          label?: string
          metric_key?: string
          position?: number
          previous_value?: number | null
          report_id?: string
          section?: string
          target_value?: number | null
          unit?: string | null
          value?: number | null
          visibility?: Database["public"]["Enums"]["visibility_level"]
        }
        Relationships: [
          {
            foreignKeyName: "monthly_report_metrics_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "monthly_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_report_top_contents: {
        Row: {
          comments: number | null
          content_id: string | null
          content_type: Database["public"]["Enums"]["content_type"] | null
          likes: number | null
          platform: Database["public"]["Enums"]["social_platform"] | null
          post_url: string | null
          publication_id: string | null
          rank: number
          report_id: string
          saves: number | null
          shares: number | null
          title: string
          views: number | null
        }
        Insert: {
          comments?: number | null
          content_id?: string | null
          content_type?: Database["public"]["Enums"]["content_type"] | null
          likes?: number | null
          platform?: Database["public"]["Enums"]["social_platform"] | null
          post_url?: string | null
          publication_id?: string | null
          rank: number
          report_id: string
          saves?: number | null
          shares?: number | null
          title: string
          views?: number | null
        }
        Update: {
          comments?: number | null
          content_id?: string | null
          content_type?: Database["public"]["Enums"]["content_type"] | null
          likes?: number | null
          platform?: Database["public"]["Enums"]["social_platform"] | null
          post_url?: string | null
          publication_id?: string | null
          rank?: number
          report_id?: string
          saves?: number | null
          shares?: number | null
          title?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "monthly_report_top_contents_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_report_top_contents_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "content_publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_report_top_contents_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "monthly_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_reports: {
        Row: {
          client_id: string
          created_at: string
          generated_at: string | null
          generated_by: string | null
          highlights: string | null
          id: string
          pdf_generated_at: string | null
          pdf_path: string | null
          period_month: string
          published_at: string | null
          published_by: string | null
          status: Database["public"]["Enums"]["report_status"]
          title: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          generated_at?: string | null
          generated_by?: string | null
          highlights?: string | null
          id?: string
          pdf_generated_at?: string | null
          pdf_path?: string | null
          period_month: string
          published_at?: string | null
          published_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          generated_at?: string | null
          generated_by?: string | null
          highlights?: string | null
          id?: string
          pdf_generated_at?: string | null
          pdf_path?: string | null
          period_month?: string
          published_at?: string | null
          published_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_reports_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          id: number
          next_attempt_at: string
          notification_id: string
          push_token_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          ticket_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: never
          next_attempt_at?: string
          notification_id: string
          push_token_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          ticket_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: never
          next_attempt_at?: string
          notification_id?: string
          push_token_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_push_token_id_fkey"
            columns: ["push_token_id"]
            isOneToOne: false
            referencedRelation: "push_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          in_app_enabled: boolean
          push_enabled: boolean
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          in_app_enabled?: boolean
          push_enabled?: boolean
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          in_app_enabled?: boolean
          push_enabled?: boolean
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          client_id: string | null
          created_at: string
          data: Json
          entity_id: string | null
          entity_type: string | null
          id: string
          priority: Database["public"]["Enums"]["notification_priority"]
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          client_id?: string | null
          created_at?: string
          data?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["notification_priority"]
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          client_id?: string | null
          created_at?: string
          data?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["notification_priority"]
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          created_at: string
          description: string | null
          key: string
          module: string
          name: string
          scope: Database["public"]["Enums"]["user_kind"]
        }
        Insert: {
          created_at?: string
          description?: string | null
          key: string
          module: string
          name: string
          scope: Database["public"]["Enums"]["user_kind"]
        }
        Update: {
          created_at?: string
          description?: string | null
          key?: string
          module?: string
          name?: string
          scope?: Database["public"]["Enums"]["user_kind"]
        }
        Relationships: []
      }
      plan_features: {
        Row: {
          created_at: string
          is_included: boolean
          note: string | null
          plan_id: string
          quantity: number | null
          service_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          is_included?: boolean
          note?: string | null
          plan_id: string
          quantity?: number | null
          service_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          is_included?: boolean
          note?: string | null
          plan_id?: string
          quantity?: number | null
          service_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_features_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_features_service_key_fkey"
            columns: ["service_key"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["key"]
          },
        ]
      }
      plan_upgrade_requests: {
        Row: {
          client_id: string
          created_at: string
          current_subscription_id: string | null
          handled_at: string | null
          handled_by: string | null
          id: string
          message: string | null
          requested_by: string | null
          requested_plan_id: string
          response: string | null
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          current_subscription_id?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          message?: string | null
          requested_by?: string | null
          requested_plan_id: string
          response?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          current_subscription_id?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          message?: string | null
          requested_by?: string | null
          requested_plan_id?: string
          response?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_upgrade_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_upgrade_requests_current_subscription_id_fkey"
            columns: ["current_subscription_id"]
            isOneToOne: false
            referencedRelation: "client_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_upgrade_requests_current_subscription_id_fkey"
            columns: ["current_subscription_id"]
            isOneToOne: false
            referencedRelation: "subscription_usage_summary"
            referencedColumns: ["subscription_id"]
          },
          {
            foreignKeyName: "plan_upgrade_requests_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_upgrade_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_upgrade_requests_requested_plan_id_fkey"
            columns: ["requested_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          description: string | null
          duration_months: number
          id: string
          is_active: boolean
          is_public: boolean
          name: string
          position: number
          price: number
          slug: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          description?: string | null
          duration_months?: number
          id?: string
          is_active?: boolean
          is_public?: boolean
          name: string
          position?: number
          price?: number
          slug: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          description?: string | null
          duration_months?: number
          id?: string
          is_active?: boolean
          is_public?: boolean
          name?: string
          position?: number
          price?: number
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          access_requested_at: string | null
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          first_name: string | null
          full_name: string
          id: string
          last_name: string | null
          last_seen_at: string | null
          locale: string
          password_changed_at: string | null
          password_reset_at: string | null
          phone: string | null
          provisioned_by: string | null
          status: Database["public"]["Enums"]["account_status"]
          status_changed_at: string | null
          status_changed_by: string | null
          status_reason: string | null
          updated_at: string
        }
        Insert: {
          access_requested_at?: string | null
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: string
          id: string
          last_name?: string | null
          last_seen_at?: string | null
          locale?: string
          password_changed_at?: string | null
          password_reset_at?: string | null
          phone?: string | null
          provisioned_by?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          status_changed_at?: string | null
          status_changed_by?: string | null
          status_reason?: string | null
          updated_at?: string
        }
        Update: {
          access_requested_at?: string | null
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: string
          id?: string
          last_name?: string | null
          last_seen_at?: string | null
          locale?: string
          password_changed_at?: string | null
          password_reset_at?: string | null
          phone?: string | null
          provisioned_by?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          status_changed_at?: string | null
          status_changed_by?: string | null
          status_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_provisioned_by_fkey"
            columns: ["provisioned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_status_changed_by_fkey"
            columns: ["status_changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          added_by: string | null
          created_at: string
          project_id: string
          team_role: Database["public"]["Enums"]["team_role"]
          user_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          project_id: string
          team_role: Database["public"]["Enums"]["team_role"]
          user_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          project_id?: string
          team_role?: Database["public"]["Enums"]["team_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          ends_on: string | null
          id: string
          kind: Database["public"]["Enums"]["project_kind"]
          name: string
          starts_on: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          ends_on?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["project_kind"]
          name: string
          starts_on?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          ends_on?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["project_kind"]
          name?: string
          starts_on?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          audience: string
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          eligible_client_ids: string[]
          expires_at: string | null
          id: string
          is_active: boolean
          max_redemptions: number | null
          new_user_days: number
          per_user_limit: number
          per_workspace_limit: number
          plan_key: string
          redemption_count: number
          reward_days: number
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          eligible_client_ids?: string[]
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_redemptions?: number | null
          new_user_days?: number
          per_user_limit?: number
          per_workspace_limit?: number
          plan_key?: string
          redemption_count?: number
          reward_days: number
          starts_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          eligible_client_ids?: string[]
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_redemptions?: number | null
          new_user_days?: number
          per_user_limit?: number
          per_workspace_limit?: number
          plan_key?: string
          redemption_count?: number
          reward_days?: number
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_codes_plan_key_fkey"
            columns: ["plan_key"]
            isOneToOne: false
            referencedRelation: "saas_plans"
            referencedColumns: ["key"]
          },
        ]
      }
      promo_redemptions: {
        Row: {
          id: string
          promo_id: string
          redeemed_at: string
          subscription_id: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          id?: string
          promo_id: string
          redeemed_at?: string
          subscription_id?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          id?: string
          promo_id?: string
          redeemed_at?: string
          subscription_id?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_promo_id_fkey"
            columns: ["promo_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_redemptions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "workspace_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_redemptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          app_version: string | null
          created_at: string
          device_name: string | null
          id: string
          last_seen_at: string
          platform: string
          revoked_at: string | null
          token: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_name?: string | null
          id?: string
          last_seen_at?: string
          platform: string
          revoked_at?: string | null
          token: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_name?: string | null
          id?: string
          last_seen_at?: string
          platform?: string
          revoked_at?: string | null
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      revision_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          is_resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          revision_id: string
          timecode_ms: number | null
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          revision_id: string
          timecode_ms?: number | null
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          revision_id?: string
          timecode_ms?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revision_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revision_comments_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revision_comments_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      revisions: {
        Row: {
          client_id: string
          content_id: string
          created_at: string
          id: string
          requested_at: string
          requested_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          revision_number: number
          stage: Database["public"]["Enums"]["approval_stage"]
          status: Database["public"]["Enums"]["revision_status"]
          summary: string | null
          updated_at: string
          version_id: string | null
        }
        Insert: {
          client_id: string
          content_id: string
          created_at?: string
          id?: string
          requested_at?: string
          requested_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          revision_number: number
          stage: Database["public"]["Enums"]["approval_stage"]
          status?: Database["public"]["Enums"]["revision_status"]
          summary?: string | null
          updated_at?: string
          version_id?: string | null
        }
        Update: {
          client_id?: string
          content_id?: string
          created_at?: string
          id?: string
          requested_at?: string
          requested_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          revision_number?: number
          stage?: Database["public"]["Enums"]["approval_stage"]
          status?: Database["public"]["Enums"]["revision_status"]
          summary?: string | null
          updated_at?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revisions_content_id_client_id_fkey"
            columns: ["content_id", "client_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "revisions_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revisions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revisions_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "content_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          permission_key: string
          role_id: string
        }
        Insert: {
          created_at?: string
          permission_key: string
          role_id: string
        }
        Update: {
          created_at?: string
          permission_key?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          key: string
          name: string
          rank: number
          scope: Database["public"]["Enums"]["user_kind"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key: string
          name: string
          rank?: number
          scope: Database["public"]["Enums"]["user_kind"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key?: string
          name?: string
          rank?: number
          scope?: Database["public"]["Enums"]["user_kind"]
          updated_at?: string
        }
        Relationships: []
      }
      saas_features: {
        Row: {
          audience: string
          description: string
          key: string
          kind: string
          name: string
          position: number
        }
        Insert: {
          audience: string
          description?: string
          key: string
          kind: string
          name: string
          position?: number
        }
        Update: {
          audience?: string
          description?: string
          key?: string
          kind?: string
          name?: string
          position?: number
        }
        Relationships: []
      }
      saas_plan_features: {
        Row: {
          enabled: boolean
          feature_key: string
          limit_value: number | null
          plan_key: string
        }
        Insert: {
          enabled?: boolean
          feature_key: string
          limit_value?: number | null
          plan_key: string
        }
        Update: {
          enabled?: boolean
          feature_key?: string
          limit_value?: number | null
          plan_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "saas_plan_features_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "saas_features"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "saas_plan_features_plan_key_fkey"
            columns: ["plan_key"]
            isOneToOne: false
            referencedRelation: "saas_plans"
            referencedColumns: ["key"]
          },
        ]
      }
      saas_plans: {
        Row: {
          billing_interval: string
          created_at: string
          currency: string
          description: string | null
          is_active: boolean
          is_public: boolean
          key: string
          name: string
          price_cents: number
          rank: number
          updated_at: string
        }
        Insert: {
          billing_interval?: string
          created_at?: string
          currency?: string
          description?: string | null
          is_active?: boolean
          is_public?: boolean
          key: string
          name: string
          price_cents?: number
          rank: number
          updated_at?: string
        }
        Update: {
          billing_interval?: string
          created_at?: string
          currency?: string
          description?: string | null
          is_active?: boolean
          is_public?: boolean
          key?: string
          name?: string
          price_cents?: number
          rank?: number
          updated_at?: string
        }
        Relationships: []
      }
      service_types: {
        Row: {
          content_types: Database["public"]["Enums"]["content_type"][]
          counts_on: string
          created_at: string
          is_active: boolean
          is_quantitative: boolean
          key: string
          name: string
          position: number
          unit: string
          updated_at: string
        }
        Insert: {
          content_types?: Database["public"]["Enums"]["content_type"][]
          counts_on?: string
          created_at?: string
          is_active?: boolean
          is_quantitative?: boolean
          key: string
          name: string
          position?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          content_types?: Database["public"]["Enums"]["content_type"][]
          counts_on?: string
          created_at?: string
          is_active?: boolean
          is_quantitative?: boolean
          key?: string
          name?: string
          position?: number
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      shared_documents: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          file_id: string | null
          id: string
          is_pinned: boolean
          title: string
          updated_at: string
          updated_by: string | null
          url: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          file_id?: string | null
          id?: string
          is_pinned?: boolean
          title: string
          updated_at?: string
          updated_by?: string | null
          url?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          file_id?: string | null
          id?: string
          is_pinned?: boolean
          title?: string
          updated_at?: string
          updated_by?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shared_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_documents_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shooting_attendance: {
        Row: {
          arrived_at: string | null
          created_at: string
          late_minutes: number
          marked_at: string | null
          marked_by: string | null
          note: string | null
          shooting_id: string
          status: Database["public"]["Enums"]["shooting_attendance_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          arrived_at?: string | null
          created_at?: string
          late_minutes?: number
          marked_at?: string | null
          marked_by?: string | null
          note?: string | null
          shooting_id: string
          status?: Database["public"]["Enums"]["shooting_attendance_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          arrived_at?: string | null
          created_at?: string
          late_minutes?: number
          marked_at?: string | null
          marked_by?: string | null
          note?: string | null
          shooting_id?: string
          status?: Database["public"]["Enums"]["shooting_attendance_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shooting_attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shooting_attendance_shooting_id_user_id_fkey"
            columns: ["shooting_id", "user_id"]
            isOneToOne: true
            referencedRelation: "shooting_members"
            referencedColumns: ["shooting_id", "user_id"]
          },
        ]
      }
      shooting_members: {
        Row: {
          assigned_by: string | null
          created_at: string
          role: Database["public"]["Enums"]["team_role"]
          shooting_id: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          role?: Database["public"]["Enums"]["team_role"]
          shooting_id: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          role?: Database["public"]["Enums"]["team_role"]
          shooting_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shooting_members_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shooting_members_shooting_id_fkey"
            columns: ["shooting_id"]
            isOneToOne: false
            referencedRelation: "shootings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shooting_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shootings: {
        Row: {
          actual_ended_at: string | null
          actual_started_at: string | null
          client_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          ends_at: string
          id: string
          location_address: string | null
          location_lat: number | null
          location_lng: number | null
          location_name: string | null
          location_url: string | null
          project_id: string | null
          reference_links: Json
          responsible_manager_id: string | null
          shot_list: Json
          starts_at: string
          status: Database["public"]["Enums"]["shooting_status"]
          title: string
          updated_at: string
        }
        Insert: {
          actual_ended_at?: string | null
          actual_started_at?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          ends_at: string
          id?: string
          location_address?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_name?: string | null
          location_url?: string | null
          project_id?: string | null
          reference_links?: Json
          responsible_manager_id?: string | null
          shot_list?: Json
          starts_at: string
          status?: Database["public"]["Enums"]["shooting_status"]
          title: string
          updated_at?: string
        }
        Update: {
          actual_ended_at?: string | null
          actual_started_at?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          ends_at?: string
          id?: string
          location_address?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_name?: string | null
          location_url?: string | null
          project_id?: string | null
          reference_links?: Json
          responsible_manager_id?: string | null
          shot_list?: Json
          starts_at?: string
          status?: Database["public"]["Enums"]["shooting_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shootings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shootings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shootings_project_id_client_id_fkey"
            columns: ["project_id", "client_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "shootings_responsible_manager_id_fkey"
            columns: ["responsible_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          client_id: string
          connection: Database["public"]["Enums"]["social_connection"]
          created_at: string
          deleted_at: string | null
          external_id: string | null
          handle: string
          id: string
          last_synced_at: string | null
          platform: Database["public"]["Enums"]["social_platform"]
          sync_error: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          client_id: string
          connection?: Database["public"]["Enums"]["social_connection"]
          created_at?: string
          deleted_at?: string | null
          external_id?: string | null
          handle: string
          id?: string
          last_synced_at?: string | null
          platform: Database["public"]["Enums"]["social_platform"]
          sync_error?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          client_id?: string
          connection?: Database["public"]["Enums"]["social_connection"]
          created_at?: string
          deleted_at?: string | null
          external_id?: string | null
          handle?: string
          id?: string
          last_synced_at?: string | null
          platform?: Database["public"]["Enums"]["social_platform"]
          sync_error?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      social_daily_snapshots: {
        Row: {
          accounts_engaged: number | null
          client_id: string
          comments: number | null
          followers: number | null
          interactions: number | null
          likes: number | null
          media_count: number | null
          profile_links_taps: number | null
          reach: number | null
          reach_30d: number | null
          reach_7d: number | null
          saves: number | null
          shares: number | null
          snapshot_date: string
          social_account_id: string
          source: Database["public"]["Enums"]["metric_source"]
          synced_at: string
          views: number | null
        }
        Insert: {
          accounts_engaged?: number | null
          client_id: string
          comments?: number | null
          followers?: number | null
          interactions?: number | null
          likes?: number | null
          media_count?: number | null
          profile_links_taps?: number | null
          reach?: number | null
          reach_30d?: number | null
          reach_7d?: number | null
          saves?: number | null
          shares?: number | null
          snapshot_date: string
          social_account_id: string
          source?: Database["public"]["Enums"]["metric_source"]
          synced_at?: string
          views?: number | null
        }
        Update: {
          accounts_engaged?: number | null
          client_id?: string
          comments?: number | null
          followers?: number | null
          interactions?: number | null
          likes?: number | null
          media_count?: number | null
          profile_links_taps?: number | null
          reach?: number | null
          reach_30d?: number | null
          reach_7d?: number | null
          saves?: number | null
          shares?: number | null
          snapshot_date?: string
          social_account_id?: string
          source?: Database["public"]["Enums"]["metric_source"]
          synced_at?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "social_daily_snapshots_social_account_id_client_id_fkey"
            columns: ["social_account_id", "client_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id", "client_id"]
          },
        ]
      }
      social_media_items: {
        Row: {
          caption: string | null
          client_id: string
          comments: number | null
          content_id: string | null
          created_at: string
          external_id: string
          id: string
          interactions: number | null
          likes: number | null
          media_type: string | null
          metrics_synced_at: string | null
          permalink: string | null
          posted_at: string | null
          product_type: string | null
          reach: number | null
          saves: number | null
          shares: number | null
          social_account_id: string
          thumbnail_url: string | null
          updated_at: string
          views: number | null
        }
        Insert: {
          caption?: string | null
          client_id: string
          comments?: number | null
          content_id?: string | null
          created_at?: string
          external_id: string
          id?: string
          interactions?: number | null
          likes?: number | null
          media_type?: string | null
          metrics_synced_at?: string | null
          permalink?: string | null
          posted_at?: string | null
          product_type?: string | null
          reach?: number | null
          saves?: number | null
          shares?: number | null
          social_account_id: string
          thumbnail_url?: string | null
          updated_at?: string
          views?: number | null
        }
        Update: {
          caption?: string | null
          client_id?: string
          comments?: number | null
          content_id?: string | null
          created_at?: string
          external_id?: string
          id?: string
          interactions?: number | null
          likes?: number | null
          media_type?: string | null
          metrics_synced_at?: string | null
          permalink?: string | null
          posted_at?: string | null
          product_type?: string | null
          reach?: number | null
          saves?: number | null
          shares?: number | null
          social_account_id?: string
          thumbnail_url?: string | null
          updated_at?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "social_media_items_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_media_items_social_account_id_client_id_fkey"
            columns: ["social_account_id", "client_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id", "client_id"]
          },
        ]
      }
      social_metrics: {
        Row: {
          client_id: string
          comments: number | null
          created_at: string
          entered_by: string | null
          followers_end: number | null
          followers_start: number | null
          id: string
          likes: number | null
          period_end: string
          period_start: string
          profile_visits: number | null
          reach: number | null
          saves: number | null
          shares: number | null
          social_account_id: string
          source: Database["public"]["Enums"]["metric_source"]
          synced_at: string | null
          updated_at: string
          views: number | null
        }
        Insert: {
          client_id: string
          comments?: number | null
          created_at?: string
          entered_by?: string | null
          followers_end?: number | null
          followers_start?: number | null
          id?: string
          likes?: number | null
          period_end: string
          period_start: string
          profile_visits?: number | null
          reach?: number | null
          saves?: number | null
          shares?: number | null
          social_account_id: string
          source: Database["public"]["Enums"]["metric_source"]
          synced_at?: string | null
          updated_at?: string
          views?: number | null
        }
        Update: {
          client_id?: string
          comments?: number | null
          created_at?: string
          entered_by?: string | null
          followers_end?: number | null
          followers_start?: number | null
          id?: string
          likes?: number | null
          period_end?: string
          period_start?: string
          profile_visits?: number | null
          reach?: number | null
          saves?: number | null
          shares?: number | null
          social_account_id?: string
          source?: Database["public"]["Enums"]["metric_source"]
          synced_at?: string | null
          updated_at?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "social_metrics_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_metrics_social_account_id_client_id_fkey"
            columns: ["social_account_id", "client_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id", "client_id"]
          },
        ]
      }
      subscription_events: {
        Row: {
          actor_id: string | null
          created_at: string
          data: Json
          external_id: string | null
          id: number
          subscription_id: string | null
          type: string
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          data?: Json
          external_id?: string | null
          id?: never
          subscription_id?: string | null
          type: string
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          data?: Json
          external_id?: string | null
          id?: never
          subscription_id?: string | null
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "workspace_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_quotas: {
        Row: {
          is_included: boolean
          note: string | null
          quantity: number | null
          service_key: string
          subscription_id: string
        }
        Insert: {
          is_included?: boolean
          note?: string | null
          quantity?: number | null
          service_key: string
          subscription_id: string
        }
        Update: {
          is_included?: boolean
          note?: string | null
          quantity?: number | null
          service_key?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_quotas_service_key_fkey"
            columns: ["service_key"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "subscription_quotas_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "client_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_quotas_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscription_usage_summary"
            referencedColumns: ["subscription_id"]
          },
        ]
      }
      task_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          task_id: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          task_id: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_checklist_items: {
        Row: {
          created_at: string
          done_at: string | null
          done_by: string | null
          id: string
          is_done: boolean
          position: number
          task_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          id?: string
          is_done?: boolean
          position?: number
          task_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          id?: string
          is_done?: boolean
          position?: number
          task_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_checklist_items_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_checklist_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          task_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          task_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_dependencies: {
        Row: {
          created_at: string
          created_by: string | null
          depends_on: string
          task_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          depends_on: string
          task_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          depends_on?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_depends_on_fkey"
            columns: ["depends_on"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          client_id: string | null
          completed_at: string | null
          content_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_at: string | null
          estimated_minutes: number | null
          id: string
          overdue_at: string | null
          priority: Database["public"]["Enums"]["priority_level"]
          project_id: string | null
          shooting_id: string | null
          started_at: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_type: Database["public"]["Enums"]["task_type"]
          title: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          completed_at?: string | null
          content_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          estimated_minutes?: number | null
          id?: string
          overdue_at?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          project_id?: string | null
          shooting_id?: string | null
          started_at?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_type?: Database["public"]["Enums"]["task_type"]
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          completed_at?: string | null
          content_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          estimated_minutes?: number | null
          id?: string
          overdue_at?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          project_id?: string | null
          shooting_id?: string | null
          started_at?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_type?: Database["public"]["Enums"]["task_type"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_content_id_client_id_fkey"
            columns: ["content_id", "client_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_client_id_fkey"
            columns: ["project_id", "client_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "tasks_shooting_id_client_id_fkey"
            columns: ["shooting_id", "client_id"]
            isOneToOne: false
            referencedRelation: "shootings"
            referencedColumns: ["id", "client_id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          created_at: string
          granted_by: string | null
          permission_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          permission_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          permission_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_by: string | null
          created_at: string
          role_id: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          role_id: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_subscriptions: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          note: string | null
          plan_key: string
          provider: string | null
          provider_ref: string | null
          source: string
          starts_at: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          note?: string | null
          plan_key: string
          provider?: string | null
          provider_ref?: string | null
          source: string
          starts_at?: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          note?: string | null
          plan_key?: string
          provider?: string | null
          provider_ref?: string | null
          source?: string
          starts_at?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_subscriptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_subscriptions_plan_key_fkey"
            columns: ["plan_key"]
            isOneToOne: false
            referencedRelation: "saas_plans"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "workspace_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          client_id: string | null
          created_at: string
          home_logo_url: string | null
          id: string
          inherits_agency_plan: boolean
          is_internal: boolean
          kind: Database["public"]["Enums"]["workspace_kind"]
          name: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          home_logo_url?: string | null
          id?: string
          inherits_agency_plan?: boolean
          is_internal?: boolean
          kind: Database["public"]["Enums"]["workspace_kind"]
          name: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          home_logo_url?: string | null
          id?: string
          inherits_agency_plan?: boolean
          is_internal?: boolean
          kind?: Database["public"]["Enums"]["workspace_kind"]
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      subscription_usage_summary: {
        Row: {
          client_id: string | null
          is_included: boolean | null
          is_quantitative: boolean | null
          planned: number | null
          position: number | null
          service_key: string | null
          service_name: string | null
          subscription_id: string | null
          unit: string | null
          used: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_billing_event: {
        Args: {
          p_event_id: string
          p_period_end: string
          p_plan: string
          p_provider: string
          p_status: string
          p_subscription_ref: string
          p_workspace: string
        }
        Returns: string
      }
      archive_monthly_report: {
        Args: { p_report_id: string }
        Returns: {
          client_id: string
          created_at: string
          generated_at: string | null
          generated_by: string | null
          highlights: string | null
          id: string
          pdf_generated_at: string | null
          pdf_path: string | null
          period_month: string
          published_at: string | null
          published_by: string | null
          status: Database["public"]["Enums"]["report_status"]
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "monthly_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_plan: {
        Args: {
          p_client_id: string
          p_notes?: string
          p_plan_id: string
          p_price?: number
          p_starts_on?: string
        }
        Returns: string
      }
      authorize_password_reset: { Args: { p_user_id: string }; Returns: string }
      change_staff_role: {
        Args: { p_role_key: string; p_user_id: string }
        Returns: undefined
      }
      claim_push_deliveries: {
        Args: { p_limit?: number }
        Returns: {
          badge: number
          body: string
          data: Json
          delivery_id: number
          priority: Database["public"]["Enums"]["notification_priority"]
          title: string
          token: string
        }[]
      }
      complete_file_upload: {
        Args: {
          p_duration_ms?: number
          p_file_id: string
          p_height?: number
          p_width?: number
        }
        Returns: {
          bucket: string | null
          chat_room_id: string | null
          client_id: string | null
          content_id: string | null
          created_at: string
          deleted_at: string | null
          duration_ms: number | null
          external_url: string | null
          folder_id: string | null
          height: number | null
          id: string
          kind: Database["public"]["Enums"]["file_kind"]
          mime_type: string | null
          name: string
          size_bytes: number | null
          status: Database["public"]["Enums"]["file_status"]
          storage_path: string | null
          task_id: string | null
          updated_at: string
          uploaded_at: string | null
          uploaded_by: string | null
          visibility: Database["public"]["Enums"]["visibility_level"]
          width: number | null
        }
        SetofOptions: {
          from: "*"
          to: "files"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_meta_lead: {
        Args: { p_details: Json; p_lead_id: string }
        Returns: Json
      }
      complete_push_deliveries: {
        Args: { p_results: Json }
        Returns: undefined
      }
      create_file_upload: {
        Args: {
          p_chat_room_id?: string
          p_client_id?: string
          p_content_id?: string
          p_folder_id?: string
          p_mime_type: string
          p_name: string
          p_size_bytes: number
          p_task_id?: string
        }
        Returns: {
          bucket: string | null
          chat_room_id: string | null
          client_id: string | null
          content_id: string | null
          created_at: string
          deleted_at: string | null
          duration_ms: number | null
          external_url: string | null
          folder_id: string | null
          height: number | null
          id: string
          kind: Database["public"]["Enums"]["file_kind"]
          mime_type: string | null
          name: string
          size_bytes: number | null
          status: Database["public"]["Enums"]["file_status"]
          storage_path: string | null
          task_id: string | null
          updated_at: string
          uploaded_at: string | null
          uploaded_by: string | null
          visibility: Database["public"]["Enums"]["visibility_level"]
          width: number | null
        }
        SetofOptions: {
          from: "*"
          to: "files"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_group_chat: {
        Args: { p_member_ids: string[]; p_name: string }
        Returns: string
      }
      decline_access_request: {
        Args: { p_reason?: string; p_user_id: string }
        Returns: undefined
      }
      deliver_leads: {
        Args: { p_client: string; p_lead_ids?: string[] }
        Returns: Json
      }
      discard_leads: {
        Args: { p_lead_ids: string[]; p_reason?: string }
        Returns: number
      }
      disconnect_meta_asset: {
        Args: { p_asset_id: string }
        Returns: undefined
      }
      end_workspace_subscription: {
        Args: { p_subscription: string }
        Returns: undefined
      }
      fail_meta_lead: {
        Args: { p_error: string; p_lead_id: string }
        Returns: undefined
      }
      game_finish: { Args: { p_session: string }; Returns: Json }
      game_guarantee_next: { Args: { p_campaign: string }; Returns: undefined }
      game_next_attempt: { Args: { p_session: string }; Returns: Json }
      game_open_box: {
        Args: { p_box: number; p_session: string }
        Returns: Json
      }
      game_shoot: {
        Args: { p_n: number; p_session: string; p_zone: number }
        Returns: Json
      }
      game_start: { Args: { p_campaign: string }; Returns: Json }
      game_submit_attempt: {
        Args: { p_n: number; p_session: string; p_tap_ms: number }
        Returns: Json
      }
      generate_monthly_report: {
        Args: { p_client_id: string; p_month: string }
        Returns: {
          client_id: string
          created_at: string
          generated_at: string | null
          generated_by: string | null
          highlights: string | null
          id: string
          pdf_generated_at: string | null
          pdf_path: string | null
          period_month: string
          published_at: string | null
          published_by: string | null
          status: Database["public"]["Enums"]["report_status"]
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "monthly_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_access_requests: {
        Args: never
        Returns: {
          avatar_url: string
          created_at: string
          email: string
          full_name: string
          last_sign_in_at: string
          providers: string[]
          requested_at: string
          status: Database["public"]["Enums"]["account_status"]
          user_id: string
        }[]
      }
      get_activity_feed: {
        Args: { p_before?: number; p_client_id?: string; p_limit?: number }
        Returns: {
          action: string
          actor_avatar: string
          actor_id: string
          actor_name: string
          changes: Json
          client_id: string
          client_name: string
          entity_id: string
          entity_type: string
          id: number
          label: string
          occurred_at: string
          subject_name: string
        }[]
      }
      get_approval_counts: { Args: never; Returns: Json }
      get_attendance_day: {
        Args: { p_date: string }
        Returns: {
          arrived_at: string
          attendance_id: string
          avatar_url: string
          full_name: string
          job_title: string
          late_minutes: number
          marked_at: string
          marked_by_name: string
          note: string
          roles: Json
          scheduled: boolean
          status: Database["public"]["Enums"]["attendance_status"]
          user_id: string
          work_start_time: string
        }[]
      }
      get_attendance_summary: {
        Args: { p_from: string; p_to: string; p_user_id: string }
        Returns: Json
      }
      get_calendar_events: {
        Args: { p_client_id?: string; p_from: string; p_to: string }
        Returns: {
          client_id: string
          client_name: string
          content_id: string
          content_type: Database["public"]["Enums"]["content_type"]
          ends_at: string
          entity_id: string
          event_type: string
          location_name: string
          platform: Database["public"]["Enums"]["social_platform"]
          starts_at: string
          status: string
          title: string
        }[]
      }
      get_client_conversations: {
        Args: never
        Returns: {
          awaiting_reply: boolean
          client_code: string
          client_id: string
          client_logo: string
          client_name: string
          is_member: boolean
          last_message_at: string
          last_message_body: string
          last_sender_name: string
          room_id: string
          unread_count: number
        }[]
      }
      get_client_folders: {
        Args: { p_client_id: string }
        Returns: {
          file_count: number
          id: string
          is_system: boolean
          kind: Database["public"]["Enums"]["folder_kind"]
          last_upload_at: string
          name: string
          parent_id: string
          total_bytes: number
          visibility: Database["public"]["Enums"]["visibility_level"]
        }[]
      }
      get_client_forecast: { Args: { p_client: string }; Returns: Json }
      get_client_home: { Args: { p_client_id: string }; Returns: Json }
      get_client_leads: {
        Args: {
          p_before?: string
          p_client: string
          p_limit?: number
          p_period?: string
        }
        Returns: Json
      }
      get_client_overview: { Args: { p_client_id: string }; Returns: Json }
      get_client_plan: { Args: { p_client_id: string }; Returns: Json }
      get_client_resource_report: {
        Args: { p_from: string; p_to: string }
        Returns: {
          client_id: string
          client_name: string
          metrics: Json
        }[]
      }
      get_client_results: {
        Args: { p_client: string; p_month?: string }
        Returns: Json
      }
      get_command_center: { Args: { p_date?: string }; Returns: Json }
      get_content_transitions: {
        Args: { p_content_id: string }
        Returns: Database["public"]["Enums"]["content_status"][]
      }
      get_crm_summary: { Args: never; Returns: Json }
      get_employee_home: { Args: never; Returns: Json }
      get_employee_scorecards: {
        Args: { p_from: string; p_to: string; p_user_id?: string }
        Returns: {
          full_name: string
          metrics: Json
          role_keys: string[]
          user_id: string
        }[]
      }
      get_files_overview: {
        Args: never
        Returns: {
          client_id: string
          code: string
          file_count: number
          last_upload_at: string
          logo_url: string
          name: string
          total_bytes: number
        }[]
      }
      get_inbox_counts: { Args: never; Returns: Json }
      get_instagram_summary: {
        Args: { p_client: string; p_days?: number }
        Returns: Json
      }
      get_lead: { Args: { p_lead_id: string }; Returns: Json }
      get_leads: {
        Args: {
          p_before?: string
          p_client?: string
          p_limit?: number
          p_state: string
        }
        Returns: {
          ad_name: string
          campaign_name: string
          client_code: string
          client_id: string
          client_name: string
          delivered_at: string
          delivery_status: Database["public"]["Enums"]["lead_delivery_status"]
          email: string
          fetch_status: Database["public"]["Enums"]["lead_fetch_status"]
          form_name: string
          full_name: string
          id: string
          lead_at: string
          phone: string
          platform: string
          received_at: string
        }[]
      }
      get_my_chats: {
        Args: never
        Returns: {
          archived: boolean
          client_code: string
          client_id: string
          client_logo: string
          client_name: string
          description: string
          is_default: boolean
          kind: Database["public"]["Enums"]["chat_room_kind"]
          last_has_files: boolean
          last_is_system: boolean
          last_message_at: string
          last_message_body: string
          last_message_id: string
          last_read_at: string
          last_sender_id: string
          last_sender_name: string
          member_count: number
          muted: boolean
          name: string
          peer_avatar: string
          peer_id: string
          peer_name: string
          room_id: string
          unread_count: number
        }[]
      }
      get_my_context: { Args: never; Returns: Json }
      get_my_entitlements: { Args: { p_client?: string }; Returns: Json }
      get_my_games: { Args: never; Returns: Json }
      get_report: { Args: { p_report_id: string }; Returns: Json }
      get_team_directory: {
        Args: never
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"]
          attendance_status: Database["public"]["Enums"]["attendance_status"]
          avatar_url: string
          department: string
          due_today: number
          email: string
          employee_status: Database["public"]["Enums"]["employee_status"]
          full_name: string
          job_title: string
          late_minutes: number
          open_tasks: number
          overdue_tasks: number
          phone: string
          roles: Json
          shootings_today: number
          user_id: string
        }[]
      }
      get_top_media: {
        Args: {
          p_client: string
          p_days?: number
          p_limit?: number
          p_sort?: string
        }
        Returns: Json
      }
      global_search: {
        Args: { p_limit?: number; p_query: string }
        Returns: Json
      }
      grant_workspace_plan: {
        Args: {
          p_days: number
          p_note?: string
          p_plan: string
          p_workspace: string
        }
        Returns: string
      }
      handle_upgrade_request: {
        Args: {
          p_approve: boolean
          p_request_id: string
          p_response?: string
          p_starts_on?: string
        }
        Returns: string
      }
      ig_accounts_to_sync: {
        Args: { p_client?: string }
        Returns: {
          asset_id: string
          client_id: string
          connection_id: string
          ig_user_id: string
          last_snapshot: string
          social_account_id: string
          token_asset_id: string
        }[]
      }
      ig_mark_synced: {
        Args: { p_asset_id: string; p_error?: string }
        Returns: undefined
      }
      ig_save_media: {
        Args: { p_items: Json; p_social_account: string }
        Returns: number
      }
      ig_save_period: {
        Args: {
          p_end: string
          p_metrics: Json
          p_social_account: string
          p_start: string
        }
        Returns: undefined
      }
      ig_save_snapshot: {
        Args: { p_date: string; p_metrics: Json; p_social_account: string }
        Returns: undefined
      }
      ingest_meta_lead: {
        Args: {
          p_ad_id?: string
          p_adset_id?: string
          p_created_time?: string
          p_form_id?: string
          p_meta_lead_id: string
          p_page_id: string
        }
        Returns: Json
      }
      link_media_to_content: {
        Args: { p_content_id: string; p_media_id: string }
        Returns: undefined
      }
      mark_chat_read: { Args: { p_room_id: string }; Returns: undefined }
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number }
      mark_password_changed: { Args: never; Returns: undefined }
      meta_drop_token: {
        Args: { p_owner_id: string; p_owner_kind: string }
        Returns: undefined
      }
      meta_leads_to_fetch: {
        Args: { p_limit?: number }
        Returns: {
          lead_id: string
          meta_lead_id: string
          page_asset_id: string
        }[]
      }
      meta_mark_asset: {
        Args: { p_asset_id: string; p_error?: string; p_webhook_ok: boolean }
        Returns: undefined
      }
      meta_read_token: {
        Args: { p_owner_id: string; p_owner_kind: string }
        Returns: string
      }
      meta_save_connection: {
        Args: {
          p_connected_by: string
          p_expires_at: string
          p_meta_user_id: string
          p_name: string
          p_scopes: string[]
          p_token: string
        }
        Returns: string
      }
      meta_save_token: {
        Args: { p_owner_id: string; p_owner_kind: string; p_token: string }
        Returns: undefined
      }
      open_direct_chat: { Args: { p_user_id: string }; Returns: string }
      preview_crm_report: {
        Args: { p_client: string; p_from: string; p_to: string }
        Returns: Json
      }
      provision_client_user: {
        Args: {
          p_client_id: string
          p_first_name: string
          p_last_name: string
          p_permissions?: string[]
          p_phone?: string
          p_role_key: string
          p_title?: string
          p_user_id: string
        }
        Returns: Json
      }
      provision_staff_member: {
        Args: {
          p_client_ids?: string[]
          p_department?: string
          p_employment_type?: Database["public"]["Enums"]["employment_type"]
          p_first_name: string
          p_job_title?: string
          p_last_name: string
          p_permissions?: string[]
          p_phone?: string
          p_role_key: string
          p_team_role?: Database["public"]["Enums"]["team_role"]
          p_user_id: string
        }
        Returns: Json
      }
      publish_monthly_report: {
        Args: { p_report_id: string }
        Returns: {
          client_id: string
          created_at: string
          generated_at: string | null
          generated_by: string | null
          highlights: string | null
          id: string
          pdf_generated_at: string | null
          pdf_path: string | null
          period_month: string
          published_at: string | null
          published_by: string | null
          status: Database["public"]["Enums"]["report_status"]
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "monthly_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      redeem_promo: { Args: { p_code: string }; Returns: Json }
      register_external_file: {
        Args: {
          p_client_id: string
          p_content_id?: string
          p_external_url: string
          p_folder_id: string
          p_name: string
        }
        Returns: {
          bucket: string | null
          chat_room_id: string | null
          client_id: string | null
          content_id: string | null
          created_at: string
          deleted_at: string | null
          duration_ms: number | null
          external_url: string | null
          folder_id: string | null
          height: number | null
          id: string
          kind: Database["public"]["Enums"]["file_kind"]
          mime_type: string | null
          name: string
          size_bytes: number | null
          status: Database["public"]["Enums"]["file_status"]
          storage_path: string | null
          task_id: string | null
          updated_at: string
          uploaded_at: string | null
          uploaded_by: string | null
          visibility: Database["public"]["Enums"]["visibility_level"]
          width: number | null
        }
        SetofOptions: {
          from: "*"
          to: "files"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_push_token: {
        Args: {
          p_app_version?: string
          p_device_name?: string
          p_platform: string
          p_token: string
        }
        Returns: undefined
      }
      remove_file: { Args: { p_file_id: string }; Returns: undefined }
      request_access: { Args: never; Returns: Json }
      request_pro_upgrade: { Args: { p_feature?: string }; Returns: undefined }
      restore_lead: { Args: { p_lead_id: string }; Returns: undefined }
      review_content_version: {
        Args: {
          p_comments?: Json
          p_decision: Database["public"]["Enums"]["approval_decision"]
          p_summary?: string
          p_version_id: string
        }
        Returns: Json
      }
      save_content: {
        Args: { p_content_id: string; p_payload: Json }
        Returns: string
      }
      save_crm_settings: {
        Args: {
          p_auto_deliver: boolean
          p_client: string
          p_field_map?: Json
          p_template: string
        }
        Returns: {
          auto_deliver: boolean
          client_id: string
          created_at: string
          field_map: Json
          template: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "client_crm_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_meta_assets: {
        Args: {
          p_assets: Json
          p_auto_deliver?: boolean
          p_client: string
          p_connection: string
          p_template?: string
        }
        Returns: {
          asset_id: string
          asset_type: Database["public"]["Enums"]["meta_asset_type"]
          external_id: string
        }[]
      }
      save_shooting: {
        Args: { p_payload: Json; p_shooting_id: string }
        Returns: string
      }
      save_task: {
        Args: { p_payload: Json; p_task_id: string }
        Returns: string
      }
      send_crm_report: {
        Args: {
          p_client: string
          p_from: string
          p_kind: string
          p_note?: string
          p_to: string
        }
        Returns: string
      }
      send_message: {
        Args: {
          p_body: string
          p_directive?: boolean
          p_file_ids?: string[]
          p_reply_to?: string
          p_room_id: string
        }
        Returns: {
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          is_directive: boolean
          is_system: boolean
          reply_to_id: string | null
          room_id: string
          sender_id: string | null
          sender_label: string | null
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_account_status: {
        Args: {
          p_reason?: string
          p_status: Database["public"]["Enums"]["account_status"]
          p_user_id: string
        }
        Returns: Database["public"]["Enums"]["account_status"]
      }
      set_client_member_permissions: {
        Args: {
          p_client_id: string
          p_permissions: string[]
          p_user_id: string
        }
        Returns: undefined
      }
      set_content_status: {
        Args: {
          p_content_id: string
          p_note?: string
          p_status: Database["public"]["Enums"]["content_status"]
        }
        Returns: {
          approved_at: string | null
          caption: string | null
          client_approval_due_at: string | null
          client_id: string
          content_type: Database["public"]["Enums"]["content_type"]
          counts_toward_plan: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_at: string | null
          hashtags: string[]
          id: string
          is_client_visible: boolean
          music_reference: string | null
          number: number
          plan_month: string
          priority: Database["public"]["Enums"]["priority_level"]
          project_id: string | null
          published_at: string | null
          reference_links: Json
          revision_count: number
          script: string | null
          shooting_id: string | null
          status: Database["public"]["Enums"]["content_status"]
          status_changed_at: string
          thumbnail_file_id: string | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "content_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_home_logo: {
        Args: { p_client: string; p_url: string }
        Returns: undefined
      }
      set_staff_permissions: {
        Args: { p_permissions: string[]; p_user_id: string }
        Returns: undefined
      }
      submit_content_version: {
        Args: {
          p_content_id: string
          p_file_id: string
          p_notes?: string
          p_stage?: Database["public"]["Enums"]["approval_stage"]
        }
        Returns: {
          client_id: string
          content_id: string
          created_at: string
          decided_at: string | null
          file_id: string
          id: string
          notes: string | null
          sent_to_client_at: string | null
          status: Database["public"]["Enums"]["version_status"]
          submitted_at: string
          submitted_by: string | null
          updated_at: string
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "content_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      system_auth_events: {
        Args: { p_limit?: number }
        Returns: {
          action: string
          email: string
          ip: string
          occurred_at: string
        }[]
      }
      system_revoke_sessions: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      system_sessions: {
        Args: never
        Returns: {
          email: string
          full_name: string
          ip: string
          last_active_at: string
          sessions: number
          user_agent: string
          user_id: string
        }[]
      }
      toggle_shot_item: {
        Args: { p_done: boolean; p_index: number; p_shooting_id: string }
        Returns: Json
      }
      touch_last_seen: { Args: never; Returns: undefined }
      unregister_push_token: { Args: { p_token: string }; Returns: undefined }
      update_account_profile: {
        Args: {
          p_first_name: string
          p_last_name: string
          p_phone?: string
          p_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      account_status: "active" | "disabled" | "suspended"
      approval_decision: "approved" | "changes_requested"
      approval_stage: "internal" | "client"
      attendance_status:
        | "present"
        | "absent"
        | "late"
        | "excused"
        | "vacation"
        | "remote"
      chat_room_kind: "project" | "internal" | "direct"
      client_status: "active" | "paused" | "disabled" | "archived"
      content_status:
        | "idea"
        | "script"
        | "ready_for_shoot"
        | "shooting"
        | "shot"
        | "editing"
        | "internal_review"
        | "client_review"
        | "revision"
        | "approved"
        | "scheduled"
        | "published"
        | "cancelled"
      content_type:
        | "reel"
        | "video"
        | "post"
        | "carousel"
        | "story"
        | "design"
        | "ad_creative"
        | "other"
      contract_status: "draft" | "active" | "expired" | "terminated"
      delivery_status: "pending" | "sent" | "failed" | "skipped"
      employee_status: "active" | "on_leave" | "terminated"
      employment_type: "full_time" | "part_time" | "contractor" | "intern"
      file_kind:
        | "video"
        | "image"
        | "audio"
        | "pdf"
        | "document"
        | "archive"
        | "other"
      file_status: "pending" | "uploaded" | "failed"
      folder_kind:
        | "raw"
        | "edited"
        | "approved"
        | "logos"
        | "brandbook"
        | "music"
        | "photos"
        | "documents"
        | "contracts"
        | "custom"
      integration_status: "active" | "error" | "disconnected"
      lead_delivery_status: "pending" | "delivered" | "discarded"
      lead_fetch_status: "pending" | "complete" | "failed"
      meta_asset_type:
        | "business"
        | "page"
        | "instagram"
        | "ad_account"
        | "lead_form"
      metric_source: "manual" | "api"
      notification_priority: "low" | "normal" | "high"
      priority_level: "low" | "normal" | "high" | "urgent"
      project_kind: "retainer" | "campaign" | "one_off"
      project_status:
        | "planning"
        | "active"
        | "on_hold"
        | "completed"
        | "cancelled"
      publication_status:
        | "planned"
        | "scheduled"
        | "published"
        | "failed"
        | "cancelled"
      report_status: "draft" | "published" | "archived"
      request_status: "pending" | "approved" | "rejected" | "cancelled"
      revision_status: "open" | "in_progress" | "resolved" | "cancelled"
      shooting_attendance_status:
        | "pending"
        | "arrived"
        | "absent"
        | "excused"
        | "late"
      shooting_status:
        | "planned"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "postponed"
        | "cancelled"
      social_connection: "manual" | "connected" | "error" | "disconnected"
      social_platform:
        | "instagram"
        | "tiktok"
        | "youtube"
        | "facebook"
        | "telegram"
        | "linkedin"
        | "x"
        | "website"
        | "other"
      subscription_status: "scheduled" | "active" | "expired" | "cancelled"
      task_status:
        | "todo"
        | "in_progress"
        | "in_review"
        | "revision"
        | "done"
        | "cancelled"
      task_type:
        | "shooting"
        | "editing"
        | "design"
        | "copywriting"
        | "publishing"
        | "review"
        | "strategy"
        | "meeting"
        | "other"
      team_role:
        | "account_manager"
        | "project_manager"
        | "smm_manager"
        | "operator"
        | "editor"
        | "designer"
        | "copywriter"
        | "assistant"
      usage_source: "auto" | "manual"
      user_kind: "staff" | "client"
      version_status:
        | "internal_review"
        | "client_review"
        | "changes_requested"
        | "approved"
        | "superseded"
      visibility_level: "internal" | "client"
      workspace_kind: "agency" | "client"
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
      account_status: ["active", "disabled", "suspended"],
      approval_decision: ["approved", "changes_requested"],
      approval_stage: ["internal", "client"],
      attendance_status: [
        "present",
        "absent",
        "late",
        "excused",
        "vacation",
        "remote",
      ],
      chat_room_kind: ["project", "internal", "direct"],
      client_status: ["active", "paused", "disabled", "archived"],
      content_status: [
        "idea",
        "script",
        "ready_for_shoot",
        "shooting",
        "shot",
        "editing",
        "internal_review",
        "client_review",
        "revision",
        "approved",
        "scheduled",
        "published",
        "cancelled",
      ],
      content_type: [
        "reel",
        "video",
        "post",
        "carousel",
        "story",
        "design",
        "ad_creative",
        "other",
      ],
      contract_status: ["draft", "active", "expired", "terminated"],
      delivery_status: ["pending", "sent", "failed", "skipped"],
      employee_status: ["active", "on_leave", "terminated"],
      employment_type: ["full_time", "part_time", "contractor", "intern"],
      file_kind: [
        "video",
        "image",
        "audio",
        "pdf",
        "document",
        "archive",
        "other",
      ],
      file_status: ["pending", "uploaded", "failed"],
      folder_kind: [
        "raw",
        "edited",
        "approved",
        "logos",
        "brandbook",
        "music",
        "photos",
        "documents",
        "contracts",
        "custom",
      ],
      integration_status: ["active", "error", "disconnected"],
      lead_delivery_status: ["pending", "delivered", "discarded"],
      lead_fetch_status: ["pending", "complete", "failed"],
      meta_asset_type: [
        "business",
        "page",
        "instagram",
        "ad_account",
        "lead_form",
      ],
      metric_source: ["manual", "api"],
      notification_priority: ["low", "normal", "high"],
      priority_level: ["low", "normal", "high", "urgent"],
      project_kind: ["retainer", "campaign", "one_off"],
      project_status: [
        "planning",
        "active",
        "on_hold",
        "completed",
        "cancelled",
      ],
      publication_status: [
        "planned",
        "scheduled",
        "published",
        "failed",
        "cancelled",
      ],
      report_status: ["draft", "published", "archived"],
      request_status: ["pending", "approved", "rejected", "cancelled"],
      revision_status: ["open", "in_progress", "resolved", "cancelled"],
      shooting_attendance_status: [
        "pending",
        "arrived",
        "absent",
        "excused",
        "late",
      ],
      shooting_status: [
        "planned",
        "confirmed",
        "in_progress",
        "completed",
        "postponed",
        "cancelled",
      ],
      social_connection: ["manual", "connected", "error", "disconnected"],
      social_platform: [
        "instagram",
        "tiktok",
        "youtube",
        "facebook",
        "telegram",
        "linkedin",
        "x",
        "website",
        "other",
      ],
      subscription_status: ["scheduled", "active", "expired", "cancelled"],
      task_status: [
        "todo",
        "in_progress",
        "in_review",
        "revision",
        "done",
        "cancelled",
      ],
      task_type: [
        "shooting",
        "editing",
        "design",
        "copywriting",
        "publishing",
        "review",
        "strategy",
        "meeting",
        "other",
      ],
      team_role: [
        "account_manager",
        "project_manager",
        "smm_manager",
        "operator",
        "editor",
        "designer",
        "copywriter",
        "assistant",
      ],
      usage_source: ["auto", "manual"],
      user_kind: ["staff", "client"],
      version_status: [
        "internal_review",
        "client_review",
        "changes_requested",
        "approved",
        "superseded",
      ],
      visibility_level: ["internal", "client"],
      workspace_kind: ["agency", "client"],
    },
  },
} as const

