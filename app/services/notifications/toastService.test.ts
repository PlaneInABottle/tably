import {
  showInfoToast,
  showSuccessToast,
  subscribeToToasts,
} from "@/services/notifications/toastService"

describe("toastService", () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("emits info toasts with display options", () => {
    jest.spyOn(Date, "now").mockReturnValue(123)
    const listener = jest.fn()
    const unsubscribe = subscribeToToasts(listener)

    showInfoToast("Found 9 dive events", { testID: "map-status", visibleMs: 4000 })

    expect(listener).toHaveBeenCalledWith({
      id: 123,
      message: "Found 9 dive events",
      testID: "map-status",
      variant: "info",
      visibleMs: 4000,
    })

    unsubscribe()
    showSuccessToast("Saved")

    expect(listener).toHaveBeenCalledTimes(1)
  })
})
