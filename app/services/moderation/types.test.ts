import { REPORT_REASONS } from "./types"

describe("moderation types", () => {
  test("report reasons stay reviewer-friendly and bounded", () => {
    expect(REPORT_REASONS).toContain("Harassment or abuse")
    expect(REPORT_REASONS).toContain("Other")
    expect(REPORT_REASONS.every((reason) => reason.length > 0 && reason.length <= 80)).toBe(true)
  })
})
