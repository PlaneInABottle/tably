import { Image, ImageStyle, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const mark = require("@assets/images/app-icon-all.png")

export function BrandHeader() {
  const { themed } = useAppTheme()

  return (
    <View accessibilityLabel="Tably" style={themed($container)}>
      <Image source={mark} style={$mark} />
      <Text text="Tably" preset="heading" size="lg" />
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  flexDirection: "row",
  gap: spacing.sm,
  marginBottom: spacing.xl,
})

const $mark: ImageStyle = {
  borderRadius: 8,
  height: 52,
  width: 52,
}
