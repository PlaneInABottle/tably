import { supabase } from "@/services/supabase/client"

import { getSocialTableDetail, subscribeToTableMessages } from "./tableService"

jest.mock("@/services/supabase/client", () => ({
  supabase: {
    rpc: jest.fn(),
    channel: jest.fn(),
    removeChannel: jest.fn(),
  },
}))

describe("tableService", () => {
  beforeEach(() => jest.clearAllMocks())

  it("normalizes a removed or missing table through the existing fatal notice path", async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never)

    await expect(getSocialTableDetail("table-1")).resolves.toEqual({
      ok: false,
      error: "This table is no longer available.",
    })
  })

  it("notifies the screen when a table or message is removed", () => {
    const handlers: Array<{
      event: string
      table: string
      callback: (payload: { new: unknown }) => void
    }> = []
    type MockChannel = { on: jest.Mock; subscribe: jest.Mock }
    const channel = {} as MockChannel
    channel.on = jest.fn(
      (
        event: string,
        config: { table: string; event?: string },
        callback: (payload: { new: unknown }) => void,
      ) => {
        handlers.push({ event: config.event ?? event, table: config.table, callback })
        return channel
      },
    )
    channel.subscribe = jest.fn(() => channel)
    jest.mocked(supabase.channel).mockReturnValue(channel as never)
    const onRemoval = jest.fn()

    const cleanup = subscribeToTableMessages("table-1", jest.fn(), jest.fn(), onRemoval)

    handlers
      .find((handler) => handler.event === "UPDATE" && handler.table === "social_tables")
      ?.callback({
        new: { content_removed_at: "2026-08-14T00:00:00.000Z" },
      })
    handlers
      .find((handler) => handler.event === "UPDATE" && handler.table === "table_messages")
      ?.callback({
        new: { content_removed_at: "2026-08-14T00:00:00.000Z" },
      })

    expect(onRemoval).toHaveBeenCalledTimes(2)
    cleanup()
    expect(supabase.removeChannel).toHaveBeenCalledWith(channel)
  })
})
