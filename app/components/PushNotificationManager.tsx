import { useEffect } from "react"

import { useAuth } from "@/context/AuthContext"
import {
  listenForNotificationResponses,
  registerPushToken,
} from "@/services/notifications/pushService"

export function PushNotificationManager() {
  const { status } = useAuth()

  useEffect(() => listenForNotificationResponses(), [])

  useEffect(() => {
    if (status !== "signedIn") return
    void registerPushToken().then((result) => {
      if (!result.ok) {
        console.warn("Push registration failed", result.error)
        return
      }
      if (!result.data.token) {
        console.warn("Push token unavailable")
        return
      }
      if (__DEV__) console.log("Push token registered")
    })
  }, [status])

  return null
}
