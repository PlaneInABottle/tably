import { FC, useCallback, useEffect, useRef, useState } from "react"
import { Alert, Pressable, StyleSheet, useWindowDimensions, View, ViewStyle } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import BottomSheet, {
  BottomSheetModal,
  BottomSheetScrollView,
  useBottomSheetModal,
} from "@gorhom/bottom-sheet"
import { useNavigation } from "@react-navigation/native"
import MapView, { Marker, type Region } from "react-native-maps"

import { InlineNotice } from "@/components/InlineNotice"
import { MapMarkerDetailCard } from "@/components/map/MapMarkerDetailCard"
import { MapMarkerLegend } from "@/components/map/MapMarkerLegend"
import { PillButton } from "@/components/map/PillButton"
import { SearchResultsSheet } from "@/components/map/SearchResultsSheet"
import { translate } from "@/i18n/translate"
import type { MainTabScreenProps } from "@/navigators/navigationTypes"
import { upsertConversation } from "@/services/chat/chatService"
import * as diveEventService from "@/services/dives/diveEventService"
import type { DiveEventMarker } from "@/services/dives/types"
import * as mapService from "@/services/location/mapService"
import type { MapUserMarker } from "@/services/location/types"
import { blockUser, REPORT_REASONS, submitReport } from "@/services/moderation/moderationService"
import type { ReportReason } from "@/services/moderation/types"
import { showInfoToast, showSuccessToast } from "@/services/notifications/toastService"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { calculateBounds } from "@/utils/map/calculateBounds"

const initialRegion: Region = {
  latitude: 41.015137,
  longitude: 28.97953,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
}

const DEFAULT_MARKER_Z_INDEX = 1
const SELECTED_MARKER_Z_INDEX = 3
const UNSELECTED_MARKER_SIZE = 28
const SELECTED_MARKER_SIZE = 44
const UNSELECTED_POINTER_HEIGHT = 8
const SELECTED_POINTER_HEIGHT = 12
const UNSELECTED_MARKER_ICON_SIZE = 14
const SELECTED_MARKER_ICON_SIZE = 18
const SELECTED_MARKER_INNER_SIZE = 32
const MARKER_FOOTPRINT_HEIGHT = SELECTED_MARKER_SIZE + SELECTED_POINTER_HEIGHT - 2

interface MapFabProps {
  iconName: React.ComponentProps<typeof Ionicons>["name"]
  accessibilityLabel: string
  testID: string
  onPress: () => void
  disabled?: boolean
  active?: boolean
}

interface MapMarkerPinProps {
  fillColor: string
  iconName: React.ComponentProps<typeof Ionicons>["name"]
  selected: boolean
}

const MapFab: FC<MapFabProps> = ({
  iconName,
  accessibilityLabel,
  testID,
  onPress,
  disabled = false,
  active = false,
}) => {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={themed($fabContainer)}
    >
      <Ionicons name={iconName} size={22} color={active ? colors.tint : colors.text} />
    </Pressable>
  )
}

const MapMarkerPin: FC<MapMarkerPinProps> = ({ fillColor, iconName, selected }) => {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()

  const iconSize = selected ? SELECTED_MARKER_ICON_SIZE : UNSELECTED_MARKER_ICON_SIZE
  const markerOuterColorStyle = {
    borderColor: selected ? colors.palette.neutral100 : fillColor,
    backgroundColor: fillColor,
  }
  const markerPointerColorStyle = { borderTopColor: fillColor }

  return (
    <View style={themed($markerPinContainer)} pointerEvents="none">
      <View
        style={[
          themed(selected ? $selectedMarkerOuter : $unselectedMarkerOuter),
          markerOuterColorStyle,
        ]}
      >
        {selected ? (
          <View style={themed($selectedMarkerInner)}>
            <Ionicons name={iconName} size={iconSize} color={colors.palette.neutral100} />
          </View>
        ) : (
          <Ionicons name={iconName} size={iconSize} color={colors.palette.neutral100} />
        )}
      </View>
      <View
        style={[
          themed(selected ? $selectedMarkerPointer : $unselectedMarkerPointer),
          markerPointerColorStyle,
        ]}
      />
    </View>
  )
}

export const MapScreen: FC = () => {
  const mapRef = useRef<MapView>(null)
  const bottomSheetRef = useRef<BottomSheet>(null)
  const searchSheetRef = useRef<BottomSheetModal>(null)
  const navigation = useNavigation<MainTabScreenProps<"Map">["navigation"]>()
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const { height: windowHeight } = useWindowDimensions()
  const [region, setRegion] = useState<Region>(initialRegion)
  const [markers, setMarkers] = useState<MapUserMarker[]>([])
  const [diveMarkers, setDiveMarkers] = useState<DiveEventMarker[]>([])
  const [selectedDetail, setSelectedDetail] = useState<
    { type: "person"; marker: MapUserMarker } | { type: "event"; marker: DiveEventMarker } | null
  >(null)
  const [errorMessage, setErrorMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isStartingChat, setIsStartingChat] = useState(false)

  const { dismiss: dismissSheet } = useBottomSheetModal()
  const markerDetailMaxHeight = Math.round(windowHeight * 0.85)

  useEffect(() => {
    if (!selectedDetail) return undefined

    const timeout = setTimeout(() => bottomSheetRef.current?.snapToIndex(0), 120)
    return () => clearTimeout(timeout)
  }, [selectedDetail])

  async function searchThisArea() {
    setSelectedDetail(null)
    bottomSheetRef.current?.close()
    searchSheetRef.current?.dismiss()
    setErrorMessage("")

    const boundsResult = calculateBounds(region)
    if (!boundsResult.ok) {
      setErrorMessage(boundsResult.error)
      return
    }

    setIsLoading(true)
    try {
      const [usersResult, divesResult] = await Promise.all([
        mapService.getUsersInView(boundsResult.bounds),
        diveEventService.getDivesInView(boundsResult.bounds),
      ])

      if (!usersResult.ok && !divesResult.ok) {
        setErrorMessage(usersResult.error)
        return
      }

      if (usersResult.ok) setMarkers(usersResult.data)
      if (divesResult.ok) setDiveMarkers(divesResult.data)
      showInfoToast(
        divesResult.ok
          ? translate("mapScreen:foundDiveEvents", { count: divesResult.data.length })
          : translate("mapScreen:foundNearbyDivers", {
              count: usersResult.ok ? usersResult.data.length : 0,
            }),
        { testID: "map-status", visibleMs: 4000 },
      )
      setErrorMessage(
        !usersResult.ok ? usersResult.error : !divesResult.ok ? divesResult.error : "",
      )
    } catch {
      setErrorMessage("Map request failed. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  async function startConversation(otherUserId: string, opponentDisplayName: string) {
    bottomSheetRef.current?.close()
    setIsStartingChat(true)
    setErrorMessage("")
    const result = await upsertConversation(otherUserId)
    setIsStartingChat(false)

    if (!result.ok) {
      setErrorMessage(result.error)
      return
    }

    navigation.navigate("Chat", {
      screen: "ConversationDetail",
      initial: false,
      params: {
        conversationId: result.data.conversationId,
        opponentUserId: otherUserId,
        opponentDisplayName,
      },
    })
  }

  function removeBlockedUserFromResults(userId: string) {
    setMarkers((current) => current.filter((marker) => marker.userId !== userId))
    setDiveMarkers((current) => current.filter((marker) => marker.creatorId !== userId))
    setSelectedDetail(null)
    bottomSheetRef.current?.close()
    dismissSheet()
  }

  function confirmBlockUser(userId: string, displayName: string) {
    Alert.alert(
      translate("moderation:blockUserTitle", { name: displayName }),
      translate("moderation:blockUserMessage"),
      [
        { text: translate("common:cancel"), style: "cancel" },
        {
          text: translate("moderation:blockUserConfirm"),
          style: "destructive",
          onPress: () => void handleBlockUser(userId),
        },
      ],
    )
  }

  async function handleBlockUser(userId: string) {
    setErrorMessage("")
    const result = await blockUser(userId)
    if (!result.ok) {
      setErrorMessage(result.error)
      return
    }

    removeBlockedUserFromResults(userId)
    showSuccessToast(translate("moderation:userBlocked"))
  }

  function chooseReportReason(targetType: "profile" | "dive", targetId: string, userId?: string) {
    Alert.alert(translate("moderation:reportTitle"), translate("moderation:reportMessage"), [
      ...REPORT_REASONS.map((reason) => ({
        text: reason,
        onPress: () => void handleReport(targetType, targetId, reason, userId),
      })),
      { text: translate("common:cancel"), style: "cancel" as const },
    ])
  }

  async function handleReport(
    targetType: "profile" | "dive",
    targetId: string,
    reason: ReportReason,
    userId?: string,
  ) {
    setErrorMessage("")
    const result = await submitReport({ targetType, targetId, reason })
    if (!result.ok) {
      setErrorMessage(result.error)
      return
    }

    showSuccessToast(translate("moderation:reportSubmitted"))
    if (userId) {
      Alert.alert(
        translate("moderation:reportSubmitted"),
        translate("moderation:blockAfterReport"),
        [
          { text: translate("common:cancel"), style: "cancel" },
          {
            text: translate("moderation:blockUserConfirm"),
            style: "destructive",
            onPress: () => void handleBlockUser(userId),
          },
        ],
      )
    }
  }

  function selectUserMarker(marker: MapUserMarker) {
    const detail = { type: "person" as const, marker }
    setSelectedDetail(detail)
  }

  function selectDiveMarker(dive: DiveEventMarker) {
    const detail = { type: "event" as const, marker: dive }
    setSelectedDetail(detail)
  }

  const handleSheetClose = useCallback(() => {
    setSelectedDetail(null)
  }, [])

  const closeMarkerDetail = useCallback(() => {
    bottomSheetRef.current?.close()
    setSelectedDetail(null)
  }, [])

  const getPersonMarkerState = useCallback(
    (marker: MapUserMarker) => {
      return selectedDetail?.type === "person" && selectedDetail.marker.userId === marker.userId
    },
    [selectedDetail],
  )
  const getDiveMarkerState = useCallback(
    (dive: DiveEventMarker) => {
      return selectedDetail?.type === "event" && selectedDetail.marker.id === dive.id
    },
    [selectedDetail],
  )
  const personMarkerColor = colors.tint
  const eventMarkerColor = colors.palette.secondary500
  const selectedPersonMarkerColor = colors.palette.primary400
  const selectedEventMarkerColor = colors.palette.secondary400

  const renderPersonMarkerPin = useCallback(
    (isSelected: boolean) => (
      <MapMarkerPin
        selected={isSelected}
        fillColor={isSelected ? selectedPersonMarkerColor : personMarkerColor}
        iconName="person"
      />
    ),
    [personMarkerColor, selectedPersonMarkerColor],
  )

  const renderEventMarkerPin = useCallback(
    (isSelected: boolean) => (
      <MapMarkerPin
        selected={isSelected}
        fillColor={isSelected ? selectedEventMarkerColor : eventMarkerColor}
        iconName="calendar"
      />
    ),
    [eventMarkerColor, selectedEventMarkerColor],
  )

  return (
    <View style={themed($container)}>
      <MapView
        ref={mapRef}
        testID="map-view"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={StyleSheet.absoluteFillObject}
        initialRegion={initialRegion}
        onRegionChangeComplete={setRegion}
        showsPointsOfInterests={false}
      >
        {markers.map((marker) => {
          const isSelected = getPersonMarkerState(marker)

          return (
            <Marker
              key={marker.userId}
              coordinate={marker.coordinate}
              anchor={{ x: 0.5, y: 1 }}
              title={marker.displayName}
              description={marker.summary}
              zIndex={isSelected ? SELECTED_MARKER_Z_INDEX : DEFAULT_MARKER_Z_INDEX}
              tracksViewChanges
              onPress={() => selectUserMarker(marker)}
              onSelect={() => selectUserMarker(marker)}
            >
              {renderPersonMarkerPin(isSelected)}
            </Marker>
          )
        })}
        {diveMarkers.map((dive) => {
          const isSelected = getDiveMarkerState(dive)

          return (
            <Marker
              key={dive.id}
              coordinate={dive.coordinate}
              anchor={{ x: 0.5, y: 1 }}
              title={dive.title || translate("mapScreen:diveEventFallback")}
              description={dive.creatorDisplayName}
              zIndex={isSelected ? SELECTED_MARKER_Z_INDEX : DEFAULT_MARKER_Z_INDEX}
              tracksViewChanges
              onPress={() => selectDiveMarker(dive)}
              onSelect={() => selectDiveMarker(dive)}
            >
              {renderEventMarkerPin(isSelected)}
            </Marker>
          )
        })}
      </MapView>

      <MapMarkerLegend />

      {/* Pill button — bottom center, shown after search finds results */}
      {(markers.length > 0 || diveMarkers.length > 0) && selectedDetail === null && (
        <View style={themed($pillPosition)} pointerEvents="box-none">
          <PillButton
            iconName="list"
            label={translate("mapScreen:listPillButton")}
            accessibilityLabel={translate("mapScreen:listPillButton")}
            testID="map-search-results-pill-button"
            onPress={() => {
              setSelectedDetail(null)
              dismissSheet()
              searchSheetRef.current?.present()
            }}
          />
        </View>
      )}

      {/* FAB column — right side, stacked bottom-to-top */}
      <View style={themed($fabColumn)} pointerEvents="box-none">
        <MapFab
          iconName="search"
          accessibilityLabel={translate("mapScreen:fabSearchArea")}
          testID="map-search-this-area-button"
          onPress={searchThisArea}
          disabled={isLoading}
        />
      </View>

      {!!errorMessage ? (
        <View style={themed($statusPosition)} pointerEvents="box-none">
          <InlineNotice text={errorMessage} testID="map-error" variant="error" />
        </View>
      ) : null}

      {/* Bottom sheet for marker detail */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        enableDynamicSizing
        maxDynamicContentSize={markerDetailMaxHeight}
        enablePanDownToClose
        onClose={handleSheetClose}
        style={themed($bottomSheet)}
        handleStyle={themed($bottomSheetHandle)}
        handleIndicatorStyle={themed($bottomSheetHandleIndicator)}
        backgroundStyle={themed($bottomSheetBackground)}
      >
        <BottomSheetScrollView contentContainerStyle={themed($bottomSheetContent)}>
          {selectedDetail?.type === "person" && (
            <MapMarkerDetailCard
              type="person"
              marker={selectedDetail.marker}
              isStartingChat={isStartingChat}
              onClose={closeMarkerDetail}
              onMessage={(userId, displayName) => void startConversation(userId, displayName)}
              onReportUser={(userId) => chooseReportReason("profile", userId, userId)}
              onBlockUser={confirmBlockUser}
            />
          )}
          {selectedDetail?.type === "event" && (
            <MapMarkerDetailCard
              type="event"
              marker={selectedDetail.marker}
              isStartingChat={isStartingChat}
              onClose={closeMarkerDetail}
              onMessage={(userId, displayName) => void startConversation(userId, displayName)}
              onReportUser={(userId) => chooseReportReason("profile", userId, userId)}
              onReportEvent={(eventId) =>
                chooseReportReason("dive", eventId, selectedDetail.marker.creatorId)
              }
              onBlockUser={confirmBlockUser}
            />
          )}
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Search results sheet — list of people + events */}
      <SearchResultsSheet
        people={markers}
        events={diveMarkers}
        onSelectPerson={(marker) => {
          searchSheetRef.current?.dismiss()
          setTimeout(() => selectUserMarker(marker), 300)
        }}
        onSelectEvent={(event) => {
          searchSheetRef.current?.dismiss()
          setTimeout(() => selectDiveMarker(event), 300)
        }}
        sheetRef={searchSheetRef}
      />
    </View>
  )
}

const $container: ViewStyle = {
  flex: 1,
}

const $fabColumn: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  right: spacing.md,
  bottom: spacing.md,
  gap: spacing.xs + 4,
  alignItems: "center",
})

const $pillPosition: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  bottom: spacing.md + 24,
  left: 0,
  right: 0,
  alignItems: "center",
  pointerEvents: "box-none",
})

const $fabContainer: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 48,
  height: 48,
  borderRadius: 24,
  backgroundColor: colors.palette.neutral100,
  shadowColor: colors.palette.neutral900,
  shadowOpacity: 0.25,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 2 },
  elevation: 4,
  alignItems: "center",
  justifyContent: "center",
})

const $markerPinContainer: ThemedStyle<ViewStyle> = () => ({
  width: SELECTED_MARKER_SIZE,
  height: MARKER_FOOTPRINT_HEIGHT,
  alignItems: "center",
  justifyContent: "flex-end",
})

const $selectedMarkerOuter: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: SELECTED_MARKER_SIZE,
  height: SELECTED_MARKER_SIZE,
  borderRadius: SELECTED_MARKER_SIZE / 2,
  borderWidth: 3,
  alignItems: "center",
  justifyContent: "center",
  shadowColor: colors.palette.neutral900,
  shadowOpacity: 0.3,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 4 },
  elevation: 8,
})

const $unselectedMarkerOuter: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: UNSELECTED_MARKER_SIZE,
  height: UNSELECTED_MARKER_SIZE,
  borderRadius: UNSELECTED_MARKER_SIZE / 2,
  borderWidth: 0,
  alignItems: "center",
  justifyContent: "center",
  shadowColor: colors.palette.neutral900,
  shadowOpacity: 0.18,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 2 },
  elevation: 3,
})

const $selectedMarkerInner: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: SELECTED_MARKER_INNER_SIZE,
  height: SELECTED_MARKER_INNER_SIZE,
  borderRadius: SELECTED_MARKER_INNER_SIZE / 2,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: colors.palette.overlay20,
})

const $selectedMarkerPointer: ThemedStyle<ViewStyle> = () => ({
  width: 0,
  height: 0,
  marginTop: -2,
  borderLeftWidth: 8,
  borderRightWidth: 8,
  borderTopWidth: SELECTED_POINTER_HEIGHT,
  borderLeftColor: "transparent",
  borderRightColor: "transparent",
})

const $unselectedMarkerPointer: ThemedStyle<ViewStyle> = () => ({
  width: 0,
  height: 0,
  marginTop: -1,
  borderLeftWidth: 6,
  borderRightWidth: 6,
  borderTopWidth: UNSELECTED_POINTER_HEIGHT,
  borderLeftColor: "transparent",
  borderRightColor: "transparent",
})

const $statusPosition: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  left: spacing.md,
  right: 80,
  bottom: spacing.md,
})

const $bottomSheet: ThemedStyle<ViewStyle> = () => ({
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
})

const $bottomSheetBackground: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.neutral100,
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
})

const $bottomSheetContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.md,
})

const $bottomSheetHandle: ThemedStyle<ViewStyle> = () => ({
  paddingTop: 12,
  paddingBottom: 4,
})

const $bottomSheetHandleIndicator: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.neutral400,
  width: 36,
  height: 4,
  borderRadius: 2,
})
