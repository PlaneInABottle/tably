# Map Screen List View Redesign — Implementation Plan

## Problem Statement

The map screen currently shows dive events in a left-side overlay card (`ScannedEventsList`) toggled by a circular FAB button on the right side. This doesn't surface people (divers) at all in the list view, and the UX flow of toggling a sidebar card is awkward. The redesign replaces this with a center-bottom pill button that opens a tall bottom sheet showing both people and events in two clearly-separated sections, and removes the old overlay entirely.

## Approach

Incremental replacement: build the new components alongside the existing ones, then remove the old code in the final phase. This keeps each phase independently committable and avoids breaking the UI at any commit boundary.

## Success Criteria

- [ ] Pill button appears at bottom-center only when `markers.length > 0 || diveMarkers.length > 0`
- [ ] Tapping the pill opens a BottomSheetModal at ~75% height showing People and Events sections
- [ ] Tapping a row dismisses the list sheet and opens the existing detail bottom sheet with the correct marker
- [ ] Old `ScannedEventsList` overlay removed (no left-side card)
- [ ] Old Events List FAB (list icon) removed from right-side FAB column
- [ ] Add and Search FABs remain on right side, unaffected
- [ ] Existing marker detail bottom sheet still works identically (person or event)
- [ ] All new strings use `mapScreen:` i18n keys
- [ ] TestIDs follow existing `map-*` kebab-case convention

---

## Phase 1: Add i18n Keys

**Owner**: @implementer
**Dependencies**: None
**Complexity**: LOW

### Tasks

- [ ] 1.1 Add new i18n keys to `app/i18n/en.ts` under the `mapScreen` namespace:
  ```ts
  listPillButton: "List",
  listSheetPeopleSection: "People",
  listSheetEventsSection: "Events",
  listSheetNoResults: "No results found in this area.",
  listSheetPeopleEmpty: "No divers found.",
  listSheetEventsEmpty: "No events found.",
  ```
- [ ] 1.2 Add equivalent keys to all other locale files: `ar.ts`, `es.ts`, `fr.ts`, `hi.ts`, `ja.ts`, `ko.ts`, `demo-en.ts`, `demo-es.ts`, `demo-fr.ts`, `demo-hi.ts`, `demo-ar.ts`, `demo-ja.ts`, `demo-ko.ts`

### Acceptance Criteria

- [ ] `app/i18n/en.ts` has 6 new keys inside the `mapScreen` object
- [ ] All 12 locale files compile without TypeScript errors
- [ ] Existing `mapScreen` keys are untouched (especially `scannedEventsList`, `scannedEventsEmpty`, `scannedEventsListButton` which remain used until Phase 4)

---

## Phase 2: Create `SearchResultsSheet` Component

**Owner**: @implementer
**Dependencies**: Phase 1
**Complexity**: MEDIUM

### Tasks

- [ ] 2.1 Create `app/components/map/SearchResultsSheet.tsx` — a new component receiving:
  ```ts
  type SearchResultsSheetProps = {
    people: MapUserMarker[]
    events: DiveEventMarker[]
    onSelectPerson: (marker: MapUserMarker) => void
    onSelectEvent: (event: DiveEventMarker) => void
    sheetRef: React.RefObject<BottomSheetModal>
  }
  ```
- [ ] 2.2 Implement the component with:
  - A `BottomSheetModal` with snap points `["75%"]`, `enablePanDownToClose`
  - `onDismiss` callback that cleans up any parent state
  - Two sections: "People" header + rows, "Events" header + rows
  - **Person row** (reuse pattern from `MapMarkerDetailCard.PersonDetailCard`):
    - Avatar circle (first letter of `displayName`, bg `colors.tint`, white text)
    - `displayName` (bold)
    - `summary` text (dimmed), falling back to `mapScreen:nearbyDiverFallback`
    - `onPress` → `onSelectPerson(marker)`
  - **Event row** (reuse pattern from `ScannedEventsList` + `MapMarkerDetailCard.EventDetailCard`):
    - 12px dot (bg `colors.palette.secondary500`)
    - `title` (bold), falling back to `mapScreen:diveEventFallback`
    - Date: `format(new Date(event.eventAt), "PPp")` (dimmed)
    - `creatorDisplayName` (dimmed)
    - `onPress` → `onSelectEvent(event)`
  - Empty states per section: if `people.length === 0` show `mapScreen:listSheetPeopleEmpty`; if `events.length === 0` show `mapScreen:listSheetEventsEmpty`
  - Overall empty: if both arrays are empty, show `mapScreen:listSheetNoResults`
  - TestIDs: `map-search-results-sheet` (container), `map-search-results-people-section`, `map-search-results-events-section`, `map-search-result-person-{sanitizedSlug}`, `map-search-result-event-{sanitizedSlug}` (reuse `toEventTestId` slug logic from ScannedEventsList)
  - Accessibility labels: "Search results", "People section", "Events section", and per-row labels
- [ ] 2.3 Create `app/components/map/PillButton.tsx` — a small reusable component:
  ```ts
  type PillButtonProps = {
    iconName: React.ComponentProps<typeof Ionicons>["name"]
    label: string
    accessibilityLabel: string
    testID: string
    onPress: () => void
  }
  ```
  - Pill shape: `borderRadius: 999`, horizontal padding `spacing.md`, vertical padding `spacing.sm`
  - White background, shadow matching `$fabContainer`
  - Flex row with icon (size 18, `colors.tint`) + `Text` (size "sm", `colors.text`)
  - Absolute positioning is **not** in this component — the parent positions it
  - TestID on the outer `Pressable`

### Design Details — Person Row
```
┌────────────────────────────────────────┐
│ [A]  Alice Anderson                    │
│      Enjoys wreck diving & photography │
└────────────────────────────────────────┘
```
- `[A]` = 36×36 circle, `colors.tint` bg, white bold initial letter
- Name: bold, `colors.text`
- Summary: `colors.textDim`, `size="xs"`

### Design Details — Event Row
```
┌────────────────────────────────────────┐
│ ●  Night Dive at Blue Hole             │
│    Jun 15, 2026, 8:00 PM              │
│    by Carlos M.                        │
└────────────────────────────────────────┘
```
- `●` = 12×12 circle, `colors.palette.secondary500`
- Title: bold, `colors.text`
- Date + organizer: `colors.textDim`, `size="xs"`

### Acceptance Criteria

- [ ] `SearchResultsSheet` renders both sections with correct rows
- [ ] Empty states display per i18n keys
- [ ] Row taps call `onSelectPerson` / `onSelectEvent` with correct data
- [ ] `PillButton` renders icon + label in a pill shape
- [ ] Both components use `ThemedStyle` pattern and `useAppTheme()`
- [ ] All strings use `tx=` or `translate()` with `mapScreen:` keys
- [ ] TestIDs and accessibility labels are present

---

## Phase 3: Integrate Pill, List Sheet, and Wire State (Add New, Keep Old)

**Owner**: @implementer
**Dependencies**: Phase 2
**Complexity**: HIGH — the main integration phase

### Tasks

- [ ] 3.1 In `MapScreen.tsx`, add a new ref for the search results sheet:
  ```ts
  const searchSheetRef = useRef<BottomSheetModal>(null)
  ```
- [ ] 3.2 In `MapScreen.tsx`, add the new `PillButton` in the JSX, positioned at bottom-center:
  ```tsx
  {(markers.length > 0 || diveMarkers.length > 0) && (
    <View style={themed($pillPosition)} pointerEvents="box-none">
      <PillButton
        iconName="list"
        label={translate("mapScreen:listPillButton")}
        accessibilityLabel={translate("mapScreen:fabEventsList")}
        testID="map-search-results-pill-button"
        onPress={() => {
          setSelectedDetail(null)
          dismissSheet() // close detail sheet if open
          searchSheetRef.current?.present()
        }}
      />
    </View>
  )}
  ```
- [ ] 3.3 Add `$pillPosition` style — absolute, bottom-center, centered horizontally:
  ```ts
  const $pillPosition: ThemedStyle<ViewStyle> = ({ spacing }) => ({
    position: "absolute",
    bottom: spacing.md,
    left: 0,
    right: 0,
    alignItems: "center",
  })
  ```
- [ ] 3.4 Add the `SearchResultsSheet` component to the JSX tree, **alongside** the existing `BottomSheetModal` for detail. The new sheet receives a separate ref (`searchSheetRef`):
  ```tsx
  <SearchResultsSheet
    people={markers}
    events={diveMarkers}
    onSelectPerson={(marker) => {
      searchSheetRef.current?.dismiss()
      // Small delay to let list sheet close before detail sheet opens
      setTimeout(() => {
        selectUserMarker(marker)
      }, 300)
    }}
    onSelectEvent={(event) => {
      searchSheetRef.current?.dismiss()
      setTimeout(() => {
        selectDiveMarker(event)
      }, 300)
    }}
    sheetRef={searchSheetRef}
  />
  ```
- [ ] 3.5 Import `PillButton` and `SearchResultsSheet` at the top of `MapScreen.tsx`
- [ ] 3.6 **Keep** the old Events List FAB and `ScannedEventsList` unchanged in this phase (both old and new coexist temporarily). This ensures no visual breakage at this commit.

### Acceptance Criteria

- [ ] Pill button appears at bottom-center when markers exist
- [ ] Pill is hidden when `markers.length === 0 && diveMarkers.length === 0`
- [ ] Tapping pill opens the search results bottom sheet (75% height)
- [ ] Search results sheet shows People and Events sections with correct data
- [ ] Tapping a person row: list sheet closes, detail sheet opens for that person
- [ ] Tapping an event row: list sheet closes, detail sheet opens for that event
- [ ] Old Events List FAB and ScannedEventsList still render (no visual regression)
- [ ] Add and Search FABs on right side still work

---

## Phase 4: Remove Old Events List FAB and ScannedEventsList

**Owner**: @implementer
**Dependencies**: Phase 3
**Complexity**: LOW

### Tasks

- [ ] 4.1 In `MapScreen.tsx`, **remove** the Events List FAB block (lines 207-219):
  ```tsx
  {diveMarkers.length > 0 && (
    <MapFab
      iconName="list"
      accessibilityLabel={translate("mapScreen:fabEventsList")}
      testID="map-scanned-events-list-button"
      onPress={() => {
        setSelectedDetail(null)
        dismissSheet()
        setShowEventsList((current) => !current)
      }}
      disabled={isLoading}
      active={showEventsList}
    />
  )}
  ```
- [ ] 4.2 In `MapScreen.tsx`, **remove** the `showEventsList` state variable (line 76):
  ```ts
  const [showEventsList, setShowEventsList] = useState(false)
  ```
- [ ] 4.3 In `MapScreen.tsx`, remove all references to `showEventsList`:
  - Line 106: `setShowEventsList(false)` inside `searchThisArea()` — remove this call; the list sheet is separate and shouldn't auto-dismiss on search (user may want to compare)
  - Lines 142, 149: `setShowEventsList(false)` inside `selectUserMarker` / `selectDiveMarker` — no longer needed since the detail sheet closing logic doesn't rely on this state
  - Lines 232-234: The conditional rendering of `ScannedEventsList` inside `$bottomOverlay` — remove it
- [ ] 4.4 In `MapScreen.tsx`, **remove** the import of `ScannedEventsList` (line 10):
  ```ts
  import { ScannedEventsList } from "@/components/map/ScannedEventsList"
  ```
- [ ] 4.5 Remove the `$bottomOverlay` View entirely (lines 230-241). The status/error `Text` inside it needs a new home. Move the status text into a simpler absolute-positioned view at bottom-left:
  ```tsx
  {/* Status messages */}
  <View style={themed($statusPosition)} pointerEvents="box-none">
    <Text
      text={errorMessage || statusMessage}
      accessibilityRole="alert"
      testID={errorMessage ? "map-error" : "map-status"}
      style={themed(errorMessage ? $error : $statusOverlay)}
    />
  </View>
  ```
  And add a new style:
  ```ts
  const $statusPosition: ThemedStyle<ViewStyle> = ({ spacing }) => ({
    position: "absolute",
    left: spacing.md,
    bottom: spacing.md,
    right: 80, // leave room for FAB column
  })
  ```
- [ ] 4.6 **Delete** `app/components/map/ScannedEventsList.tsx` entirely
- [ ] 4.7 Remove unused i18n keys that were only used by ScannedEventsList:
  - `mapScreen:scannedEventsList`
  - `mapScreen:scannedEventsEmpty`
  - `mapScreen:scannedEventsListButton`
  
  From ALL locale files (en.ts, ar.ts, es.ts, fr.ts, hi.ts, ja.ts, ko.ts, and demo-* files). Replace them with the new keys added in Phase 1 only if any other code references them; otherwise just remove.

### Acceptance Criteria

- [ ] No `ScannedEventsList` import or usage remains in `MapScreen.tsx`
- [ ] No `showEventsList` state variable remains
- [ ] Events List FAB (list icon) removed from right-side FAB column
- [ ] Left-side overlay (`$bottomOverlay`) removed
- [ ] Status/error text still visible at bottom-left
- [ ] `ScannedEventsList.tsx` file deleted
- [ ] Unused i18n keys removed from all locale files
- [ ] App compiles and runs without errors
- [ ] All existing flows (Add, Search, marker taps, detail sheet) still work

---

## Phase 5: Cleanup and Edge Cases

**Owner**: @implementer
**Dependencies**: Phase 4
**Complexity**: LOW

### Tasks

- [ ] 5.1 Adjust pill button position so it doesn't overlap with status messages. If the status text is at `bottom: spacing.md` and the pill is also at `bottom: spacing.md`, the pill sits above the status. Verify visually that there is no overlap. If overlap occurs, move `$pillPosition` to `bottom: spacing.md + 24` (above status line) and adjust `$statusPosition` accordingly.
- [ ] 5.2 Add `onDismiss` to the search results `BottomSheetModal` to ensure clean state (no stale selections):
  ```tsx
  onDismiss={() => {
    // Slap dismiss is already a no-op; state is cleaned on row tap
  }}
  ```
- [ ] 5.3 Verify `setTimeout` delay of 300ms is sufficient for `@gorhom/bottom-sheet` dismiss animation. Test on both iOS and Android. If the detail sheet fails to appear, increase to 400ms or use `animateOnClose` callback.
- [ ] 5.4 Ensure the pill button is **hidden** when the detail bottom sheet is open (to avoid visual clutter). Add a visibility flag:
  ```ts
  // In MapScreen, the detail sheet being open means selectedDetail !== null
  // The pill should hide when the detail sheet is presented
  ```
  Since the pill only shows when `markers.length > 0 || diveMarkers.length > 0`, and the detail sheet auto-hides the list, this should already work naturally. Verify and document.
- [ ] 5.5 Verify that re-search (pressing Search FAB again while list sheet is open) correctly updates the list sheet content. The `markers` and `diveMarkers` state updates will re-render the `SearchResultsSheet` content in real time since those are passed as props. Confirm this works.

### Acceptance Criteria

- [ ] No visual overlap between pill, status text, and FAB column
- [ ] Pill hides when no search results exist
- [ ] Detail sheet opens cleanly after list sheet dismisses
- [ ] Re-search updates list sheet content without closing it
- [ ] No stale state or visual glitches

---

## Deliverables

| Phase | Files Created | Files Modified | Files Deleted |
|-------|-------------|---------------|---------------|
| Phase 1 | — | `app/i18n/en.ts` + 12 other locale files | — |
| Phase 2 | `app/components/map/SearchResultsSheet.tsx`, `app/components/map/PillButton.tsx` | — | — |
| Phase 3 | — | `app/screens/main/MapScreen.tsx` | — |
| Phase 4 | — | `app/screens/main/MapScreen.tsx`, `app/i18n/*.ts` (13 files) | `app/components/map/ScannedEventsList.tsx` |
| Phase 5 | — | `app/screens/main/MapScreen.tsx`, possibly `SearchResultsSheet.tsx` | — |

## Blast Radius / Affected Entry Points

- **`MapScreen.tsx`** — Primary file touched in Phases 3, 4, 5. All map interactions flow here.
- **`ScannedEventsList.tsx`** — Deleted in Phase 4. No other file imports it.
- **`MapMarkerDetailCard.tsx`** — Not modified, but `SearchResultsSheet` reuses its per-row patterns (avatar, event dot). Must remain backward-compatible.
- **`MapMarkerLegend.tsx`** — Not touched. Positioned top-left, no conflicts with bottom-center pill.
- **i18n files (13)** — All locale files modified in Phase 1 (add) and Phase 4 (remove).
- **`BottomSheetModal` (detail)** — Existing `bottomSheetRef` with snap `["45%"]` is untouched. New `searchSheetRef` with snap `["75%"]` is additive. `@gorhom/bottom-sheet` supports multiple `BottomSheetModal` instances on the same screen.

## Allowed Scope / Forbidden Scope

- **Allowed**: `MapScreen.tsx`, `SearchResultsSheet.tsx` (new), `PillButton.tsx` (new), i18n files, `ScannedEventsList.tsx` (delete)
- **Forbidden**: `MapMarkerDetailCard.tsx`, `MapMarkerLegend.tsx`, `MapView` rendering logic, `calculateBounds`, service layers (`mapService`, `diveEventService`), navigation types, theme files, `BottomSheetModal` version or config outside `MapScreen`

## UI/UX Composition Specification

### Screen Composition — Map Screen (after Phase 4)

```
#### [Zone: Map Layer] (full screen, z-index: 0)
└── MapView with markers (unchanged)

#### [Zone: Legend] (top-left, z-index: 1)
└── <MapMarkerLegend /> (unchanged, pill shape at top-left)

#### [Zone: FAB Column] (right side, z-index: 2)
├── Add FAB (+) — navigates to LocationPicker
└── Search FAB (🔍) — calls searchThisArea()

#### [Zone: Pill Button] (bottom-center, z-index: 2)
└── [List icon + "List" label] → opens search results sheet
   Visible only when markers.length > 0 || diveMarkers.length > 0
   Centered horizontally, above bottom edge

#### [Zone: Status Text] (bottom-left, z-index: 1)
└── "Found 3 dive events" / error text (unchanged)

#### [Zone: Detail Sheet] (bottom sheet, z-index: 10)
└── <MapMarkerDetailCard /> (unchanged, 45% snap)

#### [Zone: Search Results Sheet] (bottom sheet, z-index: 10)
└── People section + Events section (75% snap)
```

### Action Placement Rules

| Action | Position | Variant | Visibility Condition |
|--------|----------|---------|----------------------|
| Open search results | Bottom-center pill button | pill/heavy | `markers.length > 0 \|\| diveMarkers.length > 0` |
| Add saved location | Right FAB column, top | circular FAB | Always |
| Search this area | Right FAB column, bottom | circular FAB | Always (disabled while loading) |
| Select person row | Inside list sheet | row tap | List sheet open + people exist |
| Select event row | Inside list sheet | row tap | List sheet open + events exist |

### Content Flow (Reading Order)

1. Screen title / map region
2. Legend (top-left) — People dot, Events dot
3. Map markers
4. Status text (bottom-left, if present)
5. Pill button (bottom-center, if markers exist)
6. FAB column (right side): Add, Search
7. (On pill tap) Search results sheet — People section, then Events section
8. (On row tap) Detail sheet — person detail or event detail

### Component Mapping

| Need | Reuse Existing | New Component | Reference Pattern |
|-----|---------------|---------------|-------------------|
| Pill button | — | `PillButton.tsx` | `$fabContainer` from MapScreen for shadow |
| Search results sheet | `BottomSheetModal` (library) | `SearchResultsSheet.tsx` | `MapMarkerDetailCard.tsx` patterns for rows |
| Person row layout | Avatar circle pattern from `PersonDetailCard` | Inside `SearchResultsSheet` | `$avatarCircle`, `$avatarText` from MapMarkerDetailCard |
| Event row layout | Dot pattern from `EventDetailCard`, text layout from `ScannedEventsList` | Inside `SearchResultsSheet` | `$eventDot`, `$eventRow` patterns |
| Section header | — | Inside `SearchResultsSheet` | `$title` from ScannedEventsList pattern |
| Status text positioning | `Text` component + `$statusOverlay` / `$error` | Repositioned in `$statusPosition` | Existing style, new absolute position |

### Responsive Behavior

| Breakpoint | Layout Change |
|------------|--------------|
| All widths | Pill button centered with `alignItems: "center"`, `left: 0, right: 0` |
| All widths | Bottom sheet uses percentage snap point, adapts automatically |
| All widths | List rows stretch full width within sheet padding |

### States

| State | Affected Zone | Treatment |
|-------|--------------|-----------|
| No search results | Pill button | Hidden entirely (`markers.length === 0 && diveMarkers.length === 0`) |
| Search loading | Pill button | Hidden (no markers yet), status text shows loading message |
| 0 people, N events | List sheet | People section shows "No divers found.", Events section shows rows |
| N people, 0 events | List sheet | People section shows rows, Events section shows "No events found." |
| 0 people, 0 events | Pill button | Hidden (condition not met) |
| Detail sheet open | Pill button | Hidden or visually clear (detail sheet overlays pill) |

## Invariants

| Invariant | Why it matters | How to verify |
|-----------|----------------|---------------|
| Add FAB always visible and functional on right side | Core navigation | Tap test: Add FAB → LocationPicker |
| Search FAB always visible and functional on right side | Core search trigger | Tap test: Search FAB → searchThisArea() |
| Detail sheet shows correct marker after row tap | Data flow correctness | Tap person row → detail shows person; tap event row → detail shows event |
| `selectedDetail` state drives detail sheet content | Single source of truth | Verify `selectUserMarker`/`selectDiveMarker` set correct type |
| `@gorhom/bottom-sheet` `enablePanDownToClose` still works on detail sheet | UX consistency | Pan down on detail sheet → dismisses |
| Map markers still render with correct pin colors | Visual consistency | People = #C76542, Events = #41476E |

## Behavior That Must Not Change

- Tapping a map marker still opens the detail bottom sheet with correct person/event data — validated by tapping markers on map
- Add FAB still navigates to `LocationPicker` with current region coords — validated by tap test
- Search FAB still calls `searchThisArea()` — validated by tap test
- Status messages ("Found N dive events", "Found N nearby divers") still appear — validated by searching
- Error messages still appear — validated by searching with no network
- `MapMarkerLegend` still shows at top-left — validated visually
- `MapMarkerDetailCard` component is not modified — validated by no file changes

## Validation Matrix

| Check | Command / Method | Proves |
|------|-------------------|--------|
| Pill appears after search | Search → verify pill visible | Pill visibility condition |
| Pill hidden before search | Fresh screen → verify pill absent | Pill hidden when empty |
| List sheet opens on pill tap | Tap pill → sheet at 75% | Sheet presentation |
| Person row → detail | Tap person row in sheet → detail sheet for that person | Data flow: person row → detail |
| Event row → detail | Tap event row in sheet → detail sheet for that event | Data flow: event row → detail |
| FABs unaffected | Tap Add, Search FABs → same behavior | No regression |
| TypeScript compiles | `npx tsc --noEmit` | No type errors |
| Old ScannedEventsList removed | `grep -r "ScannedEventsList" app/` → no hits (except in deleted file) | Cleanup complete |

## Evidence Owners

| Item | Owner | Proof Required |
|------|-------|----------------|
| Pill visibility condition | @implementer | Visual test: search → pill visible; fresh → pill hidden |
| List sheet data binding | @implementer | Tap rows → correct detail opens |
| No regressions in FABs | @implementer | Add/Search FAB tap → correct navigation/action |
| i18n keys present in all locales | @analyzer | `grep "listPillButton" app/i18n/*.ts` → 13 matches |
| ScannedEventsList deleted | @analyzer | File absent + no import references |

## Failure Signals

- Pill button appears before any search (visibility condition broken)
- Detail sheet fails to open after row tap (`setTimeout` race condition)
- Old ScannedEventsList overlay still visible after Phase 4 (incomplete removal)
- Status text missing or overlapping with pill (layout collision)
- TypeScript compilation errors after Phase 2 (type mismatches between MapScreen and SearchResultsSheet)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `setTimeout` race condition between sheet dismiss and present | MEDIUM | HIGH — detail sheet may not open | Use `onDismiss` callback of list sheet to trigger `selectUserMarker`/`selectDiveMarker` instead of `setTimeout(300)` |
| Two `BottomSheetModal` instances conflict | LOW | MEDIUM — simultaneous sheets | `@gorhom/bottom-sheet` supports multiple modals; dismiss one before presenting the other |
| Pill overlaps status text on small screens | LOW | MEDIUM — visual clutter | Test on small devices; adjust `$pillPosition.bottom` or use `bottom: spacing.xl` to keep pill above status |
| i18n key consistency across 13 locale files | MEDIUM | LOW — wrong translations | Mechanical copy-paste with same keys; review diffs in PR |

## Notes

- **`setTimeout` alternative**: If 300ms is unreliable, consider using `BottomSheetModal`'s `onDismiss` callback on the list sheet to trigger the detail sheet open. This is more robust but requires passing callbacks through props. Evaluate in Phase 5.
- **Animation**: `@gorhom/bottom-sheet` has built-in spring animations. The `dismiss()` → `present()` sequence may need the 300ms delay for the dismiss animation to complete. Phase 5 should validate this.
- **The `searchThisArea` function** currently resets `showEventsList` to false. In Phase 4, the `setShowEventsList(false)` calls are removed. The list sheet should persist across re-searches (data updates via props, no need to dismiss).
- **No new dependencies**: Everything is built with existing `@gorhom/bottom-sheet`, `Ionicons`, and `date-fns` (already in `package.json`).

## Decision Log

| Decision | Chosen | Rejected | Rationale | Evidence |
|----------|--------|----------|-----------|---------|
| Sheet vs overlay | BottomSheetModal at 75% | Scrolled overlay card | Consistent with existing detail sheet pattern; bottom sheet is native-feeling on mobile | `MapScreen.tsx:244-251` already uses BottomSheetModal |
| Pill vs FAB | Pill button (icon + label) | Icon-only FAB | The pill explicitly labels the action ("List") per requirement; FAB was icon-only and confusing | Requirement spec item 2 |
| Separate sheet ref | New `searchSheetRef` | Reuse `bottomSheetRef` | Each sheet has different snap points (45% vs 75%) and different content; reusing would require swapping content and snap points | `@gorhom/bottom-sheet` v5 supports multiple modal instances |
| Row tap → dismiss → present | `dismiss()` + `setTimeout(300)` + `present()` | Shared ref with content swap | Simpler mental model; `@gorhom/bottom-sheet` recommends separate refs for different sheets | Phase 5 validates timing |
| Coexistence phase | Phase 3 keeps old alongside new | Remove old then add new | Incremental approach: if Phase 3 breaks, revert is safe since old is still there | YAGNI/KISS: avoid big-bang removal |