import type { Session, User } from "@supabase/supabase-js"

import { supabase } from "../supabase/client"

export type AuthResult<T = void> = { ok: true; data: T } | { ok: false; error: string }

export const PASSWORD_RESET_REDIRECT_URL = "tably://update-password"

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>
}

function normalizeAuthError(message?: string): string {
  if (!message) return "Something went wrong. Please try again."
  if (message.includes("Content contains")) return "This content cannot be shared."
  if (message.includes("Terms")) return "Accept the community terms to continue."

  return message
}

export async function acceptCurrentTerms(): Promise<AuthResult> {
  const { error } = await (supabase as unknown as RpcClient).rpc("accept_current_terms")

  if (error) return { ok: false, error: normalizeAuthError(error.message) }

  return { ok: true, data: undefined }
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<AuthResult<{ session: Session | null; user: User | null }>> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) return { ok: false, error: normalizeAuthError(error.message) }

  if (data.session) {
    const terms = await acceptCurrentTerms()
    if (!terms.ok) return { ok: false, error: terms.error }
  }

  return { ok: true, data: { session: data.session, user: data.user } }
}

export async function signUpWithPassword(
  email: string,
  password: string,
  displayName?: string,
): Promise<AuthResult<{ session: Session | null; user: User | null }>> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName ?? "" } },
  })

  if (error) return { ok: false, error: normalizeAuthError(error.message) }

  if (data.session) {
    const terms = await acceptCurrentTerms()
    if (!terms.ok) return { ok: false, error: terms.error }
  }

  return { ok: true, data: { session: data.session, user: data.user } }
}

export async function sendPasswordReset(email: string): Promise<AuthResult> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: PASSWORD_RESET_REDIRECT_URL,
  })

  if (error) return { ok: false, error: normalizeAuthError(error.message) }

  return { ok: true, data: undefined }
}

export async function updatePassword(password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.updateUser({ password })

  if (error) return { ok: false, error: normalizeAuthError(error.message) }

  return { ok: true, data: undefined }
}

export async function setSessionFromRecoveryTokens(
  accessToken: string,
  refreshToken: string,
): Promise<AuthResult<{ session: Session | null; user: User | null }>> {
  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  if (error) return { ok: false, error: normalizeAuthError(error.message) }

  return { ok: true, data: { session: data.session, user: data.user } }
}

export async function signOut(): Promise<AuthResult> {
  const { error } = await supabase.auth.signOut({ scope: "local" })

  if (error) return { ok: false, error: normalizeAuthError(error.message) }

  return { ok: true, data: undefined }
}
