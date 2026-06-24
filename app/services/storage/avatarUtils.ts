export function getAvatarExtension(mimeType?: string | null): "jpg" | "png" | "webp" {
  if (mimeType === "image/png") return "png"
  if (mimeType === "image/webp") return "webp"
  return "jpg"
}

export function buildAvatarPath(userId: string, mimeType?: string | null): string {
  return `${userId}/avatar.${getAvatarExtension(mimeType)}`
}

export function getInitials(displayName?: string | null, email?: string | null): string {
  const source = (displayName || email || "Diver").trim()
  const parts = source.split(/\s+/).filter(Boolean)
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "")
  return initials.join("") || "D"
}
