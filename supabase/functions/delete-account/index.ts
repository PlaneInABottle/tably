import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

type SupabaseAdminClient = ReturnType<typeof createClient>

async function listAvatarPaths(admin: SupabaseAdminClient, userId: string): Promise<string[]> {
  const avatarPaths: string[] = []
  let offset = 0
  const limit = 100

  while (true) {
    const { data, error } = await admin.storage.from("avatars").list(userId, { limit, offset })
    if (error) throw new Error(`Avatar cleanup failed: ${error.message}`)

    const objects = data ?? []
    avatarPaths.push(...objects.map((object) => `${userId}/${object.name}`))

    if (objects.length < limit) return avatarPaths
    offset += objects.length
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Delete account is not configured." }, 500)
  }

  const authorization = req.headers.get("Authorization")
  if (!authorization) return json({ error: "Authentication required" }, 401)

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser()

  if (userError || !user) return json({ error: "Authentication required" }, 401)

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let avatarPaths: string[]
  try {
    avatarPaths = await listAvatarPaths(admin, user.id)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Avatar cleanup failed." }, 500)
  }

  if (avatarPaths.length > 0) {
    const { error: removeError } = await admin.storage.from("avatars").remove(avatarPaths)
    if (removeError) return json({ error: `Avatar cleanup failed: ${removeError.message}` }, 500)
  }

  await admin.from("moderation_reports").insert({
    reporter_id: user.id,
    reported_user_id: user.id,
    target_type: "profile",
    target_id: user.id,
    reason: "account_deletion",
    details: "User requested immediate account deletion from the app.",
    status: "actioned",
    snapshot: {
      email: user.email,
      requested_at: new Date().toISOString(),
    },
  })

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
  if (deleteError) return json({ error: deleteError.message }, 500)

  return json({ ok: true })
})
