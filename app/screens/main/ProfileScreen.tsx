import { FC, useEffect, useState } from "react"
import { Image, ImageStyle, TextStyle, View, ViewStyle } from "react-native"
import * as ImagePicker from "expo-image-picker"
import { useNavigation } from "@react-navigation/native"

import { Button } from "@/components/Button"
import { InlineNotice } from "@/components/InlineNotice"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { useAuth } from "@/context/AuthContext"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { clearOwnAvatarPath, updateOwnAvatarPath } from "@/services/profiles/profileService"
import {
  createAvatarSignedUrl,
  getInitials,
  removeAvatarObject,
  uploadOwnAvatar,
} from "@/services/storage/avatarService"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export const ProfileScreen: FC = () => {
  const { themed } = useAppTheme()
  const navigation = useNavigation<AppStackScreenProps<"Main">["navigation"]>()
  const { profile, user, updateProfile, refreshProfile } = useAuth()
  const [displayName, setDisplayName] = useState("")
  const [summary, setSummary] = useState("")
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)

  useEffect(() => {
    setDisplayName(profile?.display_name ?? "")
    setSummary(profile?.summary ?? "")
  }, [profile?.display_name, profile?.summary])

  useEffect(() => {
    let isActive = true

    async function loadAvatar() {
      if (!profile?.avatar_path) {
        setAvatarUrl(null)
        return
      }

      const result = await createAvatarSignedUrl(profile.avatar_path)
      if (isActive) setAvatarUrl(result.ok ? result.data : null)
    }

    void loadAvatar()
    return () => {
      isActive = false
    }
  }, [profile?.avatar_path])

  async function saveProfile() {
    setMessage("")
    setError("")
    setIsSaving(true)

    const result = await updateProfile({
      display_name: displayName.trim(),
      summary: summary.trim(),
      is_first_login: false,
    })

    if (result.ok) setMessage("Profile saved")
    else setError(result.error)
    setIsSaving(false)
  }

  async function chooseAvatar() {
    if (!user) return
    setMessage("")
    setError("")

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    })

    if (picked.canceled || !picked.assets[0]) return

    setIsUploadingAvatar(true)
    try {
      const previousAvatarPath = profile?.avatar_path ?? null
      const upload = await uploadOwnAvatar({
        userId: user.id,
        uri: picked.assets[0].uri,
        mimeType: picked.assets[0].mimeType,
      })
      if (!upload.ok) {
        setError(upload.error)
        return
      }

      const update = await updateOwnAvatarPath(upload.data)
      if (!update.ok) {
        setError(update.error)
        return
      }

      await refreshProfile()
      if (previousAvatarPath && previousAvatarPath !== upload.data) {
        await removeAvatarObject(previousAvatarPath)
      }
      const signed = await createAvatarSignedUrl(upload.data)
      if (signed.ok) setAvatarUrl(signed.data)
      setMessage("Profile photo updated")
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  async function removeAvatar() {
    if (!profile?.avatar_path) return
    setMessage("")
    setError("")
    setIsUploadingAvatar(true)

    const cleared = await clearOwnAvatarPath()
    if (!cleared.ok) setError(cleared.error)
    if (cleared.ok) {
      await removeAvatarObject(profile.avatar_path)
      setAvatarUrl(null)
      await refreshProfile()
      setMessage("Profile photo removed")
    }

    setIsUploadingAvatar(false)
  }

  return (
    <Screen preset="auto" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      <View style={themed($header)}>
        <View style={themed($avatar)}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={$avatarImage} />
          ) : (
            <Text text={getInitials(displayName, profile?.email ?? "")} preset="bold" style={themed($avatarText)} />
          )}
        </View>
        <View style={themed($headerCopy)}>
          <Text text={displayName || "Your profile"} preset="heading" />
          <Text text="Help people understand the table vibe you bring." style={themed($muted)} />
        </View>
      </View>

      <View style={themed($row)}>
        <Button text={isUploadingAvatar ? "Updating..." : "Change photo"} disabled={isUploadingAvatar} onPress={() => void chooseAvatar()} style={themed($rowButton)} />
        {profile?.avatar_path ? <Button text="Remove" disabled={isUploadingAvatar} onPress={() => void removeAvatar()} style={themed($rowButton)} /> : null}
      </View>

      <TextField label="Display name" value={displayName} onChangeText={setDisplayName} />
      <TextField label="Bio" value={summary} onChangeText={setSummary} multiline placeholder="A short trust-building intro: interests, languages, and what kind of plans you like." />

      {!!message ? <InlineNotice variant="success" text={message} /> : null}
      {!!error ? <InlineNotice variant="error" text={error} /> : null}

      <Button text={isSaving ? "Saving..." : "Save profile"} disabled={isSaving} preset="reversed" onPress={() => void saveProfile()} />

      <View style={themed($settingsCard)}>
        <Text text="Safety and account" preset="subheading" />
        <Text text="Manage blocked users, password, privacy links, sign out, or delete your account." style={themed($muted)} />
        <Button text="Open settings" onPress={() => navigation.navigate("Settings")} />
      </View>
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
  padding: spacing.lg,
})

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  flexDirection: "row",
  gap: spacing.md,
})

const $avatar: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.palette.secondary500,
  borderRadius: 40,
  height: 80,
  justifyContent: "center",
  overflow: "hidden",
  width: 80,
})

const $avatarImage: ImageStyle = {
  height: 80,
  width: 80,
}

const $avatarText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  fontSize: 22,
})

const $headerCopy: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
})

const $rowButton: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $settingsCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderColor: colors.separator,
  borderRadius: 8,
  borderWidth: 1,
  gap: spacing.sm,
  padding: spacing.lg,
})
