export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      conversation_participants: {
        Row: {
          conversation_id: string
          created_at: string
          profile_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          profile_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          participant_high: string
          participant_low: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          participant_high: string
          participant_low: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          participant_high?: string
          participant_low?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_participant_high_fkey"
            columns: ["participant_high"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_participant_low_fkey"
            columns: ["participant_low"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dives: {
        Row: {
          created_at: string
          created_by: string
          description: string
          event_at: string
          id: string
          location: unknown
          location_id: string | null
          location_label_snapshot: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description: string
          event_at: string
          id?: string
          location: unknown
          location_id?: string | null
          location_label_snapshot?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string
          event_at?: string
          id?: string
          location?: unknown
          location_id?: string | null
          location_label_snapshot?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dives_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dives_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "profile_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
          updated_at: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
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
      profile_locations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_public_map_location: boolean
          label: string
          location: unknown
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_public_map_location?: boolean
          label: string
          location: unknown
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_public_map_location?: boolean
          label?: string
          location?: unknown
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_locations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          display_name: string
          email: string
          id: string
          is_first_login: boolean
          location: unknown
          show_location: boolean
          summary: string
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string
          email: string
          id: string
          is_first_login?: boolean
          location?: unknown
          show_location?: boolean
          summary?: string
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          is_first_login?: boolean
          location?: unknown
          show_location?: boolean
          summary?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      clear_own_avatar_path: {
        Args: never
        Returns: {
          avatar_path: string
          updated_at: string
        }[]
      }
      create_profile_location: {
        Args: {
          p_label: string
          p_lat: number
          p_lng: number
          p_share_on_map?: boolean
        }
        Returns: {
          created_at: string
          id: string
          is_active: boolean
          is_public_map_location: boolean
          label: string
          latitude: number
          longitude: number
          updated_at: string
        }[]
      }
      delete_own_dive: {
        Args: {
          p_dive_id: string
        }
        Returns: {
          deleted_id: string
        }[]
      }
      delete_own_location: {
        Args: never
        Returns: {
          show_location: boolean
          updated_at: string
          user_id: string
        }[]
      }
      delete_profile_location: {
        Args: { p_id: string }
        Returns: {
          deleted_id: string
          was_public: boolean
        }[]
      }
      dives_in_view: {
        Args: {
          max_lat: number
          max_long: number
          min_lat: number
          min_long: number
        }
        Returns: {
          creator_avatar_path: string
          creator_display_name: string
          creator_id: string
          creator_summary: string
          description: string
          event_at: string
          id: string
          is_own: boolean
          latitude: number
          location_id: string
          location_label_snapshot: string
          longitude: number
          title: string
        }[]
      }
      get_conversations_with_latest_message: {
        Args: never
        Returns: {
          conversation_id: string
          latest_message_body: string
          latest_message_created_at: string
          latest_message_id: string
          latest_message_sender_id: string
          opponent_avatar_path: string
          opponent_display_name: string
          opponent_id: string
          opponent_summary: string
          updated_at: string
        }[]
      }
      get_messages_by_conversation_id: {
        Args: {
          p_before_message_created_at?: string
          p_conversation_id: string
          p_page_size?: number
        }
        Returns: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_avatar_path: string
          sender_display_name: string
          sender_id: string
          updated_at: string
        }[]
      }
      get_own_dive: {
        Args: never
        Returns: {
          created_at: string
          created_by: string
          description: string
          event_at: string
          id: string
          latitude: number
          location_id: string
          location_label_snapshot: string
          longitude: number
          title: string
          updated_at: string
        }[]
      }
      list_own_dives: {
        Args: never
        Returns: {
          created_at: string
          created_by: string
          description: string
          event_at: string
          id: string
          latitude: number
          location_id: string
          location_label_snapshot: string
          longitude: number
          title: string
          updated_at: string
        }[]
      }
      is_conversation_participant: {
        Args: { p_conversation_id: string; p_profile_id: string }
        Returns: boolean
      }
      is_current_user_conversation_participant: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      list_own_profile_locations: {
        Args: never
        Returns: {
          created_at: string
          id: string
          is_active: boolean
          is_public_map_location: boolean
          label: string
          latitude: number
          longitude: number
          updated_at: string
        }[]
      }
      mirror_public_profile_location: {
        Args: { p_location: unknown; p_owner_id: string }
        Returns: undefined
      }
      send_message: {
        Args: { p_body: string; p_conversation_id: string }
        Returns: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_avatar_path: string
          sender_display_name: string
          sender_id: string
          updated_at: string
        }[]
      }
      share_profile_location_on_map: {
        Args: { p_id: string }
        Returns: {
          created_at: string
          id: string
          is_active: boolean
          is_public_map_location: boolean
          label: string
          latitude: number
          longitude: number
          updated_at: string
        }[]
      }
      unshare_profile_location_from_map: { Args: never; Returns: undefined }
      update_own_avatar_path: {
        Args: { p_path: string }
        Returns: {
          avatar_path: string
          updated_at: string
        }[]
      }
      update_own_location: {
        Args: { p_lat: number; p_lng: number }
        Returns: {
          latitude: number
          longitude: number
          show_location: boolean
          updated_at: string
          user_id: string
        }[]
      }
      update_profile_location: {
        Args: { p_id: string; p_label: string; p_lat: number; p_lng: number }
        Returns: {
          created_at: string
          id: string
          is_active: boolean
          is_public_map_location: boolean
          label: string
          latitude: number
          longitude: number
          updated_at: string
        }[]
      }
      upsert_conversation: {
        Args: { p_other_user_id: string }
        Returns: {
          conversation_id: string
          opponent_avatar_path: string
          opponent_display_name: string
          opponent_id: string
          opponent_summary: string
        }[]
      }
      upsert_own_dive: {
        Args: {
          p_description: string
          p_event_at: string
          p_lat: number
          p_lng: number
          p_title?: string
          p_dive_id?: string
        }
        Returns: {
          created_at: string
          created_by: string
          description: string
          event_at: string
          id: string
          latitude: number
          longitude: number
          title: string
          updated_at: string
        }[]
      }
      upsert_own_dive_from_location: {
        Args: {
          p_description: string
          p_event_at: string
          p_location_id: string
          p_title?: string
          p_dive_id?: string
        }
        Returns: {
          created_at: string
          created_by: string
          description: string
          event_at: string
          id: string
          latitude: number
          location_id: string
          location_label_snapshot: string
          longitude: number
          title: string
          updated_at: string
        }[]
      }
      users_in_view: {
        Args: {
          max_lat: number
          max_long: number
          min_lat: number
          min_long: number
        }
        Returns: {
          avatar_path: string
          display_name: string
          is_self: boolean
          latitude: number
          longitude: number
          summary: string
          user_id: string
        }[]
      }
      validate_profile_location_input: {
        Args: { p_label: string; p_lat: number; p_lng: number }
        Returns: {
          label: string
          location: unknown
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
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
