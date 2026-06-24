import { FC, useState } from "react"
import { TextStyle, ViewStyle } from "react-native"

import { Button } from "@/components/Button"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { useAuth } from "@/context/AuthContext"
import { translate } from "@/i18n/translate"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { validatePasswordPair } from "@/utils/passwordValidation"

interface ChangePasswordScreenProps extends AppStackScreenProps<"ChangePassword"> {}

const PASSWORD_ERROR_TX = {
  passwordTooShort: "passwordScreen:passwordTooShort",
  passwordMismatch: "passwordScreen:passwordMismatch",
} as const

export const ChangePasswordScreen: FC<ChangePasswordScreenProps> = ({ navigation }) => {
  const { themed } = useAppTheme()
  const { updatePassword } = useAuth()
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submitPasswordChange() {
    setMessage("")
    setError("")

    const validationError = validatePasswordPair(password, confirmation)
    if (validationError) {
      setError(translate(PASSWORD_ERROR_TX[validationError]))
      return
    }

    setIsSubmitting(true)
    const result = await updatePassword(password)
    setIsSubmitting(false)

    if (result.ok) {
      setPassword("")
      setConfirmation("")
      setMessage(translate("passwordScreen:changed"))
    }

    if (!result.ok) setError(result.error)
  }

  return (
    <Screen
      preset="auto"
      keyboardShouldPersistTaps="never"
      safeAreaEdges={["top", "bottom"]}
      contentContainerStyle={themed($container)}
    >
      <Text tx="passwordScreen:changeTitle" preset="heading" style={themed($title)} />
      <Text tx="passwordScreen:changeSubtitle" style={themed($subtitle)} />
      <TextField
        labelTx="passwordScreen:newPasswordLabel"
        accessibilityLabel="New password"
        testID="change-password-input"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        containerStyle={themed($field)}
      />
      <TextField
        labelTx="passwordScreen:confirmPasswordLabel"
        accessibilityLabel="Confirm new password"
        testID="change-password-confirm-input"
        value={confirmation}
        onChangeText={setConfirmation}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        containerStyle={themed($field)}
      />
      {!!message && (
        <Text
          text={message}
          accessibilityRole="alert"
          testID="change-password-success"
          style={themed($message)}
        />
      )}
      {!!error && (
        <Text
          text={error}
          accessibilityRole="alert"
          testID="change-password-error"
          style={themed($error)}
        />
      )}
      <Button
        tx="passwordScreen:changeSubmit"
        accessibilityLabel="Submit change password"
        testID="change-password-submit-button"
        preset="reversed"
        disabled={isSubmitting}
        onPress={submitPasswordChange}
      />
      <Button
        tx="common:back"
        accessibilityLabel="Back to settings"
        testID="change-password-back-button"
        onPress={() => navigation.goBack()}
      />
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.xxl,
})

const $title: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginBottom: spacing.xs,
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textDim,
  marginBottom: spacing.xl,
})

const $field: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.md,
})

const $message: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.tint,
  marginBottom: spacing.md,
})

const $error: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.error,
  marginBottom: spacing.md,
})
