import { FC, useCallback, useEffect, useState } from "react"
import { Alert, Image, ImageStyle, Pressable, TextStyle, View, ViewStyle } from "react-native"
import * as ImagePicker from "expo-image-picker"
import { Ionicons } from "@expo/vector-icons"
import { useFocusEffect, useNavigation } from "@react-navigation/native"

import { Button } from "@/components/Button"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { useAuth } from "@/context/AuthContext"
import { translate } from "@/i18n/translate"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import {
  deleteSavedLocation,
  listOwnSavedLocations,
  unshareSavedLocationFromMap,
  shareSavedLocationOnMap,
} from "@/services/location/locationService"
import type { SavedLocation } from "@/services/location/types"
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
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const { profile, user, updateProfile, refreshProfile } = useAuth()
  const navigation = useNavigation<AppStackScreenProps<"LocationPicker">["navigation"]>()
  const [displayName, setDisplayName] = useState("")
  const [summary, setSummary] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([])
  const [savedLocationsMessage, setSavedLocationsMessage] = useState("")

  useEffect(() => {
    setDisplayName(profile?.display_name ?? "")
    setSummary(profile?.summary ?? "")
  }, [profile?.display_name, profile?.summary])

  useFocusEffect(
    useCallback(() => {
      let isActive = true
      void (async () => {
        const result = await listOwnSavedLocations()
        if (!isActive) return
        if (result.ok) setSavedLocations(result.data)
      })()
      return () => {
        isActive = false
      }
    }, []),
  )

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

    if (displayName.length > 80) {
      setError(translate("profileScreen:displayNameTooLong"))
      setIsSaving(false)
      return
    }

    if (summary.length > 500) {
      setError(translate("profileScreen:summaryTooLong"))
      setIsSaving(false)
      return
    }

    const result = await updateProfile({
      display_name: displayName,
      summary,
      is_first_login: false,
    })
    if (result.ok) setMessage(translate("profileScreen:saved"))
    if (!result.ok) setError(result.error)
    setIsSaving(false)
  }

  async function chooseAvatar() {
    if (!user) return

    setMessage("")
    setError("")

    // No permission pre-check needed — expo-image-picker handles it on iOS 11+
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    })

    if (picked.canceled || !picked.assets[0]) return

    // Only NOW set the loading state — the upload is actually starting
    setIsUploadingAvatar(true)
    try {
      const asset = picked.assets[0]
      const previousAvatarPath = profile?.avatar_path ?? null
      const upload = await uploadOwnAvatar({
        userId: user.id,
        uri: asset.uri,
        mimeType: asset.mimeType,
      })
      if (!upload.ok) {
        setError(upload.error)
        return
      }

      const update = await updateOwnAvatarPath(upload.data)
      if (!update.ok) setError(update.error)
      if (update.ok) {
        await refreshProfile()
        if (previousAvatarPath && previousAvatarPath !== upload.data) {
          await removeAvatarObject(previousAvatarPath)
        }
        // Bypass the [profile?.avatar_path] useEffect dep: when the user
        // re-uploads a file with the same extension (e.g. PNG over PNG),
        // the path string is unchanged, so the effect never re-fires and
        // the <Image> keeps showing stale bytes from RN's image cache. We
        // just wrote a brand-new storage object at `upload.data` — sign a
        // URL for it and assign explicitly.
        const signed = await createAvatarSignedUrl(upload.data)
        if (signed.ok) setAvatarUrl(signed.data)
        setMessage(translate("profileScreen:avatarUpdated"))
      }
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
      setMessage(translate("profileScreen:avatarRemoved"))
    }

    setIsUploadingAvatar(false)
  }

  function openLocationPicker() {
    navigation.navigate("LocationPicker", { returnTo: "Profile", mode: "create" })
  }

  function openLocationPickerForEdit(location: SavedLocation) {
    navigation.navigate("LocationPicker", {
      returnTo: "Profile",
      mode: "edit",
      locationId: location.id,
      initialLabel: location.label,
      initialLatitude: location.coordinate.latitude,
      initialLongitude: location.coordinate.longitude,
    })
  }

  async function markAsUserLocation(locationId: string) {
    setSavedLocationsMessage("")
    setError("")
    const result = await shareSavedLocationOnMap(locationId)
    if (!result.ok) {
      setError(result.error)
      return
    }

    setSavedLocations((prev) =>
      prev.map((location) => ({
        ...location,
        isPublicMapLocation: location.id === locationId,
      })),
    )
    setSavedLocationsMessage(translate("profileScreen:savedLocationSetAsMyUserLocation"))
  }

  async function clearUserLocation() {
    setSavedLocationsMessage("")
    setError("")
    const result = await unshareSavedLocationFromMap()
    if (!result.ok) {
      setError(result.error)
      return
    }

    setSavedLocations((prev) =>
      prev.map((location) => ({ ...location, isPublicMapLocation: false })),
    )
    setSavedLocationsMessage(translate("profileScreen:savedLocationUnsetAsMyUserLocation"))
  }

  function confirmRemoveSavedLocation(id: string) {
    Alert.alert(
      translate("profileScreen:deleteSavedLocation"),
      undefined,
      [
        { text: translate("common:cancel"), style: "cancel" },
        {
          text: translate("profileScreen:deleteSavedLocation"),
          style: "destructive",
          onPress: () => void removeSavedLocation(id),
        },
      ],
      { cancelable: true },
    )
  }

  async function removeSavedLocation(id: string) {
    setSavedLocationsMessage("")
    setError("")
    const result = await deleteSavedLocation(id)
    if (result.ok) {
      setSavedLocations((prev) => prev.filter((loc) => loc.id !== id))
      setSavedLocationsMessage(translate("profileScreen:savedLocationDeleted"))
    } else {
      setError(result.error)
    }
  }

  function renderNoSavedLocations() {
    return (
      <View testID="profile-saved-locations-empty" style={themed($noSavedLocationsCard)}>
        <Text tx="profileScreen:noSavedLocations" size="sm" style={themed($noSavedLocationsText)} />
      </View>
    )
  }

  function renderSavedLocationRow(loc: SavedLocation) {
    const userActionLabel = loc.isPublicMapLocation
      ? "profileScreen:removeAsMyUserLocationShort"
      : "profileScreen:setAsMyUserLocationShort"
    const userActionA11yLabel = loc.isPublicMapLocation
      ? "profileScreen:removeAsMyUserLocationA11y"
      : "profileScreen:setAsMyUserLocationA11y"
    const userActionIcon = loc.isPublicMapLocation ? "close-circle-outline" : "star-outline"
    return (
      <View
        key={loc.id}
        testID={`profile-saved-location-${loc.id}`}
        style={themed($savedLocationRow)}
      >
        <View style={themed($savedLocationRowHeader)}>
          <Ionicons name="location-outline" size={18} color={colors.tint} />
          <View style={themed($savedLocationRowText)}>
            <Text text={loc.label} preset="bold" numberOfLines={2} />
            <Text
              text={`${loc.coordinate.latitude.toFixed(4)}, ${loc.coordinate.longitude.toFixed(4)}`}
              size="xs"
              style={themed($savedLocationCoords)}
            />
          </View>
        </View>
        {loc.isPublicMapLocation ? (
          <View style={themed($savedLocationBadgeRow)}>
            <View style={themed($myUserLocationBadge)}>
              <Ionicons name="person" size={12} color={colors.palette.neutral100} />
              <Text
                numberOfLines={1}
                tx="profileScreen:shownAsMyUserLocation"
                size="xxs"
                style={themed($shownAsUserLocationText)}
              />
            </View>
          </View>
        ) : null}
        <View style={themed($savedLocationActions)}>
          <Pressable
            testID={`profile-saved-location-${loc.isPublicMapLocation ? "remove-user" : "make-user"}-${loc.id}`}
            accessibilityLabel={translate(userActionA11yLabel)}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() =>
              void (loc.isPublicMapLocation ? clearUserLocation() : markAsUserLocation(loc.id))
            }
            style={themed([
              $locationActionButton,
              {
                borderColor: colors.tint,
              },
            ])}
          >
            <Ionicons name={userActionIcon} size={14} color={colors.tint} />
            <Text
              numberOfLines={1}
              tx={userActionLabel}
              size="xxs"
              style={themed($locationActionPrimaryText)}
            />
          </Pressable>
          <Pressable
            testID={`profile-saved-location-edit-${loc.id}`}
            accessibilityLabel={translate("profileScreen:editSavedLocation")}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => openLocationPickerForEdit(loc)}
            style={themed($locationActionButton)}
          >
            <Ionicons name="create-outline" size={14} color={colors.textDim} />
            <Text
              numberOfLines={1}
              tx="profileScreen:editSavedLocation"
              size="xxs"
              style={themed($locationActionDefaultText)}
            />
          </Pressable>
          <Pressable
            testID={`profile-saved-location-delete-${loc.id}`}
            accessibilityLabel={translate("profileScreen:deleteSavedLocation")}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => confirmRemoveSavedLocation(loc.id)}
            style={themed([
              $locationActionButton,
              {
                borderColor: colors.error,
              },
            ])}
          >
            <Ionicons name="trash-outline" size={14} color={colors.error} />
            <Text
              numberOfLines={1}
              tx="profileScreen:deleteSavedLocation"
              size="xxs"
              style={themed($locationActionDangerText)}
            />
          </Pressable>
        </View>
      </View>
    )
  }

  function renderSavedLocationsSection() {
    return (
      <View testID="profile-saved-locations-section" style={themed($savedLocationsSection)}>
        <Text
          tx="profileScreen:savedLocationsHeading"
          preset="subheading"
          style={themed($savedLocationsHeading)}
        />
        <Text
          tx="profileScreen:savedLocationsSubheading"
          size="sm"
          style={themed($savedLocationsSubheading)}
        />
        {savedLocations.length === 0 ? (
          renderNoSavedLocations()
        ) : (
          <View testID="profile-saved-location-list" style={themed($savedLocationsList)}>
            {savedLocations.map(renderSavedLocationRow)}
          </View>
        )}
        {!!savedLocationsMessage && (
          <Text
            text={savedLocationsMessage}
            accessibilityRole="alert"
            testID="profile-saved-locations-message"
            style={themed($savedLocationsMessage)}
          />
        )}
        <Button
          tx="profileScreen:addSavedLocation"
          accessibilityLabel="Profile add saved location"
          testID="profile-add-saved-location-button"
          onPress={openLocationPicker}
          style={themed($savedLocationsAddButton)}
        />
      </View>
    )
  }

  return (
    <Screen
      preset="auto"
      keyboardShouldPersistTaps="never"
      safeAreaEdges={["top"]}
      contentContainerStyle={themed($container)}
    >
      <Text tx="profileScreen:title" preset="heading" style={themed($title)} />
      <View style={themed($avatarSection)}>
        <View accessibilityLabel="Profile avatar" testID="profile-avatar" style={themed($avatar)}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={themed($avatarImage)} />
          ) : (
            <Text text={getInitials(displayName, profile?.email)} preset="heading" />
          )}
        </View>
        <View style={themed($avatarActions)}>
          <Button
            tx="profileScreen:uploadAvatar"
            accessibilityLabel="Profile avatar upload"
            testID="profile-avatar-upload-button"
            disabled={isUploadingAvatar}
            onPress={chooseAvatar}
          />
          {profile?.avatar_path ? (
            <Button
              tx="profileScreen:removeAvatar"
              accessibilityLabel="Profile avatar remove"
              testID="profile-avatar-remove-button"
              disabled={isUploadingAvatar}
              onPress={removeAvatar}
            />
          ) : null}
        </View>
      </View>
      <TextField
        labelTx="profileScreen:emailLabel"
        accessibilityLabel="Email"
        testID="profile-email-input"
        value={profile?.email ?? ""}
        editable={false}
        containerStyle={themed($field)}
      />
      <TextField
        labelTx="profileScreen:displayNameLabel"
        accessibilityLabel="Display name"
        testID="profile-display-name-input"
        value={displayName}
        onChangeText={setDisplayName}
        containerStyle={themed($field)}
      />
      <TextField
        labelTx="profileScreen:summaryLabel"
        accessibilityLabel="Summary"
        testID="profile-summary-input"
        value={summary}
        onChangeText={setSummary}
        multiline
        containerStyle={themed($field)}
      />
      {error ? (
        <Text
          text={error}
          accessibilityRole="alert"
          testID="profile-error"
          style={themed($error)}
        />
      ) : null}
      {message ? (
        <Text
          text={message}
          accessibilityRole="alert"
          testID="profile-success"
          style={themed($success)}
        />
      ) : null}
      <Button
        tx="profileScreen:save"
        accessibilityLabel="Save profile"
        testID="profile-save-button"
        disabled={isSaving || isUploadingAvatar}
        onPress={saveProfile}
      />
      {renderSavedLocationsSection()}
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

const $avatarSection: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  gap: spacing.md,
  marginBottom: spacing.xl,
})

const $avatar: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.palette.neutral200,
  borderColor: colors.separator,
  borderRadius: 56,
  borderWidth: 1,
  height: 112,
  justifyContent: "center",
  overflow: "hidden",
  width: 112,
})

const $avatarImage: ImageStyle = {
  height: "100%",
  width: "100%",
}

const $avatarActions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
  width: "100%",
})

const $field: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.md,
})

const $error: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.error,
  marginBottom: spacing.md,
})

const $success: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.tint,
  marginBottom: spacing.md,
})

const $savedLocationsSection: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.xl,
  gap: spacing.sm,
})

const $savedLocationsHeading: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginTop: spacing.xs,
})

const $savedLocationsSubheading: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textDim,
  marginBottom: spacing.md,
})

const $noSavedLocationsCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderColor: colors.separator,
  borderRadius: 12,
  borderWidth: 1,
  padding: spacing.md,
})

const $noSavedLocationsText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $savedLocationsList: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})

const $savedLocationRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.sm,
  borderColor: colors.separator,
  borderRadius: 12,
  borderWidth: 1,
  padding: spacing.md,
  backgroundColor: colors.background,
})

const $savedLocationRowHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "flex-start",
  gap: spacing.sm,
})

const $savedLocationRowText: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  minWidth: 0,
  gap: spacing.xs,
})

const $savedLocationActions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xs,
  alignItems: "center",
})

const $savedLocationBadgeRow: ThemedStyle<ViewStyle> = () => ({
  marginBottom: 2,
})

const $locationActionButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  flex: 1,
  gap: spacing.xs,
  justifyContent: "center",
  borderRadius: 10,
  borderWidth: 1,
  borderColor: colors.separator,
  paddingHorizontal: spacing.sm,
  paddingVertical: 6,
  minHeight: 30,
})

const $locationActionDefaultText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textAlign: "center",
})

const $locationActionPrimaryText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
  textAlign: "center",
})

const $locationActionDangerText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.error,
  textAlign: "center",
})

const $myUserLocationBadge: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  borderRadius: 999,
  paddingHorizontal: spacing.sm,
  paddingVertical: 4,
  backgroundColor: colors.tint,
})

const $shownAsUserLocationText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $savedLocationCoords: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $savedLocationsMessage: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.tint,
  marginTop: spacing.xs,
})

const $savedLocationsAddButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.md,
})
