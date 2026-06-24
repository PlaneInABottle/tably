import type { Tables, TablesUpdate } from "@/services/supabase/database.types"

import { supabase } from "../supabase/client"

export type Profile = Tables<"profiles">

export type ProfilePatch = Pick<
  TablesUpdate<"profiles">,
  "display_name" | "summary" | "is_first_login"
>

type AvatarPathRow = Pick<Profile, "avatar_path" | "updated_at">

export type ServiceResult<T = void> = { ok: true; data: T } | { ok: false; error: string }

function messageFromUnknown(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return "Something went wrong. Please try again."
}

function normalizeProfilePatch(patch: ProfilePatch): ProfilePatch {
  return {
    ...(patch.display_name !== undefined ? { display_name: patch.display_name } : {}),
    ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
    ...(patch.is_first_login !== undefined ? { is_first_login: patch.is_first_login } : {}),
  }
}

export async function getOwnProfile(userId: string): Promise<ServiceResult<Profile>> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id,email,display_name,summary,avatar_path,location,show_location,is_first_login,created_at,updated_at",
    )
    .eq("id", userId)
    .single()

  if (error) return { ok: false, error: error.message }

  return { ok: true, data }
}

export async function updateOwnProfile(
  userId: string,
  patch: ProfilePatch,
): Promise<ServiceResult<Profile>> {
  const { data, error } = await supabase
    .from("profiles")
    .update(normalizeProfilePatch(patch))
    .eq("id", userId)
    .select(
      "id,email,display_name,summary,avatar_path,location,show_location,is_first_login,created_at,updated_at",
    )
    .single()

  if (error) return { ok: false, error: error.message }

  return { ok: true, data }
}

export async function updateOwnAvatarPath(path: string): Promise<ServiceResult<AvatarPathRow>> {
  const { data, error } = await supabase.rpc("update_own_avatar_path", { p_path: path })

  if (error) return { ok: false, error: error.message }
  if (!data?.[0]) return { ok: false, error: "Avatar was not updated." }

  return { ok: true, data: data[0] }
}

export async function clearOwnAvatarPath(): Promise<ServiceResult<AvatarPathRow>> {
  const { data, error } = await supabase.rpc("clear_own_avatar_path")

  if (error) return { ok: false, error: error.message }
  if (!data?.[0]) return { ok: false, error: "Avatar was not cleared." }

  return { ok: true, data: data[0] }
}

export function normalizeProfileError(error: unknown): string {
  return messageFromUnknown(error)
}
