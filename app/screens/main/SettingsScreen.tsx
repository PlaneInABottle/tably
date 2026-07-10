import { FC, useEffect, useState } from "react"
import { Alert, Linking, Pressable, TextStyle, View, ViewStyle } from "react-native"
import { useNavigation } from "@react-navigation/native"

import { Button } from "@/components/Button"
import { InlineNotice } from "@/components/InlineNotice"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { Switch } from "@/components/Toggle/Switch"
import { useAuth } from "@/context/AuthContext"
import { translate } from "@/i18n/translate"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { deleteAccount } from "@/services/account/accountService"
import {
  listBlockedUsers,
  unblockUser,
  type BlockedUser,
} from "@/services/moderation/moderationService"
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from "@/services/notifications/pushService"
import { showSuccessToast } from "@/services/notifications/toastService"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

interface SettingsScreenProps {}

type ThemeMode = "system" | "light" | "dark"
type ThemeLabelTx =
  | "settingsScreen:themeSystem"
  | "settingsScreen:themeLight"
  | "settingsScreen:themeDark"

const SUPPORT_LINKS = {
  privacy: "https://tably.app/privacy",
  terms: "https://tably.app/terms",
  accountDeletion: "https://tably.app/account-deletion",
  contact: "mailto:support@tably.app",
} as const

export const SettingsScreen: FC<SettingsScreenProps> = () => {
  const navigation = useNavigation<AppStackScreenProps<"Main">["navigation"]>()
  const { themed, themeContext, setThemeContextOverride } = useAppTheme()
  const { signOut } = useAuth()
  const [selectedThemeMode, setSelectedThemeMode] = useState<ThemeMode>(themeContext)
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([])
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences | null>(null)
  const [error, setError] = useState("")
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)

  useEffect(() => {
    let isActive = true

    async function loadBlockedUsers() {
      const result = await listBlockedUsers()
      if (isActive && result.ok) setBlockedUsers(result.data)
    }

    async function loadNotificationPreferences() {
      const result = await getNotificationPreferences()
      if (isActive && result.ok) setNotificationPreferences(result.data)
    }

    void loadBlockedUsers()
    void loadNotificationPreferences()
    return () => {
      isActive = false
    }
  }, [])

  async function toggleNotificationPreference(key: keyof NotificationPreferences, value: boolean) {
    if (!notificationPreferences) return
    const next = { ...notificationPreferences, [key]: value }
    setNotificationPreferences(next)
    const result = await updateNotificationPreferences({ [key]: value })
    if (!result.ok) {
      setError(result.error)
      setNotificationPreferences(notificationPreferences)
      return
    }
    setNotificationPreferences(result.data)
  }

  function setThemeMode(mode: ThemeMode) {
    setSelectedThemeMode(mode)
    setThemeContextOverride(mode === "system" ? undefined : mode)
    setError("")
    showSuccessToast(translate("settingsScreen:themeSaved"))
  }

  function confirmUnblock(blockedUser: BlockedUser) {
    Alert.alert(
      translate("settingsScreen:unblockTitle", { name: blockedUser.displayName }),
      undefined,
      [
        { text: translate("common:cancel"), style: "cancel" },
        {
          text: translate("settingsScreen:unblock"),
          onPress: () => void handleUnblock(blockedUser.id),
        },
      ],
    )
  }

  async function handleUnblock(blockedId: string) {
    setError("")
    const result = await unblockUser(blockedId)
    if (!result.ok) {
      setError(result.error)
      return
    }

    setBlockedUsers((current) => current.filter((user) => user.id !== blockedId))
    showSuccessToast(translate("settingsScreen:unblocked"))
  }

  async function openSupportLink(url: string) {
    setError("")

    const canOpen = await Linking.canOpenURL(url)
    if (!canOpen) {
      setError(translate("settingsScreen:linkUnavailable"))
      return
    }

    await Linking.openURL(url)
  }

  function confirmSignOut() {
    Alert.alert(
      translate("settingsScreen:signOutTitle"),
      translate("settingsScreen:signOutMessage"),
      [
        { text: translate("settingsScreen:cancel"), style: "cancel" },
        {
          text: translate("settingsScreen:confirmSignOut"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              const result = await signOut()
              if (!result.ok) setError(result.error)
            })()
          },
        },
      ],
    )
  }

  function confirmDeleteAccount() {
    Alert.alert(
      translate("settingsScreen:deleteAccountTitle"),
      translate("settingsScreen:deleteAccountMessage"),
      [
        { text: translate("common:cancel"), style: "cancel" },
        {
          text: translate("settingsScreen:deleteAccountContinue"),
          style: "destructive",
          onPress: confirmFinalDeleteAccount,
        },
      ],
    )
  }

  function confirmFinalDeleteAccount() {
    Alert.alert(
      translate("settingsScreen:deleteAccountFinalTitle"),
      translate("settingsScreen:deleteAccountFinalMessage"),
      [
        { text: translate("common:cancel"), style: "cancel" },
        {
          text: translate("settingsScreen:deleteAccountConfirm"),
          style: "destructive",
          onPress: () => void handleDeleteAccount(),
        },
      ],
    )
  }

  async function handleDeleteAccount() {
    setError("")
    setIsDeletingAccount(true)
    const result = await deleteAccount()
    setIsDeletingAccount(false)

    if (!result.ok) setError(result.error)
  }

  function renderThemeButton(mode: ThemeMode, labelTx: ThemeLabelTx) {
    const selected = selectedThemeMode === mode

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`Theme ${mode}`}
        testID={`settings-theme-${mode}`}
        onPress={() => setThemeMode(mode)}
        style={themed([$row, selected && $selectedRow])}
      >
        <Text tx={labelTx} weight={selected ? "bold" : "normal"} />
        {selected ? <Text text="✓" style={themed($checkmark)} /> : null}
      </Pressable>
    )
  }

  return (
    <Screen preset="auto" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      <Text tx="settingsScreen:title" preset="heading" style={themed($title)} />
      <View style={themed($section)}>
        <Text
          tx="settingsScreen:appearanceSection"
          preset="subheading"
          style={themed($sectionTitle)}
        />
        {renderThemeButton("system", "settingsScreen:themeSystem")}
        {renderThemeButton("light", "settingsScreen:themeLight")}
        {renderThemeButton("dark", "settingsScreen:themeDark")}
      </View>
      <View style={themed($section)}>
        <Text
          tx="settingsScreen:securitySection"
          preset="subheading"
          style={themed($sectionTitle)}
        />
        <Button
          tx="settingsScreen:changePassword"
          accessibilityLabel="Change password"
          testID="settings-change-password-button"
          onPress={() => navigation.getParent()?.navigate("ChangePassword")}
        />
      </View>
      <View style={themed($section)}>
        <Text text="Notifications" preset="subheading" style={themed($sectionTitle)} />
        <Text
          text="Control reminders that keep table plans moving."
          size="sm"
          style={themed($body)}
        />
        {notificationPreferences ? (
          <>
            <Switch
              label="Seat held reminders"
              value={notificationPreferences.seatHeldIntro}
              onValueChange={(value) => toggleNotificationPreference("seatHeldIntro", value)}
            />
            <Switch
              label="Confirm attendance reminders"
              value={notificationPreferences.seatConfirmDue}
              onValueChange={(value) => toggleNotificationPreference("seatConfirmDue", value)}
            />
            <Switch
              label="Confirmed table updates"
              value={notificationPreferences.tableConfirmed}
              onValueChange={(value) => toggleNotificationPreference("tableConfirmed", value)}
            />
            <Switch
              label="Waitlist promotions"
              value={notificationPreferences.waitlistPromoted}
              onValueChange={(value) => toggleNotificationPreference("waitlistPromoted", value)}
            />
            <Switch
              label="Chat messages"
              value={notificationPreferences.tableMessage}
              onValueChange={(value) => toggleNotificationPreference("tableMessage", value)}
            />
            <Switch
              label="Starting soon"
              value={notificationPreferences.tableStartingSoon}
              onValueChange={(value) => toggleNotificationPreference("tableStartingSoon", value)}
            />
          </>
        ) : (
          <Text text="Loading notification preferences..." size="sm" style={themed($body)} />
        )}
      </View>
      <View style={themed($section)}>
        <Text
          tx="settingsScreen:supportSection"
          preset="subheading"
          style={themed($sectionTitle)}
        />
        <Button
          tx="settingsScreen:privacy"
          accessibilityLabel="Privacy policy"
          testID="settings-privacy-button"
          onPress={() => openSupportLink(SUPPORT_LINKS.privacy)}
        />
        <Button
          tx="settingsScreen:terms"
          accessibilityLabel="Terms"
          testID="settings-terms-button"
          onPress={() => openSupportLink(SUPPORT_LINKS.terms)}
        />
        <Button
          tx="settingsScreen:accountDeletionWeb"
          accessibilityLabel="Account deletion web resource"
          testID="settings-account-deletion-web-button"
          onPress={() => openSupportLink(SUPPORT_LINKS.accountDeletion)}
        />
        <Text tx="settingsScreen:about" style={themed($body)} />
        <Button
          tx="settingsScreen:contact"
          accessibilityLabel="Contact support"
          testID="settings-contact-button"
          onPress={() => openSupportLink(SUPPORT_LINKS.contact)}
        />
      </View>
      <View style={themed($section)}>
        <Text tx="settingsScreen:safetySection" preset="subheading" style={themed($sectionTitle)} />
        <Text tx="settingsScreen:safetyBody" style={themed($body)} />
        {blockedUsers.length === 0 ? (
          <Text tx="settingsScreen:noBlockedUsers" size="sm" style={themed($body)} />
        ) : (
          <View style={themed($blockedList)}>
            {blockedUsers.map((blockedUser) => (
              <Pressable
                key={blockedUser.id}
                accessibilityLabel={`Unblock ${blockedUser.displayName}`}
                accessibilityRole="button"
                testID={`settings-unblock-user-${blockedUser.id}`}
                onPress={() => confirmUnblock(blockedUser)}
                style={themed($row)}
              >
                <View style={themed($blockedUserText)}>
                  <Text text={blockedUser.displayName} preset="bold" />
                  {!!blockedUser.summary ? (
                    <Text text={blockedUser.summary} size="xs" style={themed($body)} />
                  ) : null}
                </View>
                <Text tx="settingsScreen:unblock" size="sm" style={themed($dangerText)} />
              </Pressable>
            ))}
          </View>
        )}
      </View>
      {!!error && (
        <InlineNotice
          text={error}
          testID="settings-error"
          variant="error"
          style={themed($notice)}
        />
      )}
      <Button
        tx="settingsScreen:signOut"
        accessibilityLabel="Sign out"
        testID="settings-sign-out-button"
        preset="reversed"
        onPress={confirmSignOut}
      />
      <Button
        tx={
          isDeletingAccount
            ? "settingsScreen:deleteAccountDeleting"
            : "settingsScreen:deleteAccount"
        }
        accessibilityLabel="Delete account"
        testID="settings-delete-account-button"
        disabled={isDeletingAccount}
        onPress={confirmDeleteAccount}
        style={themed($deleteAccountButton)}
        textStyle={themed($dangerText)}
      />
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.xxl,
})

const $title: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginBottom: spacing.lg,
})

const $section: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderColor: colors.separator,
  borderRadius: 12,
  borderWidth: 1,
  gap: spacing.sm,
  marginBottom: spacing.lg,
  padding: spacing.md,
})

const $sectionTitle: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginBottom: spacing.xs,
})

const $row: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  alignItems: "center",
  borderColor: colors.separator,
  borderRadius: 8,
  borderWidth: 1,
  flexDirection: "row",
  justifyContent: "space-between",
  minHeight: 48,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
})

const $selectedRow: ThemedStyle<ViewStyle> = ({ colors }) => ({
  borderColor: colors.tint,
  backgroundColor: colors.palette.neutral200,
})

const $checkmark: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
})

const $body: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $blockedList: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})

const $blockedUserText: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $dangerText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.error,
})

const $deleteAccountButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderColor: colors.error,
  marginTop: spacing.sm,
})

const $notice: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.md,
})
