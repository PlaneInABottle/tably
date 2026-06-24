import { FC, useCallback, useState } from "react"
import { Pressable, RefreshControl, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Button } from "@/components/Button"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAuth } from "@/context/AuthContext"
import { translate } from "@/i18n/translate"
import type { ChatStackScreenProps } from "@/navigators/navigationTypes"
import { getConversationsWithLatestMessage } from "@/services/chat/chatService"
import type { ConversationSummary } from "@/services/chat/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

interface ConversationListScreenProps extends ChatStackScreenProps<"ConversationList"> {}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatConversationTimestamp(value?: string | null): string {
  if (!value) return ""
  const messageDate = new Date(value)
  if (Number.isNaN(messageDate.getTime())) return ""

  const now = new Date()
  const diffDays = Math.floor(
    (startOfDay(now).getTime() - startOfDay(messageDate).getTime()) / (1000 * 60 * 60 * 24),
  )

  if (diffDays === 0) {
    return messageDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  }
  if (diffDays === 1) {
    return translate("chatScreen:listTimestampYesterday")
  }
  if (messageDate.getFullYear() === now.getFullYear()) {
    return messageDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  }
  return messageDate.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "2-digit",
  })
}

export const ConversationListScreen: FC<ConversationListScreenProps> = ({ navigation }) => {
  const { themed } = useAppTheme()
  const { user } = useAuth()
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const loadConversations = useCallback(async (refreshing = false) => {
    setError("")
    if (refreshing) setIsRefreshing(true)
    else setIsLoading(true)

    const result = await getConversationsWithLatestMessage()

    if (result.ok) setConversations(result.data)
    else setError(result.error)

    setIsLoading(false)
    setIsRefreshing(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      void loadConversations()
    }, [loadConversations]),
  )

  function openConversation(conversation: ConversationSummary) {
    navigation.navigate("ConversationDetail", {
      conversationId: conversation.id,
      opponentUserId: conversation.opponent.id,
      opponentDisplayName: conversation.opponent.displayName,
    })
  }

  function renderConversation(conversation: ConversationSummary) {
    const { latestMessage, opponent } = conversation
    const isOwnLastMessage = latestMessage?.senderId === user?.id
    const previewBody = isOwnLastMessage
      ? `${translate("chatScreen:listYouPrefix")}${latestMessage?.body ?? ""}`
      : (latestMessage?.body ?? "")
    const timestamp = formatConversationTimestamp(latestMessage?.createdAt)

    return (
      <Pressable
        key={conversation.id}
        accessibilityLabel={`Open conversation with ${opponent.displayName}`}
        testID={`chat-conversation-${opponent.id}`}
        onPress={() => openConversation(conversation)}
        style={themed($conversationRow)}
      >
        <View
          style={themed($conversationAvatar)}
          testID={`chat-conversation-avatar-${opponent.id}`}
        >
          <Text
            text={opponent.displayName.charAt(0).toUpperCase()}
            preset="bold"
            style={themed($conversationAvatarText)}
          />
        </View>

        <View style={themed($conversationCenter)}>
          <Text
            text={opponent.displayName}
            preset="bold"
            numberOfLines={1}
            ellipsizeMode="tail"
            style={themed($conversationName)}
          />
          <Text
            text={previewBody}
            numberOfLines={1}
            ellipsizeMode="tail"
            size="xs"
            style={themed($conversationPreview)}
          />
        </View>

        <View style={themed($conversationRight)}>
          <Text text={timestamp} size="xxs" style={themed($conversationTimestamp)} />
        </View>
      </Pressable>
    )
  }

  return (
    <Screen
      preset="auto"
      safeAreaEdges={["top"]}
      contentContainerStyle={themed($container)}
      ScrollViewProps={{
        refreshControl: (
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadConversations(true)}
          />
        ),
      }}
    >
      <Text tx="chatScreen:title" preset="heading" style={themed($title)} />
      <Text tx="chatScreen:listSubtitle" style={themed($subtitle)} />

      {isLoading ? <Text tx="chatScreen:loadingConversations" style={themed($stateText)} /> : null}
      {!!error && !isLoading ? (
        <View style={themed($stateCard)}>
          <Text text={error} style={themed($errorText)} />
          <Button tx="chatScreen:retry" onPress={() => void loadConversations()} />
        </View>
      ) : null}
      {!isLoading && !error && conversations.length === 0 ? (
        <View style={themed($stateCard)} testID="chat-empty-state">
          <Text tx="chatScreen:emptyTitle" preset="subheading" />
          <Text tx="chatScreen:emptyMessage" style={themed($conversationPreview)} />
        </View>
      ) : null}
      {!isLoading && !error ? conversations.map(renderConversation) : null}
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.xl,
})

const $title: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginBottom: spacing.xs,
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textDim,
  marginBottom: spacing.lg,
})

const $stateCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderColor: colors.separator,
  borderRadius: 16,
  borderWidth: 1,
  gap: spacing.sm,
  padding: spacing.lg,
})

const $stateText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $conversationRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  alignItems: "center",
  backgroundColor: "transparent",
  borderBottomColor: colors.separator,
  borderBottomWidth: 1,
  flexDirection: "row",
  gap: spacing.md,
  paddingHorizontal: spacing.xs,
  paddingVertical: spacing.md,
})

const $conversationAvatar: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.palette.secondary500,
  borderRadius: 20,
  height: 40,
  justifyContent: "center",
  width: 40,
})

const $conversationAvatarText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  fontSize: 16,
})

const $conversationCenter: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  gap: 2,
  overflow: "hidden",
})

const $conversationName: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $conversationPreview: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $conversationRight: ThemedStyle<ViewStyle> = () => ({
  alignItems: "flex-end",
  gap: 2,
})

const $conversationTimestamp: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.error,
})
