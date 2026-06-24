import { Pressable, TextStyle, View, ViewStyle } from "react-native"
import { BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { format } from "date-fns"

import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
import type { DiveEventMarker } from "@/services/dives/types"
import type { MapUserMarker } from "@/services/location/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

type SearchResultsSheetProps = {
  people: MapUserMarker[]
  events: DiveEventMarker[]
  onSelectPerson: (marker: MapUserMarker) => void
  onSelectEvent: (event: DiveEventMarker) => void
  sheetRef: React.RefObject<BottomSheetModal | null>
}

export function SearchResultsSheet({
  people,
  events,
  onSelectPerson,
  onSelectEvent,
  sheetRef,
}: SearchResultsSheetProps) {
  const { themed } = useAppTheme()

  const hasNoResults = people.length === 0 && events.length === 0

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={["75%"]}
      enablePanDownToClose
      style={themed($bottomSheet)}
      handleStyle={themed($bottomSheetHandle)}
      handleIndicatorStyle={themed($bottomSheetHandleIndicator)}
      backgroundStyle={themed($bottomSheetBackground)}
    >
      <BottomSheetScrollView contentContainerStyle={themed($bottomSheetContent)}>
        {hasNoResults ? (
          <Text tx="mapScreen:listSheetNoResults" style={themed($emptyText)} />
        ) : (
          <View style={themed($sheetContainer)}>
            {/* People section */}
            <View>
              <Text
                tx="mapScreen:listSheetPeopleSection"
                preset="bold"
                style={themed($sectionHeader)}
              />
              {people.length === 0 ? (
                <Text tx="mapScreen:listSheetPeopleEmpty" style={themed($emptyText)} />
              ) : (
                people.map((marker) => {
                  return (
                    <Pressable
                      key={marker.userId}
                      testID={`map-search-result-person-${marker.userId}`}
                      accessibilityLabel={marker.displayName}
                      accessibilityRole="button"
                      onPress={() => onSelectPerson(marker)}
                      style={themed($personRow)}
                    >
                      <View style={themed($avatarCircle)}>
                        <Text
                          text={marker.displayName.charAt(0).toUpperCase()}
                          style={themed($avatarText)}
                        />
                      </View>
                      <View style={themed($personInfo)}>
                        <Text text={marker.displayName} preset="bold" />
                        <Text
                          text={marker.summary || translate("mapScreen:nearbyDiverFallback")}
                          size="xs"
                          style={themed($metadata)}
                        />
                      </View>
                    </Pressable>
                  )
                })
              )}
            </View>

            {/* Events section */}
            <View>
              <Text
                tx="mapScreen:listSheetEventsSection"
                preset="bold"
                style={themed($sectionHeader)}
              />
              {events.length === 0 ? (
                <Text tx="mapScreen:listSheetEventsEmpty" style={themed($emptyText)} />
              ) : (
                events.map((event) => {
                  const eventTitle = event.title || translate("mapScreen:diveEventFallback")
                  return (
                    <Pressable
                      key={event.id}
                      testID={`map-search-result-event-${event.id}`}
                      accessibilityLabel={eventTitle}
                      accessibilityRole="button"
                      onPress={() => onSelectEvent(event)}
                      style={themed($eventRow)}
                    >
                      <View style={themed($eventTitleRow)}>
                        <View style={themed($eventDot)} />
                        <Text text={eventTitle} preset="bold" />
                      </View>
                      <Text
                        text={format(new Date(event.eventAt), "PPp")}
                        size="xs"
                        style={themed($metadata)}
                      />
                      <Text
                        text={
                          translate("mapScreen:eventOrganizer") + ": " + event.creatorDisplayName
                        }
                        size="xs"
                        style={themed($metadata)}
                      />
                    </Pressable>
                  )
                })
              )}
            </View>
          </View>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  )
}

// --- Bottom sheet handle/background styles (matching MapScreen) ---

const $bottomSheet: ThemedStyle<ViewStyle> = () => ({
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
})

const $bottomSheetBackground: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.neutral100,
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
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

const $bottomSheetContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
})

// --- Sheet content styles ---

const $sheetContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  gap: spacing.lg,
  paddingBottom: spacing.xl,
})

const $sectionHeader: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginBottom: spacing.sm,
})

const $personRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.md,
  paddingVertical: spacing.sm,
  borderBottomWidth: 1,
  borderColor: colors.separator,
})

const $avatarCircle: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 36,
  height: 36,
  borderRadius: 18,
  backgroundColor: colors.tint,
  alignItems: "center",
  justifyContent: "center",
})

const $avatarText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  fontSize: 18,
  fontWeight: "bold",
})

const $personInfo: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  gap: spacing.xxxs,
})

const $eventRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  paddingVertical: spacing.sm,
  borderBottomWidth: 1,
  borderColor: colors.separator,
})

const $eventTitleRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})

const $eventDot: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 12,
  height: 12,
  borderRadius: 6,
  backgroundColor: colors.palette.secondary500,
})

const $metadata: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $emptyText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textDim,
  paddingVertical: spacing.sm,
})
