import { FC, useMemo, useState } from "react"
import { Pressable, TextStyle, View, ViewStyle } from "react-native"
import * as Location from "expo-location"

import { Button } from "@/components/Button"
import { InlineNotice } from "@/components/InlineNotice"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import type { MainTabScreenProps } from "@/navigators/navigationTypes"
import { createSocialTable } from "@/services/tables/tableService"
import { formatActivityLabel } from "@/services/tables/tableUtils"
import { ACTIVITY_TYPES, type ActivityType } from "@/services/tables/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

interface CreateTableScreenProps extends MainTabScreenProps<"CreateTable"> {}

const DEFAULT_COORDINATE = { latitude: 41.015137, longitude: 28.97953 }
const VIBES = ["Chill", "Talkative", "Beginner friendly", "Focused", "Spontaneous"]
const TIMES = ["18:30", "19:30", "20:30", "21:30"]

function buildStartsAt(day: "today" | "tomorrow", time: string): string {
  const [hours, minutes] = time.split(":").map(Number)
  const date = new Date()
  if (day === "tomorrow") date.setDate(date.getDate() + 1)
  date.setHours(hours, minutes, 0, 0)
  return date.toISOString()
}

export const CreateTableScreen: FC<CreateTableScreenProps> = ({ navigation }) => {
  const { themed } = useAppTheme()
  const [activity, setActivity] = useState<ActivityType>("coffee")
  const [day, setDay] = useState<"today" | "tomorrow">("today")
  const [time, setTime] = useState("19:30")
  const [title, setTitle] = useState("Coffee table")
  const [areaLabel, setAreaLabel] = useState("Kadikoy")
  const [note, setNote] = useState("")
  const [vibe, setVibe] = useState("Chill")
  const [maxSeats, setMaxSeats] = useState(5)
  const [coordinate, setCoordinate] = useState(DEFAULT_COORDINATE)
  const [error, setError] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [locationMessage, setLocationMessage] = useState("")

  const startsAt = useMemo(() => buildStartsAt(day, time), [day, time])

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
    setLocationMessage("Using your current location.")
  }

  async function save() {
    setError("")
    setIsSaving(true)
    const result = await createSocialTable({
      activity,
      title: title.trim() || `${formatActivityLabel(activity)} table`,
      note,
      vibe,
      areaLabel: areaLabel.trim() || "Nearby",
      startsAt,
      coordinate,
      minSeats: 3,
      maxSeats,
      introPrompt: "What are you hoping this plan feels like?",
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
        <Text text={title.trim() || `${formatActivityLabel(activity)} table`} preset="heading" />
        <Text
          text={`${day === "today" ? "Today" : "Tomorrow"} ${time} · ${areaLabel || "Nearby"}`}
        />
        <View style={themed($previewMeta)}>
          <Text text={vibe} size="xs" preset="bold" />
          <Text text={`${maxSeats} seats`} size="xs" preset="bold" />
          <Text text="Intro + confirmation required" size="xs" preset="bold" />
        </View>
      </View>

      <View style={themed($section)}>
        <Text text="Activity" preset="bold" />
        <View style={themed($chips)}>
          {ACTIVITY_TYPES.map((item) => (
            <Pressable
              key={item}
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
        <Text text="When" preset="bold" />
        <View style={themed($chips)}>
          {(["today", "tomorrow"] as const).map((item) => (
            <Pressable
              key={item}
              onPress={() => setDay(item)}
              style={themed([$chip, day === item && $chipActive])}
            >
              <Text
                text={item === "today" ? "Today" : "Tomorrow"}
                size="xs"
                preset="bold"
                style={themed(day === item ? $chipTextActive : $chipText)}
              />
            </Pressable>
          ))}
          {TIMES.map((item) => (
            <Pressable
              key={item}
              onPress={() => setTime(item)}
              style={themed([$chip, time === item && $chipActive])}
            >
              <Text
                text={item}
                size="xs"
                preset="bold"
                style={themed(time === item ? $chipTextActive : $chipText)}
              />
            </Pressable>
          ))}
        </View>
      </View>

      <View style={themed($section)}>
        <Text text="Vibe and seats" preset="bold" />
        <View style={themed($chips)}>
          {VIBES.map((item) => (
            <Pressable
              key={item}
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
          {[3, 4, 5, 6].map((item) => (
            <Pressable
              key={item}
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
      <Button text="Use current location" onPress={() => void applyCurrentLocation()} />
      {!!locationMessage ? <InlineNotice variant="success" text={locationMessage} /> : null}
      {!!error ? <InlineNotice variant="error" text={error} /> : null}
      <Button
        text={isSaving ? "Creating..." : "Create table"}
        accessibilityLabel="Submit table"
        testID="create-table-submit-button"
        disabled={isSaving}
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
  gap: spacing.xs,
  padding: spacing.lg,
})

const $previewMeta: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.sm,
})

const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})

const $chips: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.sm,
})

const $chip: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderColor: colors.separator,
  borderRadius: 999,
  borderWidth: 1,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs,
})

const $chipActive: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.tint,
  borderColor: colors.tint,
})

const $chipText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $chipTextActive: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})
