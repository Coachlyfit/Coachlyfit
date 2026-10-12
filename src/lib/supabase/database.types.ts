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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          avg_hr: number | null
          client_id: string
          coach_id: string
          completed_at: string
          distance_km: number | null
          duration_min: number | null
          id: string
          kcal: number | null
          notes: string | null
          performed_on: string
          program_activity_id: string
          relationship_id: string | null
          rpe: number | null
        }
        Insert: {
          avg_hr?: number | null
          client_id: string
          coach_id: string
          completed_at?: string
          distance_km?: number | null
          duration_min?: number | null
          id?: string
          kcal?: number | null
          notes?: string | null
          performed_on?: string
          program_activity_id: string
          relationship_id?: string | null
          rpe?: number | null
        }
        Update: {
          avg_hr?: number | null
          client_id?: string
          coach_id?: string
          completed_at?: string
          distance_km?: number | null
          duration_min?: number | null
          id?: string
          kcal?: number | null
          notes?: string | null
          performed_on?: string
          program_activity_id?: string
          relationship_id?: string | null
          rpe?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "activity_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "activity_logs_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_program_activity_id_fkey"
            columns: ["program_activity_id"]
            isOneToOne: false
            referencedRelation: "program_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "coaching_relationships"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string
          admin_name: string | null
          created_at: string
          details: Json
          id: string
          target_email: string | null
          target_name: string | null
          target_user_id: string
        }
        Insert: {
          action: string
          admin_id: string
          admin_name?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_email?: string | null
          target_name?: string | null
          target_user_id: string
        }
        Update: {
          action?: string
          admin_id?: string
          admin_name?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_email?: string | null
          target_name?: string | null
          target_user_id?: string
        }
        Relationships: []
      }
      body_metrics: {
        Row: {
          client_id: string
          coach_id: string
          created_at: string
          id: string
          metric: string
          relationship_id: string | null
          taken_on: string
          unit: string
          value: number
        }
        Insert: {
          client_id: string
          coach_id: string
          created_at?: string
          id?: string
          metric: string
          relationship_id?: string | null
          taken_on?: string
          unit: string
          value: number
        }
        Update: {
          client_id?: string
          coach_id?: string
          created_at?: string
          id?: string
          metric?: string
          relationship_id?: string | null
          taken_on?: string
          unit?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "body_metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "body_metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "body_metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "body_metrics_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "body_metrics_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "coaching_relationships"
            referencedColumns: ["id"]
          },
        ]
      }
      checkins: {
        Row: {
          adherence: number | null
          adjustment_applied_at: string | null
          adjustments: Json | null
          checkin_date: string
          client_id: string
          coach_id: string
          coach_reply: string | null
          coach_seen_at: string | null
          created_at: string
          decision: string | null
          energy: number | null
          id: string
          mood: number | null
          notes: string | null
          relationship_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sleep_hours: number | null
          weight: number | null
        }
        Insert: {
          adherence?: number | null
          adjustment_applied_at?: string | null
          adjustments?: Json | null
          checkin_date?: string
          client_id: string
          coach_id: string
          coach_reply?: string | null
          coach_seen_at?: string | null
          created_at?: string
          decision?: string | null
          energy?: number | null
          id?: string
          mood?: number | null
          notes?: string | null
          relationship_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sleep_hours?: number | null
          weight?: number | null
        }
        Update: {
          adherence?: number | null
          adjustment_applied_at?: string | null
          adjustments?: Json | null
          checkin_date?: string
          client_id?: string
          coach_id?: string
          coach_reply?: string | null
          coach_seen_at?: string | null
          created_at?: string
          decision?: string | null
          energy?: number | null
          id?: string
          mood?: number | null
          notes?: string | null
          relationship_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sleep_hours?: number | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "checkins_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "checkins_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "checkins_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "coaching_relationships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      client_body_profiles: {
        Row: {
          activity_level: string | null
          birth_date: string | null
          client_id: string
          created_at: string
          goal: string | null
          height_cm: number | null
          sex: string | null
        }
        Insert: {
          activity_level?: string | null
          birth_date?: string | null
          client_id: string
          created_at?: string
          goal?: string | null
          height_cm?: number | null
          sex?: string | null
        }
        Update: {
          activity_level?: string | null
          birth_date?: string | null
          client_id?: string
          created_at?: string
          goal?: string | null
          height_cm?: number | null
          sex?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_body_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_body_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_body_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
        ]
      }
      client_metric_definitions: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          key: string
          label_ar: string
          label_en: string
          unit: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          key: string
          label_ar: string
          label_en: string
          unit: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          key?: string
          label_ar?: string
          label_en?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_metric_definitions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      client_observations: {
        Row: {
          body: string
          client_id: string
          coach_id: string
          created_at: string
          id: string
        }
        Insert: {
          body: string
          client_id: string
          coach_id: string
          created_at?: string
          id?: string
        }
        Update: {
          body?: string
          client_id?: string
          coach_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_observations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_observations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_observations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_observations_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      client_packages: {
        Row: {
          coach_id: string
          created_at: string
          description_ar: string | null
          description_en: string | null
          duration_days: number
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          price_egp: number
        }
        Insert: {
          coach_id: string
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          duration_days: number
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          price_egp: number
        }
        Update: {
          coach_id?: string
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          duration_days?: number
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          price_egp?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_packages_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      client_payment_methods: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          name_ar: string
          name_en: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          name_ar: string
          name_en: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          name_ar?: string
          name_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_payment_methods_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      client_subscriptions: {
        Row: {
          client_id: string
          coach_id: string
          created_at: string
          end_date: string
          frozen_at: string | null
          id: string
          package_id: string
          start_date: string
          status: string
        }
        Insert: {
          client_id: string
          coach_id: string
          created_at?: string
          end_date: string
          frozen_at?: string | null
          id?: string
          package_id: string
          start_date?: string
          status?: string
        }
        Update: {
          client_id?: string
          coach_id?: string
          created_at?: string
          end_date?: string
          frozen_at?: string | null
          id?: string
          package_id?: string
          start_date?: string
          status?: string
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
            foreignKeyName: "client_subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_subscriptions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_subscriptions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "client_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      client_transactions: {
        Row: {
          amount_egp: number
          client_id: string
          coach_id: string
          created_at: string
          currency: string
          id: string
          payment_method_id: string
          proof_path: string | null
          recorded_by: string | null
          subscription_id: string | null
          transaction_date: string
        }
        Insert: {
          amount_egp: number
          client_id: string
          coach_id: string
          created_at?: string
          currency?: string
          id?: string
          payment_method_id: string
          proof_path?: string | null
          recorded_by?: string | null
          subscription_id?: string | null
          transaction_date?: string
        }
        Update: {
          amount_egp?: number
          client_id?: string
          coach_id?: string
          created_at?: string
          currency?: string
          id?: string
          payment_method_id?: string
          proof_path?: string | null
          recorded_by?: string | null
          subscription_id?: string | null
          transaction_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_transactions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_transactions_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "client_payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_transactions_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_transactions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "client_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          coach_id: string
          created_at: string
          display_name: string
          email: string | null
          id: string
          phone: string | null
          profile_id: string | null
          status: Database["public"]["Enums"]["client_status"]
        }
        Insert: {
          coach_id: string
          created_at?: string
          display_name: string
          email?: string | null
          id?: string
          phone?: string | null
          profile_id?: string | null
          status?: Database["public"]["Enums"]["client_status"]
        }
        Update: {
          coach_id?: string
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          phone?: string | null
          profile_id?: string | null
          status?: Database["public"]["Enums"]["client_status"]
        }
        Relationships: [
          {
            foreignKeyName: "clients_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coaches: {
        Row: {
          address: string | null
          brand_accent: string | null
          brand_primary: string | null
          brand_sidebar: string | null
          brand_sidebar_text: string | null
          business_name: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          default_checkin_template_id: string | null
          default_currency: string
          default_tax_rate: number
          id: string
          logo_path: string | null
          onboarding_completed_at: string | null
          slug: string
          tax_number: string | null
          training_mode: string | null
        }
        Insert: {
          address?: string | null
          brand_accent?: string | null
          brand_primary?: string | null
          brand_sidebar?: string | null
          brand_sidebar_text?: string | null
          business_name: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          default_checkin_template_id?: string | null
          default_currency?: string
          default_tax_rate?: number
          id: string
          logo_path?: string | null
          onboarding_completed_at?: string | null
          slug: string
          tax_number?: string | null
          training_mode?: string | null
        }
        Update: {
          address?: string | null
          brand_accent?: string | null
          brand_primary?: string | null
          brand_sidebar?: string | null
          brand_sidebar_text?: string | null
          business_name?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          default_checkin_template_id?: string | null
          default_currency?: string
          default_tax_rate?: number
          id?: string
          logo_path?: string | null
          onboarding_completed_at?: string | null
          slug?: string
          tax_number?: string | null
          training_mode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coaches_default_checkin_template_id_fkey"
            columns: ["default_checkin_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaches_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_decisions: {
        Row: {
          adjustments: Json
          affected_item_ids: string[]
          applied_at: string | null
          checkin_id: string | null
          client_id: string
          client_note: string | null
          client_seen_at: string | null
          coach_id: string
          created_at: string
          decided_by: string | null
          decision: string
          evaluated_at: string | null
          evidence: Json
          id: string
          outcome_evidence: Json | null
          outcome_status: string
          program_id: string | null
          reason_key: string
          revision_id: string | null
        }
        Insert: {
          adjustments?: Json
          affected_item_ids?: string[]
          applied_at?: string | null
          checkin_id?: string | null
          client_id: string
          client_note?: string | null
          client_seen_at?: string | null
          coach_id: string
          created_at?: string
          decided_by?: string | null
          decision: string
          evaluated_at?: string | null
          evidence?: Json
          id?: string
          outcome_evidence?: Json | null
          outcome_status?: string
          program_id?: string | null
          reason_key: string
          revision_id?: string | null
        }
        Update: {
          adjustments?: Json
          affected_item_ids?: string[]
          applied_at?: string | null
          checkin_id?: string | null
          client_id?: string
          client_note?: string | null
          client_seen_at?: string | null
          coach_id?: string
          created_at?: string
          decided_by?: string | null
          decision?: string
          evaluated_at?: string | null
          evidence?: Json
          id?: string
          outcome_evidence?: Json | null
          outcome_status?: string
          program_id?: string | null
          reason_key?: string
          revision_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coaching_decisions_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: true
            referencedRelation: "checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_decisions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_decisions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "coaching_decisions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "coaching_decisions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_decisions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_decisions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["program_id"]
          },
          {
            foreignKeyName: "coaching_decisions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_decisions_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "program_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_relationships: {
        Row: {
          client_id: string
          coach_id: string
          created_at: string
          ended_at: string | null
          id: string
          share_history: boolean
          started_at: string | null
          status: Database["public"]["Enums"]["coaching_relationship_status"]
        }
        Insert: {
          client_id: string
          coach_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          share_history?: boolean
          started_at?: string | null
          status?: Database["public"]["Enums"]["coaching_relationship_status"]
        }
        Update: {
          client_id?: string
          coach_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          share_history?: boolean
          started_at?: string | null
          status?: Database["public"]["Enums"]["coaching_relationship_status"]
        }
        Relationships: [
          {
            foreignKeyName: "coaching_relationships_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_relationships_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "coaching_relationships_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "coaching_relationships_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      diet_plans: {
        Row: {
          archived_at: string | null
          client_id: string | null
          coach_id: string
          created_at: string
          end_date: string | null
          id: string
          name_ar: string
          name_en: string
          notes_ar: string | null
          notes_en: string | null
          program_id: string | null
          source_template_id: string | null
          start_date: string
          target_carb_g: number | null
          target_fat_g: number | null
          target_kcal: number | null
          target_protein_g: number | null
          targets_source: string | null
          targets_suggestion: Json | null
        }
        Insert: {
          archived_at?: string | null
          client_id?: string | null
          coach_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          name_ar: string
          name_en: string
          notes_ar?: string | null
          notes_en?: string | null
          program_id?: string | null
          source_template_id?: string | null
          start_date?: string
          target_carb_g?: number | null
          target_fat_g?: number | null
          target_kcal?: number | null
          target_protein_g?: number | null
          targets_source?: string | null
          targets_suggestion?: Json | null
        }
        Update: {
          archived_at?: string | null
          client_id?: string | null
          coach_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          name_ar?: string
          name_en?: string
          notes_ar?: string | null
          notes_en?: string | null
          program_id?: string | null
          source_template_id?: string | null
          start_date?: string
          target_carb_g?: number | null
          target_fat_g?: number | null
          target_kcal?: number | null
          target_protein_g?: number | null
          targets_source?: string | null
          targets_suggestion?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "diet_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diet_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "diet_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "diet_plans_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diet_plans_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["program_id"]
          },
          {
            foreignKeyName: "diet_plans_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diet_plans_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "diet_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaign_recipients: {
        Row: {
          campaign_id: string
          coach_id: string
          email: string
          error: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          coach_id: string
          email: string
          error?: string | null
          sent_at?: string | null
          status: string
        }
        Update: {
          campaign_id?: string
          coach_id?: string
          email?: string
          error?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          body: string
          created_at: string
          direction: string
          failed_count: number
          id: string
          recipient_count: number
          recipient_filter: string
          sent_by: string | null
          sent_count: number
          subject: string
        }
        Insert: {
          body: string
          created_at?: string
          direction: string
          failed_count?: number
          id?: string
          recipient_count: number
          recipient_filter: string
          sent_by?: string | null
          sent_count?: number
          subject: string
        }
        Update: {
          body?: string
          created_at?: string
          direction?: string
          failed_count?: number
          id?: string
          recipient_count?: number
          recipient_filter?: string
          sent_by?: string | null
          sent_count?: number
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_suppressions: {
        Row: {
          created_at: string
          email: string
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          reason?: string
        }
        Relationships: []
      }
      exercises: {
        Row: {
          archived_at: string | null
          coach_id: string | null
          coach_notes_ar: string | null
          coach_notes_en: string | null
          created_at: string
          cues_ar: string[] | null
          cues_en: string[] | null
          difficulty: string | null
          equipment: string | null
          id: string
          image_url: string | null
          instructions_ar: string | null
          instructions_en: string | null
          mistakes_ar: string[] | null
          mistakes_en: string[] | null
          muscle_group: string | null
          name_ar: string
          name_en: string
          primary_muscles: string[] | null
          safety_ar: string | null
          safety_en: string | null
          secondary_muscles: string[] | null
          source_exercise_id: string | null
          steps_ar: string[] | null
          steps_en: string[] | null
          tempo: string | null
          thumbnail_url: string | null
          video_url: string | null
          video_url_alt: string | null
        }
        Insert: {
          archived_at?: string | null
          coach_id?: string | null
          coach_notes_ar?: string | null
          coach_notes_en?: string | null
          created_at?: string
          cues_ar?: string[] | null
          cues_en?: string[] | null
          difficulty?: string | null
          equipment?: string | null
          id?: string
          image_url?: string | null
          instructions_ar?: string | null
          instructions_en?: string | null
          mistakes_ar?: string[] | null
          mistakes_en?: string[] | null
          muscle_group?: string | null
          name_ar: string
          name_en: string
          primary_muscles?: string[] | null
          safety_ar?: string | null
          safety_en?: string | null
          secondary_muscles?: string[] | null
          source_exercise_id?: string | null
          steps_ar?: string[] | null
          steps_en?: string[] | null
          tempo?: string | null
          thumbnail_url?: string | null
          video_url?: string | null
          video_url_alt?: string | null
        }
        Update: {
          archived_at?: string | null
          coach_id?: string | null
          coach_notes_ar?: string | null
          coach_notes_en?: string | null
          created_at?: string
          cues_ar?: string[] | null
          cues_en?: string[] | null
          difficulty?: string | null
          equipment?: string | null
          id?: string
          image_url?: string | null
          instructions_ar?: string | null
          instructions_en?: string | null
          mistakes_ar?: string[] | null
          mistakes_en?: string[] | null
          muscle_group?: string | null
          name_ar?: string
          name_en?: string
          primary_muscles?: string[] | null
          safety_ar?: string | null
          safety_en?: string | null
          secondary_muscles?: string[] | null
          source_exercise_id?: string | null
          steps_ar?: string[] | null
          steps_en?: string[] | null
          tempo?: string | null
          thumbnail_url?: string | null
          video_url?: string | null
          video_url_alt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercises_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_source_exercise_id_fkey"
            columns: ["source_exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_source_exercise_id_fkey"
            columns: ["source_exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          body: string
          coach_id: string
          created_at: string
          id: string
        }
        Insert: {
          body: string
          coach_id: string
          created_at?: string
          id?: string
        }
        Update: {
          body?: string
          coach_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      foods: {
        Row: {
          carb_g: number
          category: string
          coach_id: string | null
          created_at: string
          fat_g: number
          id: string
          kcal: number
          name_ar: string
          name_en: string
          notes_ar: string | null
          notes_en: string | null
          protein_g: number
          serving_label: string
          source_food_id: string | null
        }
        Insert: {
          carb_g?: number
          category?: string
          coach_id?: string | null
          created_at?: string
          fat_g?: number
          id?: string
          kcal: number
          name_ar: string
          name_en: string
          notes_ar?: string | null
          notes_en?: string | null
          protein_g?: number
          serving_label?: string
          source_food_id?: string | null
        }
        Update: {
          carb_g?: number
          category?: string
          coach_id?: string | null
          created_at?: string
          fat_g?: number
          id?: string
          kcal?: number
          name_ar?: string
          name_en?: string
          notes_ar?: string | null
          notes_en?: string | null
          protein_g?: number
          serving_label?: string
          source_food_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "foods_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foods_source_food_id_fkey"
            columns: ["source_food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foods_source_food_id_fkey"
            columns: ["source_food_id"]
            isOneToOne: false
            referencedRelation: "foods_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      form_assignments: {
        Row: {
          assigned_at: string
          client_id: string
          coach_id: string
          created_at: string
          due_at: string | null
          id: string
          status: string
          template_version_id: string
        }
        Insert: {
          assigned_at?: string
          client_id: string
          coach_id: string
          created_at?: string
          due_at?: string | null
          id?: string
          status?: string
          template_version_id: string
        }
        Update: {
          assigned_at?: string
          client_id?: string
          coach_id?: string
          created_at?: string
          due_at?: string | null
          id?: string
          status?: string
          template_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "form_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "form_assignments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_assignments_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "form_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          answers: Json
          assignment_id: string
          client_id: string
          coach_id: string
          id: string
          relationship_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          submitted_at: string
          template_version_id: string
        }
        Insert: {
          answers: Json
          assignment_id: string
          client_id: string
          coach_id: string
          id?: string
          relationship_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          submitted_at?: string
          template_version_id: string
        }
        Update: {
          answers?: Json
          assignment_id?: string
          client_id?: string
          coach_id?: string
          id?: string
          relationship_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          submitted_at?: string
          template_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "form_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "form_submissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "form_submissions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "coaching_relationships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "form_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_template_versions: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          published_at: string
          schema: Json
          template_id: string
          version: number
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          published_at?: string
          schema: Json
          template_id: string
          version: number
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          published_at?: string
          schema?: Json
          template_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "form_template_versions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      form_templates: {
        Row: {
          archived_at: string | null
          coach_id: string
          created_at: string
          current_version_id: string | null
          draft_schema: Json | null
          id: string
          kind: string
          name_ar: string
          name_en: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          coach_id: string
          created_at?: string
          current_version_id?: string | null
          draft_schema?: Json | null
          id?: string
          kind: string
          name_ar: string
          name_en: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          coach_id?: string
          created_at?: string
          current_version_id?: string | null
          draft_schema?: Json | null
          id?: string
          kind?: string
          name_ar?: string
          name_en?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_templates_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_templates_current_version_fk"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "form_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_log: {
        Row: {
          admin_id: string
          coach_id: string
          created_at: string
          id: string
        }
        Insert: {
          admin_id: string
          coach_id: string
          created_at?: string
          id?: string
        }
        Update: {
          admin_id?: string
          coach_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_log_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_log_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_attempts: {
        Row: {
          attempts: number
          ip: unknown
          window_started_at: string
        }
        Insert: {
          attempts?: number
          ip: unknown
          window_started_at?: string
        }
        Update: {
          attempts?: number
          ip?: unknown
          window_started_at?: string
        }
        Relationships: []
      }
      invites: {
        Row: {
          accepted_at: string | null
          client_id: string
          coach_id: string
          created_at: string
          expires_at: string
          id: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          client_id: string
          coach_id: string
          created_at?: string
          expires_at?: string
          id?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          client_id?: string
          coach_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "invites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "invites_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_counters: {
        Row: {
          coach_id: string
          last_number: number
        }
        Insert: {
          coach_id: string
          last_number?: number
        }
        Update: {
          coach_id?: string
          last_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_counters_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          line_total: number
          position: number
          quantity: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          line_total: number
          position?: number
          quantity: number
          unit_price: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          line_total?: number
          position?: number
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          client_id: string
          coach_id: string
          created_at: string
          currency: string
          due_date: string | null
          id: string
          invoice_number: string | null
          issue_date: string | null
          notes: string | null
          paid_at: string | null
          snapshot: Json | null
          status: string
          subtotal: number
          tax: number
          tax_rate: number
          total: number
          transaction_id: string | null
        }
        Insert: {
          client_id: string
          coach_id: string
          created_at?: string
          currency?: string
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          issue_date?: string | null
          notes?: string | null
          paid_at?: string | null
          snapshot?: Json | null
          status?: string
          subtotal?: number
          tax?: number
          tax_rate?: number
          total?: number
          transaction_id?: string | null
        }
        Update: {
          client_id?: string
          coach_id?: string
          created_at?: string
          currency?: string
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          issue_date?: string | null
          notes?: string | null
          paid_at?: string | null
          snapshot?: Json | null
          status?: string
          subtotal?: number
          tax?: number
          tax_rate?: number
          total?: number
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "invoices_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "client_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_items: {
        Row: {
          client_id: string | null
          coach_id: string
          food_id: string
          id: string
          meal_id: string
          order_index: number
          quantity: number
          unit: string
        }
        Insert: {
          client_id?: string | null
          coach_id: string
          food_id: string
          id?: string
          meal_id: string
          order_index?: number
          quantity?: number
          unit?: string
        }
        Update: {
          client_id?: string | null
          coach_id?: string
          food_id?: string
          id?: string
          meal_id?: string
          order_index?: number
          quantity?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "meal_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "meal_items_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_items_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id"]
          },
        ]
      }
      meals: {
        Row: {
          client_id: string | null
          coach_id: string
          diet_plan_id: string
          id: string
          label_ar: string | null
          label_en: string | null
          order_index: number
          time_of_day: string | null
        }
        Insert: {
          client_id?: string | null
          coach_id: string
          diet_plan_id: string
          id?: string
          label_ar?: string | null
          label_en?: string | null
          order_index?: number
          time_of_day?: string | null
        }
        Update: {
          client_id?: string | null
          coach_id?: string
          diet_plan_id?: string
          id?: string
          label_ar?: string | null
          label_en?: string | null
          order_index?: number
          time_of_day?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "meals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "meals_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meals_diet_plan_id_fkey"
            columns: ["diet_plan_id"]
            isOneToOne: false
            referencedRelation: "diet_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      media: {
        Row: {
          checkin_id: string | null
          client_id: string
          coach_id: string
          created_at: string
          id: string
          kind: string
          pose: string | null
          relationship_id: string | null
          storage_path: string
        }
        Insert: {
          checkin_id?: string | null
          client_id: string
          coach_id: string
          created_at?: string
          id?: string
          kind: string
          pose?: string | null
          relationship_id?: string | null
          storage_path: string
        }
        Update: {
          checkin_id?: string | null
          client_id?: string
          coach_id?: string
          created_at?: string
          id?: string
          kind?: string
          pose?: string | null
          relationship_id?: string | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "media_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "media_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "coaching_relationships"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          client_id: string
          coach_id: string
          created_at: string
          id: string
          read_at: string | null
          relationship_id: string | null
          sender_role: string
        }
        Insert: {
          body: string
          client_id: string
          coach_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          relationship_id?: string | null
          sender_role: string
        }
        Update: {
          body?: string
          client_id?: string
          coach_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
          relationship_id?: string | null
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "messages_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "coaching_relationships"
            referencedColumns: ["id"]
          },
        ]
      }
      mrr_snapshots: {
        Row: {
          active_count: number
          created_at: string
          month: string
          mrr_egp: number
          updated_at: string
        }
        Insert: {
          active_count: number
          created_at?: string
          month: string
          mrr_egp: number
          updated_at?: string
        }
        Update: {
          active_count?: number
          created_at?: string
          month?: string
          mrr_egp?: number
          updated_at?: string
        }
        Relationships: []
      }
      notification_deliveries: {
        Row: {
          attempts: number
          channel: string
          created_at: string
          id: string
          last_error: string | null
          notification_id: string
          send_after: string
          status: string
        }
        Insert: {
          attempts?: number
          channel: string
          created_at?: string
          id?: string
          last_error?: string | null
          notification_id: string
          send_after?: string
          status?: string
        }
        Update: {
          attempts?: number
          channel?: string
          created_at?: string
          id?: string
          last_error?: string | null
          notification_id?: string
          send_after?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json
          profile_id: string
          read_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          profile_id: string
          read_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          profile_id?: string
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_logs: {
        Row: {
          carb_g: number | null
          client_id: string
          coach_id: string
          created_at: string
          fat_g: number | null
          id: string
          kcal: number | null
          log_date: string
          off_plan: boolean
          off_plan_kcal: number | null
          off_plan_meal: string | null
          off_plan_note: string | null
          off_plan_photo_path: string | null
          protein_g: number | null
          relationship_id: string | null
        }
        Insert: {
          carb_g?: number | null
          client_id: string
          coach_id: string
          created_at?: string
          fat_g?: number | null
          id?: string
          kcal?: number | null
          log_date: string
          off_plan?: boolean
          off_plan_kcal?: number | null
          off_plan_meal?: string | null
          off_plan_note?: string | null
          off_plan_photo_path?: string | null
          protein_g?: number | null
          relationship_id?: string | null
        }
        Update: {
          carb_g?: number | null
          client_id?: string
          coach_id?: string
          created_at?: string
          fat_g?: number | null
          id?: string
          kcal?: number | null
          log_date?: string
          off_plan?: boolean
          off_plan_kcal?: number | null
          off_plan_meal?: string | null
          off_plan_note?: string | null
          off_plan_photo_path?: string | null
          protein_g?: number | null
          relationship_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "nutrition_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "nutrition_logs_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_logs_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "coaching_relationships"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_reminder_settings: {
        Row: {
          client_id: string
          created_at: string
          enabled: boolean
          last_reminded_on: string | null
          remind_at: string
          timezone: string
        }
        Insert: {
          client_id: string
          created_at?: string
          enabled?: boolean
          last_reminded_on?: string | null
          remind_at?: string
          timezone: string
        }
        Update: {
          client_id?: string
          created_at?: string
          enabled?: boolean
          last_reminded_on?: string | null
          remind_at?: string
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_reminder_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_reminder_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "nutrition_reminder_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_egp: number
          coach_id: string
          created_at: string
          id: string
          method: string
          period_end: string
          period_start: string
          provider: string
          recorded_by: string | null
          reference: string | null
          subscription_id: string
        }
        Insert: {
          amount_egp: number
          coach_id: string
          created_at?: string
          id?: string
          method: string
          period_end: string
          period_start: string
          provider?: string
          recorded_by?: string | null
          reference?: string | null
          subscription_id: string
        }
        Update: {
          amount_egp?: number
          coach_id?: string
          created_at?: string
          id?: string
          method?: string
          period_end?: string
          period_start?: string
          provider?: string
          recorded_by?: string | null
          reference?: string | null
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
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
          email_notifications: boolean
          full_name: string | null
          id: string
          last_seen_at: string | null
          locale: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          suspended_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email_notifications?: boolean
          full_name?: string | null
          id: string
          last_seen_at?: string | null
          locale?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          suspended_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email_notifications?: boolean
          full_name?: string | null
          id?: string
          last_seen_at?: string | null
          locale?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          suspended_at?: string | null
        }
        Relationships: []
      }
      program_activities: {
        Row: {
          client_id: string | null
          coach_id: string
          distance_km: number | null
          duration_min: number | null
          hr_zone: number | null
          id: string
          intensity: string | null
          kcal_target: number | null
          kind: string
          log_required: boolean
          modality: string
          notes_ar: string | null
          notes_en: string | null
          order_index: number
          pace: string | null
          program_day_id: string
        }
        Insert: {
          client_id?: string | null
          coach_id: string
          distance_km?: number | null
          duration_min?: number | null
          hr_zone?: number | null
          id?: string
          intensity?: string | null
          kcal_target?: number | null
          kind: string
          log_required?: boolean
          modality: string
          notes_ar?: string | null
          notes_en?: string | null
          order_index?: number
          pace?: string | null
          program_day_id: string
        }
        Update: {
          client_id?: string | null
          coach_id?: string
          distance_km?: number | null
          duration_min?: number | null
          hr_zone?: number | null
          id?: string
          intensity?: string | null
          kcal_target?: number | null
          kind?: string
          log_required?: boolean
          modality?: string
          notes_ar?: string | null
          notes_en?: string | null
          order_index?: number
          pace?: string | null
          program_day_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "program_activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "program_activities_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_activities_program_day_id_fkey"
            columns: ["program_day_id"]
            isOneToOne: false
            referencedRelation: "program_days"
            referencedColumns: ["id"]
          },
        ]
      }
      program_days: {
        Row: {
          client_id: string | null
          coach_id: string
          day_index: number
          diet_plan_id: string | null
          id: string
          label_ar: string | null
          label_en: string | null
          notes_ar: string | null
          notes_en: string | null
          order_index: number
          program_id: string
          weekday: number | null
        }
        Insert: {
          client_id?: string | null
          coach_id: string
          day_index: number
          diet_plan_id?: string | null
          id?: string
          label_ar?: string | null
          label_en?: string | null
          notes_ar?: string | null
          notes_en?: string | null
          order_index?: number
          program_id: string
          weekday?: number | null
        }
        Update: {
          client_id?: string | null
          coach_id?: string
          day_index?: number
          diet_plan_id?: string | null
          id?: string
          label_ar?: string | null
          label_en?: string | null
          notes_ar?: string | null
          notes_en?: string | null
          order_index?: number
          program_id?: string
          weekday?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "program_days_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_days_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "program_days_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "program_days_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_days_diet_plan_id_fkey"
            columns: ["diet_plan_id"]
            isOneToOne: false
            referencedRelation: "diet_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_days_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["program_id"]
          },
          {
            foreignKeyName: "program_days_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_item_sets: {
        Row: {
          client_id: string | null
          coach_id: string
          duration_seconds: number | null
          id: string
          program_item_id: string
          reps: number | null
          rest_seconds: number | null
          set_index: number
          weight: number | null
        }
        Insert: {
          client_id?: string | null
          coach_id: string
          duration_seconds?: number | null
          id?: string
          program_item_id: string
          reps?: number | null
          rest_seconds?: number | null
          set_index: number
          weight?: number | null
        }
        Update: {
          client_id?: string | null
          coach_id?: string
          duration_seconds?: number | null
          id?: string
          program_item_id?: string
          reps?: number | null
          rest_seconds?: number | null
          set_index?: number
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "program_item_sets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_item_sets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "program_item_sets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "program_item_sets_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_item_sets_program_item_id_fkey"
            columns: ["program_item_id"]
            isOneToOne: false
            referencedRelation: "program_items"
            referencedColumns: ["id"]
          },
        ]
      }
      program_items: {
        Row: {
          block: string
          client_id: string | null
          coach_id: string
          coach_note_private: string | null
          exercise_id: string
          group_key: string | null
          group_kind: string | null
          id: string
          notes_ar: string | null
          notes_en: string | null
          order_index: number
          program_day_id: string
          progression_rule: string
          rehab_phase_id: string | null
          reps: string
          rest_seconds: number | null
          sets: number
        }
        Insert: {
          block?: string
          client_id?: string | null
          coach_id: string
          coach_note_private?: string | null
          exercise_id: string
          group_key?: string | null
          group_kind?: string | null
          id?: string
          notes_ar?: string | null
          notes_en?: string | null
          order_index?: number
          program_day_id: string
          progression_rule?: string
          rehab_phase_id?: string | null
          reps?: string
          rest_seconds?: number | null
          sets?: number
        }
        Update: {
          block?: string
          client_id?: string | null
          coach_id?: string
          coach_note_private?: string | null
          exercise_id?: string
          group_key?: string | null
          group_kind?: string | null
          id?: string
          notes_ar?: string | null
          notes_en?: string | null
          order_index?: number
          program_day_id?: string
          progression_rule?: string
          rehab_phase_id?: string | null
          reps?: string
          rest_seconds?: number | null
          sets?: number
        }
        Relationships: [
          {
            foreignKeyName: "program_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "program_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "program_items_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_items_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_items_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_items_program_day_id_fkey"
            columns: ["program_day_id"]
            isOneToOne: false
            referencedRelation: "program_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_items_rehab_phase_id_fkey"
            columns: ["rehab_phase_id"]
            isOneToOne: false
            referencedRelation: "rehab_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      program_revisions: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          program_id: string
          reason: string | null
          snapshot: Json
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          program_id: string
          reason?: string | null
          snapshot: Json
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          program_id?: string
          reason?: string | null
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "program_revisions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_revisions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["program_id"]
          },
          {
            foreignKeyName: "program_revisions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          archived_at: string | null
          checkin_triggered_at: string | null
          client_id: string | null
          coach_id: string
          created_at: string
          end_date: string | null
          id: string
          name_ar: string
          name_en: string
          schedule_mode: string
          source_template_id: string | null
          start_date: string
        }
        Insert: {
          archived_at?: string | null
          checkin_triggered_at?: string | null
          client_id?: string | null
          coach_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          name_ar: string
          name_en: string
          schedule_mode?: string
          source_template_id?: string | null
          start_date?: string
        }
        Update: {
          archived_at?: string | null
          checkin_triggered_at?: string | null
          client_id?: string | null
          coach_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          name_ar?: string
          name_en?: string
          schedule_mode?: string
          source_template_id?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "programs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "programs_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["program_id"]
          },
          {
            foreignKeyName: "programs_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          profile_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          profile_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rehab_phases: {
        Row: {
          client_id: string | null
          coach_id: string
          from_week: number
          goals_ar: string | null
          goals_en: string | null
          id: string
          name_ar: string
          name_en: string
          order_index: number
          progression_criteria_ar: string | null
          progression_criteria_en: string | null
          protocol_id: string
          to_week: number
        }
        Insert: {
          client_id?: string | null
          coach_id: string
          from_week: number
          goals_ar?: string | null
          goals_en?: string | null
          id?: string
          name_ar: string
          name_en: string
          order_index?: number
          progression_criteria_ar?: string | null
          progression_criteria_en?: string | null
          protocol_id: string
          to_week: number
        }
        Update: {
          client_id?: string | null
          coach_id?: string
          from_week?: number
          goals_ar?: string | null
          goals_en?: string | null
          id?: string
          name_ar?: string
          name_en?: string
          order_index?: number
          progression_criteria_ar?: string | null
          progression_criteria_en?: string | null
          protocol_id?: string
          to_week?: number
        }
        Relationships: [
          {
            foreignKeyName: "rehab_phases_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rehab_phases_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "rehab_phases_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "rehab_phases_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rehab_phases_protocol_id_fkey"
            columns: ["protocol_id"]
            isOneToOne: false
            referencedRelation: "rehab_protocols"
            referencedColumns: ["id"]
          },
        ]
      }
      rehab_protocols: {
        Row: {
          body_area: string
          client_id: string | null
          coach_id: string
          id: string
          injury_ar: string | null
          injury_en: string | null
          instructions_ar: string | null
          instructions_en: string | null
          order_index: number
          program_id: string
          restrictions_ar: string | null
          restrictions_en: string | null
        }
        Insert: {
          body_area: string
          client_id?: string | null
          coach_id: string
          id?: string
          injury_ar?: string | null
          injury_en?: string | null
          instructions_ar?: string | null
          instructions_en?: string | null
          order_index?: number
          program_id: string
          restrictions_ar?: string | null
          restrictions_en?: string | null
        }
        Update: {
          body_area?: string
          client_id?: string | null
          coach_id?: string
          id?: string
          injury_ar?: string | null
          injury_en?: string | null
          instructions_ar?: string | null
          instructions_en?: string | null
          order_index?: number
          program_id?: string
          restrictions_ar?: string | null
          restrictions_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rehab_protocols_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rehab_protocols_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "rehab_protocols_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "rehab_protocols_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rehab_protocols_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["program_id"]
          },
          {
            foreignKeyName: "rehab_protocols_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_requests: {
        Row: {
          admin_response: string | null
          coach_id: string
          created_at: string
          id: string
          note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          tier_id: string | null
          type: string
        }
        Insert: {
          admin_response?: string | null
          coach_id: string
          created_at?: string
          id?: string
          note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          tier_id?: string | null
          type: string
        }
        Update: {
          admin_response?: string | null
          coach_id?: string
          created_at?: string
          id?: string
          note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          tier_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_requests_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_requests_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_requests_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "subscription_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_tiers: {
        Row: {
          created_at: string
          features: Json
          id: string
          is_active: boolean
          key: string
          max_clients: number
          name_ar: string
          name_en: string
          price_egp_monthly: number
        }
        Insert: {
          created_at?: string
          features?: Json
          id?: string
          is_active?: boolean
          key: string
          max_clients: number
          name_ar: string
          name_en: string
          price_egp_monthly: number
        }
        Update: {
          created_at?: string
          features?: Json
          id?: string
          is_active?: boolean
          key?: string
          max_clients?: number
          name_ar?: string
          name_en?: string
          price_egp_monthly?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          coach_id: string
          created_at: string
          current_period_end: string | null
          id: string
          status: string
          status_changed_at: string | null
          tier_id: string
          trial_ends_at: string | null
        }
        Insert: {
          cancel_at_period_end?: boolean
          coach_id: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          status?: string
          status_changed_at?: string | null
          tier_id: string
          trial_ends_at?: string | null
        }
        Update: {
          cancel_at_period_end?: boolean
          coach_id?: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          status?: string
          status_changed_at?: string | null
          tier_id?: string
          trial_ends_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "subscription_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          accepted_at: string | null
          coach_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_at: string
          profile_id: string | null
          token_hash: string | null
        }
        Insert: {
          accepted_at?: string | null
          coach_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_at?: string
          profile_id?: string | null
          token_hash?: string | null
        }
        Update: {
          accepted_at?: string | null
          coach_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_at?: string
          profile_id?: string | null
          token_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_exercise_results: {
        Row: {
          client_id: string
          coach_id: string
          created_at: string
          difficulty: number | null
          energy: number | null
          id: string
          notes: string | null
          pain: number | null
          program_item_id: string
          relationship_id: string | null
          session_id: string
          status: string
        }
        Insert: {
          client_id: string
          coach_id: string
          created_at?: string
          difficulty?: number | null
          energy?: number | null
          id?: string
          notes?: string | null
          pain?: number | null
          program_item_id: string
          relationship_id?: string | null
          session_id: string
          status: string
        }
        Update: {
          client_id?: string
          coach_id?: string
          created_at?: string
          difficulty?: number | null
          energy?: number | null
          id?: string
          notes?: string | null
          pain?: number | null
          program_item_id?: string
          relationship_id?: string | null
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_exercise_results_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_exercise_results_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "workout_exercise_results_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "workout_exercise_results_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_exercise_results_program_item_id_fkey"
            columns: ["program_item_id"]
            isOneToOne: false
            referencedRelation: "program_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_exercise_results_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "coaching_relationships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_exercise_results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_sessions: {
        Row: {
          client_id: string
          coach_id: string
          completed_at: string | null
          created_at: string
          current_item_id: string | null
          duration_seconds: number | null
          elapsed_seconds: number
          id: string
          program_day_id: string
          relationship_id: string | null
          sets_completed: number | null
          sets_prescribed: number | null
          started_at: string
          total_volume: number | null
        }
        Insert: {
          client_id: string
          coach_id: string
          completed_at?: string | null
          created_at?: string
          current_item_id?: string | null
          duration_seconds?: number | null
          elapsed_seconds?: number
          id?: string
          program_day_id: string
          relationship_id?: string | null
          sets_completed?: number | null
          sets_prescribed?: number | null
          started_at?: string
          total_volume?: number | null
        }
        Update: {
          client_id?: string
          coach_id?: string
          completed_at?: string | null
          created_at?: string
          current_item_id?: string | null
          duration_seconds?: number | null
          elapsed_seconds?: number
          id?: string
          program_day_id?: string
          relationship_id?: string | null
          sets_completed?: number | null
          sets_prescribed?: number | null
          started_at?: string
          total_volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "workout_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "workout_sessions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sessions_current_item_id_fkey"
            columns: ["current_item_id"]
            isOneToOne: false
            referencedRelation: "program_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sessions_program_day_id_fkey"
            columns: ["program_day_id"]
            isOneToOne: false
            referencedRelation: "program_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sessions_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "coaching_relationships"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_set_logs: {
        Row: {
          client_id: string
          coach_id: string
          completed_at: string
          duration_seconds: number | null
          id: string
          notes: string | null
          prescribed_reps: number | null
          prescribed_weight: number | null
          program_item_id: string
          relationship_id: string | null
          reps: number | null
          rpe: number | null
          session_id: string
          set_index: number
          substituted_exercise_id: string | null
          weight: number | null
        }
        Insert: {
          client_id: string
          coach_id: string
          completed_at?: string
          duration_seconds?: number | null
          id?: string
          notes?: string | null
          prescribed_reps?: number | null
          prescribed_weight?: number | null
          program_item_id: string
          relationship_id?: string | null
          reps?: number | null
          rpe?: number | null
          session_id: string
          set_index: number
          substituted_exercise_id?: string | null
          weight?: number | null
        }
        Update: {
          client_id?: string
          coach_id?: string
          completed_at?: string
          duration_seconds?: number | null
          id?: string
          notes?: string | null
          prescribed_reps?: number | null
          prescribed_weight?: number | null
          program_item_id?: string
          relationship_id?: string | null
          reps?: number | null
          rpe?: number | null
          session_id?: string
          set_index?: number
          substituted_exercise_id?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_set_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_set_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_roster"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "workout_set_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_inbox_threads"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "workout_set_logs_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_set_logs_program_item_id_fkey"
            columns: ["program_item_id"]
            isOneToOne: false
            referencedRelation: "program_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_set_logs_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "coaching_relationships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_set_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_set_logs_substituted_exercise_id_fkey"
            columns: ["substituted_exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_set_logs_substituted_exercise_id_fkey"
            columns: ["substituted_exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises_visible"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      coach_client_roster: {
        Row: {
          adherence: number | null
          client_id: string | null
          coach_id: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          last_checkin_date: string | null
          program_id: string | null
          program_name_ar: string | null
          program_name_en: string | null
          status: Database["public"]["Enums"]["client_status"] | null
          subscription_end_date: string | null
          subscription_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_finance_summary: {
        Row: {
          coach_id: string | null
          collected_month: number | null
          collected_total: number | null
          currency: string | null
          expected_month: number | null
          outstanding_amount: number | null
          outstanding_count: number | null
          overdue_amount: number | null
          overdue_count: number | null
        }
        Relationships: []
      }
      coach_inbox_threads: {
        Row: {
          client_id: string | null
          coach_id: string | null
          display_name: string | null
          last_body: string | null
          last_message_at: string | null
          last_read_at: string | null
          last_sender_role: string | null
          status: Database["public"]["Enums"]["client_status"] | null
          unread_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises_visible: {
        Row: {
          archived_at: string | null
          coach_id: string | null
          coach_notes_ar: string | null
          coach_notes_en: string | null
          created_at: string | null
          cues_ar: string[] | null
          cues_en: string[] | null
          difficulty: string | null
          equipment: string | null
          id: string | null
          image_url: string | null
          instructions_ar: string | null
          instructions_en: string | null
          mistakes_ar: string[] | null
          mistakes_en: string[] | null
          muscle_group: string | null
          my_clone_id: string | null
          name_ar: string | null
          name_en: string | null
          primary_muscles: string[] | null
          safety_ar: string | null
          safety_en: string | null
          secondary_muscles: string[] | null
          source_exercise_id: string | null
          source_name_ar: string | null
          source_name_en: string | null
          steps_ar: string[] | null
          steps_en: string[] | null
          tempo: string | null
          thumbnail_url: string | null
          video_url: string | null
          video_url_alt: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercises_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_source_exercise_id_fkey"
            columns: ["source_exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_source_exercise_id_fkey"
            columns: ["source_exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      foods_visible: {
        Row: {
          carb_g: number | null
          category: string | null
          coach_id: string | null
          created_at: string | null
          fat_g: number | null
          id: string | null
          kcal: number | null
          my_clone_id: string | null
          name_ar: string | null
          name_en: string | null
          notes_ar: string | null
          notes_en: string | null
          protein_g: number | null
          serving_label: string | null
          source_food_id: string | null
          source_name_ar: string | null
          source_name_en: string | null
        }
        Relationships: [
          {
            foreignKeyName: "foods_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foods_source_food_id_fkey"
            columns: ["source_food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foods_source_food_id_fkey"
            columns: ["source_food_id"]
            isOneToOne: false
            referencedRelation: "foods_visible"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_invite: {
        Args: { p_ip?: unknown; p_token: string }
        Returns: Json
      }
      accept_team_invite: {
        Args: { p_ip?: unknown; p_token: string }
        Returns: Json
      }
      admin_add_coach_note: {
        Args: { p_coach_id: string; p_note: string }
        Returns: undefined
      }
      admin_authorize_user_action: {
        Args: { p_action: string; p_user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      admin_coach_clients: {
        Args: { p_coach_id: string }
        Returns: {
          can_invite: boolean
          client_id: string
          last_seen_at: string
          name: string
          user_id: string
        }[]
      }
      admin_create_invite: {
        Args: { p_client_id: string; p_token_hash: string }
        Returns: string
      }
      admin_email_recipients: {
        Args: never
        Returns: {
          business_name: string
          coach_id: string
          email: string
          owner_name: string
          status: string
        }[]
      }
      admin_list_coaches: {
        Args: never
        Returns: {
          business_name: string
          cancel_at_period_end: boolean
          client_count: number
          coach_id: string
          created_at: string
          current_period_end: string
          last_seen_at: string
          mrr_egp: number
          owner_name: string
          phone: string
          price_egp_monthly: number
          status: string
          status_changed_at: string
          suspended_at: string
          tier_id: string
          tier_key: string
          trial_ends_at: string
        }[]
      }
      admin_list_users: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string
          role: Database["public"]["Enums"]["user_role"]
          suspended_at: string
        }[]
      }
      admin_log_user_action: {
        Args: {
          p_action: string
          p_details?: Json
          p_target: string
          p_target_email?: string
          p_target_name?: string
        }
        Returns: undefined
      }
      admin_metrics: { Args: never; Returns: Json }
      admin_online_summary: { Args: never; Returns: Json }
      admin_promote_exercise: { Args: { p_id: string }; Returns: undefined }
      admin_promote_food: { Args: { p_id: string }; Returns: undefined }
      admin_resolve_subscription_request: {
        Args: { p_approve: boolean; p_request_id: string; p_response?: string }
        Returns: undefined
      }
      admin_set_role: {
        Args: {
          p_role: Database["public"]["Enums"]["user_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      admin_set_suspended: {
        Args: { p_suspended: boolean; p_user_id: string }
        Returns: undefined
      }
      admin_update_subscription: {
        Args: {
          p_cancel_at_period_end?: boolean
          p_coach_id: string
          p_period_end?: string
          p_status?: string
          p_tier_id?: string
        }
        Returns: undefined
      }
      admin_update_user_profile: {
        Args: { p_full_name: string; p_phone: string; p_user_id: string }
        Returns: undefined
      }
      begin_impersonation: { Args: { p_coach_id: string }; Returns: undefined }
      get_invite_info: { Args: { p_token: string }; Returns: Json }
      get_my_branding: { Args: never; Returns: Json }
      get_portal_branding: { Args: { p_slug: string }; Returns: Json }
      issue_invoice: {
        Args: { p_invoice_id: string }
        Returns: {
          client_id: string
          coach_id: string
          created_at: string
          currency: string
          due_date: string | null
          id: string
          invoice_number: string | null
          issue_date: string | null
          notes: string | null
          paid_at: string | null
          snapshot: Json | null
          status: string
          subtotal: number
          tax: number
          tax_rate: number
          total: number
          transaction_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      library_exercise_facets: {
        Args: { p_equipment?: string; p_query?: string; p_source?: string }
        Returns: {
          grp: string
          n: number
        }[]
      }
      library_food_facets: {
        Args: { p_query?: string; p_source?: string }
        Returns: {
          grp: string
          n: number
        }[]
      }
      link_existing_client: { Args: { p_email: string }; Returns: string }
      list_online_users: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string }
        Returns: {
          avatar_url: string
          coach_id: string
          coach_name: string
          last_seen_at: string
          name: string
          online: boolean
          online_count: number
          role: Database["public"]["Enums"]["user_role"]
          total_count: number
          user_id: string
        }[]
      }
      mark_checkin_adjustment_applied: {
        Args: { p_checkin_id: string }
        Returns: {
          adherence: number | null
          adjustment_applied_at: string | null
          adjustments: Json | null
          checkin_date: string
          client_id: string
          coach_id: string
          coach_reply: string | null
          coach_seen_at: string | null
          created_at: string
          decision: string | null
          energy: number | null
          id: string
          mood: number | null
          notes: string | null
          relationship_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sleep_hours: number | null
          weight: number | null
        }
        SetofOptions: {
          from: "*"
          to: "checkins"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_checkin_seen: {
        Args: { p_checkin_id: string }
        Returns: {
          adherence: number | null
          adjustment_applied_at: string | null
          adjustments: Json | null
          checkin_date: string
          client_id: string
          coach_id: string
          coach_reply: string | null
          coach_seen_at: string | null
          created_at: string
          decision: string | null
          energy: number | null
          id: string
          mood: number | null
          notes: string | null
          relationship_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sleep_hours: number | null
          weight: number | null
        }
        SetofOptions: {
          from: "*"
          to: "checkins"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_decision_seen: {
        Args: { p_decision_id: string }
        Returns: {
          adjustments: Json
          affected_item_ids: string[]
          applied_at: string | null
          checkin_id: string | null
          client_id: string
          client_note: string | null
          client_seen_at: string | null
          coach_id: string
          created_at: string
          decided_by: string | null
          decision: string
          evaluated_at: string | null
          evidence: Json
          id: string
          outcome_evidence: Json | null
          outcome_status: string
          program_id: string | null
          reason_key: string
          revision_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "coaching_decisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_form_submission_reviewed: {
        Args: { p_submission_id: string }
        Returns: {
          answers: Json
          assignment_id: string
          client_id: string
          coach_id: string
          id: string
          relationship_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          submitted_at: string
          template_version_id: string
        }
        SetofOptions: {
          from: "*"
          to: "form_submissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_invoice_payment: {
        Args: {
          p_invoice_id: string
          p_paid_on?: string
          p_payment_method_id: string
          p_proof_path?: string
        }
        Returns: {
          client_id: string
          coach_id: string
          created_at: string
          currency: string
          due_date: string | null
          id: string
          invoice_number: string | null
          issue_date: string | null
          notes: string | null
          paid_at: string | null
          snapshot: Json | null
          status: string
          subtotal: number
          tax: number
          tax_rate: number
          total: number
          transaction_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_payment: {
        Args: {
          p_amount_egp: number
          p_coach_id: string
          p_method: string
          p_period_end: string
          p_period_start: string
          p_provider?: string
          p_reference?: string
        }
        Returns: string
      }
      respond_to_coach_invite: {
        Args: {
          p_accept: boolean
          p_relationship_id: string
          p_share_history?: boolean
        }
        Returns: undefined
      }
      review_checkin: {
        Args: {
          p_adjustments?: Json
          p_checkin_id: string
          p_coach_reply?: string
          p_decision: string
        }
        Returns: {
          adherence: number | null
          adjustment_applied_at: string | null
          adjustments: Json | null
          checkin_date: string
          client_id: string
          coach_id: string
          coach_reply: string | null
          coach_seen_at: string | null
          created_at: string
          decision: string | null
          energy: number | null
          id: string
          mood: number | null
          notes: string | null
          relationship_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sleep_hours: number | null
          weight: number | null
        }
        SetofOptions: {
          from: "*"
          to: "checkins"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_my_subscription_cancel: {
        Args: { p_cancel: boolean }
        Returns: undefined
      }
      snapshot_mrr: { Args: never; Returns: undefined }
      touch_last_seen: { Args: never; Returns: undefined }
    }
    Enums: {
      client_status: "invited" | "active" | "archived"
      coaching_relationship_status: "pending" | "active" | "ended"
      user_role: "admin" | "coach" | "client"
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
      client_status: ["invited", "active", "archived"],
      coaching_relationship_status: ["pending", "active", "ended"],
      user_role: ["admin", "coach", "client"],
    },
  },
} as const
