import type { Coordinate, MapBounds } from "@/services/location/types"

export const ACTIVITY_TYPES = [
  "coffee",
  "dinner",
  "drinks",
  "walk",
  "run",
  "cinema",
  "coworking",
  "culture",
  "sports",
  "explore",
] as const

export type ActivityType = (typeof ACTIVITY_TYPES)[number]

export type TableStatus = "forming" | "confirmed" | "happening" | "completed" | "cancelled"

export type MemberStatus =
  | "pending_intro"
  | "pending_confirm"
  | "confirmed"
  | "left"
  | "replaced"
  | "no_show"
  | "waitlisted"

export type SocialTableSummary = {
  id: string
  activity: ActivityType
  title: string
  note: string
  vibe: string
  areaLabel: string
  startsAt: string
  coordinate: Coordinate
  status: TableStatus
  minSeats: number
  maxSeats: number
  confirmedCount: number
  activeCount: number
  waitlistCount: number
  creator: {
    id: string
    displayName: string
    avatarPath: string | null
  }
  myMemberStatus: MemberStatus | null
  isWaitlisted: boolean
  introDueAt: string | null
  confirmDueAt: string | null
}

export type SocialTableDetail = Omit<
  SocialTableSummary,
  "confirmedCount" | "activeCount" | "waitlistCount" | "creator"
> & {
  introPrompt: string
  creator: {
    id: string
    displayName: string
  }
  joinedAt: string | null
  confirmedAt: string | null
}

export type TableMember = {
  profileId: string
  displayName: string
  summary: string
  avatarPath: string | null
  status: MemberStatus
  introAnswer: string
  confirmedAt: string | null
}

export type TableMessage = {
  id: string
  tableId: string
  senderId: string
  senderDisplayName: string
  senderAvatarPath: string | null
  body: string
  createdAt: string
  updatedAt: string
}

export type ActiveTableChat = {
  id: string
  activity: ActivityType
  title: string
  startsAt: string
  areaLabel: string
  status: TableStatus
  memberStatus: MemberStatus
  latestMessageBody: string | null
  latestMessageCreatedAt: string | null
  introDueAt: string | null
  confirmDueAt: string | null
}

export type CreateSocialTableInput = {
  activity: ActivityType
  title: string
  note: string
  vibe: string
  areaLabel: string
  startsAt: string
  coordinate: Coordinate
  minSeats: number
  maxSeats: number
  introPrompt: string
}

export type ListSocialTablesInput = {
  bounds: MapBounds
}

export type ServiceResult<T = void> = { ok: true; data: T } | { ok: false; error: string }
