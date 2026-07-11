import { FC, useCallback, useMemo, useRef, useState } from "react"
import { Pressable, RefreshControl, ScrollView, TextStyle, View, ViewStyle } from "react-native"
import * as Location from "expo-location"
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
import { ACTIVITY_TYPES, type ActivityType, type SocialTableSummary } from "@/services/tables/types"
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
type ActivityFilter = "all" | ActivityType

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
  const [mode, setMode] = useState<ViewMode>("map")
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all")
  const [tables, setTables] = useState<SocialTableSummary[]>([])
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLocating, setIsLocating] = useState(false)
  const [showsUserLocation, setShowsUserLocation] = useState(false)

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

  const visibleTables = useMemo(
    () =>
      activityFilter === "all"
        ? sortedTables
        : sortedTables.filter((table) => table.activity === activityFilter),
    [activityFilter, sortedTables],
  )

  const loadTables = useCallback(async (refreshing = false, region = regionRef.current) => {
    setError("")
    if (refreshing) setIsRefreshing(true)
    else setIsLoading(true)

    const bounds = calculateBounds(region)
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

  async function centerOnUser() {
    setError("")
    setIsLocating(true)

    try {
      const permission = await Location.requestForegroundPermissionsAsync()
      if (permission.status !== "granted") {
        setError("Location permission is needed to show tables around you.")
        return
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })
      const nextRegion: Region = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }

      setShowsUserLocation(true)
      regionRef.current = nextRegion
      mapRef.current?.animateToRegion(nextRegion, 350)
      await loadTables(false, nextRegion)
    } catch {
      setError("Your location could not be loaded. Move the map and search this area instead.")
    } finally {
      setIsLocating(false)
    }
  }

  const selectedTable = useMemo(
    () => visibleTables.find((table) => table.id === selectedTableId) ?? null,
    [selectedTableId, visibleTables],
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
          showsUserLocation={showsUserLocation}
          onRegionChangeComplete={(nextRegion) => {
            regionRef.current = nextRegion
          }}
          style={themed($map)}
        >
          {visibleTables.map((table) => (
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isLocating ? "Finding your location" : "Show my location"}
          testID="today-map-locate-button"
          disabled={isLocating}
          onPress={() => void centerOnUser()}
          style={themed($locateButton)}
        >
          <Ionicons
            name={isLocating ? "hourglass-outline" : "locate"}
            size={22}
            color={colors.text}
          />
        </Pressable>
        {!isLoading && visibleTables.length === 0 ? (
          <View style={themed($mapEmptyBanner)}>
            <Text
              text={
                activityFilter === "all" ? "No tables in this area yet" : "No matching tables here"
              }
              size="sm"
              preset="bold"
            />
            <Text text="Move the map or start one nearby." size="xs" style={themed($mutedText)} />
          </View>
        ) : null}
        {isLoading ? (
          <View style={themed($mapLoadingBanner)}>
            <Text text="Finding nearby tables..." size="sm" preset="bold" />
          </View>
        ) : null}
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

  return (
    <View style={themed($root(insets.top))}>
      <View style={themed($header)}>
        <View>
          <Text text="Explore" preset="heading" />
          <Text
            text={`${visibleTables.length} nearby ${visibleTables.length === 1 ? "table" : "tables"} today and tomorrow`}
            style={themed($mutedText)}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create table"
          testID="today-create-button"
          onPress={() => navigation.navigate("CreateTable")}
          style={themed($iconButton)}
        >
          <Ionicons name="add" size={24} color={colors.palette.neutral100} />
        </Pressable>
      </View>

      <View style={themed($segmented)}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === "list" }}
          accessibilityLabel="List view"
          testID="today-list-mode-button"
          onPress={() => setMode("list")}
          style={themed([$segment, mode === "list" && $segmentSelected])}
        >
          <Ionicons name="list" size={18} color={mode === "list" ? colors.text : colors.textDim} />
          <Text
            text="List"
            size="sm"
            preset="bold"
            style={themed(mode === "list" ? $segmentTextSelected : $segmentText)}
          />
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === "map" }}
          accessibilityLabel="Map view"
          testID="today-map-mode-button"
          onPress={() => setMode("map")}
          style={themed([$segment, mode === "map" && $segmentSelected])}
        >
          <Ionicons
            name="map-outline"
            size={18}
            color={mode === "map" ? colors.text : colors.textDim}
          />
          <Text
            text="Map"
            size="sm"
            preset="bold"
            style={themed(mode === "map" ? $segmentTextSelected : $segmentText)}
          />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={themed($filterScroll)}
        contentContainerStyle={themed($filterContent)}
      >
        {(["all", ...ACTIVITY_TYPES] as ActivityFilter[]).map((filter) => {
          const selected = activityFilter === filter
          const label = filter === "all" ? "All" : formatActivityLabel(filter)

          return (
            <Pressable
              key={filter}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Filter ${label}`}
              testID={`today-filter-${filter}`}
              onPress={() => {
                setActivityFilter(filter)
                setSelectedTableId(null)
              }}
              style={themed([$filterChip, selected && $filterChipSelected])}
            >
              <Text
                text={label}
                size="xs"
                preset="bold"
                style={themed(selected ? $filterTextSelected : $filterText)}
              />
            </Pressable>
          )
        })}
      </ScrollView>

      {!!error ? (
        <View style={themed($noticeWrap)}>
          <InlineNotice variant="error" text={error} />
        </View>
      ) : null}
      {mode === "list" ? (
        <ScrollView
          style={themed($list)}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={() => void loadTables(true)} />
          }
          contentContainerStyle={themed($listContent)}
        >
          {isLoading ? <Text text="Finding nearby tables..." style={themed($mutedText)} /> : null}
          {!isLoading && !error && visibleTables.length === 0 ? (
            <View style={themed($emptyCard)}>
              <Text text="No matching tables" preset="subheading" />
              <Text
                text="Try another activity or start a table nearby."
                style={themed($mutedText)}
              />
              <Button
                text="Create a table"
                preset="reversed"
                onPress={() => navigation.navigate("CreateTable")}
              />
            </View>
          ) : null}
          {!error ? visibleTables.map(renderTableCard) : null}
        </ScrollView>
      ) : null}
      {mode === "map" ? renderMap() : null}
    </View>
  )
}

const $root =
  (topInset: number): ThemedStyle<ViewStyle> =>
  ({ colors, spacing }) => ({
    backgroundColor: colors.background,
    flex: 1,
    paddingTop: topInset + spacing.md,
  })

const $list: ThemedStyle<ViewStyle> = () => ({ flex: 1 })

const $listContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
  paddingBottom: spacing.lg,
  paddingHorizontal: spacing.lg,
})

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  flexDirection: "row",
  justifyContent: "space-between",
  paddingBottom: spacing.sm,
  paddingHorizontal: spacing.lg,
})

const $mutedText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $iconButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  alignItems: "center",
  backgroundColor: colors.tint,
  borderRadius: 22,
  height: 44,
  justifyContent: "center",
  width: 44,
  marginLeft: spacing.sm,
})

const $segmented: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral300,
  borderRadius: 8,
  flexDirection: "row",
  marginBottom: spacing.xs,
  marginHorizontal: spacing.lg,
  padding: 3,
})

const $segment: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  borderRadius: 6,
  flex: 1,
  flexDirection: "row",
  gap: spacing.xs,
  justifyContent: "center",
  minHeight: 40,
  paddingHorizontal: spacing.sm,
})

const $segmentSelected: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.neutral100,
})

const $segmentText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })

const $segmentTextSelected: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.text })

const $filterScroll: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexGrow: 0,
  marginBottom: spacing.sm,
})

const $filterContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  paddingHorizontal: spacing.lg,
})

const $filterChip: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral100,
  borderColor: colors.separator,
  borderRadius: 8,
  borderWidth: 1,
  justifyContent: "center",
  minHeight: 36,
  paddingHorizontal: spacing.md,
})

const $filterChipSelected: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.tint,
  borderColor: colors.tint,
})

const $filterText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.text })

const $filterTextSelected: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $noticeWrap: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingBottom: spacing.sm,
  paddingHorizontal: spacing.lg,
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
  overflow: "hidden",
})

const $map: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $locateButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  alignItems: "center",
  backgroundColor: colors.palette.neutral100,
  borderColor: colors.separator,
  borderRadius: 8,
  borderWidth: 1,
  height: 44,
  justifyContent: "center",
  position: "absolute",
  right: spacing.md,
  top: spacing.md,
  width: 44,
})

const $mapEmptyBanner: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral100,
  borderColor: colors.separator,
  borderRadius: 8,
  borderWidth: 1,
  gap: spacing.xxs,
  left: spacing.md,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  position: "absolute",
  right: 72,
  top: spacing.md,
})

const $mapLoadingBanner: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral100,
  borderColor: colors.separator,
  borderRadius: 8,
  borderWidth: 1,
  left: spacing.md,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  position: "absolute",
  right: 72,
  top: spacing.md,
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
