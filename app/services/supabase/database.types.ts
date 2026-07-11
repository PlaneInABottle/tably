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
            isOneToOne: false
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
      moderation_reports: {
        Row: {
          created_at: string
          details: string
          id: string
          reason: string
          reported_user_id: string | null
          reporter_id: string | null
          snapshot: Json
          status: string
          target_id: string
          target_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: string
          id?: string
          reason: string
          reported_user_id?: string | null
          reporter_id?: string | null
          snapshot?: Json
          status?: string
          target_id: string
          target_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: string
          id?: string
          reason?: string
          reported_user_id?: string | null
          reporter_id?: string | null
          snapshot?: Json
          status?: string
          target_id?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_events: {
        Row: {
          body: string
          created_at: string
          data: Json
          dedupe_key: string | null
          error: string | null
          id: string
          processing_started_at: string | null
          recipient_id: string
          scheduled_for: string
          sent_at: string | null
          status: string
          table_id: string | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          data?: Json
          dedupe_key?: string | null
          error?: string | null
          id?: string
          processing_started_at?: string | null
          recipient_id: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          table_id?: string | null
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json
          dedupe_key?: string | null
          error?: string | null
          id?: string
          processing_started_at?: string | null
          recipient_id?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          table_id?: string | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_events_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "social_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          profile_id: string
          seat_confirm_due: boolean
          seat_held_intro: boolean
          table_confirmed: boolean
          table_message: boolean
          table_starting_soon: boolean
          updated_at: string
          waitlist_promoted: boolean
        }
        Insert: {
          profile_id: string
          seat_confirm_due?: boolean
          seat_held_intro?: boolean
          table_confirmed?: boolean
          table_message?: boolean
          table_starting_soon?: boolean
          updated_at?: string
          waitlist_promoted?: boolean
        }
        Update: {
          profile_id?: string
          seat_confirm_due?: boolean
          seat_held_intro?: boolean
          table_confirmed?: boolean
          table_message?: boolean
          table_starting_soon?: boolean
          updated_at?: string
          waitlist_promoted?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
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
          moderation_status: string
          show_location: boolean
          summary: string
          terms_accepted_at: string | null
          terms_version: string | null
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
          moderation_status?: string
          show_location?: boolean
          summary?: string
          terms_accepted_at?: string | null
          terms_version?: string | null
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
          moderation_status?: string
          show_location?: boolean
          summary?: string
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          device_id: string | null
          id: string
          platform: string
          profile_id: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          id?: string
          platform: string
          profile_id: string
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          id?: string
          platform?: string
          profile_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      social_tables: {
        Row: {
          activity: string
          area_label: string
          created_at: string
          created_by: string
          id: string
          intro_prompt: string
          location: unknown
          max_seats: number
          min_seats: number
          note: string
          starts_at: string
          status: string
          title: string
          updated_at: string
          vibe: string
        }
        Insert: {
          activity: string
          area_label: string
          created_at?: string
          created_by: string
          id?: string
          intro_prompt?: string
          location: unknown
          max_seats?: number
          min_seats?: number
          note?: string
          starts_at: string
          status?: string
          title: string
          updated_at?: string
          vibe?: string
        }
        Update: {
          activity?: string
          area_label?: string
          created_at?: string
          created_by?: string
          id?: string
          intro_prompt?: string
          location?: unknown
          max_seats?: number
          min_seats?: number
          note?: string
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
          vibe?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_tables_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      table_members: {
        Row: {
          confirm_due_at: string
          confirmed_at: string | null
          intro_answer: string
          intro_due_at: string
          joined_at: string
          profile_id: string
          status: string
          table_id: string
          updated_at: string
        }
        Insert: {
          confirm_due_at?: string
          confirmed_at?: string | null
          intro_answer?: string
          intro_due_at?: string
          joined_at?: string
          profile_id: string
          status?: string
          table_id: string
          updated_at?: string
        }
        Update: {
          confirm_due_at?: string
          confirmed_at?: string | null
          intro_answer?: string
          intro_due_at?: string
          joined_at?: string
          profile_id?: string
          status?: string
          table_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_members_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "social_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      table_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          sender_id: string
          table_id: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          sender_id: string
          table_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          sender_id?: string
          table_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_messages_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "social_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      table_waitlist: {
        Row: {
          created_at: string
          profile_id: string
          table_id: string
        }
        Insert: {
          created_at?: string
          profile_id: string
          table_id: string
        }
        Update: {
          created_at?: string
          profile_id?: string
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_waitlist_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_waitlist_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "social_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          reason: string | null
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          reason?: string | null
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_current_terms: {
        Args: never
        Returns: {
          terms_accepted_at: string
          terms_version: string
        }[]
      }
      answer_table_intro: {
        Args: { p_answer: string; p_table_id: string }
        Returns: {
          member_status: string
        }[]
      }
      block_user: {
        Args: { p_blocked_id: string; p_reason?: string }
        Returns: {
          blocked_id: string
          created_at: string
        }[]
      }
      can_current_user_read_conversation: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      claim_notification_events: {
        Args: { p_limit?: number }
        Returns: {
          body: string
          data: Json
          id: string
          recipient_id: string
          table_id: string
          title: string
          type: string
        }[]
      }
      clear_own_avatar_path: {
        Args: never
        Returns: {
          avatar_path: string
          updated_at: string
        }[]
      }
      confirm_table_attendance: {
        Args: { p_table_id: string }
        Returns: {
          member_status: string
        }[]
      }
      contains_objectionable_content: {
        Args: { p_text: string }
        Returns: boolean
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
      create_social_table: {
        Args: {
          p_activity: string
          p_area_label: string
          p_intro_prompt?: string
          p_lat: number
          p_lng: number
          p_max_seats?: number
          p_min_seats?: number
          p_note: string
          p_starts_at: string
          p_title: string
          p_vibe: string
        }
        Returns: {
          id: string
        }[]
      }
      delete_own_dive: {
        Args: { p_dive_id: string }
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
      delete_push_token: { Args: { p_token: string }; Returns: undefined }
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
      ensure_notification_preferences: {
        Args: { p_profile_id: string }
        Returns: undefined
      }
      ensure_terms_accepted: { Args: never; Returns: undefined }
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
      get_notification_preferences: {
        Args: never
        Returns: {
          seat_confirm_due: boolean
          seat_held_intro: boolean
          table_confirmed: boolean
          table_message: boolean
          table_starting_soon: boolean
          waitlist_promoted: boolean
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
      get_social_table_detail: {
        Args: { p_table_id: string }
        Returns: {
          activity: string
          area_label: string
          confirm_due_at: string
          confirmed_at: string
          creator_display_name: string
          creator_id: string
          id: string
          intro_due_at: string
          intro_prompt: string
          is_waitlisted: boolean
          joined_at: string
          latitude: number
          longitude: number
          max_seats: number
          min_seats: number
          my_member_status: string
          note: string
          starts_at: string
          status: string
          title: string
          vibe: string
        }[]
      }
      is_blocked_between: {
        Args: { p_first: string; p_second: string }
        Returns: boolean
      }
      is_conversation_participant: {
        Args: { p_conversation_id: string; p_profile_id: string }
        Returns: boolean
      }
      is_current_table_member: {
        Args: { p_table_id: string }
        Returns: boolean
      }
      is_current_user_conversation_participant: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      join_social_table: {
        Args: { p_table_id: string }
        Returns: {
          is_waitlisted: boolean
          member_status: string
        }[]
      }
      leave_social_table: { Args: { p_table_id: string }; Returns: undefined }
      list_blocked_users: {
        Args: never
        Returns: {
          avatar_path: string
          blocked_id: string
          created_at: string
          display_name: string
          summary: string
        }[]
      }
      list_my_active_tables: {
        Args: never
        Returns: {
          activity: string
          area_label: string
          confirm_due_at: string
          id: string
          intro_due_at: string
          latest_message_body: string
          latest_message_created_at: string
          member_status: string
          starts_at: string
          status: string
          title: string
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
      list_social_tables: {
        Args: {
          p_max_lat: number
          p_max_lng: number
          p_min_lat: number
          p_min_lng: number
        }
        Returns: {
          active_count: number
          activity: string
          area_label: string
          confirm_due_at: string
          confirmed_count: number
          creator_avatar_path: string
          creator_display_name: string
          creator_id: string
          id: string
          intro_due_at: string
          is_waitlisted: boolean
          latitude: number
          longitude: number
          max_seats: number
          min_seats: number
          my_member_status: string
          note: string
          starts_at: string
          status: string
          title: string
          vibe: string
          waitlist_count: number
        }[]
      }
      list_table_members: {
        Args: { p_table_id: string }
        Returns: {
          avatar_path: string
          confirmed_at: string
          display_name: string
          intro_answer: string
          profile_id: string
          status: string
          summary: string
        }[]
      }
      list_table_messages: {
        Args: { p_table_id: string }
        Returns: {
          body: string
          created_at: string
          id: string
          sender_avatar_path: string
          sender_display_name: string
          sender_id: string
          table_id: string
          updated_at: string
        }[]
      }
      mark_notification_events: {
        Args: { p_error?: string; p_event_ids: string[]; p_status: string }
        Returns: undefined
      }
      mirror_public_profile_location: {
        Args: { p_location: unknown; p_owner_id: string }
        Returns: undefined
      }
      queue_notification_event: {
        Args: {
          p_body: string
          p_data?: Json
          p_dedupe_key?: string
          p_recipient_id: string
          p_scheduled_for?: string
          p_table_id: string
          p_title: string
          p_type: string
        }
        Returns: undefined
      }
      refresh_table_status: { Args: { p_table_id: string }; Returns: undefined }
      reject_objectionable_text: {
        Args: { p_text: string }
        Returns: undefined
      }
      release_expired_table_seats: {
        Args: { p_table_id?: string }
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
      send_table_message: {
        Args: { p_body: string; p_table_id: string }
        Returns: {
          body: string
          created_at: string
          id: string
          sender_avatar_path: string
          sender_display_name: string
          sender_id: string
          table_id: string
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
      submit_report: {
        Args: {
          p_details?: string
          p_reason: string
          p_target_id: string
          p_target_type: string
        }
        Returns: {
          created_at: string
          id: string
          status: string
        }[]
      }
      unblock_user: {
        Args: { p_blocked_id: string }
        Returns: {
          blocked_id: string
        }[]
      }
      unshare_profile_location_from_map: { Args: never; Returns: undefined }
      update_notification_preferences: {
        Args: {
          p_seat_confirm_due?: boolean
          p_seat_held_intro?: boolean
          p_table_confirmed?: boolean
          p_table_message?: boolean
          p_table_starting_soon?: boolean
          p_waitlist_promoted?: boolean
        }
        Returns: {
          seat_confirm_due: boolean
          seat_held_intro: boolean
          table_confirmed: boolean
          table_message: boolean
          table_starting_soon: boolean
          waitlist_promoted: boolean
        }[]
      }
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
          p_dive_id?: string
          p_event_at: string
          p_lat: number
          p_lng: number
          p_title?: string
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
          p_dive_id?: string
          p_event_at: string
          p_location_id: string
          p_title?: string
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
      upsert_push_token: {
        Args: { p_device_id?: string; p_platform: string; p_token: string }
        Returns: {
          token: string
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
