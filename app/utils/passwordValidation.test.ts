import { validatePasswordPair } from "./passwordValidation"

describe("validatePasswordPair", () => {
  it("requires the signup password length", () => {
    expect(validatePasswordPair("short", "short")).toBe("passwordTooShort")
  })

  it("requires matching confirmation", () => {
    expect(validatePasswordPair("longer", "different")).toBe("passwordMismatch")
  })

  it("accepts valid matching passwords", () => {
    expect(validatePasswordPair("longer", "longer")).toBeNull()
  })
})
