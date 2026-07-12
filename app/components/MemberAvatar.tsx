import { FC, useEffect, useState } from "react"
import { Image, ImageStyle, StyleProp, TextStyle, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { createAvatarSignedUrl, getInitials } from "@/services/storage/avatarService"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

interface MemberAvatarProps {
  avatarPath: string | null
  displayName: string
  size?: number
  style?: StyleProp<ViewStyle>
}

export const MemberAvatar: FC<MemberAvatarProps> = ({
  avatarPath,
  displayName,
  size = 40,
  style,
}) => {
  const { themed } = useAppTheme()
  const [resolvedAvatar, setResolvedAvatar] = useState<{ path: string; url: string } | null>(null)

  useEffect(() => {
    let isActive = true
    if (!avatarPath) return () => undefined

    void createAvatarSignedUrl(avatarPath).then((result) => {
      if (isActive && result.ok) setResolvedAvatar({ path: avatarPath, url: result.data })
    })

    return () => {
      isActive = false
    }
  }, [avatarPath])

  const sizeStyle = { borderRadius: size / 2, height: size, width: size }
  const avatarUrl = resolvedAvatar?.path === avatarPath ? resolvedAvatar.url : null

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[themed($avatar), sizeStyle, style]}
    >
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={[$image, sizeStyle]} />
      ) : (
        <Text text={getInitials(displayName)} size="xs" preset="bold" style={themed($initials)} />
      )}
    </View>
  )
}

const $avatar: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.palette.secondary500,
  justifyContent: "center",
  overflow: "hidden",
})

const $image: ImageStyle = {
  resizeMode: "cover",
}

const $initials: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})
