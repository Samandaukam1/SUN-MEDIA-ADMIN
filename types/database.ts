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
          is_system: boolean
          reply_to_id: string | null
          room_id: string
          sender_id: string | null
        }
        Insert: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_system?: boolean
          reply_to_id?: string | null
          room_id: string
          sender_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_system?: boolean
          reply_to_id?: string | null
          room_id?: string
          sender_id?: string | null
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
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          last_seen_at: string | null
          locale: string
          phone: string | null
          status: Database["public"]["Enums"]["account_status"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id: string
          last_seen_at?: string | null
          locale?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          last_seen_at?: string | null
          locale?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
        }
        Relationships: []
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
      get_client_resource_report: {
        Args: { p_from: string; p_to: string }
        Returns: {
          client_id: string
          client_name: string
          metrics: Json
        }[]
      }
      get_command_center: { Args: { p_date?: string }; Returns: Json }
      get_employee_scorecards: {
        Args: { p_from: string; p_to: string; p_user_id?: string }
        Returns: {
          full_name: string
          metrics: Json
          role_keys: string[]
          user_id: string
        }[]
      }
      get_my_context: { Args: never; Returns: Json }
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number }
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
      review_content_version: {
        Args: {
          p_comments?: Json
          p_decision: Database["public"]["Enums"]["approval_decision"]
          p_summary?: string
          p_version_id: string
        }
        Returns: Json
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
      touch_last_seen: { Args: never; Returns: undefined }
      unregister_push_token: { Args: { p_token: string }; Returns: undefined }
    }
    Enums: {
      account_status: "active" | "disabled"
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
        | "shooting"
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
      shooting_attendance_status: "pending" | "arrived" | "absent" | "late"
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
      account_status: ["active", "disabled"],
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
        "shooting",
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
      shooting_attendance_status: ["pending", "arrived", "absent", "late"],
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
    },
  },
} as const

