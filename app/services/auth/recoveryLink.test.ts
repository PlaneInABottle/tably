import { parseRecoveryLink } from "./recoveryLink"

describe("parseRecoveryLink", () => {
  it("reads recovery tokens from a hash URL", () => {
    const result = parseRecoveryLink(
      "tably://update-password#access_token=access&refresh_token=refresh&type=recovery",
    )

    expect(result).toEqual({ ok: true, accessToken: "access", refreshToken: "refresh" })
  })

  it("rejects missing tokens", () => {
    expect(parseRecoveryLink("tably://update-password?type=recovery")).toEqual({
      ok: false,
      error: "Recovery link is missing tokens.",
    })
  })
})
