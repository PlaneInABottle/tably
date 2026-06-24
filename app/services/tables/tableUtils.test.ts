import {
  formatActivityLabel,
  formatPlanTime,
  getMemberStatusLabel,
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
})
