import { FC, useState } from "react"
import { Linking, Pressable, TextStyle, View, ViewStyle } from "react-native"

import { Button } from "@/components/Button"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { useAuth } from "@/context/AuthContext"
import { translate } from "@/i18n/translate"
import type { AuthStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

interface SignUpScreenProps extends AuthStackScreenProps<"SignUp"> {}

export const SignUpScreen: FC<SignUpScreenProps> = ({ navigation }) => {
  const { themed } = useAppTheme()
  const { signUp } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSignUp() {
    setError("")

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError(translate("signUpScreen:invalidEmail"))
      return
    }

    if (password.length < 6) {
      setError(translate("signUpScreen:passwordTooShort"))
      return
    }

    if (!acceptedTerms) {
      setError(translate("signUpScreen:termsRequired"))
      return
    }

    setIsSubmitting(true)
    const result = await signUp(email.trim(), password, displayName.trim())
    setIsSubmitting(false)

    if (!result.ok) setError(result.error)
  }

  return (
    <Screen
      preset="auto"
      keyboardShouldPersistTaps="never"
      safeAreaEdges={["top", "bottom"]}
      contentContainerStyle={themed($container)}
    >
      <Text tx="signUpScreen:title" preset="heading" style={themed($title)} />
      <Text tx="signUpScreen:subtitle" style={themed($subtitle)} />

      <TextField
        labelTx="signUpScreen:displayNameLabel"
        accessibilityLabel="Display name"
        testID="display-name-input"
        value={displayName}
        onChangeText={setDisplayName}
        containerStyle={themed($field)}
      />
      <TextField
        labelTx="signUpScreen:emailLabel"
        accessibilityLabel="Email"
        testID="email-input"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        containerStyle={themed($field)}
      />
      <TextField
        labelTx="signUpScreen:passwordLabel"
        accessibilityLabel="Password"
        testID="password-input"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="password"
        containerStyle={themed($field)}
      />

      <Pressable
        accessibilityLabel="Accept community terms"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: acceptedTerms }}
        testID="sign-up-terms-checkbox"
        onPress={() => setAcceptedTerms((value) => !value)}
        style={themed($termsRow)}
      >
        <View style={themed([$checkbox, acceptedTerms && $checkboxChecked])}>
          {acceptedTerms ? <Text text="✓" style={themed($checkboxMark)} /> : null}
        </View>
        <Text tx="signUpScreen:termsAgreement" size="sm" style={themed($termsText)} />
      </Pressable>
      <View style={themed($termsLinks)}>
        <Button
          tx="settingsScreen:terms"
          accessibilityLabel="Open terms"
          testID="sign-up-terms-link"
          onPress={() => Linking.openURL("https://tably.app/terms")}
          style={themed($inlineLinkButton)}
          textStyle={themed($linkButtonText)}
        />
        <Button
          tx="settingsScreen:privacy"
          accessibilityLabel="Open privacy policy"
          testID="sign-up-privacy-link"
          onPress={() => Linking.openURL("https://tably.app/privacy")}
          style={themed($inlineLinkButton)}
          textStyle={themed($linkButtonText)}
        />
      </View>

      {!!error && (
        <Text
          text={error}
          accessibilityRole="alert"
          testID="sign-up-error"
          style={themed($error)}
        />
      )}

      <Button
        tx={isSubmitting ? "signUpScreen:submittingButton" : "signUpScreen:submitButton"}
        accessibilityLabel="Submit create account"
        testID="sign-up-submit-button"
        preset="reversed"
        disabled={isSubmitting || !acceptedTerms}
        onPress={handleSignUp}
        style={themed($primaryButton)}
      />
      <Button
        tx="signUpScreen:backToSignIn"
        accessibilityLabel="Back to sign in"
        testID="sign-up-back-button"
        onPress={() => navigation.navigate("SignIn")}
        style={themed($linkButton)}
        textStyle={themed($linkButtonText)}
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

const $termsRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "flex-start",
  flexDirection: "row",
  gap: spacing.sm,
  marginBottom: spacing.xs,
})

const $checkbox: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  borderColor: colors.separator,
  borderRadius: 4,
  borderWidth: 1,
  height: 22,
  justifyContent: "center",
  marginTop: 1,
  width: 22,
})

const $checkboxChecked: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.tint,
  borderColor: colors.tint,
})

const $checkboxMark: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  lineHeight: 18,
})

const $termsText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  flex: 1,
})

const $termsLinks: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
  marginBottom: spacing.md,
})

const $inlineLinkButton: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "transparent",
  borderWidth: 0,
  minHeight: 32,
  paddingHorizontal: 0,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.xs,
})

const $linkButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 40,
  marginTop: spacing.sm,
  borderWidth: 0,
  backgroundColor: "transparent",
})

const $linkButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
})

const $error: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.error,
  marginBottom: spacing.md,
})
