import { supabase } from "@/services/supabase/client"

import type {
  ActiveTableChat,
  ActivityType,
  CreateSocialTableInput,
  ListSocialTablesInput,
  MemberStatus,
  ServiceResult,
  SocialTableDetail,
  SocialTableSummary,
  TableMember,
  TableMessage,
  TableStatus,
} from "./types"

type RpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>
}

const db = supabase as unknown as RpcClient

type SummaryRow = {
  id: string
  activity: ActivityType
  title: string
  note: string
  vibe: string
  area_label: string
  starts_at: string
  latitude: number
  longitude: number
  status: TableStatus
  min_seats: number
  max_seats: number
  confirmed_count: number
  active_count: number
  waitlist_count: number
  creator_id: string
  creator_display_name: string
  creator_avatar_path: string | null
  my_member_status: MemberStatus | null
  is_waitlisted: boolean
  intro_due_at: string | null
  confirm_due_at: string | null
}

type DetailRow = Omit<
  SummaryRow,
  "confirmed_count" | "active_count" | "waitlist_count" | "creator_avatar_path"
> & {
  intro_prompt: string
  joined_at: string | null
  confirmed_at: string | null
}

type MemberRow = {
  profile_id: string
  display_name: string
  summary: string
  avatar_path: string | null
  status: MemberStatus
  intro_answer: string
  confirmed_at: string | null
}

type MessageRow = {
  id: string
  table_id: string
  sender_id: string
  sender_display_name: string
  sender_avatar_path: string | null
  body: string
  created_at: string
  updated_at: string
  content_removed_at?: string | null
}

type ActiveChatRow = {
  id: string
  activity: ActivityType
  title: string
  starts_at: string
  area_label: string
  status: TableStatus
  member_status: MemberStatus
  latest_message_body: string | null
  latest_message_created_at: string | null
  intro_due_at: string | null
  confirm_due_at: string | null
}

function normalizeError(message?: string): string {
  if (!message) return "Table request failed. Please try again."
  if (message.includes("Authentication required")) return "Please sign in to use Tably."
  if (message.includes("today or tomorrow"))
    return "Tables can only be created for today or tomorrow."
  if (message.includes("Invalid activity")) return "Choose a supported activity."
  if (message.includes("Invalid coordinates")) return "Choose a supported location."
  if (message.includes("Table not found")) return "This table is no longer available."
  if (message.includes("Intro answer is required")) return "Answer the intro before joining chat."
  if (message.includes("Join this table")) return "Join this table before using chat."
  if (message.includes("Message must be")) return "Message must be 1-1000 characters."
  if (message.includes("blocked")) return "This table is unavailable."
  return "Table request failed. Please try again."
}

function normalizeSummary(row: SummaryRow): SocialTableSummary {
  return {
    id: row.id,
    activity: row.activity,
    title: row.title,
    note: row.note,
    vibe: row.vibe,
    areaLabel: row.area_label,
    startsAt: row.starts_at,
    coordinate: { latitude: row.latitude, longitude: row.longitude },
    status: row.status,
    minSeats: row.min_seats,
    maxSeats: row.max_seats,
    confirmedCount: row.confirmed_count,
    activeCount: row.active_count,
    waitlistCount: row.waitlist_count,
    creator: {
      id: row.creator_id,
      displayName: row.creator_display_name || "Tably member",
      avatarPath: row.creator_avatar_path,
    },
    myMemberStatus: row.my_member_status,
    isWaitlisted: row.is_waitlisted,
    introDueAt: row.intro_due_at,
    confirmDueAt: row.confirm_due_at,
  }
}

function normalizeDetail(row: DetailRow): SocialTableDetail {
  return {
    id: row.id,
    activity: row.activity,
    title: row.title,
    note: row.note,
    vibe: row.vibe,
    areaLabel: row.area_label,
    startsAt: row.starts_at,
    coordinate: { latitude: row.latitude, longitude: row.longitude },
    status: row.status,
    minSeats: row.min_seats,
    maxSeats: row.max_seats,
    introPrompt: row.intro_prompt,
    creator: {
      id: row.creator_id,
      displayName: row.creator_display_name || "Tably member",
    },
    myMemberStatus: row.my_member_status,
    isWaitlisted: row.is_waitlisted,
    introDueAt: row.intro_due_at,
    confirmDueAt: row.confirm_due_at,
    joinedAt: row.joined_at,
    confirmedAt: row.confirmed_at,
  }
}

function normalizeMember(row: MemberRow): TableMember {
  return {
    profileId: row.profile_id,
    displayName: row.display_name || "Tably member",
    summary: row.summary,
    avatarPath: row.avatar_path,
    status: row.status,
    introAnswer: row.intro_answer,
    confirmedAt: row.confirmed_at,
  }
}

function normalizeMessage(row: MessageRow): TableMessage {
  return {
    id: row.id,
    tableId: row.table_id,
    senderId: row.sender_id,
    senderDisplayName: row.sender_display_name || "Tably member",
    senderAvatarPath: row.sender_avatar_path,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeActiveChat(row: ActiveChatRow): ActiveTableChat {
  return {
    id: row.id,
    activity: row.activity,
    title: row.title,
    startsAt: row.starts_at,
    areaLabel: row.area_label,
    status: row.status,
    memberStatus: row.member_status,
    latestMessageBody: row.latest_message_body,
    latestMessageCreatedAt: row.latest_message_created_at,
    introDueAt: row.intro_due_at,
    confirmDueAt: row.confirm_due_at,
  }
}

export async function createSocialTable(
  input: CreateSocialTableInput,
): Promise<ServiceResult<{ id: string }>> {
  const { data, error } = await db.rpc("create_social_table", {
    p_activity: input.activity,
    p_title: input.title,
    p_note: input.note,
    p_vibe: input.vibe,
    p_area_label: input.areaLabel,
    p_starts_at: input.startsAt,
    p_lng: input.coordinate.longitude,
    p_lat: input.coordinate.latitude,
    p_min_seats: input.minSeats,
    p_max_seats: input.maxSeats,
    p_intro_prompt: input.introPrompt,
  })

  if (error) return { ok: false, error: normalizeError(error.message) }
  if (!data?.[0]?.id) return { ok: false, error: "Table was not created." }

  return { ok: true, data: { id: data[0].id } }
}

export async function listSocialTables(
  input: ListSocialTablesInput,
): Promise<ServiceResult<SocialTableSummary[]>> {
  const { data, error } = await db.rpc("list_social_tables", {
    p_min_lat: input.bounds.minLat,
    p_min_lng: input.bounds.minLong,
    p_max_lat: input.bounds.maxLat,
    p_max_lng: input.bounds.maxLong,
  })

  if (error) return { ok: false, error: normalizeError(error.message) }
  return { ok: true, data: (data ?? []).map(normalizeSummary) }
}

export async function getSocialTableDetail(
  tableId: string,
): Promise<ServiceResult<SocialTableDetail>> {
  const { data, error } = await db.rpc("get_social_table_detail", { p_table_id: tableId })

  if (error) return { ok: false, error: normalizeError(error.message) }
  if (!data?.[0]) return { ok: false, error: "This table is no longer available." }

  return { ok: true, data: normalizeDetail(data[0]) }
}

export async function listTableMembers(tableId: string): Promise<ServiceResult<TableMember[]>> {
  const { data, error } = await db.rpc("list_table_members", { p_table_id: tableId })

  if (error) return { ok: false, error: normalizeError(error.message) }
  return { ok: true, data: (data ?? []).map(normalizeMember) }
}

export async function joinSocialTable(
  tableId: string,
): Promise<ServiceResult<{ memberStatus: MemberStatus; isWaitlisted: boolean }>> {
  const { data, error } = await db.rpc("join_social_table", { p_table_id: tableId })

  if (error) return { ok: false, error: normalizeError(error.message) }
  if (!data?.[0]) return { ok: false, error: "Could not join this table." }

  return {
    ok: true,
    data: { memberStatus: data[0].member_status, isWaitlisted: data[0].is_waitlisted },
  }
}

export async function answerTableIntro(
  tableId: string,
  answer: string,
): Promise<ServiceResult<MemberStatus>> {
  const { data, error } = await db.rpc("answer_table_intro", {
    p_table_id: tableId,
    p_answer: answer,
  })

  if (error) return { ok: false, error: normalizeError(error.message) }
  return { ok: true, data: data?.[0]?.member_status ?? "pending_confirm" }
}

export async function confirmTableAttendance(
  tableId: string,
): Promise<ServiceResult<MemberStatus>> {
  const { data, error } = await db.rpc("confirm_table_attendance", { p_table_id: tableId })

  if (error) return { ok: false, error: normalizeError(error.message) }
  return { ok: true, data: data?.[0]?.member_status ?? "confirmed" }
}

export async function leaveSocialTable(tableId: string): Promise<ServiceResult> {
  const { error } = await db.rpc("leave_social_table", { p_table_id: tableId })
  if (error) return { ok: false, error: normalizeError(error.message) }
  return { ok: true, data: undefined }
}

export async function listMyActiveTables(): Promise<ServiceResult<ActiveTableChat[]>> {
  const { data, error } = await db.rpc("list_my_active_tables")
  if (error) return { ok: false, error: normalizeError(error.message) }
  return { ok: true, data: (data ?? []).map(normalizeActiveChat) }
}

export async function listTableMessages(tableId: string): Promise<ServiceResult<TableMessage[]>> {
  const { data, error } = await db.rpc("list_table_messages", { p_table_id: tableId })
  if (error) return { ok: false, error: normalizeError(error.message) }
  return { ok: true, data: (data ?? []).map(normalizeMessage) }
}

export async function sendTableMessage(
  tableId: string,
  body: string,
): Promise<ServiceResult<TableMessage>> {
  const { data, error } = await db.rpc("send_table_message", { p_table_id: tableId, p_body: body })
  if (error) return { ok: false, error: normalizeError(error.message) }
  if (!data?.[0]) return { ok: false, error: "Message was not sent." }
  return { ok: true, data: normalizeMessage(data[0]) }
}

export function subscribeToTableMessages(
  tableId: string,
  onMessage: (message: TableMessage) => void,
  onError: (message: string) => void,
  onRemoval?: () => void,
): () => void {
  const channel = supabase
    .channel(`table:${tableId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "table_messages",
        filter: `table_id=eq.${tableId}`,
      },
      (payload) => onMessage(normalizeMessage(payload.new as MessageRow)),
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "table_messages",
        filter: `table_id=eq.${tableId}`,
      },
      (payload) => {
        if ((payload.new as MessageRow).content_removed_at) onRemoval?.()
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "social_tables",
        filter: `id=eq.${tableId}`,
      },
      (payload) => {
        if ((payload.new as { content_removed_at?: string | null }).content_removed_at)
          onRemoval?.()
      },
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR") onError("Realtime updates are unavailable.")
    })

  return () => {
    void supabase.removeChannel(channel)
  }
}
