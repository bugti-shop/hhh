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
      onboarding_responses: {
        Row: {
          created_at: string
          device_id: string | null
          devices: Json | null
          frustration: string | null
          goals: Json | null
          id: string
          journey_selected: string | null
          language: string | null
          note_created: boolean | null
          notes_folders_count: number | null
          offline_preference: string | null
          previous_app: string | null
          sketch_created: boolean | null
          slowdown_reason: string | null
          source: string | null
          task_view_preference: string | null
          tasks_created_count: number | null
          tasks_folders_count: number | null
          unfinished_reason: string | null
          user_email: string | null
          user_name: string | null
          why_apps_fail: string | null
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          devices?: Json | null
          frustration?: string | null
          goals?: Json | null
          id?: string
          journey_selected?: string | null
          language?: string | null
          note_created?: boolean | null
          notes_folders_count?: number | null
          offline_preference?: string | null
          previous_app?: string | null
          sketch_created?: boolean | null
          slowdown_reason?: string | null
          source?: string | null
          task_view_preference?: string | null
          tasks_created_count?: number | null
          tasks_folders_count?: number | null
          unfinished_reason?: string | null
          user_email?: string | null
          user_name?: string | null
          why_apps_fail?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string | null
          devices?: Json | null
          frustration?: string | null
          goals?: Json | null
          id?: string
          journey_selected?: string | null
          language?: string | null
          note_created?: boolean | null
          notes_folders_count?: number | null
          offline_preference?: string | null
          previous_app?: string | null
          sketch_created?: boolean | null
          slowdown_reason?: string | null
          source?: string | null
          task_view_preference?: string | null
          tasks_created_count?: number | null
          tasks_folders_count?: number | null
          unfinished_reason?: string | null
          user_email?: string | null
          user_name?: string | null
          why_apps_fail?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          is_trialing: boolean
          plan_type: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string
          user_email: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          is_trialing?: boolean
          plan_type?: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string
          user_email: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          is_trialing?: boolean
          plan_type?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string
          user_email?: string
        }
        Relationships: []
      }
      user_daily_ai_usage: {
        Row: {
          count: number
          created_at: string
          feature: string
          id: string
          identifier: string
          identifier_type: string
          updated_at: string
          usage_date: string
        }
        Insert: {
          count?: number
          created_at?: string
          feature: string
          id?: string
          identifier: string
          identifier_type: string
          updated_at?: string
          usage_date: string
        }
        Update: {
          count?: number
          created_at?: string
          feature?: string
          id?: string
          identifier?: string
          identifier_type?: string
          updated_at?: string
          usage_date?: string
        }
        Relationships: []
      }
      user_entitlements: {
        Row: {
          app_user_id: string
          created_at: string
          expires_at: string | null
          grace_period_expires_at: string | null
          id: string
          in_billing_retry: boolean
          is_active: boolean
          last_event_at: string
          last_event_type: string | null
          product_id: string | null
          store: string | null
          updated_at: string
        }
        Insert: {
          app_user_id: string
          created_at?: string
          expires_at?: string | null
          grace_period_expires_at?: string | null
          id?: string
          in_billing_retry?: boolean
          is_active?: boolean
          last_event_at?: string
          last_event_type?: string | null
          product_id?: string | null
          store?: string | null
          updated_at?: string
        }
        Update: {
          app_user_id?: string
          created_at?: string
          expires_at?: string | null
          grace_period_expires_at?: string | null
          id?: string
          in_billing_retry?: boolean
          is_active?: boolean
          last_event_at?: string
          last_event_type?: string | null
          product_id?: string | null
          store?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_lifetime_counters: {
        Row: {
          created_at: string
          id: string
          identifier: string
          identifier_type: string
          note_folders_created: number
          notes_created: number
          task_folders_created: number
          task_sections_created: number
          tasks_created: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          identifier: string
          identifier_type: string
          note_folders_created?: number
          notes_created?: number
          task_folders_created?: number
          task_sections_created?: number
          tasks_created?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          identifier?: string
          identifier_type?: string
          note_folders_created?: number
          notes_created?: number
          task_folders_created?: number
          task_sections_created?: number
          tasks_created?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_refresh_tokens: {
        Row: {
          created_at: string
          google_refresh_token: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          google_refresh_token: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          google_refresh_token?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      decrement_ai_usage: {
        Args: {
          p_feature: string
          p_identifier: string
          p_identifier_type: string
          p_usage_date: string
        }
        Returns: undefined
      }
      increment_ai_usage_if_under_limit: {
        Args: {
          p_feature: string
          p_identifier: string
          p_identifier_type: string
          p_limit: number
          p_usage_date: string
        }
        Returns: {
          allowed: boolean
          new_count: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
