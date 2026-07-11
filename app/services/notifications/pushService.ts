import { Platform } from "react-native"
import Constants from "expo-constants"

import { navigate } from "@/navigators/navigationUtilities"
import { supabase } from "@/services/supabase/client"
import type { ServiceResult } from "@/services/tables/types"

export type NotificationPreferences = {
  seatHeldIntro: boolean
  seatConfirmDue: boolean
  tableConfirmed: boolean
  waitlistPromoted: boolean
  tableMessage: boolean
  tableStartingSoon: boolean
}

type PreferencesRow = {
  seat_held_intro: boolean
  seat_confirm_due: boolean
  table_confirmed: boolean
  waitlist_promoted: boolean
  table_message: boolean
  table_starting_soon: boolean
}

type AnySupabase = typeof supabase & {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>
}

const db = supabase as AnySupabase

type NativeNotifications = {
  Device: typeof import("expo-device")
  Notifications: typeof import("expo-notifications")
}

let nativeNotifications: NativeNotifications | null | undefined

async function getNativeNotifications(): Promise<NativeNotifications | null> {
  if (nativeNotifications !== undefined) return nativeNotifications

  try {
    const Device = require("expo-device") as typeof import("expo-device")
    const Notifications = require("expo-notifications") as typeof import("expo-notifications")
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: true,
      }),
    })
    nativeNotifications = { Device, Notifications }
  } catch {
    nativeNotifications = null
  }

  return nativeNotifications
}

function normalizeError(message?: string): string {
  if (!message) return "Notification request failed. Please try again."
  if (message.includes("Authentication required")) return "Please sign in to use notifications."
  if (message.includes("Invalid push token")) return "Notification token was invalid."
  if (message.includes("Project ID not found")) return "Notification project is not configured."
  if (message.includes("permission")) return "Notification permission was not granted."
  return "Notification request failed. Please try again."
}

function normalizePreferences(row: PreferencesRow): NotificationPreferences {
  return {
    seatHeldIntro: row.seat_held_intro,
    seatConfirmDue: row.seat_confirm_due,
    tableConfirmed: row.table_confirmed,
    waitlistPromoted: row.waitlist_promoted,
    tableMessage: row.table_message,
    tableStartingSoon: row.table_starting_soon,
  }
}

async function setupAndroidChannels() {
  if (Platform.OS !== "android") return
  const native = await getNativeNotifications()
  if (!native) return

  await native.Notifications.setNotificationChannelAsync("momentum", {
    name: "Table momentum",
    importance: native.Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  })

  await native.Notifications.setNotificationChannelAsync("messages", {
    name: "Messages",
    importance: native.Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  })
}

function getProjectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
}

export async function registerPushToken(options?: {
  requestPermission?: boolean
}): Promise<ServiceResult<{ token: string | null }>> {
  try {
    await setupAndroidChannels()
    const native = await getNativeNotifications()

    if (!native) return { ok: true, data: { token: null } }

    const permission = await native.Notifications.getPermissionsAsync()
    const finalPermission =
      permission.status === "granted"
        ? permission
        : options?.requestPermission
          ? await native.Notifications.requestPermissionsAsync()
          : permission

    if (finalPermission.status !== "granted") return { ok: true, data: { token: null } }

    const projectId = getProjectId()
    if (!projectId) return { ok: false, error: "Notification project is not configured." }

    const token = (await native.Notifications.getExpoPushTokenAsync({ projectId })).data
    const { error } = await db.rpc("upsert_push_token", {
      p_token: token,
      p_platform: Platform.OS,
      p_device_id: Constants.sessionId ?? undefined,
    })

    if (error) return { ok: false, error: normalizeError(error.message) }
    return { ok: true, data: { token } }
  } catch (error) {
    const message = error instanceof Error ? error.message : undefined
    return { ok: false, error: normalizeError(message) }
  }
}

export async function unregisterPushToken(token: string): Promise<ServiceResult> {
  const { error } = await db.rpc("delete_push_token", { p_token: token })
  if (error) return { ok: false, error: normalizeError(error.message) }
  return { ok: true, data: undefined }
}

export async function getNotificationPreferences(): Promise<
  ServiceResult<NotificationPreferences>
> {
  const { data, error } = await db.rpc("get_notification_preferences")
  if (error) return { ok: false, error: normalizeError(error.message) }
  return { ok: true, data: normalizePreferences(data[0] as PreferencesRow) }
}

export async function updateNotificationPreferences(
  preferences: Partial<NotificationPreferences>,
): Promise<ServiceResult<NotificationPreferences>> {
  const { data, error } = await db.rpc("update_notification_preferences", {
    p_seat_held_intro: preferences.seatHeldIntro,
    p_seat_confirm_due: preferences.seatConfirmDue,
    p_table_confirmed: preferences.tableConfirmed,
    p_waitlist_promoted: preferences.waitlistPromoted,
    p_table_message: preferences.tableMessage,
    p_table_starting_soon: preferences.tableStartingSoon,
  })

  if (error) return { ok: false, error: normalizeError(error.message) }
  return { ok: true, data: normalizePreferences(data[0] as PreferencesRow) }
}

function openNotificationData(data: Record<string, unknown>) {
  const tableId = typeof data.tableId === "string" ? data.tableId : null
  if (tableId) navigate("TableDetail", { tableId })
}

export function listenForNotificationResponses(): () => void {
  let remove = () => {}
  void getNativeNotifications().then((native) => {
    if (!native) return
    const responseSubscription = native.Notifications.addNotificationResponseReceivedListener(
      (response) => {
        openNotificationData(response.notification.request.content.data as Record<string, unknown>)
      },
    )
    remove = () => responseSubscription.remove()
  })

  void getNativeNotifications()
    .then((native) => native?.Notifications.getLastNotificationResponseAsync())
    .then((response) => {
      if (response) {
        openNotificationData(response.notification.request.content.data as Record<string, unknown>)
      }
    })

  return () => remove()
}
