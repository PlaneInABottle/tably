import { FC, useCallback, useState } from "react"
import { Pressable, RefreshControl, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Button } from "@/components/Button"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { MainTabScreenProps } from "@/navigators/navigationTypes"
import { listMyActiveTables } from "@/services/tables/tableService"
import {
  formatActivityLabel,
  formatPlanTime,
  getMemberStatusLabel,
  getTableStatusLabel,
} from "@/services/tables/tableUtils"
import type { ActiveTableChat } from "@/services/tables/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

interface TableChatsScreenProps extends MainTabScreenProps<"Chats"> {}

export const TableChatsScreen: FC<TableChatsScreenProps> = ({ navigation }) => {
  const { themed } = useAppTheme()
  const [tables, setTables] = useState<ActiveTableChat[]>([])
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const loadTables = useCallback(async (refreshing = false) => {
    setError("")
    if (refreshing) setIsRefreshing(true)
    else setIsLoading(true)

    const result = await listMyActiveTables()
    if (result.ok) setTables(result.data)
    else setError(result.error)

    setIsLoading(false)
    setIsRefreshing(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      void loadTables()
    }, [loadTables]),
  )

  function renderTable(table: ActiveTableChat) {
    return (
      <Pressable
        key={table.id}
        accessibilityRole="button"
        accessibilityLabel={`Open ${table.title}`}
        testID={`active-table-${table.id}`}
        onPress={() => navigation.navigate("TableDetail", { tableId: table.id })}
        style={themed($row)}
      >
        <View style={themed($avatar)}>
          <Text
            text={formatActivityLabel(table.activity).charAt(0)}
            preset="bold"
            style={themed($avatarText)}
          />
        </View>
        <View style={themed($center)}>
          <Text text={table.title} preset="bold" numberOfLines={1} />
          <Text
            text={
              table.latestMessageBody || `${formatPlanTime(table.startsAt)} · ${table.areaLabel}`
            }
            size="xs"
            numberOfLines={1}
            style={themed($muted)}
          />
        </View>
        <View style={themed($right)}>
          <Text text={getTableStatusLabel(table.status)} size="xxs" preset="bold" />
          <Text text={getMemberStatusLabel(table.memberStatus)} size="xxs" style={themed($muted)} />
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
          <RefreshControl refreshing={isRefreshing} onRefresh={() => void loadTables(true)} />
        ),
      }}
    >
      <Text text="Chats" preset="heading" />
      <Text text="Your active tables and next actions." style={themed($muted)} />
      {isLoading ? <Text text="Loading tables..." style={themed($muted)} /> : null}
      {!!error ? (
        <View style={themed($empty)}>
          <Text text={error} style={themed($error)} />
          <Button text="Retry" onPress={() => void loadTables()} />
        </View>
      ) : null}
      {!isLoading && !error && tables.length === 0 ? (
        <View style={themed($empty)}>
          <Text text="No active tables yet" preset="subheading" />
          <Text text="Join or create a table to unlock guided chat." style={themed($muted)} />
          <Button text="Find tables" onPress={() => navigation.navigate("Today")} />
        </View>
      ) : null}
      {!isLoading && !error ? tables.map(renderTable) : null}
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
  padding: spacing.lg,
})

const $row: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  alignItems: "center",
  borderBottomColor: colors.separator,
  borderBottomWidth: 1,
  flexDirection: "row",
  gap: spacing.md,
  paddingVertical: spacing.md,
})

const $avatar: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.palette.secondary500,
  borderRadius: 20,
  height: 40,
  justifyContent: "center",
  width: 40,
})

const $avatarText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $center: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $right: ThemedStyle<ViewStyle> = () => ({
  alignItems: "flex-end",
})

const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $empty: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderColor: colors.separator,
  borderRadius: 8,
  borderWidth: 1,
  gap: spacing.sm,
  padding: spacing.lg,
})

const $error: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.error,
})
