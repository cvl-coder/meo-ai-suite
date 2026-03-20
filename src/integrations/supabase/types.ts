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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_functions: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          icon: string | null
          id: string
          name: string
          type: Database["public"]["Enums"]["ai_function_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          icon?: string | null
          id?: string
          name: string
          type?: Database["public"]["Enums"]["ai_function_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          icon?: string | null
          id?: string
          name?: string
          type?: Database["public"]["Enums"]["ai_function_type"]
          updated_at?: string
        }
        Relationships: []
      }
      ai_search_configs: {
        Row: {
          ai_api_key: string
          ai_endpoint_url: string
          ai_model: string
          client_fields: Json
          function_id: string
          id: string
          output_language: string
          prompt_template: string
          search_urls: Json
          updated_at: string
        }
        Insert: {
          ai_api_key?: string
          ai_endpoint_url?: string
          ai_model?: string
          client_fields?: Json
          function_id: string
          id?: string
          output_language?: string
          prompt_template?: string
          search_urls?: Json
          updated_at?: string
        }
        Update: {
          ai_api_key?: string
          ai_endpoint_url?: string
          ai_model?: string
          client_fields?: Json
          function_id?: string
          id?: string
          output_language?: string
          prompt_template?: string
          search_urls?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_search_configs_function_id_fkey"
            columns: ["function_id"]
            isOneToOne: false
            referencedRelation: "ai_functions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_search_results: {
        Row: {
          client_data: Json
          config_id: string
          created_at: string
          id: string
          results: Json
          status: string
        }
        Insert: {
          client_data?: Json
          config_id: string
          created_at?: string
          id?: string
          results?: Json
          status?: string
        }
        Update: {
          client_data?: Json
          config_id?: string
          created_at?: string
          id?: string
          results?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_search_results_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "ai_search_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_search_results_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "ai_search_configs_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_test_data: {
        Row: {
          created_at: string
          field_values: Json
          function_id: string
          id: string
          label: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_values?: Json
          function_id: string
          id?: string
          label?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_values?: Json
          function_id?: string
          id?: string
          label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_test_data_function_id_fkey"
            columns: ["function_id"]
            isOneToOne: false
            referencedRelation: "ai_functions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      ai_search_configs_safe: {
        Row: {
          ai_endpoint_url: string | null
          ai_model: string | null
          client_fields: Json | null
          function_id: string | null
          id: string | null
          output_language: string | null
          prompt_template: string | null
          search_urls: Json | null
          updated_at: string | null
        }
        Insert: {
          ai_endpoint_url?: string | null
          ai_model?: string | null
          client_fields?: Json | null
          function_id?: string | null
          id?: string | null
          output_language?: string | null
          prompt_template?: string | null
          search_urls?: Json | null
          updated_at?: string | null
        }
        Update: {
          ai_endpoint_url?: string | null
          ai_model?: string | null
          client_fields?: Json | null
          function_id?: string | null
          id?: string | null
          output_language?: string | null
          prompt_template?: string | null
          search_urls?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_search_configs_function_id_fkey"
            columns: ["function_id"]
            isOneToOne: false
            referencedRelation: "ai_functions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      ai_function_type:
        | "external_search"
        | "summarizer"
        | "classifier"
        | "custom"
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
      ai_function_type: [
        "external_search",
        "summarizer",
        "classifier",
        "custom",
      ],
    },
  },
} as const
