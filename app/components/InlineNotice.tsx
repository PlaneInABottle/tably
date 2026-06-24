import { ComponentProps, FC } from "react"
import { StyleProp, TextStyle, View, ViewStyle } from "react-native"
import { Ionicons } from "@expo/vector-icons"

import { useAppTheme } from "@/theme/context"
import type { Colors, ThemedStyle } from "@/theme/types"

import { Text } from "./Text"

type NoticeVariant = "success" | "error" | "info"

interface InlineNoticeProps {
  text: string
  testID?: string
  variant?: NoticeVariant
  style?: StyleProp<ViewStyle>
}

interface NoticeTone {
  backgroundColor: string
  borderColor: string
  foregroundColor: string
  iconName: ComponentProps<typeof Ionicons>["name"]
}

export const InlineNotice: FC<InlineNoticeProps> = ({ text, testID, variant = "info", style }) => {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const tone = getNoticeTone(variant, colors)

  return (
    <View
      accessibilityRole="alert"
      testID={testID}
      style={[
        themed($notice),
        {
          backgroundColor: tone.backgroundColor,
          borderColor: tone.borderColor,
        },
        style,
      ]}
    >
      <Ionicons name={tone.iconName} size={18} color={tone.foregroundColor} />
      <Text
        text={text}
        size="xs"
        weight="medium"
        style={[$noticeText, { color: tone.foregroundColor }]}
      />
    </View>
  )
}

function getNoticeTone(variant: NoticeVariant, colors: Colors): NoticeTone {
  if (variant === "success") {
    return {
      backgroundColor: colors.palette.secondary100,
      borderColor: colors.palette.secondary200,
      foregroundColor: colors.palette.secondary500,
      iconName: "checkmark-circle",
    }
  }

  if (variant === "error") {
    return {
      backgroundColor: colors.errorBackground,
      borderColor: colors.palette.angry100,
      foregroundColor: colors.error,
      iconName: "alert-circle",
    }
  }

  return {
    backgroundColor: colors.palette.neutral100,
    borderColor: colors.palette.neutral300,
    foregroundColor: colors.textDim,
    iconName: "information-circle",
  }
}

const $notice: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "flex-start",
  borderRadius: 8,
  borderWidth: 1,
  flexDirection: "row",
  gap: spacing.xs,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
})

const $noticeText: TextStyle = {
  flex: 1,
}
