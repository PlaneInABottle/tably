import { ReactNode } from "react"
import { act, render, waitFor } from "@testing-library/react-native"

import * as authService from "@/services/auth/authService"

import { AuthContextType, AuthProvider, useAuth } from "./AuthContext"

const mockSubscription = { unsubscribe: jest.fn() }

jest.mock("@/services/auth/authService", () => ({
  signInWithPassword: jest.fn(),
  signOut: jest.fn(),
  signUpWithPassword: jest.fn(),
  sendPasswordReset: jest.fn(),
  updatePassword: jest.fn(),
}))

jest.mock("@/services/profiles/profileService", () => ({
  getOwnProfile: jest.fn(async () => ({
    ok: true,
    data: {
      avatar_path: null,
      created_at: "2026-06-05T00:00:00Z",
      display_name: "Test Diver",
      email: "diver@example.com",
      id: "user-1",
      is_first_login: false,
      location: null,
      show_location: true,
      summary: "",
      updated_at: "2026-06-05T00:00:00Z",
    },
  })),
  updateOwnProfile: jest.fn(),
}))

jest.mock("@/services/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: {
          session: {
            user: {
              id: "user-1",
            },
          },
        },
        error: null,
      })),
      onAuthStateChange: jest.fn(() => ({
        data: {
          subscription: mockSubscription,
        },
      })),
    },
  },
}))

jest.mock("@/utils/storage", () => ({
  remove: jest.fn(),
}))

function CaptureAuth({ onValue }: { onValue: (value: AuthContextType) => void }): ReactNode {
  onValue(useAuth())
  return null
}

describe("AuthContext", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("keeps the signed-in session when sign-out fails", async () => {
    let auth: AuthContextType | undefined
    jest.mocked(authService.signOut).mockResolvedValue({
      ok: false,
      error: "Unable to sign out.",
    })

    render(
      <AuthProvider>
        <CaptureAuth onValue={(value) => (auth = value)} />
      </AuthProvider>,
    )

    await waitFor(() => expect(auth?.status).toBe("signedIn"))

    await act(async () => {
      await expect(auth?.signOut()).resolves.toEqual({
        ok: false,
        error: "Unable to sign out.",
      })
    })

    await waitFor(() => {
      expect(auth?.status).toBe("signedIn")
      expect(auth?.authError).toBe("Unable to sign out.")
    })
  })
})
