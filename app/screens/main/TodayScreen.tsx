import { FC, useCallback, useMemo, useRef, useState } from "react"
import { Pressable, RefreshControl, ScrollView, TextStyle, View, ViewStyle } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useFocusEffect } from "@react-navigation/native"
import MapView, { Marker, type Region } from "react-native-maps"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Button } from "@/components/Button"
import { InlineNotice } from "@/components/InlineNotice"
import { TableMomentumBanner } from "@/components/TableMomentumBanner"
import { Text } from "@/components/Text"
import type { MainTabScreenProps } from "@/navigators/navigationTypes"
import { listSocialTables } from "@/services/tables/tableService"
import {
  formatActivityLabel,
  formatPlanTime,
  getSeatsLeft,
  getMemberStatusLabel,
  getTableStatusLabel,
} from "@/services/tables/tableUtils"
import type { SocialTableSummary } from "@/services/tables/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { calculateBounds } from "@/utils/map/calculateBounds"

const ISTANBUL_REGION: Region = {
  latitude: 41.015137,
  longitude: 28.97953,
  latitudeDelta: 0.09,
  longitudeDelta: 0.09,
}

interface TodayScreenProps extends MainTabScreenProps<"Today"> {}

type ViewMode = "list" | "map"

function statusColor(
  status: SocialTableSummary["status"],
  colors: ReturnType<typeof useAppTheme>["theme"]["colors"],
) {
  if (status === "confirmed") return colors.palette.secondary500
  if (status === "happening") return colors.tint
  if (status === "forming") return colors.palette.accent500
  return colors.textDim
}

export const TodayScreen: FC<TodayScreenProps> = ({ navigation }) => {
  const mapRef = useRef<MapView>(null)
  const regionRef = useRef<Region>(ISTANBUL_REGION)
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const insets = useSafeAreaInsets()
  const [mode, setMode] = useState<ViewMode>("list")
  const [tables, setTables] = useState<SocialTableSummary[]>([])
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const sortedTables = useMemo(
    () =>
      [...tables].sort((a, b) => {
        const aMomentum = a.status === "confirmed" ? 0 : a.confirmedCount >= 2 ? 1 : 2
        const bMomentum = b.status === "confirmed" ? 0 : b.confirmedCount >= 2 ? 1 : 2
        return (
          aMomentum - bMomentum || new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
        )
      }),
    [tables],
  )

  const loadTables = useCallback(async (refreshing = false) => {
    setError("")
    if (refreshing) setIsRefreshing(true)
    else setIsLoading(true)

    const bounds = calculateBounds(regionRef.current)
    if (!bounds.ok) {
      setError(bounds.error)
      setIsLoading(false)
      setIsRefreshing(false)
      return
    }

    const result = await listSocialTables({ bounds: bounds.bounds })
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

  function openTable(tableId: string) {
    navigation.navigate("TableDetail", { tableId })
  }

  const selectedTable = useMemo(
    () => tables.find((table) => table.id === selectedTableId) ?? null,
    [selectedTableId, tables],
  )

  function renderTableCard(table: SocialTableSummary) {
    const seatsLeft = getSeatsLeft(table.maxSeats, table.activeCount)
    return (
      <Pressable
        key={table.id}
        accessibilityRole="button"
        accessibilityLabel={`Open ${table.title}`}
        testID={`table-card-${table.id}`}
        onPress={() => openTable(table.id)}
        style={themed($tableCard)}
      >
        <View style={themed($cardTopRow)}>
          <View style={themed($activityBadge)}>
            <Ionicons name="sparkles" size={16} color={colors.palette.neutral100} />
            <Text
              text={formatActivityLabel(table.activity)}
              size="xs"
              preset="bold"
              style={themed($activityText)}
            />
          </View>
          <Text
            text={getTableStatusLabel(table.status, table.confirmedCount)}
            size="xs"
            preset="bold"
            style={themed($statusText)}
          />
        </View>
        <Text text={table.title} preset="subheading" numberOfLines={2} />
        <Text
          text={`${formatPlanTime(table.startsAt)} · ${table.areaLabel}`}
          size="sm"
          style={themed($mutedText)}
        />
        <Text
          text={table.note || table.vibe}
          size="sm"
          numberOfLines={2}
          style={themed($mutedText)}
        />
        <TableMomentumBanner
          status={table.myMemberStatus}
          introDueAt={table.introDueAt}
          confirmDueAt={table.confirmDueAt}
          compact
        />
        <View style={themed($momentumRow)}>
          <Text text={`${table.confirmedCount} confirmed`} size="xs" preset="bold" />
          <Text text={`${seatsLeft} seats left`} size="xs" preset="bold" />
          <Text text={getMemberStatusLabel(table.myMemberStatus)} size="xs" preset="bold" />
        </View>
      </Pressable>
    )
  }

  function renderMap() {
    return (
      <View style={themed($mapWrap)}>
        <MapView
          ref={mapRef}
          initialRegion={ISTANBUL_REGION}
          onRegionChangeComplete={(nextRegion) => {
            regionRef.current = nextRegion
          }}
          style={themed($map)}
        >
          {tables.map((table) => (
            <Marker
              key={table.id}
              coordinate={table.coordinate}
              onPress={() => setSelectedTableId(table.id)}
            >
              <View
                accessible
                accessibilityLabel={`Map pin ${table.title}`}
                testID={`table-map-pin-${table.id}`}
                style={[
                  themed($marker),
                  { backgroundColor: statusColor(table.status, colors) },
                  selectedTableId === table.id && themed($markerSelected),
                ]}
              >
                <Text
                  text={formatActivityLabel(table.activity).charAt(0)}
                  preset="bold"
                  style={themed($markerText)}
                />
              </View>
            </Marker>
          ))}
        </MapView>
        <Button
          text={isLoading ? "Searching..." : "Search this area"}
          testID="today-map-search-button"
          onPress={() => void loadTables()}
          disabled={isLoading}
          style={themed($mapSearchButton(!!selectedTable))}
        />
        {selectedTable ? (
          <View style={themed($mapPreviewCard)}>
            <View style={themed($cardTopRow)}>
              <Text text={formatActivityLabel(selectedTable.activity)} size="xs" preset="bold" />
              <Text
                text={getTableStatusLabel(selectedTable.status, selectedTable.confirmedCount)}
                size="xs"
                preset="bold"
                style={themed($statusText)}
              />
            </View>
            <Text text={selectedTable.title} preset="subheading" numberOfLines={1} />
            <Text
              text={`${formatPlanTime(selectedTable.startsAt)} · ${selectedTable.areaLabel}`}
              size="sm"
              style={themed($mutedText)}
              numberOfLines={1}
            />
            <TableMomentumBanner
              status={selectedTable.myMemberStatus}
              introDueAt={selectedTable.introDueAt}
              confirmDueAt={selectedTable.confirmDueAt}
              compact
            />
            <View style={themed($previewFooter)}>
              <Text
                text={`${selectedTable.confirmedCount} confirmed · ${getSeatsLeft(
                  selectedTable.maxSeats,
                  selectedTable.activeCount,
                )} seats left`}
                size="xs"
                style={themed($mutedText)}
              />
              <Button text="Open table" onPress={() => openTable(selectedTable.id)} />
            </View>
          </View>
        ) : null}
      </View>
    )
  }

  const showInitialLoading = isLoading && tables.length === 0
  const canShowContent = !error && (!isLoading || tables.length > 0)

  return (
    <View style={themed($root(insets.top))}>
      <View style={themed($header)}>
        <View>
          <Text text="Today" preset="heading" />
          <Text text="Small plans that can actually happen." style={themed($mutedText)} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create table"
          testID="today-create-button"
          onPress={() => navigation.navigate("CreateTable")}
          style={themed($iconButton)}
        >
          <Ionicons name="add" size={24} color={colors.text} />
        </Pressable>
      </View>

      <View style={themed($segmented)}>
        <Button
          text="List"
          testID="today-list-mode-button"
          preset={mode === "list" ? "filled" : "default"}
          onPress={() => setMode("list")}
          style={themed($segmentButton)}
        />
        <Button
          text="Map"
          testID="today-map-mode-button"
          preset={mode === "map" ? "filled" : "default"}
          onPress={() => setMode("map")}
          style={themed($segmentButton)}
        />
      </View>

      {!!error ? <InlineNotice variant="error" text={error} /> : null}
      {showInitialLoading ? (
        <Text text="Finding nearby tables..." style={themed($mutedText)} />
      ) : null}
      {canShowContent && tables.length === 0 ? (
        <View style={themed($emptyCard)}>
          <Text text="No nearby tables yet" preset="subheading" />
          <Text
            text="Start a small plan for today or tomorrow and let Tably host the momentum."
            style={themed($mutedText)}
          />
          <Button text="Create a table" onPress={() => navigation.navigate("CreateTable")} />
        </View>
      ) : null}
      {canShowContent && mode === "list" ? (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={() => void loadTables(true)} />
          }
          contentContainerStyle={themed($listContent)}
        >
          {sortedTables.map(renderTableCard)}
        </ScrollView>
      ) : null}
      {canShowContent && mode === "map" ? renderMap() : null}
    </View>
  )
}

const $root =
  (topInset: number): ThemedStyle<ViewStyle> =>
  ({ colors, spacing }) => ({
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.md,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: topInset + spacing.lg,
  })

const $listContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
  paddingBottom: spacing.lg,
})

const $header: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  justifyContent: "space-between",
})

const $mutedText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $iconButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  alignItems: "center",
  backgroundColor: colors.palette.neutral200,
  borderRadius: 22,
  height: 44,
  justifyContent: "center",
  width: 44,
  marginLeft: spacing.sm,
})

const $segmented: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
})

const $segmentButton: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $tableCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral100,
  borderColor: colors.separator,
  borderRadius: 8,
  borderWidth: 1,
  gap: spacing.xs,
  padding: spacing.md,
})

const $cardTopRow: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  justifyContent: "space-between",
})

const $activityBadge: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  alignItems: "center",
  backgroundColor: colors.palette.secondary500,
  borderRadius: 999,
  flexDirection: "row",
  gap: spacing.xs,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xxs,
})

const $activityText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $statusText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
})

const $momentumRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.sm,
})

const $emptyCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderColor: colors.separator,
  borderRadius: 8,
  borderWidth: 1,
  gap: spacing.sm,
  padding: spacing.lg,
})

const $mapWrap: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  minHeight: 520,
  overflow: "hidden",
  borderRadius: 8,
})

const $map: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $mapSearchButton =
  (hasPreview: boolean): ThemedStyle<ViewStyle> =>
  ({ spacing }) => ({
    bottom: hasPreview ? 180 : spacing.md,
    left: spacing.md,
    position: "absolute",
    right: spacing.md,
  })

const $marker: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  borderRadius: 18,
  height: 36,
  justifyContent: "center",
  width: 36,
})

const $markerSelected: ThemedStyle<ViewStyle> = ({ colors }) => ({
  borderColor: colors.palette.neutral100,
  borderWidth: 3,
  transform: [{ scale: 1.12 }],
})

const $markerText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $mapPreviewCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral100,
  borderColor: colors.separator,
  borderRadius: 8,
  borderWidth: 1,
  bottom: spacing.md,
  gap: spacing.xs,
  left: spacing.md,
  padding: spacing.md,
  position: "absolute",
  right: spacing.md,
})

const $previewFooter: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  flexDirection: "row",
  gap: spacing.sm,
  justifyContent: "space-between",
})
