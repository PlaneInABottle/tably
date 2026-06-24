import type { ChatMessage } from "./types"

function hasPlaceholderSender(message: ChatMessage): boolean {
  return message.senderDisplayName === "Diver" && message.senderAvatarPath === null
}

export function mergeMessagesById(
  messages: ChatMessage[],
  nextMessage: ChatMessage,
): ChatMessage[] {
  const existingIndex = messages.findIndex((message) => message.id === nextMessage.id)
  if (existingIndex >= 0) {
    const existing = messages[existingIndex]
    if (!hasPlaceholderSender(existing) || hasPlaceholderSender(nextMessage)) return messages

    return messages.map((message, index) => (index === existingIndex ? nextMessage : message))
  }

  return [...messages, nextMessage].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  )
}
