import { mergeMessagesById } from "./messageUtils"
import type { ChatMessage } from "./types"

function message(id: string, createdAt: string): ChatMessage {
  return {
    id,
    conversationId: "conversation-1",
    senderId: "sender-1",
    senderDisplayName: "Diver",
    senderAvatarPath: null,
    body: id,
    createdAt,
    updatedAt: createdAt,
  }
}

function enrichedMessage(id: string, createdAt: string): ChatMessage {
  return {
    ...message(id, createdAt),
    senderDisplayName: "Lena Cruz",
    senderAvatarPath: "avatars/event.png",
  }
}

describe("mergeMessagesById", () => {
  it("dedupes an existing message id", () => {
    const existing = message("m1", "2026-05-27T10:00:00.000Z")

    expect(mergeMessagesById([existing], existing)).toEqual([existing])
  })

  it("inserts new messages in chronological order", () => {
    const late = message("late", "2026-05-27T10:02:00.000Z")
    const early = message("early", "2026-05-27T10:01:00.000Z")

    expect(mergeMessagesById([late], early).map((item) => item.id)).toEqual(["early", "late"])
  })

  it("replaces placeholder realtime messages with enriched RPC messages", () => {
    const placeholder = message("m1", "2026-05-27T10:00:00.000Z")
    const enriched = enrichedMessage("m1", "2026-05-27T10:00:00.000Z")

    expect(mergeMessagesById([placeholder], enriched)).toEqual([enriched])
  })
})
