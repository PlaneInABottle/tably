import { FC, useState } from "react"
import { TextStyle, View, ViewStyle } from "react-native"
import { Ionicons } from "@expo/vector-icons"

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

interface UpdatePasswordScreenProps extends AppStackScreenProps<"UpdatePassword"> {}

const PASSWORD_ERROR_TX = {
  passwordTooShort: "passwordScreen:passwordTooShort",
  passwordMismatch: "passwordScreen:passwordMismatch",
} as const

export const UpdatePasswordScreen: FC<UpdatePasswordScreenProps> = ({ navigation }) => {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const { updatePassword, signOut } = useAuth()
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submitPasswordUpdate() {
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

    if (!result.ok) {
      setError(result.error)
      return
    }

    setPassword("")
    setConfirmation("")
    setMessage(translate("passwordScreen:resetChanged"))
  }

  async function returnToSignIn() {
    setError("")
    const result = await signOut()
    if (!result.ok) {
      setError(result.error)
      return
    }

    navigation.reset({
      index: 0,
      routes: [{ name: "Auth", params: { screen: "SignIn" } }],
    })
  }

  return (
    <Screen
      preset="auto"
      keyboardShouldPersistTaps="never"
      safeAreaEdges={["top", "bottom"]}
      contentContainerStyle={themed($container)}
    >
      <View style={themed($header)}>
        <Text tx="passwordScreen:updateTitle" preset="heading" style={themed($title)} />
        <Text tx="passwordScreen:updateSubtitle" style={themed($subtitle)} />
      </View>

      {!!message ? (
        <View
          accessibilityRole="alert"
          testID="update-password-success"
          style={themed($successPanel)}
        >
          <View style={themed($statusIcon)}>
            <Ionicons name="checkmark" size={18} color={colors.palette.neutral100} />
          </View>
          <Text text={message} style={themed($statusText)} />
        </View>
      ) : (
        <>
          <TextField
            labelTx="passwordScreen:newPasswordLabel"
            accessibilityLabel="New password"
            testID="update-password-input"
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
            testID="update-password-confirm-input"
            value={confirmation}
            onChangeText={setConfirmation}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            containerStyle={themed($field)}
          />
          {!!error && (
            <View
              accessibilityRole="alert"
              testID="update-password-error"
              style={themed($errorPanel)}
            >
              <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
              <Text text={error} style={themed($errorText)} />
            </View>
          )}
          <Button
            tx="passwordScreen:updateSubmit"
            accessibilityLabel="Submit update password"
            testID="update-password-submit-button"
            preset="reversed"
            disabled={isSubmitting}
            onPress={submitPasswordUpdate}
            style={themed($primaryButton)}
          />
        </>
      )}
      <Button
        tx="passwordScreen:returnToSignIn"
        accessibilityLabel="Return to sign in"
        testID="update-password-sign-in-button"
        onPress={returnToSignIn}
        style={themed($secondaryButton)}
        textStyle={themed($secondaryButtonText)}
      />
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.xxl,
  width: "100%",
  maxWidth: 480,
  alignSelf: "center",
})

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.xl,
})

const $title: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginBottom: spacing.xs,
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  lineHeight: 24,
})

const $field: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.md,
})

const $successPanel: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "flex-start",
  gap: spacing.sm,
  padding: spacing.md,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: colors.palette.primary200,
  backgroundColor: colors.palette.primary100,
  marginBottom: spacing.md,
})

const $statusIcon: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 28,
  height: 28,
  borderRadius: 14,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: colors.tint,
})

const $statusText: ThemedStyle<TextStyle> = ({ colors }) => ({
  flex: 1,
  color: colors.text,
  lineHeight: 22,
})

const $errorPanel: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "flex-start",
  gap: spacing.xs,
  padding: spacing.md,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: colors.error,
  backgroundColor: colors.errorBackground,
  marginBottom: spacing.md,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors }) => ({
  flex: 1,
  color: colors.error,
  lineHeight: 22,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.xs,
})

const $secondaryButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.sm,
  borderWidth: 0,
  backgroundColor: "transparent",
})

const $secondaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
})
