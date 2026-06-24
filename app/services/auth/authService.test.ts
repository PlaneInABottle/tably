import {
  PASSWORD_RESET_REDIRECT_URL,
  sendPasswordReset,
  signInWithPassword,
  signUpWithPassword,
} from "./authService"
import { supabase } from "../supabase/client"

jest.mock("../supabase/client", () => ({
  supabase: {
    rpc: jest.fn(),
    auth: {
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      resetPasswordForEmail: jest.fn(),
    },
  },
}))

describe("authService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("uses the app update-password deep link as the reset redirect", async () => {
    jest.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({
      data: {},
      error: null,
    } as never)

    await expect(sendPasswordReset("member@example.com")).resolves.toEqual({
      ok: true,
      data: undefined,
    })

    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith("member@example.com", {
      redirectTo: PASSWORD_RESET_REDIRECT_URL,
    })
    expect(PASSWORD_RESET_REDIRECT_URL).toBe("tably://update-password")
  })

  it("accepts current terms after successful sign in", async () => {
    jest.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { session: { access_token: "token" }, user: { id: "user-1" } },
      error: null,
    } as never)
    jest.mocked(supabase.rpc).mockResolvedValue({ error: null } as never)

    await expect(signInWithPassword("member@example.com", "Password123!")).resolves.toMatchObject({
      ok: true,
    })

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "member@example.com",
      password: "Password123!",
    })
    expect(supabase.rpc).toHaveBeenCalledWith("accept_current_terms")
  })

  it("accepts current terms after successful sign up with a session", async () => {
    jest.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { session: { access_token: "token" }, user: { id: "user-1" } },
      error: null,
    } as never)
    jest.mocked(supabase.rpc).mockResolvedValue({ error: null } as never)

    await expect(
      signUpWithPassword("new.member@example.com", "Password123!", "New Member"),
    ).resolves.toMatchObject({
      ok: true,
    })

    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: "new.member@example.com",
      password: "Password123!",
      options: { data: { display_name: "New Member" } },
    })
    expect(supabase.rpc).toHaveBeenCalledWith("accept_current_terms")
  })
})
