export const REPORT_REASONS = [
  "Harassment or abuse",
  "Hate or discrimination",
  "Sexual content",
  "Spam or scam",
  "Unsafe diving behavior",
  "Other",
] as const

export type ReportReason = (typeof REPORT_REASONS)[number]

export type ReportTargetType = "profile" | "dive" | "message" | "conversation"

export type ReportInput = {
  targetType: ReportTargetType
  targetId: string
  reason: ReportReason
  details?: string
}

export type ReportResult = {
  id: string
  status: string
  createdAt: string
}

export type BlockedUser = {
  id: string
  displayName: string
  summary: string
  avatarPath: string | null
  createdAt: string
}

export type BlockUserResult = {
  blockedId: string
  createdAt: string
}

export type ServiceResult<T = void> = { ok: true; data: T } | { ok: false; error: string }
