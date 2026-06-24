---
name: diving-buddies-map
description: "Use for Diving Buddies Map screen work: MapScreen, react-native-maps markers, search-this-area, marker detail sheets, search result sheets, location UI, map Maestro tests, and map-related bugs."
---

# Diving Buddies Map

## Where Things Live

- Main screen: `app/screens/main/MapScreen.tsx`
- Marker detail card: `app/components/map/MapMarkerDetailCard.tsx`
- Search list sheet: `app/components/map/SearchResultsSheet.tsx`
- Legend/pill UI: `app/components/map/MapMarkerLegend.tsx`, `app/components/map/PillButton.tsx`
- Map services: `app/services/location/mapService.ts`, `app/services/dives/diveEventService.ts`
- Bounds helper: `app/utils/map/calculateBounds.ts`
- Maestro flows: `.maestro/flows/map-search-area.yaml`, `.maestro/flows/dive-event-map-search.yaml`, `.maestro/flows/map-saved-location-event-redesign.yaml`

## Current Map Contract

- App markers are shown only after `searchThisArea()` populates `markers` and `diveMarkers`.
- Apple Maps base-map labels are not app markers. `MapView` sets `showsPointsOfInterests={false}` to reduce confusing native POIs.
- Search status is a top toast via `showInfoToast(..., { testID: "map-status", visibleMs: 4000 })`, not an inline persistent notice.
- Error messages remain inline through `InlineNotice` with `testID="map-error"`.
- The result list pill appears only when there are people or dive events and no marker detail is selected.

## Marker Rules

- Keep marker geometry stable:
  - unselected marker size: `28`
  - selected marker size: `44`
  - footprint height: `SELECTED_MARKER_SIZE + SELECTED_POINTER_HEIGHT - 2`
  - `anchor={{ x: 0.5, y: 1 }}`
- Do not add large labels inside custom marker views without recalculating anchor/hit behavior. It changes perceived marker position.
- Keep `title` and `description` on `Marker`; iOS uses them for native callouts and users expect event/diver names there.
- Use both `onPress` and `onSelect` on markers. iOS can select the annotation/callout path without behaving exactly like a normal React press.
- The marker custom view uses `pointerEvents="none"` so the native marker receives the tap.

## Bottom Sheet Rules

- Marker details use regular `BottomSheet`, not `BottomSheetModal`.
- Search results use `BottomSheetModal` and should stay modal.
- Marker detail opens by setting `selectedDetail`, then deferring `bottomSheetRef.current?.snapToIndex(0)` by a short timeout. This avoids the iOS MapKit callout selection race.
- Close marker detail with `bottomSheetRef.current?.close()` and clear `selectedDetail`.
- If marker state changes but no sheet opens, inspect whether the native callout selected the marker and whether `selectedDetail` was cleared by `onClose`.

## Debug Workflow

1. Check `MapScreen.tsx` diff against the last working commit before changing marker geometry.
2. Use Context7 for unfamiliar `react-native-maps` or `@gorhom/bottom-sheet` behavior.
3. Verify cold start: Map screen should have no app markers and no result pill before Search.
4. Tap Search and wait for `map-status` plus `map-search-results-pill-button`.
5. Take a Maestro screenshot before tapping a marker. Coordinates shift between launches; stale coordinates are not evidence.
6. Tap the marker icon body, not the pin tail. Then assert `map-person-detail-card` or `map-event-detail-card`.

## Common Maestro Checks

Use the installed dev app id:

```yaml
appId: com.divingbuddies.app
---
- assertNotVisible:
    id: map-search-results-pill-button
- tapOn:
    id: map-search-this-area-button
- extendedWaitUntil:
    visible:
      id: map-status
    timeout: 30000
- assertVisible:
    id: map-search-results-pill-button
```

For live marker tapping, take a screenshot and target the visible icon center. Do not hard-code old map coordinates.
