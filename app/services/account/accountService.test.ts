import { supabase } from "@/services/supabase/client"

import { deleteAccount } from "./accountService"

jest.mock("@/services/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
    auth: {
      signOut: jest.fn(),
    },
  },
}))

describe("deleteAccount", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("invokes the account deletion function and clears the local session", async () => {
    jest.mocked(supabase.functions.invoke).mockResolvedValue({ error: null } as never)
    jest.mocked(supabase.auth.signOut).mockResolvedValue({ error: null } as never)

    await expect(deleteAccount()).resolves.toEqual({ ok: true, data: undefined })

    expect(supabase.functions.invoke).toHaveBeenCalledWith("delete-account", { body: {} })
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" })
  })

  it("normalizes authentication failures", async () => {
    jest.mocked(supabase.functions.invoke).mockResolvedValue({
      error: { message: "Authentication required" },
    } as never)

    await expect(deleteAccount()).resolves.toEqual({
      ok: false,
      error: "Please sign in again before deleting.",
    })
    expect(supabase.auth.signOut).not.toHaveBeenCalled()
  })
})
