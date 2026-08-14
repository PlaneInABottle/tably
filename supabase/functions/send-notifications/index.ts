import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2"

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type NotificationEvent = {
  id: string
  recipient_id: string
  table_id: string | null
  type: string
  title: string
  body: string
  data: Record<string, unknown>
}

type PushToken = {
  profile_id: string
  token: string
  platform: string
}

type ExpoTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; details?: { error?: string } }

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Notifications are not configured." }, 500)

  if (req.headers.get("Authorization") !== `Bearer ${serviceRoleKey}`) {
    return json({ error: "Service authorization required." }, 401)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const body = await req.json().catch(() => ({}))
  const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 100)

  const { data: events, error: eventsError } = await admin.rpc("claim_notification_events", {
    p_limit: limit,
  })

  if (eventsError) return json({ error: eventsError.message }, 500)

  const dueEvents = (events ?? []) as NotificationEvent[]
  if (dueEvents.length === 0) return json({ ok: true, sent: 0, skipped: 0, failed: 0 })

  const recipientIds = [...new Set(dueEvents.map((event) => event.recipient_id))]
  const { data: tokens, error: tokensError } = await admin
    .from("push_tokens")
    .select("profile_id, token, platform")
    .in("profile_id", recipientIds)

  if (tokensError) return json({ error: tokensError.message }, 500)

  const tokensByRecipient = new Map<string, PushToken[]>()
  for (const token of (tokens ?? []) as PushToken[]) {
    const current = tokensByRecipient.get(token.profile_id) ?? []
    current.push(token)
    tokensByRecipient.set(token.profile_id, current)
  }

  const skippedIds: string[] = []
  const messages: Array<Record<string, unknown> & { eventId: string; to: string }> = []

  for (const event of dueEvents) {
    const recipientTokens = tokensByRecipient.get(event.recipient_id) ?? []
    if (recipientTokens.length === 0) {
      skippedIds.push(event.id)
      continue
    }

    for (const token of recipientTokens) {
      messages.push({
        eventId: event.id,
        to: token.token,
        sound: "default",
        title: event.title,
        body: event.body,
        channelId: event.type === "table_message" ? "messages" : "momentum",
        data: {
          ...event.data,
          tableId: event.table_id,
          type: event.type,
        },
      })
    }
  }

  if (skippedIds.length > 0) {
    const { error } = await admin.rpc("mark_notification_events", {
      p_event_ids: skippedIds,
      p_status: "skipped",
      p_error: "No push token for recipient.",
    })
    if (error) return json({ error: error.message }, 500)
  }

  const outcomes = new Map<string, { succeeded: boolean; failed: boolean }>()
  const invalidTokens: string[] = []

  for (const messageChunk of chunk(messages, 100)) {
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messageChunk.map(({ eventId: _eventId, ...message }) => message)),
      })

      if (!response.ok) throw new Error(`Expo push returned HTTP ${response.status}`)

      const result = await response.json().catch(() => ({ data: [] }))
      const tickets = (result.data ?? []) as ExpoTicket[]

      messageChunk.forEach((message, index) => {
        const ticket = tickets[index]
        const outcome = outcomes.get(message.eventId) ?? { succeeded: false, failed: false }

        if (ticket?.status === "ok") {
          outcome.succeeded = true
        } else {
          outcome.failed = true
          if (ticket?.details?.error === "DeviceNotRegistered") invalidTokens.push(message.to)
        }
        outcomes.set(message.eventId, outcome)
      })
    } catch {
      for (const message of messageChunk) {
        const outcome = outcomes.get(message.eventId) ?? { succeeded: false, failed: false }
        outcome.failed = true
        outcomes.set(message.eventId, outcome)
      }
    }
  }

  const sentIds: string[] = []
  const failedIds: string[] = []
  for (const event of dueEvents) {
    if (skippedIds.includes(event.id)) continue
    const outcome = outcomes.get(event.id)
    if (outcome?.succeeded) sentIds.push(event.id)
    else failedIds.push(event.id)
  }

  if (sentIds.length > 0) {
    const { error } = await admin.rpc("mark_notification_events", {
      p_event_ids: sentIds,
      p_status: "sent",
      p_error: null,
    })
    if (error) return json({ error: error.message }, 500)
  }

  if (failedIds.length > 0) {
    const { error } = await admin.rpc("mark_notification_events", {
      p_event_ids: failedIds,
      p_status: "failed",
      p_error: "Expo push send failed.",
    })
    if (error) return json({ error: error.message }, 500)
  }

  if (invalidTokens.length > 0) {
    await admin.from("push_tokens").delete().in("token", invalidTokens)
  }

  return json({
    ok: true,
    sent: sentIds.length,
    skipped: skippedIds.length,
    failed: failedIds.length,
  })
})
