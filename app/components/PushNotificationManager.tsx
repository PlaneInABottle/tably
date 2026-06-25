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
    void registerPushToken()
  }, [status])

  return null
}
