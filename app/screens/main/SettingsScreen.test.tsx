import { NavigationContainer } from "@react-navigation/native"
import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { SettingsScreen } from "./SettingsScreen"

const mockNavigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
}

jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => mockNavigation,
}))

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}))

jest.mock("@/components/Screen", () => {
  const React = jest.requireActual("react")
  const { ScrollView } = jest.requireActual("react-native")

  return {
    Screen: ({ children }: { children: React.ReactNode }) =>
      React.createElement(ScrollView, null, children),
  }
})

jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ signOut: jest.fn() }),
}))

jest.mock("@/services/account/accountService", () => ({
  deleteAccount: jest.fn(),
}))

jest.mock("@/services/moderation/moderationService", () => ({
  listBlockedUsers: jest.fn(async () => ({ ok: true, data: [] })),
  unblockUser: jest.fn(),
}))

jest.mock("@/services/notifications/pushService", () => ({
  getNotificationPreferences: jest.fn(async () => ({
    ok: true,
    data: {
      seatHeldIntro: true,
      seatConfirmDue: true,
      tableConfirmed: true,
      waitlistPromoted: true,
      tableMessage: true,
      tableStartingSoon: true,
    },
  })),
  registerPushToken: jest.fn(),
  updateNotificationPreferences: jest.fn(),
}))

jest.mock("@/services/notifications/toastService", () => ({
  showSuccessToast: jest.fn(),
}))

describe("SettingsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  function renderScreen() {
    return render(
      <ThemeProvider initialContext="light">
        <NavigationContainer>
          <SettingsScreen />
        </NavigationContainer>
      </ThemeProvider>,
    )
  }

  it("provides a visible route back to the profile", async () => {
    const { getByTestId, getByText } = renderScreen()

    await waitFor(() => expect(getByText("Seat held reminders")).toBeTruthy())
    fireEvent.press(getByTestId("settings-back-button"))

    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1)
  })

  it("opens password settings from the current app stack", async () => {
    const { getByTestId, getByText } = renderScreen()

    await waitFor(() => expect(getByText("Seat held reminders")).toBeTruthy())
    fireEvent.press(getByTestId("settings-change-password-button"))

    expect(mockNavigation.navigate).toHaveBeenCalledWith("ChangePassword")
  })
})
