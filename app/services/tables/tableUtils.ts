import type { MemberStatus, TableStatus } from "./types"

export type ChatPromptChip = {
  label: string
  message: string
}

export const TABLE_TIME_OPTIONS = ["18:30", "19:30", "20:30", "21:30"] as const

export type TableDay = "today" | "tomorrow"

export function buildTableStartsAt(day: TableDay, time: string, now = new Date()): string {
  const [hours, minutes] = time.split(":").map(Number)
  const date = new Date(now)
  if (day === "tomorrow") date.setDate(date.getDate() + 1)
  date.setHours(hours, minutes, 0, 0)
  return date.toISOString()
}

export function getInitialTableSchedule(now = new Date()): {
  day: TableDay
  time: (typeof TABLE_TIME_OPTIONS)[number]
} {
  const minimumStart = now.getTime() + 15 * 60 * 1000
  const todayTime = TABLE_TIME_OPTIONS.find(
    (time) => new Date(buildTableStartsAt("today", time, now)).getTime() >= minimumStart,
  )

  return todayTime
    ? { day: "today", time: todayTime }
    : { day: "tomorrow", time: TABLE_TIME_OPTIONS[0] }
}

export function formatActivityLabel(activity: string): string {
  const labels: Record<string, string> = {
    coffee: "Coffee",
    dinner: "Dinner",
    drinks: "Drinks",
    walk: "Walk",
    run: "Run",
    cinema: "Cinema",
    coworking: "Coworking",
    culture: "Culture",
    sports: "Sports",
    explore: "Explore",
  }

  return labels[activity] ?? "Plan"
}

export function getTableStatusLabel(status: TableStatus, confirmedCount = 0): string {
  if (status === "happening") return "Happening"
  if (status === "confirmed") return "Confirmed"
  if (status === "completed") return "Completed"
  if (status === "cancelled") return "Cancelled"
  if (confirmedCount > 0) return "Forming"
  return "New"
}

export function getMemberStatusLabel(status?: MemberStatus | null): string {
  if (status === "pending_intro") return "Needs intro"
  if (status === "pending_confirm") return "Needs confirm"
  if (status === "confirmed") return "Confirmed"
  if (status === "waitlisted") return "Waitlisted"
  if (status === "left") return "Left"
  if (status === "replaced") return "Seat released"
  if (status === "no_show") return "No-show"
  return "Open"
}

export function isTodayOrTomorrow(value: string, now = new Date()): boolean {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false

  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startAfterTomorrow = new Date(startToday)
  startAfterTomorrow.setDate(startAfterTomorrow.getDate() + 2)

  return date >= startToday && date < startAfterTomorrow
}

export function formatPlanTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const day =
    date.toDateString() === today.toDateString()
      ? "Today"
      : date.toDateString() === tomorrow.toDateString()
        ? "Tomorrow"
        : date.toLocaleDateString(undefined, { weekday: "short" })

  return `${day} ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
}

export function getActionDeadline(
  status: MemberStatus | null | undefined,
  introDueAt?: string | null,
  confirmDueAt?: string | null,
): string | null {
  if (status === "pending_intro") return introDueAt ?? null
  if (status === "pending_confirm") return confirmDueAt ?? null
  return null
}

export function formatCountdown(value?: string | null, now = new Date()): string {
  if (!value) return ""
  const deadline = new Date(value)
  if (Number.isNaN(deadline.getTime())) return ""

  const diffMs = deadline.getTime() - now.getTime()
  if (diffMs <= 0) return "expired"

  const diffMinutes = Math.ceil(diffMs / 60000)
  if (diffMinutes < 60) return `${diffMinutes} min`

  const hours = Math.floor(diffMinutes / 60)
  const minutes = diffMinutes % 60
  if (minutes === 0) return `${hours} hr`
  return `${hours} hr ${minutes} min`
}

export function formatDeadlineClock(value?: string | null): string {
  if (!value) return ""
  const deadline = new Date(value)
  if (Number.isNaN(deadline.getTime())) return ""
  return deadline.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
}

export function getMomentumMessage(
  status: MemberStatus | null | undefined,
  introDueAt?: string | null,
  confirmDueAt?: string | null,
  now = new Date(),
): string {
  if (status === "pending_intro") {
    const countdown = formatCountdown(introDueAt, now)
    return countdown === "expired"
      ? "Seat hold expired. Refreshing will release it."
      : `Seat held · answer intro${countdown ? ` in ${countdown}` : ""}`
  }

  if (status === "pending_confirm") {
    const clock = formatDeadlineClock(confirmDueAt)
    const countdown = formatCountdown(confirmDueAt, now)
    if (countdown === "expired") return "Confirmation window expired. Refreshing will release it."
    return clock ? `Confirm by ${clock}` : "Confirm your seat"
  }

  if (status === "confirmed") return "You are confirmed"
  if (status === "waitlisted") return "Waitlisted · we will notify you if a seat opens"
  if (status === "replaced") return "Seat released"
  return "Join to hold a seat"
}

export function getSeatsLeft(maxSeats: number, activeCount: number): number {
  return Math.max(maxSeats - activeCount, 0)
}

export function getChatPromptChips(
  status: MemberStatus | null | undefined,
  startsAt: string,
  hasMessages: boolean,
  now = new Date(),
): ChatPromptChip[] {
  const start = new Date(startsAt)
  const startsSoon =
    !Number.isNaN(start.getTime()) &&
    start.getTime() > now.getTime() &&
    start.getTime() - now.getTime() <= 60 * 60 * 1000

  if (startsSoon && status === "confirmed") {
    return [
      { label: "I'm on my way", message: "I'm on my way and should arrive soon." },
      { label: "I arrived", message: "I arrived. Where should I find everyone?" },
      { label: "Where are you sitting?", message: "Where are you sitting exactly?" },
    ]
  }

  if (status === "confirmed") {
    return [
      { label: "Confirm venue", message: "Can we confirm the exact venue?" },
      {
        label: "Share what you're wearing",
        message: "I will share what I'm wearing before I arrive.",
      },
      {
        label: "Say if you're running late",
        message: "I might be a few minutes late, but I am still coming.",
      },
    ]
  }

  if (!hasMessages) {
    return [
      { label: "Share arrival time", message: "I can arrive around the planned time." },
      { label: "Suggest exact spot", message: "Should we pick the exact spot before we meet?" },
      { label: "Ask who is coming", message: "Who is confirmed for this table?" },
    ]
  }

  return [
    { label: "Share arrival time", message: "I can arrive around the planned time." },
    { label: "Confirm venue", message: "Can we confirm the exact venue?" },
    { label: "Ask who is coming", message: "Who is confirmed for this table?" },
  ]
}
