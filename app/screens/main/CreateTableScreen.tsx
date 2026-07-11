import { FC, useMemo, useRef, useState } from "react"
import { Pressable, TextStyle, View, ViewStyle } from "react-native"
import * as Location from "expo-location"
import MapView, { Marker, type MapPressEvent } from "react-native-maps"

import { Button } from "@/components/Button"
import { InlineNotice } from "@/components/InlineNotice"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import type { MainTabScreenProps } from "@/navigators/navigationTypes"
import { createSocialTable } from "@/services/tables/tableService"
import {
  buildTableStartsAt,
  formatActivityLabel,
  getInitialTableSchedule,
  isTableStartValid,
  TABLE_TIME_OPTIONS,
  type TableDay,
} from "@/services/tables/tableUtils"
import { ACTIVITY_TYPES, type ActivityType } from "@/services/tables/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

interface CreateTableScreenProps extends MainTabScreenProps<"CreateTable"> {}

const DEFAULT_COORDINATE = { latitude: 40.9917, longitude: 29.0277 }
const VIBES = ["Chill", "Talkative", "Beginner friendly", "Focused", "Spontaneous"]

export const CreateTableScreen: FC<CreateTableScreenProps> = ({ navigation }) => {
  const { themed } = useAppTheme()
  const mapRef = useRef<MapView>(null)
  const [initialSchedule] = useState(getInitialTableSchedule)
  const [activity, setActivity] = useState<ActivityType>("coffee")
  const [day, setDay] = useState<TableDay>(initialSchedule.day)
  const [time, setTime] = useState(initialSchedule.time)
  const [title, setTitle] = useState("Coffee table")
  const [areaLabel, setAreaLabel] = useState("Kadikoy")
  const [note, setNote] = useState("")
  const [vibe, setVibe] = useState("Chill")
  const [maxSeats, setMaxSeats] = useState(5)
  const [introPrompt, setIntroPrompt] = useState("What would make this plan enjoyable for you?")
  const [coordinate, setCoordinate] = useState(DEFAULT_COORDINATE)
  const [error, setError] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [locationMessage, setLocationMessage] = useState("")

  const startsAt = useMemo(() => buildTableStartsAt(day, time), [day, time])
  const hasAvailableTodayTime = TABLE_TIME_OPTIONS.some((option) =>
    isTableStartValid(buildTableStartsAt("today", option)),
  )

  function selectDay(nextDay: TableDay) {
    setDay(nextDay)
    if (nextDay !== "today" || isTableStartValid(buildTableStartsAt(nextDay, time))) return

    const nextTime = TABLE_TIME_OPTIONS.find((option) =>
      isTableStartValid(buildTableStartsAt(nextDay, option)),
    )
    if (nextTime) setTime(nextTime)
  }

  function selectMeetingPoint(event: MapPressEvent) {
    setCoordinate(event.nativeEvent.coordinate)
    setLocationMessage("Meeting point updated.")
  }

  async function applyCurrentLocation() {
    setError("")
    setLocationMessage("")
    const permission = await Location.requestForegroundPermissionsAsync()
    if (permission.status !== "granted") {
      setError("Location permission is needed to place this table nearby.")
      return
    }

    const current = await Location.getCurrentPositionAsync({})
    setCoordinate({
      latitude: current.coords.latitude,
      longitude: current.coords.longitude,
    })
    mapRef.current?.animateToRegion(
      {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        latitudeDelta: 0.025,
        longitudeDelta: 0.025,
      },
      350,
    )
    setLocationMessage("Using your current location.")
  }

  async function save() {
    setError("")
    if (!title.trim() || !areaLabel.trim()) {
      setError("Add a title and area before creating this table.")
      return
    }
    if (!isTableStartValid(startsAt)) {
      setError("Choose a start time at least 15 minutes from now.")
      return
    }
    if (!introPrompt.trim()) {
      setError("Add an intro question for people joining your table.")
      return
    }

    setIsSaving(true)
    const result = await createSocialTable({
      activity,
      title: title.trim(),
      note,
      vibe,
      areaLabel: areaLabel.trim(),
      startsAt,
      coordinate,
      minSeats: 3,
      maxSeats,
      introPrompt: introPrompt.trim(),
    })
    setIsSaving(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    navigation.navigate("TableDetail", { tableId: result.data.id })
  }

  return (
    <Screen preset="auto" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      <Text text="Create a table" preset="heading" />
      <Text
        text="Keep it structured. Tably will handle the prompts and confirmations."
        style={themed($muted)}
      />

      <View style={themed($previewCard)}>
        <Text text={formatActivityLabel(activity)} size="xs" preset="bold" style={themed($muted)} />
        <Text
          text={title.trim() || `${formatActivityLabel(activity)} table`}
          preset="subheading"
          numberOfLines={1}
        />
        <Text
          text={`${day === "today" ? "Today" : "Tomorrow"} ${time} · ${areaLabel || "Nearby"}`}
          size="sm"
          numberOfLines={1}
        />
        <Text text={`${vibe} · ${maxSeats} seats · Join question`} size="xs" preset="bold" />
      </View>

      <View style={themed($section)}>
        <Text text="Activity" preset="bold" />
        <View style={themed($chips)}>
          {ACTIVITY_TYPES.map((item) => (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityState={{ selected: activity === item }}
              accessibilityLabel={`${formatActivityLabel(item)} activity`}
              onPress={() => {
                setActivity(item)
                setTitle(`${formatActivityLabel(item)} table`)
              }}
              style={themed([$chip, activity === item && $chipActive])}
            >
              <Text
                text={formatActivityLabel(item)}
                size="xs"
                preset="bold"
                style={themed(activity === item ? $chipTextActive : $chipText)}
              />
            </Pressable>
          ))}
        </View>
      </View>

      <View style={themed($section)}>
        <TextField label="Title" value={title} onChangeText={setTitle} />
        <TextField
          label="Area"
          value={areaLabel}
          onChangeText={setAreaLabel}
          placeholder="Kadikoy, Moda, Nisantasi..."
        />
      </View>

      <View style={themed($section)}>
        <Text text="Meeting point" preset="bold" />
        <MapView
          ref={mapRef}
          initialRegion={{
            ...DEFAULT_COORDINATE,
            latitudeDelta: 0.025,
            longitudeDelta: 0.025,
          }}
          onPress={selectMeetingPoint}
          testID="create-table-location-map"
          style={themed($locationMap)}
        >
          <Marker
            coordinate={coordinate}
            draggable
            onDragEnd={(event) => setCoordinate(event.nativeEvent.coordinate)}
          />
        </MapView>
        <Button text="Use current location" onPress={() => void applyCurrentLocation()} />
        {!!locationMessage ? <InlineNotice variant="success" text={locationMessage} /> : null}
      </View>

      <View style={themed($section)}>
        <Text text="When" preset="bold" />
        <View style={themed($chips)}>
          {(["today", "tomorrow"] as const).map((item) => (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityState={{
                disabled: item === "today" && !hasAvailableTodayTime,
                selected: day === item,
              }}
              disabled={item === "today" && !hasAvailableTodayTime}
              onPress={() => selectDay(item)}
              style={themed([
                $chip,
                item === "today" && !hasAvailableTodayTime && $chipDisabled,
                day === item && $chipActive,
              ])}
            >
              <Text
                text={item === "today" ? "Today" : "Tomorrow"}
                size="xs"
                preset="bold"
                style={themed(day === item ? $chipTextActive : $chipText)}
              />
            </Pressable>
          ))}
          {TABLE_TIME_OPTIONS.map((item) => {
            const disabled = !isTableStartValid(buildTableStartsAt(day, item))
            return (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ disabled, selected: time === item }}
                accessibilityLabel={`${item} start time`}
                disabled={disabled}
                onPress={() => setTime(item)}
                style={themed([$chip, disabled && $chipDisabled, time === item && $chipActive])}
              >
                <Text
                  text={item}
                  size="xs"
                  preset="bold"
                  style={themed(time === item ? $chipTextActive : $chipText)}
                />
              </Pressable>
            )
          })}
        </View>
      </View>

      <View style={themed($section)}>
        <Text text="Vibe and seats" preset="bold" />
        <View style={themed($chips)}>
          {VIBES.map((item) => (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityState={{ selected: vibe === item }}
              accessibilityLabel={`${item} vibe`}
              onPress={() => setVibe(item)}
              style={themed([$chip, vibe === item && $chipActive])}
            >
              <Text
                text={item}
                size="xs"
                preset="bold"
                style={themed(vibe === item ? $chipTextActive : $chipText)}
              />
            </Pressable>
          ))}
          {[3, 4, 5, 6, 7, 8].map((item) => (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityState={{ selected: maxSeats === item }}
              accessibilityLabel={`${item} seats`}
              onPress={() => setMaxSeats(item)}
              style={themed([$chip, maxSeats === item && $chipActive])}
            >
              <Text
                text={`${item} seats`}
                size="xs"
                preset="bold"
                style={themed(maxSeats === item ? $chipTextActive : $chipText)}
              />
            </Pressable>
          ))}
        </View>
      </View>

      <TextField
        label="What should people know?"
        value={note}
        onChangeText={setNote}
        multiline
        placeholder="Example: easy pace, subtitles, casual after-work coffee."
      />
      <TextField
        label="Question for people joining"
        value={introPrompt}
        onChangeText={setIntroPrompt}
        multiline
        placeholder="What would you like to know before meeting?"
      />
      {!!error ? <InlineNotice variant="error" text={error} /> : null}
      <Button
        text={isSaving ? "Creating..." : "Create table"}
        accessibilityLabel="Submit table"
        testID="create-table-submit-button"
        disabled={isSaving || !title.trim() || !areaLabel.trim() || !introPrompt.trim()}
        preset="reversed"
        onPress={() => void save()}
      />
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
  padding: spacing.lg,
})

const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $previewCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral100,
  borderColor: colors.separator,
  borderRadius: 8,
  borderWidth: 1,
  gap: spacing.xxs,
  padding: spacing.md,
})

const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})

const $locationMap: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 8,
  height: 180,
  overflow: "hidden",
})

const $chips: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.sm,
})

const $chip: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderColor: colors.separator,
  borderRadius: 8,
  borderWidth: 1,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs,
})

const $chipActive: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.tint,
  borderColor: colors.tint,
})

const $chipDisabled: ThemedStyle<ViewStyle> = () => ({ opacity: 0.4 })

const $chipText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $chipTextActive: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})
