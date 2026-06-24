import { Pressable, TextStyle, ViewStyle } from "react-native"
import { Ionicons } from "@expo/vector-icons"

import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

type PillButtonProps = {
  iconName: React.ComponentProps<typeof Ionicons>["name"]
  label: string
  accessibilityLabel: string
  testID: string
  onPress: () => void
}

export function PillButton({
  iconName,
  label,
  accessibilityLabel,
  testID,
  onPress,
}: PillButtonProps) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      style={themed($pill)}
    >
      <Ionicons name={iconName} size={18} color={colors.tint} />
      <Text text={label} size="sm" style={themed($label)} />
    </Pressable>
  )
}

const $pill: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xxs,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  borderRadius: 999,
  backgroundColor: colors.palette.neutral100,
  shadowColor: colors.palette.neutral900,
  shadowOpacity: 0.25,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 2 },
  elevation: 4,
})

const $label: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})
