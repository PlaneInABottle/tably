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

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const body = await req.json().catch(() => ({}))
  const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 100)

  const { data: events, error: eventsError } = await admin
    .from("notification_events")
    .select("id, recipient_id, table_id, type, title, body, data")
    .eq("status", "queued")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(limit)

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
    await admin
      .from("notification_events")
      .update({ status: "skipped", error: "No push token for recipient." })
      .in("id", skippedIds)
  }

  let sent = 0
  let failed = 0
  const sentIds = new Set<string>()
  const failedIds = new Set<string>()
  const invalidTokens: string[] = []

  for (const messageChunk of chunk(messages, 100)) {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messageChunk.map(({ eventId: _eventId, ...message }) => message)),
    })

    const result = await response.json().catch(() => ({ data: [] }))
    const tickets = (result.data ?? []) as ExpoTicket[]

    tickets.forEach((ticket, index) => {
      const eventId = messageChunk[index]?.eventId
      const token = messageChunk[index]?.to
      if (!eventId) return

      if (ticket.status === "ok") {
        sent += 1
        sentIds.add(eventId)
      } else {
        failed += 1
        failedIds.add(eventId)
        if (ticket.details?.error === "DeviceNotRegistered" && token) invalidTokens.push(token)
      }
    })
  }

  if (sentIds.size > 0) {
    await admin
      .from("notification_events")
      .update({ status: "sent", sent_at: new Date().toISOString(), error: null })
      .in("id", [...sentIds])
  }

  if (failedIds.size > 0) {
    await admin
      .from("notification_events")
      .update({ status: "failed", error: "Expo push send failed." })
      .in("id", [...failedIds])
  }

  if (invalidTokens.length > 0) {
    await admin.from("push_tokens").delete().in("token", invalidTokens)
  }

  return json({
    ok: true,
    sent,
    skipped: skippedIds.length,
    failed,
  })
})
