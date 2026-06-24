import type { MemberStatus, TableStatus } from "./types"

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
  const day = date.toDateString() === today.toDateString() ? "Today" : date.toDateString() === tomorrow.toDateString() ? "Tomorrow" : date.toLocaleDateString(undefined, { weekday: "short" })

  return `${day} ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
}
