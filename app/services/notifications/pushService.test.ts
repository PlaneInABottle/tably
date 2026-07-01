import { Platform } from "react-native"
import * as Notifications from "expo-notifications"

import { supabase } from "@/services/supabase/client"

import {
  getNotificationPreferences,
  registerPushToken,
  updateNotificationPreferences,
} from "./pushService"

jest.mock("@/services/supabase/client", () => ({
  supabase: {
    rpc: jest.fn(),
  },
}))

jest.mock("expo-device", () => ({
  isDevice: false,
}))

jest.mock("expo-constants", () => ({
  expoConfig: { extra: { eas: { projectId: "project-1" } } },
  easConfig: { projectId: "project-1" },
  sessionId: "session-1",
}))

jest.mock("expo-notifications", () => ({
  AndroidImportance: { HIGH: "high" },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: "ExponentPushToken[test]" }),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
}))

describe("pushService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("registers an Expo push token through RPC", async () => {
    jest
      .mocked(supabase.rpc)
      .mockResolvedValue({ data: [{ token: "ExponentPushToken[test]" }], error: null } as never)

    await expect(registerPushToken()).resolves.toEqual({
      ok: true,
      data: { token: "ExponentPushToken[test]" },
    })

    expect(supabase.rpc).toHaveBeenCalledWith("upsert_push_token", {
      p_token: "ExponentPushToken[test]",
      p_platform: Platform.OS,
      p_device_id: "session-1",
    })
  })

  it("returns a normalized error when Expo token registration rejects", async () => {
    jest
      .mocked(Notifications.getExpoPushTokenAsync)
      .mockRejectedValue(new Error("Network request failed"))

    await expect(registerPushToken()).resolves.toEqual({
      ok: false,
      error: "Notification request failed. Please try again.",
    })

    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it("normalizes notification preferences from RPC rows", async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: [
        {
          seat_held_intro: true,
          seat_confirm_due: true,
          table_confirmed: true,
          waitlist_promoted: false,
          table_message: true,
          table_starting_soon: false,
        },
      ],
      error: null,
    } as never)

    await expect(getNotificationPreferences()).resolves.toEqual({
      ok: true,
      data: {
        seatHeldIntro: true,
        seatConfirmDue: true,
        tableConfirmed: true,
        waitlistPromoted: false,
        tableMessage: true,
        tableStartingSoon: false,
      },
    })
  })

  it("updates only provided preference fields", async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: [
        {
          seat_held_intro: true,
          seat_confirm_due: true,
          table_confirmed: true,
          waitlist_promoted: true,
          table_message: false,
          table_starting_soon: true,
        },
      ],
      error: null,
    } as never)

    await expect(updateNotificationPreferences({ tableMessage: false })).resolves.toEqual({
      ok: true,
      data: {
        seatHeldIntro: true,
        seatConfirmDue: true,
        tableConfirmed: true,
        waitlistPromoted: true,
        tableMessage: false,
        tableStartingSoon: true,
      },
    })

    expect(supabase.rpc).toHaveBeenCalledWith("update_notification_preferences", {
      p_seat_held_intro: undefined,
      p_seat_confirm_due: undefined,
      p_table_confirmed: undefined,
      p_waitlist_promoted: undefined,
      p_table_message: false,
      p_table_starting_soon: undefined,
    })
  })
})
