export type RecoveryLinkResult =
  | { ok: true; accessToken: string; refreshToken: string }
  | { ok: false; error: string }

function getUrlParams(url: string): URLSearchParams {
  const [, hash = ""] = url.split("#")
  const query = url.includes("?") ? url.slice(url.indexOf("?") + 1).split("#")[0] : ""

  return new URLSearchParams([query, hash].filter(Boolean).join("&"))
}

export function parseRecoveryLink(url: string): RecoveryLinkResult {
  const params = getUrlParams(url)
  const accessToken = params.get("access_token")
  const refreshToken = params.get("refresh_token")
  const type = params.get("type")

  if (type && type !== "recovery") return { ok: false, error: "Not a recovery link." }
  if (!accessToken || !refreshToken) return { ok: false, error: "Recovery link is missing tokens." }

  return { ok: true, accessToken, refreshToken }
}
