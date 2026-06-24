import { buildAvatarPath, getAvatarExtension, getInitials } from "./avatarUtils"

describe("avatarService helpers", () => {
  it("builds canonical avatar paths by mime type", () => {
    expect(buildAvatarPath("user-1", "image/png")).toBe("user-1/avatar.png")
    expect(buildAvatarPath("user-1", "image/webp")).toBe("user-1/avatar.webp")
    expect(buildAvatarPath("user-1", "image/jpeg")).toBe("user-1/avatar.jpg")
  })

  it("defaults unknown mime types to jpg", () => {
    expect(getAvatarExtension("image/gif")).toBe("jpg")
  })

  it("uses display name or email initials", () => {
    expect(getInitials("Mina Patel", "phase@example.com")).toBe("MP")
    expect(getInitials("", "phase@example.com")).toBe("P")
  })
})
