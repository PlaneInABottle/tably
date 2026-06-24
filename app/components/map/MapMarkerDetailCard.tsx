import { TextStyle, View, ViewStyle } from "react-native"
import { format } from "date-fns"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
import type { DiveEventMarker } from "@/services/dives/types"
import type { MapUserMarker } from "@/services/location/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

type MapMarkerDetailCardProps =
  | {
      type: "person"
      marker: MapUserMarker
      isStartingChat: boolean
      onClose: () => void
      onMessage: (userId: string, displayName: string) => void
      onReportUser: (userId: string, displayName: string) => void
      onBlockUser: (userId: string, displayName: string) => void
    }
  | {
      type: "event"
      marker: DiveEventMarker
      isStartingChat: boolean
      onClose: () => void
      onMessage: (userId: string, displayName: string) => void
      onReportUser: (userId: string, displayName: string) => void
      onReportEvent: (eventId: string, title: string) => void
      onBlockUser: (userId: string, displayName: string) => void
    }

export function MapMarkerDetailCard(props: MapMarkerDetailCardProps) {
  if (props.type === "person") return <PersonDetailCard {...props} />
  return <EventDetailCard {...props} />
}

function PersonDetailCard(props: Extract<MapMarkerDetailCardProps, { type: "person" }>) {
  const { themed } = useAppTheme()
  const { marker } = props

  return (
    <View
      testID="map-person-detail-card"
      accessibilityLabel={`Diver detail ${marker.displayName}`}
      style={themed($card)}
    >
      <View style={themed($header)}>
        <View style={themed($avatarCircle)}>
          <Text
            text={marker.displayName.charAt(0).toUpperCase()}
            preset="bold"
            style={themed($avatarText)}
          />
        </View>
        <View style={themed($headerText)}>
          <Text text={marker.displayName} preset="bold" />
          <Text tx="mapScreen:personMarkerLabel" size="xs" style={themed($metadata)} />
        </View>
      </View>
      <Text
        text={marker.summary || translate("mapScreen:nearbyDiverFallback")}
        style={themed($body)}
      />
      {!marker.isSelf ? (
        <View style={themed($actions)}>
          <Button
            tx="mapScreen:messageDiver"
            accessibilityLabel="Message diver"
            testID="map-message-diver-button"
            disabled={props.isStartingChat}
            onPress={() => props.onMessage(marker.userId, marker.displayName)}
            preset="filled"
            style={themed($actionButton)}
          />
          <Button
            tx="mapScreen:reportDiver"
            accessibilityLabel="Report diver"
            testID="map-report-diver-button"
            onPress={() => props.onReportUser(marker.userId, marker.displayName)}
            style={themed($secondaryButton)}
          />
          <Button
            tx="mapScreen:blockDiver"
            accessibilityLabel="Block diver"
            testID="map-block-diver-button"
            onPress={() => props.onBlockUser(marker.userId, marker.displayName)}
            style={themed($dangerButton)}
            textStyle={themed($dangerButtonText)}
          />
        </View>
      ) : null}
    </View>
  )
}

function EventDetailCard(props: Extract<MapMarkerDetailCardProps, { type: "event" }>) {
  const { themed } = useAppTheme()
  const { marker } = props
  const title = marker.title || translate("mapScreen:diveEventFallback")

  return (
    <View
      testID="map-event-detail-card"
      accessibilityLabel={`Dive event detail ${title}`}
      style={themed($card)}
    >
      <View style={themed($eventIconRow)}>
        <View style={themed($eventDot)} />
        <Text text={title} preset="bold" style={themed($eventTitle)} />
      </View>
      <Text text={format(new Date(marker.eventAt), "PPp")} size="sm" style={themed($metadata)} />
      {!!marker.description && <Text text={marker.description} style={themed($body)} />}
      <View style={themed($detailRow)}>
        <Text
          text={`${translate("mapScreen:eventOrganizer")}: ${marker.creatorDisplayName}`}
          size="sm"
          style={themed($metadata)}
        />
      </View>
      {!!marker.locationLabelSnapshot && (
        <View style={themed($detailRow)}>
          <Text
            text={`${translate("mapScreen:locationLabelSnapshot")}: ${marker.locationLabelSnapshot}`}
            size="sm"
            style={themed($metadata)}
          />
        </View>
      )}
      {!marker.isOwn ? (
        <View style={themed($actions)}>
          <Button
            tx="mapScreen:messageOrganizer"
            accessibilityLabel="Message event organizer"
            testID="map-message-event-organizer-button"
            disabled={props.isStartingChat}
            onPress={() => props.onMessage(marker.creatorId, marker.creatorDisplayName)}
            preset="filled"
            style={themed($actionButton)}
          />
          <Button
            tx="mapScreen:reportEvent"
            accessibilityLabel="Report event"
            testID="map-report-event-button"
            onPress={() => props.onReportEvent(marker.id, title)}
            style={themed($secondaryButton)}
          />
          <Button
            tx="mapScreen:blockOrganizer"
            accessibilityLabel="Block organizer"
            testID="map-block-event-organizer-button"
            onPress={() => props.onBlockUser(marker.creatorId, marker.creatorDisplayName)}
            style={themed($dangerButton)}
            textStyle={themed($dangerButtonText)}
          />
        </View>
      ) : null}
    </View>
  )
}

const $card: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
  paddingBottom: spacing.lg,
})

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.md,
})

const $avatarCircle: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: colors.tint,
  alignItems: "center",
  justifyContent: "center",
})

const $avatarText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  fontSize: 18,
})

const $headerText: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $eventIconRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
})

const $eventDot: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 12,
  height: 12,
  borderRadius: 6,
  backgroundColor: colors.palette.secondary500,
})

const $eventTitle: ThemedStyle<TextStyle> = () => ({
  flex: 1,
})

const $body: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $metadata: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $detailRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
})

const $actionButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.tint,
  borderRadius: 12,
  minHeight: 44,
})

const $actions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})

const $secondaryButton: ThemedStyle<ViewStyle> = () => ({
  minHeight: 44,
})

const $dangerButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  borderColor: colors.error,
  minHeight: 44,
})

const $dangerButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.error,
})
