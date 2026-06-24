import { supabase } from "@/services/supabase/client"

import type {
  BlockedUser,
  BlockUserResult,
  ReportInput,
  ReportResult,
  ServiceResult,
} from "./types"

export { REPORT_REASONS } from "./types"
export type { BlockedUser, ReportInput, ReportReason, ReportTargetType } from "./types"

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>
}

const rpcClient = supabase as unknown as RpcClient

type ReportRow = {
  id: string
  status: string
  created_at: string
}

type BlockUserRow = {
  blocked_id: string
  created_at: string
}

type BlockedUserRow = {
  blocked_id: string
  display_name: string
  summary: string
  avatar_path: string | null
  created_at: string
}

function normalizeModerationError(message?: string): string {
  if (!message) return "Safety request failed. Please try again."
  if (message.includes("Authentication required")) return "Please sign in to use safety tools."
  if (message.includes("blocked")) return "This member is blocked."
  if (message.includes("Report")) return message
  if (message.includes("Content contains")) return "This content cannot be shared."
  if (message.includes("User was not found")) return "Member was not found."
  return "Safety request failed. Please try again."
}

function normalizeReport(row: ReportRow): ReportResult {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
  }
}

function normalizeBlock(row: BlockUserRow): BlockUserResult {
  return {
    blockedId: row.blocked_id,
    createdAt: row.created_at,
  }
}

function normalizeBlockedUser(row: BlockedUserRow): BlockedUser {
  return {
    id: row.blocked_id,
    displayName: row.display_name || "Tably member",
    summary: row.summary,
    avatarPath: row.avatar_path,
    createdAt: row.created_at,
  }
}

export async function submitReport(input: ReportInput): Promise<ServiceResult<ReportResult>> {
  const { data, error } = await rpcClient.rpc("submit_report", {
    p_target_type: input.targetType,
    p_target_id: input.targetId,
    p_reason: input.reason,
    p_details: input.details ?? "",
  })

  if (error) return { ok: false, error: normalizeModerationError(error.message) }
  if (!data?.[0]) return { ok: false, error: "Report was not submitted." }

  return { ok: true, data: normalizeReport(data[0] as ReportRow) }
}

export async function blockUser(
  blockedId: string,
  reason?: string,
): Promise<ServiceResult<BlockUserResult>> {
  const { data, error } = await rpcClient.rpc("block_user", {
    p_blocked_id: blockedId,
    p_reason: reason ?? undefined,
  })

  if (error) return { ok: false, error: normalizeModerationError(error.message) }
  if (!data?.[0]) return { ok: false, error: "Member was not blocked." }

  return { ok: true, data: normalizeBlock(data[0] as BlockUserRow) }
}

export async function unblockUser(
  blockedId: string,
): Promise<ServiceResult<{ blockedId: string }>> {
  const { data, error } = await rpcClient.rpc("unblock_user", { p_blocked_id: blockedId })

  if (error) return { ok: false, error: normalizeModerationError(error.message) }

  return {
    ok: true,
    data: { blockedId: (data?.[0] as { blocked_id?: string })?.blocked_id ?? blockedId },
  }
}

export async function listBlockedUsers(): Promise<ServiceResult<BlockedUser[]>> {
  const { data, error } = await rpcClient.rpc("list_blocked_users")

  if (error) return { ok: false, error: normalizeModerationError(error.message) }

  return { ok: true, data: (data ?? []).map((row) => normalizeBlockedUser(row as BlockedUserRow)) }
}
