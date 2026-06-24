import { supabase } from "@/services/supabase/client"

import type {
  ChatMessage,
  ConversationSummary,
  SendMessageInput,
  ServiceResult,
  UpsertConversationResult,
} from "./types"

export { mergeMessagesById } from "./messageUtils"

type ConversationRow = {
  conversation_id: string
  opponent_id: string
  opponent_display_name: string
  opponent_summary: string
  opponent_avatar_path: string | null
  latest_message_id: string | null
  latest_message_body: string | null
  latest_message_created_at: string | null
  latest_message_sender_id: string | null
  updated_at: string
}

type UpsertConversationRow = {
  conversation_id: string
  opponent_id: string
  opponent_display_name: string
  opponent_summary: string
  opponent_avatar_path: string | null
}

type MessageRow = {
  id: string
  conversation_id: string
  sender_id: string
  sender_display_name: string
  sender_avatar_path: string | null
  body: string
  created_at: string
  updated_at: string
}

type RealtimeMessageRow = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
  updated_at: string
}

function normalizeError(message?: string): string {
  if (!message) return "Chat request failed. Please try again."
  if (message.includes("Authentication required")) return "Please sign in to use chat."
  if (message.includes("Terms")) return "Accept the community terms before using chat."
  if (message.includes("cannot message")) return "You cannot message this diver."
  if (message.includes("Content contains")) return "This message cannot be sent."
  if (message.includes("Cannot start a conversation with yourself"))
    return "You cannot message yourself."
  if (message.includes("Other participant")) return "Diver was not found."
  if (message.includes("Conversation not found")) return "Conversation was not found."
  if (message.includes("Message must be")) return "Message must be 1-1000 characters."
  return "Chat request failed. Please try again."
}

function normalizeUpsertConversation(row: UpsertConversationRow): UpsertConversationResult {
  return {
    conversationId: row.conversation_id,
    opponent: {
      id: row.opponent_id,
      displayName: row.opponent_display_name || "Diver",
      summary: row.opponent_summary,
      avatarPath: row.opponent_avatar_path,
    },
  }
}

function normalizeConversation(row: ConversationRow): ConversationSummary {
  return {
    id: row.conversation_id,
    opponent: {
      id: row.opponent_id,
      displayName: row.opponent_display_name || "Diver",
      summary: row.opponent_summary,
      avatarPath: row.opponent_avatar_path,
    },
    latestMessage: row.latest_message_id
      ? {
          id: row.latest_message_id,
          body: row.latest_message_body ?? "",
          createdAt: row.latest_message_created_at ?? row.updated_at,
          senderId: row.latest_message_sender_id ?? "",
        }
      : null,
    updatedAt: row.updated_at,
  }
}

function normalizeMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderDisplayName: row.sender_display_name || "Diver",
    senderAvatarPath: row.sender_avatar_path,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeRealtimeMessage(row: RealtimeMessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderDisplayName: "Diver",
    senderAvatarPath: null,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function upsertConversation(
  otherUserId: string,
): Promise<ServiceResult<UpsertConversationResult>> {
  const { data, error } = await supabase.rpc("upsert_conversation", {
    p_other_user_id: otherUserId,
  })

  if (error) return { ok: false, error: normalizeError(error.message) }
  if (!data?.[0]) return { ok: false, error: "Conversation was not created." }

  return { ok: true, data: normalizeUpsertConversation(data[0]) }
}

export async function getConversationsWithLatestMessage(): Promise<
  ServiceResult<ConversationSummary[]>
> {
  const { data, error } = await supabase.rpc("get_conversations_with_latest_message")

  if (error) return { ok: false, error: normalizeError(error.message) }

  const normalized = (data ?? []).map(normalizeConversation)
  return { ok: true, data: normalized.filter((c) => c.latestMessage !== null) }
}

export async function getMessagesByConversationId(
  conversationId: string,
): Promise<ServiceResult<ChatMessage[]>> {
  const { data, error } = await supabase.rpc("get_messages_by_conversation_id", {
    p_conversation_id: conversationId,
  })

  if (error) return { ok: false, error: normalizeError(error.message) }

  return { ok: true, data: (data ?? []).map(normalizeMessage).reverse() }
}

export async function getMessageByConversationId(
  conversationId: string,
  messageId: string,
): Promise<ServiceResult<ChatMessage>> {
  const result = await getMessagesByConversationId(conversationId)
  if (!result.ok) return result

  const message = result.data.find((item) => item.id === messageId)
  if (!message) return { ok: false, error: "Message was not found." }

  return { ok: true, data: message }
}

export async function sendMessage(input: SendMessageInput): Promise<ServiceResult<ChatMessage>> {
  const { data, error } = await supabase.rpc("send_message", {
    p_conversation_id: input.conversationId,
    p_body: input.body,
  })

  if (error) return { ok: false, error: normalizeError(error.message) }
  if (!data?.[0]) return { ok: false, error: "Message was not sent." }

  return { ok: true, data: normalizeMessage(data[0]) }
}

export function subscribeToConversationMessages(
  conversationId: string,
  onMessage: (message: ChatMessage) => void,
  onError: (message: string) => void,
): () => void {
  const channel = supabase
    .channel(`conversation:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onMessage(normalizeRealtimeMessage(payload.new as RealtimeMessageRow)),
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR") onError("Realtime updates are unavailable.")
    })

  return () => {
    void supabase.removeChannel(channel)
  }
}
