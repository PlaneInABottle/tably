import { FC, useState } from "react"
import { TextStyle, View, ViewStyle } from "react-native"

import { Button } from "@/components/Button"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { useAuth } from "@/context/AuthContext"
import { translate } from "@/i18n/translate"
import type { AuthStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

interface SignInScreenProps extends AuthStackScreenProps<"SignIn"> {}

export const SignInScreen: FC<SignInScreenProps> = ({ navigation }) => {
  const { themed } = useAppTheme()
  const { signIn, authError } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [localError, setLocalError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSignIn() {
    setLocalError("")

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setLocalError(translate("signInScreen:invalidEmail"))
      return
    }

    setIsSubmitting(true)
    const result = await signIn(email.trim(), password)
    setIsSubmitting(false)

    if (!result.ok) setLocalError(result.error)
  }

  return (
    <Screen
      preset="auto"
      keyboardShouldPersistTaps="never"
      safeAreaEdges={["top", "bottom"]}
      contentContainerStyle={themed($container)}
    >
      <Text tx="signInScreen:title" preset="heading" style={themed($title)} />
      <Text tx="signInScreen:subtitle" style={themed($subtitle)} />

      <TextField
        labelTx="signInScreen:emailLabel"
        accessibilityLabel="Email"
        testID="email-input"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        keyboardType="email-address"
        containerStyle={themed($field)}
      />
      <TextField
        labelTx="signInScreen:passwordLabel"
        accessibilityLabel="Password"
        testID="password-input"
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        autoComplete="password"
        autoCorrect={false}
        secureTextEntry
        containerStyle={themed($field)}
      />

      {!!(localError || authError) && (
        <Text
          text={localError || authError || ""}
          accessibilityRole="alert"
          testID="sign-in-error"
          style={themed($error)}
        />
      )}

      <Button
        tx={isSubmitting ? "signInScreen:signingInButton" : "signInScreen:signInButton"}
        accessibilityLabel="Submit sign in"
        testID="sign-in-submit-button"
        preset="reversed"
        disabled={isSubmitting}
        onPress={handleSignIn}
        style={themed($primaryButton)}
      />
      <View style={themed($secondaryActionRow)}>
        <Button
          tx="signInScreen:createAccountButton"
          accessibilityLabel="Navigate to create account"
          testID="sign-in-create-account-button"
          onPress={() => navigation.navigate("SignUp")}
          style={themed($linkButton)}
          textStyle={themed($linkButtonText)}
        />
        <Button
          tx="signInScreen:forgotPasswordButton"
          accessibilityLabel="Navigate to forgot password"
          testID="sign-in-forgot-password-button"
          onPress={() => navigation.navigate("ForgotPassword")}
          style={themed($linkButton)}
          textStyle={themed($linkButtonText)}
        />
      </View>
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

const $primaryButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.xs,
})

const $secondaryActionRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
  marginTop: spacing.sm,
})

const $linkButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  minHeight: 40,
  borderWidth: 0,
  backgroundColor: "transparent",
  paddingHorizontal: spacing.xs,
})

const $linkButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
})

const $error: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.error,
  marginBottom: spacing.md,
})
