import { TextStyle, View, ViewStyle } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export function MapMarkerLegend() {
  const { themed } = useAppTheme()
  const { top } = useSafeAreaInsets()

  return (
    <View testID="map-legend" style={themed($container(top))}>
      <View style={themed($item)}>
        <View style={themed([$dot, $personDot])} />
        <Text tx="mapScreen:legendPeople" size="xs" style={themed($label)} />
      </View>
      <View style={themed($item)}>
        <View style={themed([$dot, $eventDot])} />
        <Text tx="mapScreen:legendEvents" size="xs" style={themed($label)} />
      </View>
    </View>
  )
}

const $container =
  (topInset: number): ThemedStyle<ViewStyle> =>
  ({ colors, spacing }) => ({
    position: "absolute",
    left: spacing.md,
    top: topInset + spacing.md,
    borderRadius: 999,
    backgroundColor: colors.palette.neutral100,
    borderColor: colors.separator,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  })

const $item: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  flexDirection: "row",
  gap: spacing.xs,
})

const $dot: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 999,
  height: 10,
  width: 10,
})

const $personDot: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.tint,
})

const $eventDot: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.secondary500,
})

const $label: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})
