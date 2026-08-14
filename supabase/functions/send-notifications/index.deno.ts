import { classifyNotificationEvents, createNotificationHandler } from "./index.ts"

const event = (id: string, recipient_id: string) => ({
  id,
  recipient_id,
  table_id: "table-1",
  table_message_id: null,
  type: "table_confirmed",
  title: "Title",
  body: "Body",
  data: { type: "table_confirmed" },
})

function fakeDependencies(
  events: ReturnType<typeof event>[],
  tokens: Array<{ profile_id: string; token: string; platform: string }>,
  fetchImpl: typeof fetch,
) {
  const terminalCalls: Array<Record<string, unknown>> = []
  const admin = {
    rpc: async (name: string, args?: Record<string, unknown>) => {
      if (name === "claim_notification_events") return { data: events, error: null }
      if (name === "check_notification_event_sources") {
        return { data: events.map((item) => ({ id: item.id, deliverable: true })), error: null }
      }
      if (name === "mark_notification_events") {
        terminalCalls.push(args ?? {})
        return { data: null, error: null }
      }
      throw new Error(`unexpected rpc: ${name}`)
    },
    from: (table: string) => {
      if (table !== "push_tokens") throw new Error(`unexpected table: ${table}`)
      return {
        select: () => ({ in: async () => ({ data: tokens, error: null }) }),
        delete: () => ({ in: async () => ({ data: null, error: null }) }),
      }
    },
  }
  const handler = createNotificationHandler({
    getEnv: (name) =>
      name === "SUPABASE_URL"
        ? "https://example.invalid"
        : name === "SUPABASE_SERVICE_ROLE_KEY"
          ? "test-key"
          : undefined,
    createAdmin: () => admin as never,
    fetchImpl,
  })
  return { handler, terminalCalls }
}

Deno.test("notification worker rechecks sources and uses the terminal RPC", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url))

  if (!source.includes('"check_notification_event_sources"') || !source.includes("admin.rpc")) {
    throw new Error("source re-check RPC is missing")
  }
  if (!source.includes('"mark_notification_events"') || !source.includes("admin.rpc")) {
    throw new Error("terminal notification RPC is missing")
  }
  if (source.includes('.from("notification_events").update')) {
    throw new Error("worker contains a direct notification terminal update")
  }
  if (!source.includes("tableMessageId")) throw new Error("message identity payload is missing")
})

Deno.test("notification classification counts each skipped event exactly once", () => {
  const events: Array<{ id: string; recipient_id: string }> = [
    { id: "source-removed", recipient_id: "recipient-1" },
    { id: "no-token", recipient_id: "recipient-2" },
    { id: "deliverable", recipient_id: "recipient-3" },
  ]

  const single = classifyNotificationEvents(
    [events[1]] as never,
    new Set([events[1].id]),
    new Map(),
  )
  if (single.skippedIds.length !== 1 || single.skippedIds[0] !== "no-token") {
    throw new Error(`single no-token event was counted ${single.skippedIds.length} times`)
  }

  const mixed = classifyNotificationEvents(
    events as never,
    new Set([events[1].id, events[2].id]),
    new Map([["recipient-3", [{ token: "token-3" }]]]) as never,
  )
  if (mixed.skippedIds.length !== 2 || mixed.deliverableEvents.length !== 1) {
    throw new Error(
      `mixed classification mismatch: skipped=${mixed.skippedIds.length} deliverable=${mixed.deliverableEvents.length}`,
    )
  }
})

Deno.test("notification handler marks one no-token event skipped once", async () => {
  let fetchCalls = 0
  const { handler, terminalCalls } = fakeDependencies([event("no-token", "recipient-1")], [], async () => {
    fetchCalls += 1
    throw new Error("network must not be called")
  })

  const response = await handler(
    new Request("https://example.invalid", {
      method: "POST",
      headers: { Authorization: "Bearer test-key", "Content-Type": "application/json" },
      body: "{}",
    }),
  )
  const body = await response.json()

  if (response.status !== 200 || body.skipped !== 1 || body.sent !== 0 || body.failed !== 0) {
    throw new Error(`unexpected no-token response: ${JSON.stringify(body)}`)
  }
  if (fetchCalls !== 0 || terminalCalls.length !== 1) {
    throw new Error(`no-token terminal behavior mismatch: fetch=${fetchCalls} calls=${terminalCalls.length}`)
  }
  if (terminalCalls[0].p_status !== "skipped" || terminalCalls[0].p_event_ids?.toString() !== "no-token") {
    throw new Error(`unexpected no-token terminal call: ${JSON.stringify(terminalCalls[0])}`)
  }
})

Deno.test("notification handler reports mixed no-token and deliverable counts", async () => {
  let fetchCalls = 0
  const { handler, terminalCalls } = fakeDependencies(
    [event("no-token", "recipient-1"), event("deliverable", "recipient-2")],
    [{ profile_id: "recipient-2", token: "token-2", platform: "ios" }],
    async () => {
      fetchCalls += 1
      return new Response(JSON.stringify({ data: [{ status: "ok", id: "ticket-1" }] }), { status: 200 })
    },
  )

  const response = await handler(
    new Request("https://example.invalid", {
      method: "POST",
      headers: { Authorization: "Bearer test-key", "Content-Type": "application/json" },
      body: "{}",
    }),
  )
  const body = await response.json()

  if (response.status !== 200 || body.skipped !== 1 || body.sent !== 1 || body.failed !== 0) {
    throw new Error(`unexpected mixed response: ${JSON.stringify(body)}`)
  }
  if (fetchCalls !== 1 || terminalCalls.length !== 2) {
    throw new Error(`mixed terminal behavior mismatch: fetch=${fetchCalls} calls=${terminalCalls.length}`)
  }
  const statuses = terminalCalls.map((call) => call.p_status).sort().join(",")
  if (statuses !== "sent,skipped") throw new Error(`unexpected mixed statuses: ${statuses}`)
})
