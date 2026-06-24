import { ComponentProps, useEffect, useRef, useState } from "react"
import { Animated, Easing, TextStyle, View, ViewStyle } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Text } from "@/components/Text"
import {
  subscribeToToasts,
  type AppToastMessage,
  type AppToastVariant,
} from "@/services/notifications/toastService"
import { useAppTheme } from "@/theme/context"
import type { Colors, ThemedStyle } from "@/theme/types"

const DEFAULT_TOAST_VISIBLE_MS = 3600

export function AppToasts() {
  const insets = useSafeAreaInsets()
  const { themed, theme } = useAppTheme()
  const [toast, setToast] = useState<AppToastMessage | null>(null)
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(-8)).current

  useEffect(() => {
    return subscribeToToasts(setToast)
  }, [])

  useEffect(() => {
    if (!toast) return

    opacity.setValue(0)
    translateY.setValue(-8)

    Animated.parallel([
      Animated.timing(opacity, {
        duration: 160,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        duration: 160,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start()

    const timeout = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          duration: 140,
          easing: Easing.in(Easing.cubic),
          toValue: 0,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          duration: 140,
          easing: Easing.in(Easing.cubic),
          toValue: -8,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setToast((current) => (current?.id === toast.id ? null : current))
      })
    }, toast.visibleMs ?? DEFAULT_TOAST_VISIBLE_MS)

    return () => clearTimeout(timeout)
  }, [opacity, toast, translateY])

  if (!toast) return null

  const top = Math.max(insets.top + theme.spacing.xs, theme.spacing.xxl)
  const tone = getToastTone(toast.variant)

  return (
    <View pointerEvents="box-none" style={[themed($container), { top }]}>
      <Animated.View
        accessibilityRole="alert"
        testID={toast.testID ?? `app-toast-${toast.variant}`}
        style={[
          themed($toast),
          {
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        <Ionicons name={tone.iconName} size={18} color={tone.iconColor(theme.colors)} />
        <Text text={toast.message} size="xs" weight="medium" style={themed($message)} />
      </Animated.View>
    </View>
  )
}

function getToastTone(variant: AppToastVariant): {
  iconName: ComponentProps<typeof Ionicons>["name"]
  iconColor: (colors: Colors) => string
} {
  if (variant === "error") {
    return {
      iconName: "alert-circle",
      iconColor: (colors) => colors.error,
    }
  }

  if (variant === "info") {
    return {
      iconName: "information-circle",
      iconColor: (colors) => colors.textDim,
    }
  }

  return {
    iconName: "checkmark-circle",
    iconColor: (colors) => colors.tint,
  }
}

const $container: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  left: 0,
  position: "absolute",
  right: 0,
  zIndex: 1000,
})

const $toast: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  alignItems: "center",
  backgroundColor: colors.palette.neutral100,
  borderColor: colors.separator,
  borderRadius: 8,
  borderWidth: 1,
  elevation: 8,
  flexDirection: "row",
  gap: spacing.xs,
  maxWidth: 380,
  minHeight: 48,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
  shadowColor: colors.palette.neutral900,
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.14,
  shadowRadius: 16,
  width: "92%",
})

const $message: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  flex: 1,
})
