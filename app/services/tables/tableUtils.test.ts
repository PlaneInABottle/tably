import {
  formatActivityLabel,
  formatCountdown,
  formatPlanTime,
  getActionDeadline,
  getChatPromptChips,
  getMemberStatusLabel,
  getMomentumMessage,
  getSeatsLeft,
  getTableStatusLabel,
  isTodayOrTomorrow,
} from "./tableUtils"

describe("tableUtils", () => {
  it("formats activity labels", () => {
    expect(formatActivityLabel("coffee")).toBe("Coffee")
    expect(formatActivityLabel("run")).toBe("Run")
    expect(formatActivityLabel("unknown")).toBe("Plan")
  })

  it("formats table momentum labels", () => {
    expect(getTableStatusLabel("confirmed")).toBe("Confirmed")
    expect(getTableStatusLabel("happening")).toBe("Happening")
    expect(getTableStatusLabel("forming", 2)).toBe("Forming")
    expect(getTableStatusLabel("forming", 0)).toBe("New")
  })

  it("formats member next-action labels", () => {
    expect(getMemberStatusLabel("pending_intro")).toBe("Needs intro")
    expect(getMemberStatusLabel("pending_confirm")).toBe("Needs confirm")
    expect(getMemberStatusLabel("confirmed")).toBe("Confirmed")
    expect(getMemberStatusLabel(null)).toBe("Open")
  })

  it("accepts dates only in today or tomorrow", () => {
    const now = new Date("2026-06-24T10:00:00.000Z")

    expect(isTodayOrTomorrow("2026-06-24T18:00:00.000Z", now)).toBe(true)
    expect(isTodayOrTomorrow("2026-06-25T18:00:00.000Z", now)).toBe(true)
    expect(isTodayOrTomorrow("2026-06-26T00:00:00.000Z", now)).toBe(false)
  })

  it("formats plan times without crashing on valid dates", () => {
    expect(formatPlanTime("2026-06-24T18:30:00.000Z")).toContain(":")
  })

  it("selects the active deadline by member status", () => {
    expect(getActionDeadline("pending_intro", "intro", "confirm")).toBe("intro")
    expect(getActionDeadline("pending_confirm", "intro", "confirm")).toBe("confirm")
    expect(getActionDeadline("confirmed", "intro", "confirm")).toBeNull()
  })

  it("formats countdowns and momentum messages", () => {
    const now = new Date("2026-06-24T10:00:00.000Z")

    expect(formatCountdown("2026-06-24T10:24:00.000Z", now)).toBe("24 min")
    expect(formatCountdown("2026-06-24T11:30:00.000Z", now)).toBe("1 hr 30 min")
    expect(formatCountdown("2026-06-24T09:59:00.000Z", now)).toBe("expired")
    expect(getMomentumMessage("pending_intro", "2026-06-24T10:24:00.000Z", null, now)).toBe(
      "Seat held · answer intro in 24 min",
    )
    expect(getMomentumMessage("confirmed", null, null, now)).toBe("You are confirmed")
  })

  it("keeps seat math non-negative", () => {
    expect(getSeatsLeft(5, 2)).toBe(3)
    expect(getSeatsLeft(5, 8)).toBe(0)
  })

  it("chooses guided chat prompt chips from table state", () => {
    const now = new Date("2026-06-24T10:00:00.000Z")

    expect(getChatPromptChips("confirmed", "2026-06-24T10:45:00.000Z", true, now)).toEqual([
      { label: "I'm on my way", message: "I'm on my way and should arrive soon." },
      { label: "I arrived", message: "I arrived. Where should I find everyone?" },
      { label: "Where are you sitting?", message: "Where are you sitting exactly?" },
    ])
    expect(getChatPromptChips("confirmed", "2026-06-24T15:00:00.000Z", true, now)).toContainEqual({
      label: "Confirm venue",
      message: "Can we confirm the exact venue?",
    })
    expect(
      getChatPromptChips("pending_confirm", "2026-06-24T15:00:00.000Z", false, now),
    ).toContainEqual({
      label: "Share arrival time",
      message: "I can arrive around the planned time.",
    })
  })
})
