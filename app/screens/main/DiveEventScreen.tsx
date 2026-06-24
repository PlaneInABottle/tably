import { FC, useCallback, useState } from "react"
import { Alert, Pressable, TextStyle, View, ViewStyle } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import DateTimePicker from "@react-native-community/datetimepicker"
import { useFocusEffect } from "@react-navigation/native"
import { format } from "date-fns"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Button } from "@/components/Button"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import type { TxKeyPath } from "@/i18n"
import { translate } from "@/i18n/translate"
import * as diveEventService from "@/services/dives/diveEventService"
import type { DiveEvent } from "@/services/dives/types"
import { DIVE_DESCRIPTION_MAX_LENGTH, DIVE_TITLE_MAX_LENGTH } from "@/services/dives/types"
import { listOwnSavedLocations } from "@/services/location/locationService"
import type { SavedLocation } from "@/services/location/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const nextDiveDate = () => new Date(Date.now() + 24 * 60 * 60 * 1000)

export const DiveEventScreen: FC = () => {
  const { theme, themed } = useAppTheme()
  const { bottom } = useSafeAreaInsets()

  const [events, setEvents] = useState<DiveEvent[]>([])
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([])
  const [editingDiveId, setEditingDiveId] = useState<string | null>(null)

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [eventAt, setEventAt] = useState(nextDiveDate())
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)

  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const now = new Date()
  const upcomingEvents = events
    .filter((event) => new Date(event.eventAt).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.eventAt).getTime() - new Date(b.eventAt).getTime())
  const pastEvents = events
    .filter((event) => new Date(event.eventAt).getTime() < now.getTime())
    .sort((a, b) => new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime())

  const resetForm = useCallback((locations: SavedLocation[]) => {
    setTitle("")
    setDescription("")
    setEventAt(nextDiveDate())
    const firstLocation = locations[0]
    setSelectedLocationId(firstLocation?.id ?? null)
  }, [])

  const loadScreen = useCallback(async () => {
    setIsLoading(true)
    setError("")

    const [eventsResult, locationsResult] = await Promise.all([
      diveEventService.listOwnDives(),
      listOwnSavedLocations(),
    ])

    setIsLoading(false)

    if (!locationsResult.ok) {
      setError(locationsResult.error)
      return
    }
    setSavedLocations(locationsResult.data)

    if (!eventsResult.ok) {
      setError(eventsResult.error)
      return
    }

    setEvents(eventsResult.data)
    setIsEditing(false)
    setEditingDiveId(null)
    resetForm(locationsResult.data)
  }, [resetForm])

  useFocusEffect(
    useCallback(() => {
      void loadScreen()
    }, [loadScreen]),
  )

  function fillForm(nextDive: DiveEvent) {
    setTitle(nextDive.title ?? "")
    setDescription(nextDive.description)
    setEventAt(new Date(nextDive.eventAt))
    setSelectedLocationId(nextDive.locationId)
  }

  function enterCreateMode() {
    resetForm(savedLocations)
    setEditingDiveId(null)
    setIsEditing(true)
    setMessage("")
    setError("")
  }

  function enterEditMode(nextDive: DiveEvent) {
    fillForm(nextDive)
    setEditingDiveId(nextDive.id)
    setIsEditing(true)
    setMessage("")
    setError("")
  }

  function cancelEdit() {
    setIsEditing(false)
    setEditingDiveId(null)
    setMessage("")
    setError("")
    resetForm(savedLocations)
  }

  function validateForm() {
    if (title.length > DIVE_TITLE_MAX_LENGTH) return translate("diveEventScreen:titleTooLong")
    if (!description.trim()) return translate("diveEventScreen:descriptionRequired")
    if (description.length > DIVE_DESCRIPTION_MAX_LENGTH)
      return translate("diveEventScreen:descriptionTooLong")
    if (!selectedLocationId) return translate("diveEventScreen:locationRequired")
    return ""
  }

  async function saveDive() {
    setMessage("")
    setError("")
    const validationError = validateForm()
    if (validationError || !selectedLocationId) {
      setError(validationError)
      return
    }

    setIsSaving(true)
    const result = await diveEventService.upsertOwnDiveFromLocation({
      title,
      description: description.trim(),
      eventAt: eventAt.toISOString(),
      locationId: selectedLocationId,
      diveId: editingDiveId,
    })
    setIsSaving(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    setEvents((currentEvents) => {
      const existingEvent = currentEvents.find((item) => item.id === result.data.id)

      const nextEvents = existingEvent
        ? currentEvents.map((item) => (item.id === result.data.id ? result.data : item))
        : [result.data, ...currentEvents]

      return nextEvents.sort((a, b) => {
        const firstEventAt = new Date(a.eventAt).getTime()
        const secondEventAt = new Date(b.eventAt).getTime()
        return secondEventAt - firstEventAt
      })
    })

    setIsEditing(false)
    setEditingDiveId(null)
    setMessage(translate("diveEventScreen:saved"))
  }

  function confirmDelete(eventId: string) {
    Alert.alert(
      translate("diveEventScreen:deleteConfirmTitle"),
      translate("diveEventScreen:deleteConfirmMessage"),
      [
        { text: translate("diveEventScreen:deleteCancel"), style: "cancel" },
        {
          text: translate("diveEventScreen:deleteConfirm"),
          style: "destructive",
          onPress: () => {
            void deleteDive(eventId)
          },
        },
      ],
    )
  }

  async function deleteDive(eventId: string) {
    setError("")
    setMessage("")
    setIsSaving(true)
    const result = await diveEventService.deleteOwnDive(eventId)
    setIsSaving(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    setEvents((currentEvents) => currentEvents.filter((event) => event.id !== eventId))

    if (editingDiveId === eventId) {
      cancelEdit()
    }

    setMessage(translate("diveEventScreen:deleted"))
  }

  function selectLocation(location: SavedLocation) {
    setSelectedLocationId(location.id)
    setMessage(translate("diveEventScreen:locationSelected"))
    setError("")
  }

  function renderEmptyList() {
    return (
      <View testID="dive-event-empty-state" style={themed($card)}>
        <Text tx="diveEventScreen:emptyTitle" preset="subheading" style={themed($sectionTitle)} />
        <Text tx="diveEventScreen:emptyMessage" style={themed($body)} />
      </View>
    )
  }

  function renderSection(
    titleTx: TxKeyPath,
    data: DiveEvent[],
    emptyTx: TxKeyPath,
    testID: string,
  ) {
    return (
      <View testID={testID} style={themed($sectionCard)}>
        <Text text={translate(titleTx)} preset="subheading" style={themed($sectionTitle)} />
        {data.length === 0 ? (
          <Text text={translate(emptyTx)} style={themed($metadata)} />
        ) : (
          <View style={themed($eventList)}>
            {data.map((event, index) => {
              const selectedLocation = savedLocations.find(
                (location) => location.id === event.locationId,
              )

              return (
                <View key={event.id} style={themed($eventCard)}>
                  <View style={themed($eventHeaderRow)}>
                    <View style={themed($eventTitleColumn)}>
                      <Text
                        text={event.title || translate("diveEventScreen:untitledEvent")}
                        preset="bold"
                        numberOfLines={1}
                        style={themed($eventTitle)}
                      />
                      <Text
                        text={format(new Date(event.eventAt), "PPp")}
                        size="xxs"
                        style={themed($eventDate)}
                      />
                    </View>
                    <View style={themed($eventActionRow)}>
                      <Pressable
                        testID={
                          index === 0 ? "dive-event-edit-button" : `dive-event-edit-${event.id}`
                        }
                        accessibilityLabel={`Edit dive event ${event.id}`}
                        accessibilityRole="button"
                        onPress={() => enterEditMode(event)}
                        style={themed($eventIconButton)}
                        disabled={isSaving}
                      >
                        <Ionicons name="create-outline" size={18} color={theme.colors.textDim} />
                      </Pressable>
                      <Pressable
                        testID={
                          index === 0 ? "dive-event-delete-button" : `dive-event-delete-${event.id}`
                        }
                        accessibilityLabel={`Delete dive event ${event.id}`}
                        accessibilityRole="button"
                        onPress={() => confirmDelete(event.id)}
                        style={themed($eventIconButton)}
                        disabled={isSaving}
                      >
                        <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
                      </Pressable>
                    </View>
                  </View>
                  <Text
                    text={event.description}
                    numberOfLines={2}
                    size="xs"
                    style={themed($eventDescription)}
                  />
                  <Text
                    text={`${translate("diveEventScreen:fromSavedLocation")}: ${event.locationLabelSnapshot || selectedLocation?.label || translate("diveEventScreen:locationSnapshotFallback")}`}
                    numberOfLines={1}
                    size="xxs"
                    style={themed($eventLocation)}
                  />
                </View>
              )
            })}
          </View>
        )}
      </View>
    )
  }

  function renderList() {
    return (
      <>
        {events.length === 0 ? (
          renderEmptyList()
        ) : (
          <>
            {renderSection(
              "diveEventScreen:upcomingEvents",
              upcomingEvents,
              "diveEventScreen:noUpcomingEvents",
              "dive-event-upcoming-section",
            )}
            {renderSection(
              "diveEventScreen:pastEvents",
              pastEvents,
              "diveEventScreen:noPastEvents",
              "dive-event-past-section",
            )}
          </>
        )}
      </>
    )
  }

  function renderLocationPicker() {
    const selectedLocation = savedLocations.find((location) => location.id === selectedLocationId)

    return (
      <View style={themed($section)}>
        <Text
          tx="diveEventScreen:savedLocationSelector"
          preset="formLabel"
          style={themed($fieldLabel)}
        />
        <Text tx="diveEventScreen:savedLocationHint" style={themed($metadata)} />
        {savedLocations.length === 0 ? renderNoSavedLocations() : renderSavedLocationOptions()}
        {!!selectedLocation && (
          <Text
            text={`${translate("diveEventScreen:locationSelected")}: ${selectedLocation.label} (${selectedLocation.coordinate.latitude.toFixed(4)}, ${selectedLocation.coordinate.longitude.toFixed(4)})`}
            testID="dive-event-selected-location"
            style={themed($metadata)}
          />
        )}
      </View>
    )
  }

  function renderNoSavedLocations() {
    return (
      <View testID="dive-event-no-saved-locations" style={themed($emptyLocationCard)}>
        <Text tx="diveEventScreen:noSavedLocations" style={themed($body)} />
      </View>
    )
  }

  function renderSavedLocationOptions() {
    return (
      <View testID="dive-event-saved-location-list" style={themed($locationList)}>
        {savedLocations.map((location) => {
          const selected = location.id === selectedLocationId
          return (
            <Pressable
              key={location.id}
              accessibilityLabel={`Select saved location ${location.label}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              testID={`dive-event-saved-location-${location.id}`}
              onPress={() => selectLocation(location)}
              style={themed([$locationOption, selected && $selectedLocationOption])}
            >
              <Text text={location.label} preset="bold" />
              <Text
                text={`${location.coordinate.latitude.toFixed(4)}, ${location.coordinate.longitude.toFixed(4)}`}
                size="xs"
                style={themed($metadata)}
              />
            </Pressable>
          )
        })}
      </View>
    )
  }

  function renderDatePicker() {
    return (
      <View style={themed($section)}>
        <Text tx="diveEventScreen:eventAtLabel" preset="formLabel" style={themed($fieldLabel)} />
        <Text tx="diveEventScreen:eventAtHint" style={themed($metadata)} />
        <DateTimePicker
          testID="dive-event-date-picker"
          value={eventAt}
          mode="datetime"
          display="compact"
          minimumDate={new Date()}
          onChange={(_, selectedDate) => {
            if (selectedDate) setEventAt(selectedDate)
          }}
        />
      </View>
    )
  }

  function renderFormActions() {
    return (
      <View style={themed($buttonRow)}>
        <Button
          tx="diveEventScreen:save"
          testID="dive-event-save-button"
          accessibilityLabel="Dive event save"
          preset="reversed"
          onPress={saveDive}
          disabled={isSaving}
          style={themed($button)}
        />
        <Button
          tx="diveEventScreen:cancelEdit"
          testID="dive-event-cancel-edit-button"
          accessibilityLabel="Dive event cancel edit"
          onPress={cancelEdit}
          disabled={isSaving}
          style={themed($button)}
        />
      </View>
    )
  }

  function renderForm() {
    return (
      <View style={themed($card)}>
        <TextField
          labelTx="diveEventScreen:eventTitleLabel"
          placeholderTx="diveEventScreen:eventTitlePlaceholder"
          accessibilityLabel="Dive event title"
          testID="dive-event-title-input"
          value={title}
          onChangeText={setTitle}
          maxLength={DIVE_TITLE_MAX_LENGTH}
          helper={translate("diveEventScreen:titleCounter", {
            count: title.length,
            max: DIVE_TITLE_MAX_LENGTH,
          })}
          containerStyle={themed($field)}
        />
        <TextField
          labelTx="diveEventScreen:descriptionLabel"
          placeholderTx="diveEventScreen:descriptionPlaceholder"
          accessibilityLabel="Dive event description"
          testID="dive-event-description-input"
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={DIVE_DESCRIPTION_MAX_LENGTH}
          helper={translate("diveEventScreen:descriptionCounter", {
            count: description.length,
            max: DIVE_DESCRIPTION_MAX_LENGTH,
          })}
          containerStyle={themed($field)}
        />
        {renderDatePicker()}
        {renderLocationPicker()}
        {renderFormActions()}
      </View>
    )
  }

  function renderContent() {
    return (
      <>
        {isEditing ? renderForm() : renderList()}
        {!!message && (
          <Text
            text={message}
            accessibilityRole="alert"
            testID="dive-event-success"
            style={themed($message)}
          />
        )}
        {!!error && (
          <Text
            text={error}
            accessibilityRole="alert"
            testID="dive-event-error"
            style={themed($error)}
          />
        )}
      </>
    )
  }

  return (
    <Screen
      preset="auto"
      safeAreaEdges={["top"]}
      contentContainerStyle={themed([$container, $containerBottomInset(bottom)])}
    >
      <View style={themed($headerRow)}>
        {isEditing && (
          <Pressable
            testID="dive-event-header-back-button"
            accessibilityLabel="Back to dive events"
            accessibilityRole="button"
            onPress={cancelEdit}
            style={themed($headerBackButton)}
          >
            <Ionicons name="chevron-back" size={28} color={theme.colors.text} />
          </Pressable>
        )}
        <Text
          tx={
            isEditing
              ? editingDiveId
                ? "diveEventScreen:edit"
                : "diveEventScreen:create"
              : "diveEventScreen:title"
          }
          preset={isEditing ? "bold" : "heading"}
          size={isEditing ? "xl" : undefined}
          numberOfLines={1}
          style={themed($title)}
        />
      </View>
      {!isEditing && (
        <Button
          tx="diveEventScreen:create"
          testID="dive-event-create-button"
          accessibilityLabel="Dive event create"
          onPress={enterCreateMode}
          disabled={isSaving}
          preset="reversed"
          LeftAccessory={() => (
            <Ionicons name="add" size={20} color={theme.colors.palette.neutral100} />
          )}
          style={themed($fullWidthButton)}
        />
      )}
      {isLoading ? <Text tx="diveEventScreen:loading" style={themed($message)} /> : renderContent()}
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.xxl,
})

const $containerBottomInset =
  (bottomInset: number): ThemedStyle<ViewStyle> =>
  ({ spacing }) => ({
    paddingBottom: bottomInset + 70 + spacing.xl,
  })

const $headerRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  marginBottom: spacing.lg,
})

const $headerBackButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: 44,
  height: 44,
  alignItems: "center",
  justifyContent: "center",
  marginLeft: -spacing.sm,
  borderRadius: 8,
})

const $title: ThemedStyle<TextStyle> = () => ({
  flex: 1,
})

const $card: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  padding: spacing.md,
  borderRadius: 16,
  backgroundColor: colors.palette.neutral100,
  borderWidth: 1,
  borderColor: colors.separator,
  marginBottom: spacing.md,
})

const $sectionTitle: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginBottom: spacing.sm,
})

const $section: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  paddingTop: spacing.md,
  marginTop: spacing.xs,
  marginBottom: spacing.md,
  borderTopWidth: 1,
  borderTopColor: colors.separator,
})

const $sectionCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.md,
})

const $fullWidthButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.lg,
})

const $eventList: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})

const $eventCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderColor: colors.separator,
  borderWidth: 1,
  borderRadius: 12,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.sm,
  backgroundColor: colors.palette.neutral100,
})

const $eventHeaderRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "flex-start",
  gap: spacing.xs,
})

const $eventTitleColumn: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  minWidth: 0,
})

const $eventTitle: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginBottom: spacing.xxxs,
})

const $eventDate: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $eventActionRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xxs,
})

const $eventIconButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 40,
  height: 40,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 8,
  backgroundColor: colors.palette.neutral200,
})

const $eventDescription: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.text,
  marginTop: spacing.xs,
  marginBottom: spacing.xs,
})

const $eventLocation: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $body: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.text,
  marginBottom: spacing.sm,
})

const $metadata: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textDim,
  marginBottom: spacing.sm,
})

const $field: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.md,
})

const $emptyLocationCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderColor: colors.separator,
  borderRadius: 12,
  borderWidth: 1,
  marginBottom: spacing.md,
  padding: spacing.md,
})

const $locationList: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
  marginBottom: spacing.md,
})

const $locationOption: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderColor: colors.separator,
  borderRadius: 12,
  borderWidth: 1,
  padding: spacing.md,
})

const $selectedLocationOption: ThemedStyle<ViewStyle> = ({ colors }) => ({
  borderColor: colors.tint,
  backgroundColor: colors.palette.neutral200,
})

const $fieldLabel: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginBottom: spacing.xs,
})

const $message: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.tint,
  marginBottom: spacing.md,
})

const $error: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.error,
  marginBottom: spacing.md,
})

const $buttonRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
  marginTop: spacing.md,
  marginBottom: spacing.sm,
})

const $button: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})
