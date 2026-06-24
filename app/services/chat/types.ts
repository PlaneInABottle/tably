export const CHAT_MESSAGE_MAX_LENGTH = 1000

export type ChatParticipant = {
  id: string
  displayName: string
  summary: string
  avatarPath: string | null
}

export type ConversationSummary = {
  id: string
  opponent: ChatParticipant
  latestMessage: {
    id: string
    body: string
    createdAt: string
    senderId: string
  } | null
  updatedAt: string
}

export type ChatMessage = {
  id: string
  conversationId: string
  senderId: string
  senderDisplayName: string
  senderAvatarPath: string | null
  body: string
  createdAt: string
  updatedAt: string
}

export type SendMessageInput = {
  conversationId: string
  body: string
}

export type UpsertConversationResult = {
  conversationId: string
  opponent: ChatParticipant
}

export type ServiceResult<T = void> = { ok: true; data: T } | { ok: false; error: string }
