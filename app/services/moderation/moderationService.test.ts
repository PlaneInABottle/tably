import { supabase } from "@/services/supabase/client"

import { blockUser, listBlockedUsers, submitReport, unblockUser } from "./moderationService"

jest.mock("@/services/supabase/client", () => ({
  supabase: {
    rpc: jest.fn(),
  },
}))

describe("moderationService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("submits reports through the reporting RPC", async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: [{ id: "report-1", status: "open", created_at: "2026-06-06T10:00:00.000Z" }],
      error: null,
    } as never)

    await expect(
      submitReport({
        targetType: "profile",
        targetId: "user-2",
        reason: "Harassment or abuse",
        details: "Aggressive chat",
      }),
    ).resolves.toEqual({
      ok: true,
      data: {
        id: "report-1",
        status: "open",
        createdAt: "2026-06-06T10:00:00.000Z",
      },
    })

    expect(supabase.rpc).toHaveBeenCalledWith("submit_report", {
      p_target_type: "profile",
      p_target_id: "user-2",
      p_reason: "Harassment or abuse",
      p_details: "Aggressive chat",
    })
  })

  it("blocks and unblocks a diver through RPCs", async () => {
    jest
      .mocked(supabase.rpc)
      .mockResolvedValueOnce({
        data: [{ blocked_id: "user-2", created_at: "2026-06-06T10:00:00.000Z" }],
        error: null,
      } as never)
      .mockResolvedValueOnce({ data: [{ blocked_id: "user-2" }], error: null } as never)

    await expect(blockUser("user-2", "Unsafe messages")).resolves.toEqual({
      ok: true,
      data: { blockedId: "user-2", createdAt: "2026-06-06T10:00:00.000Z" },
    })
    await expect(unblockUser("user-2")).resolves.toEqual({
      ok: true,
      data: { blockedId: "user-2" },
    })

    expect(supabase.rpc).toHaveBeenNthCalledWith(1, "block_user", {
      p_blocked_id: "user-2",
      p_reason: "Unsafe messages",
    })
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, "unblock_user", {
      p_blocked_id: "user-2",
    })
  })

  it("lists blocked divers with client-friendly field names", async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: [
        {
          blocked_id: "user-2",
          display_name: "Maya Stone",
          summary: "Rescue diver",
          avatar_path: "user-2/avatar.jpg",
          created_at: "2026-06-06T10:00:00.000Z",
        },
      ],
      error: null,
    } as never)

    await expect(listBlockedUsers()).resolves.toEqual({
      ok: true,
      data: [
        {
          id: "user-2",
          displayName: "Maya Stone",
          summary: "Rescue diver",
          avatarPath: "user-2/avatar.jpg",
          createdAt: "2026-06-06T10:00:00.000Z",
        },
      ],
    })

    expect(supabase.rpc).toHaveBeenCalledWith("list_blocked_users")
  })
})
