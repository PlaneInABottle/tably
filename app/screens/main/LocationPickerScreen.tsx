import { FC, useState } from "react"
import { Keyboard, TextStyle, useWindowDimensions, View, ViewStyle } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation } from "@react-navigation/native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import MapView, { Marker, type MapPressEvent, type Region } from "react-native-maps"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { translate } from "@/i18n/translate"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { createSavedLocation, updateSavedLocation } from "@/services/location/locationService"
import type { Coordinate } from "@/services/location/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const defaultCoordinate: Coordinate = {
  latitude: 41.015137,
  longitude: 28.97953,
}

const regionForCoordinate = (coordinate: Coordinate): Region => ({
  ...coordinate,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
})

interface LocationPickerScreenProps extends AppStackScreenProps<"LocationPicker"> {}

export const LocationPickerScreen: FC<LocationPickerScreenProps> = ({ route }) => {
  const isEditMode = route.params?.mode === "edit"
  const locationId = route.params?.locationId
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const { top, bottom } = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const navigation = useNavigation<AppStackScreenProps<"LocationPicker">["navigation"]>()
  const initialCoordinate = {
    latitude: route.params?.initialLatitude ?? defaultCoordinate.latitude,
    longitude: route.params?.initialLongitude ?? defaultCoordinate.longitude,
  }
  const [coordinate, setCoordinate] = useState<Coordinate>(initialCoordinate)
  const [label, setLabel] = useState(route.params?.initialLabel ?? "")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")

  const trimmedLabel = label.trim()
  const canSave = trimmedLabel.length > 0 && trimmedLabel.length <= 80 && !isSaving

  function updateCoordinate(event: MapPressEvent) {
    setCoordinate(event.nativeEvent.coordinate)
  }

  async function saveLocation() {
    Keyboard.dismiss()

    if (!canSave) {
      setError(translate("locationPickerScreen:labelRequired"))
      return
    }

    setError("")
    setIsSaving(true)

    if (isEditMode && !locationId) {
      setError(translate("locationPickerScreen:missingLocationId"))
      setIsSaving(false)
      return
    }

    const result = isEditMode
      ? await updateSavedLocation(locationId!, { label: trimmedLabel, coordinate })
      : await createSavedLocation({ label: trimmedLabel, coordinate })
    setIsSaving(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    navigation.goBack()
  }

  return (
    <View testID="location-picker-screen" style={themed($container(top))}>
      <View style={themed($mapShell)}>
        <View style={themed($mapHintCard)}>
          <Ionicons name="location-outline" size={16} color={colors.tint} />
          <Text
            tx={isEditMode ? "locationPickerScreen:subtitleEdit" : "locationPickerScreen:subtitle"}
            style={themed($mapHint)}
          />
        </View>
        <MapView
          testID="location-picker-map"
          style={themed($map(mapHeight(windowHeight)))}
          initialRegion={regionForCoordinate(initialCoordinate)}
          onPress={updateCoordinate}
        >
          <Marker
            testID="location-picker-marker"
            draggable
            coordinate={coordinate}
            title={translate("locationPickerScreen:markerTitle")}
            onDragEnd={(event) => setCoordinate(event.nativeEvent.coordinate)}
          />
        </MapView>
      </View>
      <KeyboardAwareScrollView
        bottomOffset={bottom}
        keyboardShouldPersistTaps="handled"
        style={themed($panel)}
        contentContainerStyle={themed($panelBottomInset(bottom))}
      >
        <Text
          tx={isEditMode ? "locationPickerScreen:editTitle" : "locationPickerScreen:title"}
          preset="heading"
          style={themed($title)}
        />
        <TextField
          labelTx="locationPickerScreen:labelLabel"
          accessibilityLabel="Saved location label"
          testID="location-picker-label-input"
          value={label}
          onChangeText={setLabel}
          maxLength={80}
          helper={translate("locationPickerScreen:labelCounter", {
            count: label.length,
            max: 80,
          })}
          containerStyle={themed($field)}
        />
        <Text
          text={`${coordinate.latitude.toFixed(4)}, ${coordinate.longitude.toFixed(4)}`}
          style={themed($metadata)}
        />
        {!!error && (
          <Text
            text={error}
            accessibilityRole="alert"
            testID="location-picker-error"
            style={themed($error)}
          />
        )}
        <View style={themed($buttonRow)}>
          <Button
            tx="locationPickerScreen:save"
            accessibilityLabel="Save saved location"
            testID="location-picker-save-button"
            preset="reversed"
            disabled={!canSave}
            onPress={saveLocation}
            style={themed($button)}
          />
          <Button
            tx="locationPickerScreen:cancel"
            accessibilityLabel="Cancel saved location"
            testID="location-picker-cancel-button"
            onPress={() => navigation.goBack()}
            style={themed($button)}
          />
        </View>
      </KeyboardAwareScrollView>
    </View>
  )
}

const $container: (topInset: number) => ThemedStyle<ViewStyle> = (topInset) => () => ({
  flex: 1,
  paddingTop: topInset,
})

const $mapShell: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  paddingHorizontal: spacing.md,
  marginBottom: spacing.xs,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
  gap: spacing.sm,
})

const $mapHintCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "flex-start",
  gap: spacing.sm,
  paddingHorizontal: spacing.md,
  marginBottom: spacing.xs,
})

const $map: (height: number) => ThemedStyle<ViewStyle> = (height) => () => ({
  height,
  borderRadius: 18,
  minHeight: 300,
  width: "100%",
  overflow: "hidden",
})

const mapHeight = (windowHeight: number): number => {
  const preferredHeight = Math.round(windowHeight * 0.58)
  if (preferredHeight < 320) return 320
  if (preferredHeight > 470) return 470
  return preferredHeight
}

const $mapHint: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  flex: 1,
})

const $panel: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  padding: spacing.lg,
  borderTopLeftRadius: 24,
  borderTopRightRadius: 24,
  backgroundColor: colors.background,
  borderTopColor: colors.separator,
  borderTopWidth: 1,
})

const $panelBottomInset =
  (bottomInset: number): ThemedStyle<ViewStyle> =>
  ({ spacing }) => ({
    paddingBottom: bottomInset + spacing.lg,
  })

const $title: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginBottom: spacing.xs,
})

const $metadata: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textDim,
  marginBottom: spacing.sm,
})

const $field: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.md,
})

const $error: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.error,
  marginBottom: spacing.md,
})

const $buttonRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
})

const $button: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})
