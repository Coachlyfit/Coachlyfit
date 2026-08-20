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
      body_metrics: {
        Row: {
          client_id: string
          coach_id: string
          created_at: string
          id: string
          metric: string
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
            foreignKeyName: "body_metrics_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
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
            foreignKeyName: "checkins_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
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
          business_name: string
          created_at: string
          id: string
          onboarding_completed_at: string | null
          slug: string
          training_mode: string | null
        }
        Insert: {
          business_name: string
          created_at?: string
          id: string
          onboarding_completed_at?: string | null
          slug: string
          training_mode?: string | null
        }
        Update: {
          business_name?: string
          created_at?: string
          id?: string
          onboarding_completed_at?: string | null
          slug?: string
          training_mode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coaches_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      diet_plans: {
        Row: {
          client_id: string
          coach_id: string
          created_at: string
          end_date: string | null
          id: string
          name_ar: string
          name_en: string
          start_date: string
        }
        Insert: {
          client_id: string
          coach_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          name_ar: string
          name_en: string
          start_date?: string
        }
        Update: {
          client_id?: string
          coach_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          name_ar?: string
          name_en?: string
          start_date?: string
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
            foreignKeyName: "diet_plans_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          coach_id: string | null
          coach_notes_ar: string | null
          coach_notes_en: string | null
          created_at: string
          cues_ar: string[] | null
          cues_en: string[] | null
          equipment: string | null
          id: string
          image_url: string | null
          instructions_ar: string | null
          instructions_en: string | null
          muscle_group: string | null
          name_ar: string
          name_en: string
          source_exercise_id: string | null
          video_url: string | null
        }
        Insert: {
          coach_id?: string | null
          coach_notes_ar?: string | null
          coach_notes_en?: string | null
          created_at?: string
          cues_ar?: string[] | null
          cues_en?: string[] | null
          equipment?: string | null
          id?: string
          image_url?: string | null
          instructions_ar?: string | null
          instructions_en?: string | null
          muscle_group?: string | null
          name_ar: string
          name_en: string
          source_exercise_id?: string | null
          video_url?: string | null
        }
        Update: {
          coach_id?: string | null
          coach_notes_ar?: string | null
          coach_notes_en?: string | null
          created_at?: string
          cues_ar?: string[] | null
          cues_en?: string[] | null
          equipment?: string | null
          id?: string
          image_url?: string | null
          instructions_ar?: string | null
          instructions_en?: string | null
          muscle_group?: string | null
          name_ar?: string
          name_en?: string
          source_exercise_id?: string | null
          video_url?: string | null
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
          submitted_at: string
          template_version_id: string
        }
        Insert: {
          answers: Json
          assignment_id: string
          client_id: string
          coach_id: string
          id?: string
          submitted_at?: string
          template_version_id: string
        }
        Update: {
          answers?: Json
          assignment_id?: string
          client_id?: string
          coach_id?: string
          id?: string
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
            foreignKeyName: "form_submissions_coach_id_fkey"
            columns: ["coach_id"]
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
          coach_id: string
          created_at: string
          current_version_id: string | null
          id: string
          kind: string
          name_ar: string
          name_en: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          current_version_id?: string | null
          id?: string
          kind: string
          name_ar: string
          name_en: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          current_version_id?: string | null
          id?: string
          kind?: string
          name_ar?: string
          name_en?: string
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
            foreignKeyName: "invites_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_items: {
        Row: {
          client_id: string
          coach_id: string
          food_id: string
          id: string
          meal_id: string
          order_index: number
          quantity: number
          unit: string
        }
        Insert: {
          client_id: string
          coach_id: string
          food_id: string
          id?: string
          meal_id: string
          order_index?: number
          quantity?: number
          unit?: string
        }
        Update: {
          client_id?: string
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
          client_id: string
          coach_id: string
          diet_plan_id: string
          id: string
          label_ar: string | null
          label_en: string | null
          order_index: number
        }
        Insert: {
          client_id: string
          coach_id: string
          diet_plan_id: string
          id?: string
          label_ar?: string | null
          label_en?: string | null
          order_index?: number
        }
        Update: {
          client_id?: string
          coach_id?: string
          diet_plan_id?: string
          id?: string
          label_ar?: string | null
          label_en?: string | null
          order_index?: number
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
            foreignKeyName: "media_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
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
          sender_role: string
        }
        Insert: {
          body: string
          client_id: string
          coach_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_role: string
        }
        Update: {
          body?: string
          client_id?: string
          coach_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
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
            foreignKeyName: "messages_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          locale: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          locale?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          locale?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      program_days: {
        Row: {
          client_id: string | null
          coach_id: string
          day_index: number
          id: string
          label_ar: string | null
          label_en: string | null
          order_index: number
          program_id: string
        }
        Insert: {
          client_id?: string | null
          coach_id: string
          day_index: number
          id?: string
          label_ar?: string | null
          label_en?: string | null
          order_index?: number
          program_id: string
        }
        Update: {
          client_id?: string | null
          coach_id?: string
          day_index?: number
          id?: string
          label_ar?: string | null
          label_en?: string | null
          order_index?: number
          program_id?: string
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
            foreignKeyName: "program_days_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
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
          id: string
          program_item_id: string
          reps: number
          rest_seconds: number | null
          set_index: number
          weight: number | null
        }
        Insert: {
          client_id?: string | null
          coach_id: string
          id?: string
          program_item_id: string
          reps?: number
          rest_seconds?: number | null
          set_index: number
          weight?: number | null
        }
        Update: {
          client_id?: string | null
          coach_id?: string
          id?: string
          program_item_id?: string
          reps?: number
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
          client_id: string | null
          coach_id: string
          exercise_id: string
          id: string
          notes_ar: string | null
          notes_en: string | null
          order_index: number
          program_day_id: string
          progression_rule: string
          reps: string
          rest_seconds: number | null
          sets: number
        }
        Insert: {
          client_id?: string | null
          coach_id: string
          exercise_id: string
          id?: string
          notes_ar?: string | null
          notes_en?: string | null
          order_index?: number
          program_day_id: string
          progression_rule?: string
          reps?: string
          rest_seconds?: number | null
          sets?: number
        }
        Update: {
          client_id?: string | null
          coach_id?: string
          exercise_id?: string
          id?: string
          notes_ar?: string | null
          notes_en?: string | null
          order_index?: number
          program_day_id?: string
          progression_rule?: string
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
        ]
      }
      programs: {
        Row: {
          client_id: string | null
          coach_id: string
          created_at: string
          end_date: string | null
          id: string
          name_ar: string
          name_en: string
          source_template_id: string | null
          start_date: string
        }
        Insert: {
          client_id?: string | null
          coach_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          name_ar: string
          name_en: string
          source_template_id?: string | null
          start_date?: string
        }
        Update: {
          client_id?: string | null
          coach_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          name_ar?: string
          name_en?: string
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
            referencedRelation: "programs"
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
          coach_id: string
          created_at: string
          current_period_end: string | null
          id: string
          status: string
          tier_id: string
          trial_ends_at: string | null
        }
        Insert: {
          coach_id: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          status?: string
          tier_id: string
          trial_ends_at?: string | null
        }
        Update: {
          coach_id?: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          status?: string
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
      workout_sessions: {
        Row: {
          client_id: string
          coach_id: string
          completed_at: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          program_day_id: string
          started_at: string
        }
        Insert: {
          client_id: string
          coach_id: string
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          program_day_id: string
          started_at?: string
        }
        Update: {
          client_id?: string
          coach_id?: string
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          program_day_id?: string
          started_at?: string
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
            foreignKeyName: "workout_sessions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sessions_program_day_id_fkey"
            columns: ["program_day_id"]
            isOneToOne: false
            referencedRelation: "program_days"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_set_logs: {
        Row: {
          client_id: string
          coach_id: string
          completed_at: string
          id: string
          program_item_id: string
          reps: number | null
          session_id: string
          set_index: number
          weight: number | null
        }
        Insert: {
          client_id: string
          coach_id: string
          completed_at?: string
          id?: string
          program_item_id: string
          reps?: number | null
          session_id: string
          set_index: number
          weight?: number | null
        }
        Update: {
          client_id?: string
          coach_id?: string
          completed_at?: string
          id?: string
          program_item_id?: string
          reps?: number | null
          session_id?: string
          set_index?: number
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
            foreignKeyName: "workout_set_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      exercises_visible: {
        Row: {
          coach_id: string | null
          coach_notes_ar: string | null
          coach_notes_en: string | null
          created_at: string | null
          cues_ar: string[] | null
          cues_en: string[] | null
          equipment: string | null
          id: string | null
          image_url: string | null
          instructions_ar: string | null
          instructions_en: string | null
          muscle_group: string | null
          my_clone_id: string | null
          name_ar: string | null
          name_en: string | null
          source_exercise_id: string | null
          source_name_ar: string | null
          source_name_en: string | null
          video_url: string | null
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
      admin_list_coaches: {
        Args: never
        Returns: {
          business_name: string
          client_count: number
          coach_id: string
          created_at: string
          current_period_end: string
          mrr_egp: number
          phone: string
          status: string
          tier_key: string
          trial_ends_at: string
        }[]
      }
      admin_metrics: { Args: never; Returns: Json }
      admin_promote_exercise: { Args: { p_id: string }; Returns: undefined }
      admin_promote_food: { Args: { p_id: string }; Returns: undefined }
      begin_impersonation: { Args: { p_coach_id: string }; Returns: undefined }
      get_invite_info: { Args: { p_token: string }; Returns: Json }
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
    }
    Enums: {
      client_status: "invited" | "active" | "archived"
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
      client_status: ["invited", "active", "archived"],
      user_role: ["admin", "coach", "client"],
    },
  },
} as const
