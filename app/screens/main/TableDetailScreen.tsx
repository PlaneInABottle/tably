import { FC, useCallback, useEffect, useRef, useState } from "react"
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextStyle,
  View,
  ViewStyle,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useFocusEffect } from "@react-navigation/native"
import MapView, { Marker } from "react-native-maps"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Button } from "@/components/Button"
import { InlineNotice } from "@/components/InlineNotice"
import { Screen } from "@/components/Screen"
import { TableMomentumBanner } from "@/components/TableMomentumBanner"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { useAuth } from "@/context/AuthContext"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { blockUser, REPORT_REASONS, submitReport } from "@/services/moderation/moderationService"
import type { ReportReason } from "@/services/moderation/types"
import { showSuccessToast } from "@/services/notifications/toastService"
import {
  answerTableIntro,
  confirmTableAttendance,
  getSocialTableDetail,
  joinSocialTable,
  leaveSocialTable,
  listTableMembers,
  listTableMessages,
  sendTableMessage,
  subscribeToTableMessages,
} from "@/services/tables/tableService"
import {
  formatActivityLabel,
  formatPlanTime,
  getChatPromptChips,
  getMemberStatusLabel,
  getTableStatusLabel,
} from "@/services/tables/tableUtils"
import type { SocialTableDetail, TableMember, TableMessage } from "@/services/tables/types"
import { useAppTheme } from "@/theme/context"
import { spacing } from "@/theme/spacing"
import type { ThemedStyle } from "@/theme/types"

interface TableDetailScreenProps extends AppStackScreenProps<"TableDetail"> {}

function mergeMessages(current: TableMessage[], message: TableMessage): TableMessage[] {
  if (current.some((item) => item.id === message.id)) return current
  return [...current, message].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )
}

export const TableDetailScreen: FC<TableDetailScreenProps> = ({ navigation, route }) => {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const mounted = useRef(true)
  const tableId = route.params.tableId
  const [table, setTable] = useState<SocialTableDetail | null>(null)
  const [members, setMembers] = useState<TableMember[]>([])
  const [messages, setMessages] = useState<TableMessage[]>([])
  const [introAnswer, setIntroAnswer] = useState("")
  const [draft, setDraft] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)

  const load = useCallback(async () => {
    setError("")
    const [detailResult, membersResult] = await Promise.all([
      getSocialTableDetail(tableId),
      listTableMembers(tableId),
    ])

    if (!mounted.current) return
    if (detailResult.ok) setTable(detailResult.data)
    else setError(detailResult.error)
    if (membersResult.ok) setMembers(membersResult.data)

    const currentStatus = detailResult.ok ? detailResult.data.myMemberStatus : null
    if (
      currentStatus === "pending_intro" ||
      currentStatus === "pending_confirm" ||
      currentStatus === "confirmed"
    ) {
      const messagesResult = await listTableMessages(tableId)
      if (mounted.current && messagesResult.ok) setMessages(messagesResult.data)
    }

    setIsLoading(false)
  }, [tableId])

  useFocusEffect(
    useCallback(() => {
      mounted.current = true
      setIsLoading(true)
      void load()
      return () => {
        mounted.current = false
      }
    }, [load]),
  )

  useEffect(() => {
    if (!table?.myMemberStatus || table.myMemberStatus === "waitlisted") return undefined
    return subscribeToTableMessages(
      tableId,
      (nextMessage) => setMessages((current) => mergeMessages(current, nextMessage)),
      setError,
    )
  }, [table?.myMemberStatus, tableId])

  async function handleJoin() {
    setIsBusy(true)
    setError("")
    setMessage("")
    const result = await joinSocialTable(tableId)
    setIsBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setMessage(
      result.data.isWaitlisted
        ? "This table is full, so you are on the waitlist."
        : "Seat held. Answer the intro to keep it.",
    )
    await load()
  }

  async function handleIntro() {
    setIsBusy(true)
    setError("")
    const result = await answerTableIntro(tableId, introAnswer)
    setIsBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setIntroAnswer("")
    setMessage("Intro saved. Confirm your seat when you are ready.")
    await load()
  }

  async function handleConfirm() {
    setIsBusy(true)
    setError("")
    const result = await confirmTableAttendance(tableId)
    setIsBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setMessage("You are confirmed.")
    await load()
  }

  async function handleLeave() {
    setIsBusy(true)
    setError("")
    const result = await leaveSocialTable(tableId)
    setIsBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    navigation.goBack()
  }

  function confirmLeave() {
    const isCreator = table?.creator.id === user?.id
    const isWaitlisted = table?.isWaitlisted === true
    Alert.alert(
      isCreator ? "Cancel this table?" : isWaitlisted ? "Leave the waitlist?" : "Leave this table?",
      isCreator
        ? "The plan will close for everyone and queued reminders will be cancelled."
        : isWaitlisted
          ? "You will give up your place in the waitlist."
          : "Your seat will be released and may be offered to someone on the waitlist.",
      [
        { text: "Keep table", style: "cancel" },
        {
          text: isCreator ? "Cancel table" : isWaitlisted ? "Leave waitlist" : "Leave table",
          style: "destructive",
          onPress: () => void handleLeave(),
        },
      ],
    )
  }

  async function handleSend() {
    const body = draft.trim()
    if (!body) return
    setIsBusy(true)
    setError("")
    const result = await sendTableMessage(tableId, body)
    setIsBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setMessages((current) => mergeMessages(current, result.data))
    setDraft("")
  }

  function openReportReasons(targetType: "table" | "table_message", targetId: string) {
    Alert.alert("Report", "Choose the closest reason.", [
      ...REPORT_REASONS.map((reason) => ({
        text: reason,
        onPress: () => void handleReport(targetType, targetId, reason),
      })),
      { text: "Cancel", style: "cancel" as const },
    ])
  }

  async function handleReport(
    targetType: "table" | "table_message",
    targetId: string,
    reason: ReportReason,
  ) {
    setError("")
    const result = await submitReport({ targetType, targetId, reason })
    if (!result.ok) {
      setError(result.error)
      return
    }

    showSuccessToast("Report submitted")
  }

  function confirmBlockCreator() {
    if (!table) return
    Alert.alert(
      "Block creator?",
      `You will stop seeing tables from ${table.creator.displayName}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: () => void handleBlockCreator(),
        },
      ],
    )
  }

  async function handleBlockCreator() {
    if (!table) return
    setError("")
    const result = await blockUser(table.creator.id)
    if (!result.ok) {
      setError(result.error)
      return
    }

    showSuccessToast("Member blocked")
    navigation.goBack()
  }

  function renderMember(member: TableMember) {
    return (
      <View key={member.profileId} style={themed($memberPill)}>
        <View style={themed($memberAvatar)}>
          <Text
            text={member.displayName.charAt(0).toUpperCase()}
            size="xs"
            preset="bold"
            style={themed($avatarText)}
          />
        </View>
        <View style={themed($memberCopy)}>
          <Text text={member.displayName} size="xs" preset="bold" numberOfLines={1} />
          <Text text={getMemberStatusLabel(member.status)} size="xxs" style={themed($muted)} />
        </View>
      </View>
    )
  }

  function renderMessage(item: TableMessage) {
    const isOwn = item.senderId === user?.id
    return (
      <View key={item.id} style={themed([$messageRow, isOwn && $ownMessageRow])}>
        <View style={themed([$bubble, isOwn ? $ownBubble : $otherBubble])}>
          {!isOwn ? <Text text={item.senderDisplayName} size="xs" preset="bold" /> : null}
          <Text text={item.body} style={themed(isOwn ? $ownBubbleText : $bubbleText)} />
        </View>
      </View>
    )
  }

  const status = table?.myMemberStatus
  const canChat = status === "pending_confirm" || status === "confirmed"
  const isCreator = table?.creator.id === user?.id

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={themed($keyboard)}
    >
      <Screen
        preset="auto"
        backgroundColor={colors.palette.neutral100}
        contentContainerStyle={themed($container)}
      >
        <View style={[themed($header), { paddingTop: insets.top + spacing.xs }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            testID="table-detail-back-button"
            onPress={() => navigation.goBack()}
            style={themed($backButton)}
          >
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </Pressable>
          <Text text="Table" preset="heading" size="md" />
          <View style={themed($backButton)} />
        </View>

        {isLoading ? <Text text="Loading table..." style={themed($muted)} /> : null}
        {!!error ? <InlineNotice variant="error" text={error} /> : null}
        {!!message ? <InlineNotice variant="success" text={message} /> : null}

        {table ? (
          <>
            <View style={themed($planCard)}>
              <Text
                text={formatActivityLabel(table.activity)}
                size="xs"
                preset="bold"
                style={themed($accent)}
              />
              <Text text={table.title} preset="heading" />
              <Text
                text={`${formatPlanTime(table.startsAt)} · ${table.areaLabel}`}
                style={themed($muted)}
              />
              <Text text={table.note || table.vibe} />
              <View style={themed($statusRow)}>
                <Text
                  text={table.status === "forming" ? "Forming" : getTableStatusLabel(table.status)}
                  size="xs"
                  preset="bold"
                />
                <Text text={getMemberStatusLabel(status)} size="xs" preset="bold" />
              </View>
              <MapView
                initialRegion={{
                  ...table.coordinate,
                  latitudeDelta: 0.018,
                  longitudeDelta: 0.018,
                }}
                pitchEnabled={false}
                rotateEnabled={false}
                scrollEnabled={false}
                testID="table-detail-location-map"
                zoomEnabled={false}
                style={themed($detailMap)}
              >
                <Marker coordinate={table.coordinate} title={table.areaLabel} />
              </MapView>
            </View>

            <TableMomentumBanner
              status={status}
              introDueAt={table.introDueAt}
              confirmDueAt={table.confirmDueAt}
            />

            <View style={themed($section)}>
              <Text text="People" preset="subheading" />
              <View style={themed($members)}>{members.map(renderMember)}</View>
            </View>

            {!status && !table.isWaitlisted ? (
              <View style={themed($actionCard)}>
                <Text text="Join this table" preset="subheading" />
                <Text
                  text="Tably will hold your seat while you answer the intro prompt."
                  style={themed($muted)}
                />
                <Button
                  text={isBusy ? "Joining..." : "Join"}
                  testID="table-join-button"
                  disabled={isBusy}
                  preset="reversed"
                  onPress={() => void handleJoin()}
                />
              </View>
            ) : null}

            {table.isWaitlisted ? (
              <InlineNotice
                variant="info"
                text="You are on the waitlist. Tably will promote you if a seat opens."
              />
            ) : null}

            {status === "pending_intro" ? (
              <View style={themed($actionCard)}>
                <Text text="Next action" preset="subheading" />
                <Text text={table.introPrompt} />
                <TextField
                  value={introAnswer}
                  onChangeText={setIntroAnswer}
                  placeholder="A short answer is enough."
                  multiline
                  testID="table-intro-input"
                />
                <Button
                  text={isBusy ? "Saving..." : "Save intro"}
                  testID="table-intro-submit-button"
                  disabled={isBusy}
                  preset="reversed"
                  onPress={() => void handleIntro()}
                />
              </View>
            ) : null}

            {status === "pending_confirm" ? (
              <View style={themed($actionCard)}>
                <Text text="Confirm your seat" preset="subheading" />
                <Text
                  text="Confirmed seats tell everyone this plan is real."
                  style={themed($muted)}
                />
                <Button
                  text={isBusy ? "Confirming..." : "Confirm attendance"}
                  testID="table-confirm-button"
                  disabled={isBusy}
                  preset="reversed"
                  onPress={() => void handleConfirm()}
                />
              </View>
            ) : null}

            {canChat ? (
              <View style={themed($section)}>
                <Text text="Guided chat" preset="subheading" />
                {messages.length === 0 ? (
                  <Text
                    text="Start with arrival time, venue details, or what you want the vibe to be."
                    style={themed($muted)}
                  />
                ) : null}
                {messages.map(renderMessage)}
                <View style={themed($promptChips)}>
                  {getChatPromptChips(status, table.startsAt, messages.length > 0).map((prompt) => (
                    <Pressable
                      key={prompt.label}
                      accessibilityRole="button"
                      accessibilityLabel={`Use prompt ${prompt.label}`}
                      onPress={() => setDraft(prompt.message)}
                      style={themed($promptChip)}
                    >
                      <Text text={prompt.label} size="xs" preset="bold" />
                    </Pressable>
                  ))}
                </View>
                <View style={themed($composer)}>
                  <TextField
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Message the table"
                    containerStyle={themed($composerInput)}
                    testID="table-message-input"
                  />
                  <Button
                    text="Send"
                    testID="table-message-send-button"
                    disabled={isBusy || draft.trim().length === 0}
                    onPress={() => void handleSend()}
                  />
                </View>
              </View>
            ) : null}

            {status || table.isWaitlisted ? (
              <Button
                text={
                  isCreator ? "Cancel table" : table.isWaitlisted ? "Leave waitlist" : "Leave table"
                }
                testID="table-leave-button"
                disabled={isBusy}
                onPress={confirmLeave}
              />
            ) : null}

            {!isCreator ? (
              <View style={themed($safetySection)}>
                <Text text="Safety" preset="subheading" />
                <Text
                  text="Report the table or block the creator if something feels unsafe."
                  size="sm"
                  style={themed($muted)}
                />
                <View style={themed($safetyRow)}>
                  <Button
                    text="Report table"
                    onPress={() => openReportReasons("table", table.id)}
                    style={themed($safetyButton)}
                  />
                  <Button
                    text="Block creator"
                    onPress={confirmBlockCreator}
                    style={themed($safetyButton)}
                  />
                </View>
              </View>
            ) : null}
          </>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  )
}

const $keyboard: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $container: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
  padding: spacing.lg,
})

const $header: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  justifyContent: "space-between",
})

const $backButton: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  height: 44,
  justifyContent: "center",
  width: 44,
})

const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $accent: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
})

const $planCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.background,
  borderRadius: 8,
  gap: spacing.xs,
  padding: spacing.lg,
})

const $detailMap: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  borderRadius: 8,
  height: 160,
  marginTop: spacing.xs,
  overflow: "hidden",
})

const $statusRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.md,
})

const $safetyRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
})

const $safetyButton: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $safetySection: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderColor: colors.separator,
  borderRadius: 8,
  borderWidth: 1,
  gap: spacing.sm,
  padding: spacing.md,
})

const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})

const $members: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.sm,
})

const $memberPill: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  alignItems: "center",
  backgroundColor: colors.background,
  borderRadius: 8,
  flexDirection: "row",
  gap: spacing.xs,
  padding: spacing.sm,
  width: "48%",
})

const $memberAvatar: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.palette.secondary500,
  borderRadius: 16,
  height: 32,
  justifyContent: "center",
  width: 32,
})

const $avatarText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $memberCopy: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $actionCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.background,
  borderColor: colors.separator,
  borderRadius: 8,
  borderWidth: 1,
  gap: spacing.sm,
  padding: spacing.lg,
})

const $messageRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  marginVertical: spacing.xxs,
})

const $ownMessageRow: ThemedStyle<ViewStyle> = () => ({
  justifyContent: "flex-end",
})

const $bubble: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  borderRadius: 8,
  maxWidth: "86%",
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
})

const $ownBubble: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.tint,
})

const $otherBubble: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.background,
})

const $bubbleText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $ownBubbleText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $composer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "flex-end",
  flexDirection: "row",
  gap: spacing.sm,
})

const $promptChips: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.sm,
})

const $promptChip: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderColor: colors.separator,
  borderRadius: 999,
  borderWidth: 1,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs,
})

const $composerInput: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})
