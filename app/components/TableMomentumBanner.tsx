import { TextStyle, View, ViewStyle } from "react-native"
import { Ionicons } from "@expo/vector-icons"

import { Text } from "@/components/Text"
import { getMomentumMessage } from "@/services/tables/tableUtils"
import type { MemberStatus } from "@/services/tables/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

type TableMomentumBannerProps = {
  status?: MemberStatus | null
  introDueAt?: string | null
  confirmDueAt?: string | null
  compact?: boolean
}

export function TableMomentumBanner({
  status,
  introDueAt,
  confirmDueAt,
  compact = false,
}: TableMomentumBannerProps) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const message = getMomentumMessage(status, introDueAt, confirmDueAt)

  return (
    <View style={themed([$container, compact && $compactContainer])}>
      <Ionicons name="flash" size={compact ? 14 : 18} color={colors.tint} />
      <Text
        text={message}
        size={compact ? "xxs" : "sm"}
        preset="bold"
        style={themed($copy)}
        numberOfLines={compact ? 1 : 2}
      />
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  alignItems: "center",
  backgroundColor: colors.palette.neutral200,
  borderColor: colors.separator,
  borderRadius: 8,
  borderWidth: 1,
  flexDirection: "row",
  gap: spacing.xs,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.sm,
})

const $compactContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.xs,
  paddingVertical: spacing.xxxs,
})

const $copy: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  flex: 1,
})
