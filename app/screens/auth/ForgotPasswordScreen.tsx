import { FC, useState } from "react"
import { Keyboard, Pressable, TextStyle, View, ViewStyle } from "react-native"
import { Ionicons } from "@expo/vector-icons"

import { BrandHeader } from "@/components/BrandHeader"
import { Button } from "@/components/Button"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { useAuth } from "@/context/AuthContext"
import { translate } from "@/i18n/translate"
import type { AuthStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

interface ForgotPasswordScreenProps extends AuthStackScreenProps<"ForgotPassword"> {}

export const ForgotPasswordScreen: FC<ForgotPasswordScreenProps> = ({ navigation }) => {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const { sendPasswordReset } = useAuth()
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleResetRequest() {
    Keyboard.dismiss()
    setError("")
    setMessage("")

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError(translate("forgotPasswordScreen:invalidEmail"))
      return
    }

    setIsSubmitting(true)
    const result = await sendPasswordReset(email.trim())
    setIsSubmitting(false)

    if (result.ok) setMessage(translate("forgotPasswordScreen:successMessage"))
    if (!result.ok) setError(result.error)
  }

  return (
    <Screen
      preset="auto"
      keyboardShouldPersistTaps="handled"
      safeAreaEdges={["top", "bottom"]}
      contentContainerStyle={themed($container)}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to sign in"
        testID="forgot-password-back-button"
        onPress={() => navigation.navigate("SignIn")}
        style={themed($backButton)}
      >
        <Ionicons name="chevron-back" size={18} color={colors.tint} />
        <Text tx="forgotPasswordScreen:backToSignIn" style={themed($backButtonText)} />
      </Pressable>

      <BrandHeader />
      <View style={themed($header)}>
        <Text tx="forgotPasswordScreen:title" preset="heading" style={themed($title)} />
        <Text tx="forgotPasswordScreen:subtitle" style={themed($subtitle)} />
      </View>
      <TextField
        labelTx="forgotPasswordScreen:emailLabel"
        accessibilityLabel="Email"
        testID="email-input"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        containerStyle={themed($field)}
      />
      {!!message && (
        <View
          accessibilityRole="alert"
          testID="forgot-password-success"
          style={themed($successPanel)}
        >
          <View style={themed($statusIcon)}>
            <Ionicons name="checkmark" size={18} color={colors.palette.neutral100} />
          </View>
          <Text text={message} style={themed($statusText)} />
        </View>
      )}
      {!!error && (
        <View accessibilityRole="alert" testID="forgot-password-error" style={themed($errorPanel)}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
          <Text text={error} style={themed($errorText)} />
        </View>
      )}
      <Button
        tx={
          isSubmitting
            ? "forgotPasswordScreen:submittingButton"
            : "forgotPasswordScreen:submitButton"
        }
        accessibilityLabel="Submit reset email"
        testID="forgot-password-submit-button"
        preset="reversed"
        disabled={isSubmitting}
        onPress={handleResetRequest}
        style={themed($primaryButton)}
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

const $backButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignSelf: "flex-start",
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xxs,
  minHeight: 40,
  marginBottom: spacing.lg,
})

const $backButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
  fontSize: 15,
  lineHeight: 20,
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
