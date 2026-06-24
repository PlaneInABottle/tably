import { supabase } from "@/services/supabase/client"

import { buildAvatarPath } from "./avatarUtils"

export { buildAvatarPath, getAvatarExtension, getInitials } from "./avatarUtils"

export type AvatarUploadInput = {
  userId: string
  uri: string
  mimeType?: string | null
}

export type ServiceResult<T = void> = { ok: true; data: T } | { ok: false; error: string }

export async function readUriAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri)
  return response.arrayBuffer()
}

export async function uploadOwnAvatar(input: AvatarUploadInput): Promise<ServiceResult<string>> {
  const path = buildAvatarPath(input.userId, input.mimeType)
  const bytes = await readUriAsArrayBuffer(input.uri)
  const { error } = await supabase.storage.from("avatars").upload(path, bytes, {
    contentType: input.mimeType ?? "image/jpeg",
    upsert: true,
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true, data: path }
}

export async function removeAvatarObject(path: string): Promise<ServiceResult> {
  const { error } = await supabase.storage.from("avatars").remove([path])

  if (error) return { ok: false, error: error.message }
  return { ok: true, data: undefined }
}

export async function createAvatarSignedUrl(path: string): Promise<ServiceResult<string>> {
  const { data, error } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 10)

  if (error) return { ok: false, error: error.message }
  if (!data?.signedUrl) return { ok: false, error: "Avatar could not be loaded." }

  return { ok: true, data: data.signedUrl }
}
