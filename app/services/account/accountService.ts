import { supabase } from "@/services/supabase/client"

export type ServiceResult<T = void> = { ok: true; data: T } | { ok: false; error: string }

function normalizeAccountError(message?: string): string {
  if (!message) return "Account request failed. Please try again."
  if (message.includes("Authentication required")) return "Please sign in again before deleting."
  if (message.includes("not configured")) return "Account deletion is not configured."
  return message
}

export async function deleteAccount(): Promise<ServiceResult> {
  const { error } = await supabase.functions.invoke("delete-account", {
    body: {},
  })

  if (error) return { ok: false, error: normalizeAccountError(error.message) }

  await supabase.auth.signOut({ scope: "local" })
  return { ok: true, data: undefined }
}
