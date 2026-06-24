import { FC, useCallback, useEffect, useRef, useState } from "react"
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextStyle,
  View,
  ViewStyle,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { InlineNotice } from "@/components/InlineNotice"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { useAuth } from "@/context/AuthContext"
import { translate } from "@/i18n/translate"
import type { ChatStackScreenProps } from "@/navigators/navigationTypes"
import {
  getMessageByConversationId,
  getMessagesByConversationId,
  mergeMessagesById,
  sendMessage,
  subscribeToConversationMessages,
} from "@/services/chat/chatService"
import { CHAT_MESSAGE_MAX_LENGTH, type ChatMessage } from "@/services/chat/types"
import { blockUser, REPORT_REASONS, submitReport } from "@/services/moderation/moderationService"
import type { ReportReason } from "@/services/moderation/types"
import { showSuccessToast } from "@/services/notifications/toastService"
import { useAppTheme } from "@/theme/context"
import { spacing } from "@/theme/spacing"
import type { ThemedStyle } from "@/theme/types"

interface ConversationDetailScreenProps extends ChatStackScreenProps<"ConversationDetail"> {}

function formatMessageTime(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

function formatMessageDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

function isSameMessageDay(first: string, second: string): boolean {
  const firstDate = new Date(first)
  const secondDate = new Date(second)

  return firstDate.toDateString() === secondDate.toDateString()
}

function isBlockedChatError(message: string): boolean {
  return message.toLowerCase().includes("blocked")
}

export const ConversationDetailScreen: FC<ConversationDetailScreenProps> = ({ route }) => {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const navigation = useNavigation<ChatStackScreenProps<"ConversationDetail">["navigation"]>()
  const { conversationId } = route.params
  const opponentUserId = route.params.opponentUserId
  const opponentName = route.params.opponentDisplayName ?? translate("chatScreen:diverFallback")
  const isMounted = useRef(true)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const [error, setError] = useState("")
  const [realtimeError, setRealtimeError] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [isBlocked, setIsBlocked] = useState(false)

  const loadMessages = useCallback(async () => {
    setError("")
    setIsLoading(true)

    const result = await getMessagesByConversationId(conversationId)

    if (!isMounted.current) return
    if (result.ok) {
      setMessages(result.data)
    } else if (isBlockedChatError(result.error)) {
      setIsBlocked(true)
      setMessages([])
    } else {
      setError(result.error)
    }

    setIsLoading(false)
  }, [conversationId])

  useEffect(() => {
    isMounted.current = true
    void loadMessages()

    return () => {
      isMounted.current = false
    }
  }, [loadMessages])

  useEffect(() => {
    async function mergeRealtimeMessage(message: ChatMessage) {
      const result = await getMessageByConversationId(conversationId, message.id)
      const enrichedMessage = result.ok ? result.data : message

      if (isMounted.current) {
        setMessages((current) => mergeMessagesById(current, enrichedMessage))
      }
    }

    const unsubscribe = subscribeToConversationMessages(
      conversationId,
      (message) => void mergeRealtimeMessage(message),
      setRealtimeError,
    )

    return unsubscribe
  }, [conversationId])

  async function handleSend() {
    const body = draft.trim()
    if (!body) return

    setError("")
    setIsSending(true)
    const result = await sendMessage({ conversationId, body })

    if (result.ok) {
      setMessages((current) => mergeMessagesById(current, result.data))
      setDraft("")
      Keyboard.dismiss()
    } else {
      setError(result.error)
    }

    setIsSending(false)
  }

  function openReportReasons(targetType: "message" | "conversation", targetId: string) {
    Alert.alert(translate("moderation:reportTitle"), translate("moderation:reportMessage"), [
      ...REPORT_REASONS.map((reason) => ({
        text: reason,
        onPress: () => void handleReport(targetType, targetId, reason),
      })),
      { text: translate("common:cancel"), style: "cancel" as const },
    ])
  }

  async function handleReport(
    targetType: "message" | "conversation",
    targetId: string,
    reason: ReportReason,
  ) {
    setError("")
    const result = await submitReport({ targetType, targetId, reason })
    if (result.ok) {
      showSuccessToast(translate("moderation:reportSubmitted"))
      return
    }

    setError(result.error)
  }

  function confirmBlockUser() {
    if (!opponentUserId) {
      setError(translate("moderation:blockUnavailable"))
      return
    }

    Alert.alert(
      translate("moderation:blockUserTitle", { name: opponentName }),
      translate("moderation:blockUserMessage"),
      [
        { text: translate("common:cancel"), style: "cancel" },
        {
          text: translate("moderation:blockUserConfirm"),
          style: "destructive",
          onPress: () => void handleBlockUser(),
        },
      ],
    )
  }

  async function handleBlockUser() {
    if (!opponentUserId) return

    setError("")
    const result = await blockUser(opponentUserId)
    if (!result.ok) {
      if (isBlockedChatError(result.error)) {
        setIsBlocked(true)
        setMessages([])
        showSuccessToast(translate("moderation:userBlocked"))
        return
      }

      setError(result.error)
      return
    }

    setIsBlocked(true)
    setMessages([])
    showSuccessToast(translate("moderation:userBlocked"))
  }

  function openHeaderMenu() {
    const latestMessage = messages[messages.length - 1]
    Alert.alert(translate("chatScreen:headerMenu"), undefined, [
      {
        text: translate("chatScreen:reportConversation"),
        onPress: () => openReportReasons("conversation", conversationId),
      },
      latestMessage
        ? {
            text: translate("chatScreen:reportLatestMessage"),
            onPress: () => openReportReasons("message", latestMessage.id),
          }
        : {
            text: translate("chatScreen:reportLatestMessage"),
            onPress: () => setError(translate("chatScreen:noMessageToReport")),
          },
      {
        text: translate("chatScreen:blockUser"),
        style: "destructive",
        onPress: confirmBlockUser,
      },
      { text: translate("common:cancel"), style: "cancel" },
    ])
  }

  function renderMessage(message: ChatMessage, index: number) {
    const isOwn = message.senderId === user?.id
    const previousMessage = messages[index - 1]
    const shouldShowDate =
      !previousMessage || !isSameMessageDay(previousMessage.createdAt, message.createdAt)

    return (
      <View key={message.id}>
        {shouldShowDate ? (
          <View style={themed($dateSeparator)}>
            <Text
              text={formatMessageDate(message.createdAt)}
              size="xxs"
              style={themed($dateText)}
            />
          </View>
        ) : null}
        <View style={themed([$messageRow, isOwn && $ownMessageRow])}>
          {!isOwn ? (
            <View style={themed($messageAvatar)}>
              <Text
                text={message.senderDisplayName.charAt(0).toUpperCase()}
                size="xxs"
                preset="bold"
                style={themed($messageAvatarText)}
              />
            </View>
          ) : null}
          <View style={themed([$bubble, isOwn ? $ownBubble : $otherBubble])}>
            {!isOwn ? <Text text={message.senderDisplayName} size="xs" preset="bold" /> : null}
            <Text text={message.body} style={themed(isOwn ? $ownBubbleText : $bubbleText)} />
            <Text
              text={formatMessageTime(message.createdAt)}
              size="xxs"
              style={themed(isOwn ? $ownMessageTime : $messageTime)}
            />
          </View>
        </View>
      </View>
    )
  }

  const isSendDisabled = isSending || draft.trim().length === 0

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={themed($keyboardContainer)}
    >
      <Screen
        preset="auto"
        backgroundColor={colors.palette.neutral100}
        contentContainerStyle={themed($container)}
      >
        <View style={[themed($conversationHeader), { paddingTop: insets.top + spacing.xs }]}>
          <Pressable
            accessibilityLabel={translate("chatScreen:headerBack")}
            accessibilityRole="button"
            testID="chat-detail-back-button"
            onPress={() => navigation.goBack()}
            style={themed($headerBackButton)}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </Pressable>

          <View style={themed($headerCenter)}>
            <View style={themed($headerAvatar)}>
              <Text
                text={opponentName.charAt(0).toUpperCase()}
                preset="bold"
                style={themed($headerAvatarText)}
              />
            </View>
            <View style={themed($headerCopy)}>
              <Text
                text={opponentName}
                preset="heading"
                size="md"
                numberOfLines={1}
                ellipsizeMode="tail"
                style={themed($headerName)}
              />
            </View>
          </View>

          <Pressable
            accessibilityLabel={translate("chatScreen:headerMenu")}
            accessibilityRole="button"
            testID="chat-detail-header-menu"
            onPress={openHeaderMenu}
            style={themed($headerMenuButton)}
            hitSlop={8}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
          </Pressable>
        </View>

        {isLoading ? (
          <Text
            tx="chatScreen:loadingMessages"
            testID="chat-detail-loading"
            style={themed($stateText)}
          />
        ) : null}
        {!!realtimeError ? (
          <InlineNotice
            text={realtimeError}
            testID="chat-detail-realtime-error"
            variant="info"
            style={themed($notice)}
          />
        ) : null}
        {!!error ? (
          <InlineNotice
            text={error}
            testID="chat-detail-error"
            variant="error"
            style={themed($notice)}
          />
        ) : null}
        {isBlocked ? (
          <View style={themed($blockedCard)} testID="chat-detail-blocked-state">
            <Text tx="chatScreen:blockedTitle" preset="subheading" />
            <Text tx="chatScreen:blockedMessage" style={themed($subtitle)} />
          </View>
        ) : null}
        {!isLoading && messages.length === 0 && !isBlocked ? (
          <View style={themed($emptyCard)} testID="chat-detail-empty-state">
            <Text tx="chatScreen:noMessagesTitle" preset="subheading" />
            <Text tx="chatScreen:noMessagesMessage" style={themed($subtitle)} />
          </View>
        ) : null}
        <View testID="chat-message-list" style={themed($messageList)}>
          {messages.map(renderMessage)}
        </View>
      </Screen>
      {!isBlocked ? (
        <View style={[themed($composer), { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextField
            accessibilityLabel="Chat message input"
            testID="chat-message-input"
            value={draft}
            onChangeText={setDraft}
            placeholderTx="chatScreen:messagePlaceholder"
            maxLength={CHAT_MESSAGE_MAX_LENGTH}
            multiline
            containerStyle={themed($composerInput)}
            inputWrapperStyle={themed($composerInputWrapper)}
            style={themed($composerTextInput)}
          />
          <Pressable
            accessibilityLabel="Chat send"
            accessibilityRole="button"
            accessibilityState={{ disabled: isSendDisabled }}
            testID="chat-send-button"
            disabled={isSendDisabled}
            onPress={handleSend}
            style={themed(isSendDisabled ? [$sendButton, $sendButtonDisabled] : $sendButton)}
          >
            <Ionicons name="send" size={18} color={colors.palette.neutral100} />
          </Pressable>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  )
}

const $keyboardContainer: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $container: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingTop: spacing.md,
  paddingBottom: spacing.lg,
})

const $conversationHeader: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  alignItems: "center",
  backgroundColor: colors.palette.neutral100,
  borderBottomColor: colors.palette.neutral300,
  borderBottomWidth: 1,
  flexDirection: "row",
  paddingBottom: spacing.md,
  paddingHorizontal: spacing.xs,
})

const $headerBackButton: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  height: 44,
  justifyContent: "center",
  width: 44,
})

const $headerMenuButton: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  height: 44,
  justifyContent: "center",
  width: 44,
})

const $headerCenter: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  flex: 1,
  flexDirection: "row",
  gap: spacing.xxs,
  justifyContent: "center",
  minHeight: 52,
})

const $headerAvatar: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.palette.secondary500,
  borderRadius: 26,
  height: 52,
  justifyContent: "center",
  position: "relative",
  width: 52,
})

const $headerAvatarText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  fontSize: 20,
})

const $headerCopy: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  flex: 1,
  flexShrink: 1,
  gap: spacing.xxxs,
  justifyContent: "center",
})

const $headerName: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  maxWidth: "80%",
  textAlign: "center",
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $messageList: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
  paddingTop: spacing.lg,
  paddingBottom: spacing.md,
})

const $dateSeparator: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  marginBottom: spacing.xs,
  marginTop: spacing.xs,
})

const $dateText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral200,
  borderRadius: 8,
  color: colors.textDim,
  overflow: "hidden",
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xxs,
})

const $messageRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "flex-end",
  flexDirection: "row",
  gap: spacing.xs,
  justifyContent: "flex-start",
})

const $ownMessageRow: ThemedStyle<ViewStyle> = () => ({
  justifyContent: "flex-end",
})

const $messageAvatar: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.palette.neutral300,
  borderRadius: 14,
  height: 28,
  justifyContent: "center",
  width: 28,
})

const $messageAvatarText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $bubble: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  borderRadius: 20,
  gap: spacing.xxs,
  maxWidth: "78%",
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs,
})

const $ownBubble: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.tint,
  borderBottomRightRadius: 6,
})

const $otherBubble: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.neutral200,
  borderBottomLeftRadius: 6,
  borderColor: colors.palette.neutral300,
  borderWidth: 1,
})

const $bubbleText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  lineHeight: 21,
})

const $ownBubbleText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  lineHeight: 21,
})

const $messageTime: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textAlign: "right",
})

const $ownMessageTime: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  opacity: 0.72,
  textAlign: "right",
})

const $emptyCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral200,
  borderColor: colors.palette.neutral300,
  borderRadius: 8,
  borderWidth: 1,
  gap: spacing.sm,
  marginTop: spacing.lg,
  padding: spacing.lg,
})

const $blockedCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderColor: colors.separator,
  borderRadius: 12,
  borderWidth: 1,
  gap: spacing.xs,
  marginTop: spacing.lg,
  padding: spacing.md,
})

const $composer: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  alignItems: "flex-end",
  backgroundColor: colors.palette.neutral100,
  borderTopColor: colors.palette.neutral300,
  borderTopWidth: 1,
  flexDirection: "row",
  gap: spacing.sm,
  paddingHorizontal: spacing.md,
  paddingTop: spacing.sm,
})

const $composerInput: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $composerInputWrapper: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.neutral200,
  borderColor: colors.palette.neutral300,
  borderRadius: 22,
  minHeight: 44,
})

const $composerTextInput: ThemedStyle<TextStyle> = ({ spacing }) => ({
  maxHeight: 96,
  minHeight: 24,
  paddingVertical: spacing.xxs,
})

const $sendButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.tint,
  borderRadius: 22,
  height: 44,
  justifyContent: "center",
  width: 44,
})

const $sendButtonDisabled: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.neutral400,
})

const $stateText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $notice: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.sm,
})
