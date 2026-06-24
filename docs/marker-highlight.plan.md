# MapScreen Selected Marker Highlight — Implementation Plan

## Problem Statement

`MapScreen` already tracks a single active selection in `selectedDetail`, opens the correct bottom sheet detail card, and clears that selection on sheet dismiss. What is missing is a visible marker-level highlight while the detail sheet is open, so users can still tell which diver or dive event the sheet belongs to.

## Chosen Approach

Keep the existing native `react-native-maps` markers and add **selection-aware marker props inside `MapScreen` only**:

- derive `isSelected` for each person/event marker from `selectedDetail`
- swap the selected marker to a nearby palette shade (same color family, brighter than default)
- raise the selected marker with `zIndex` so it stays visually above nearby pins
- clear the highlight automatically by continuing to rely on `selectedDetail = null` when the detail sheet dismisses

Why this is the simplest fit:

- it reuses existing state (`selectedDetail`) instead of adding new state
- it keeps the native pin marker path, so no custom marker component or map redesign is required
- it avoids changing the bottom sheet, data fetching, navigation, or legend structure

## Rejected Alternatives

| Alternative | Why rejected for this scope |
|---|---|
| Custom `<Marker>` child view with ring/scale animation | Reliable, but larger UI change than needed; `react-native-maps` docs note custom marker children replace the native pin and introduce `tracksViewChanges` performance considerations. |
| New dedicated selected-marker store/state | Duplicates `selectedDetail`, violates DRY, and increases sync risk. |
| Bottom sheet / legend redesign | Out of scope and not required to satisfy the objective. |

## Success Criteria

- [ ] When a diver marker is selected and the detail sheet is open, that diver pin is visually distinct from unselected diver pins.
- [ ] When an event marker is selected and the detail sheet is open, that event pin is visually distinct from unselected event pins.
- [ ] Only one marker can appear highlighted at a time.
- [ ] Dismissing the detail sheet removes the highlight.
- [ ] Marker tap behavior, list-sheet-to-detail behavior, and bottom sheet content remain unchanged.
- [ ] No map legend, data fetching, or navigation behavior changes.

## Current State (Evidence)

- `selectedDetail` already exists in `app/screens/main/MapScreen.tsx:75-77` and is the sole active selection source.
- Person selection sets `selectedDetail` and presents the detail sheet in `MapScreen.tsx:137-140`.
- Event selection sets `selectedDetail` and presents the detail sheet in `MapScreen.tsx:143-146`.
- Dismissing the detail sheet clears `selectedDetail` in `MapScreen.tsx:149-151` and the sheet is wired to `onDismiss` in `MapScreen.tsx:240-249`.
- People markers currently use native `<Marker pinColor="#C76542" />` in `MapScreen.tsx:164-172`.
- Event markers currently use native `<Marker pinColor="#41476E" />` in `MapScreen.tsx:174-182`.
- The legend uses the same two base colors in `app/components/map/MapMarkerLegend.tsx:10-20` and `:50-56`.
- Existing selected-state styling elsewhere in the app uses a minimal “same component, selected style overlay” pattern rather than new UI structures (`app/screens/main/SettingsScreen.tsx:69-83`, `:200-203`; `app/screens/main/DiveEventScreen.tsx:357-370`, `:497-500`).
- Existing palette shades already provide nearby brighter variants for both marker families in `app/theme/colors.ts:12-29`.
- `react-native-maps` is on `1.27.2` in `package.json:71`.
- Context7 docs confirm: `pinColor` applies only to the default/native marker, while custom marker children replace that symbol and make `tracksViewChanges` relevant; this supports keeping the native marker path as the primary approach for the smallest change.

## Verified Facts vs Assumptions

| Type | Item | Evidence / status |
|---|---|---|
| Verified fact | Only one selected marker is active at a time. | `selectedDetail` is a single union-or-null value in `MapScreen.tsx:75-77`. |
| Verified fact | Highlight lifetime should map to bottom-sheet lifetime. | Selection is created in `MapScreen.tsx:137-146` and cleared in `:149-151`, with dismiss wired in `:240-249`. |
| Verified fact | Person and event markers currently use built-in native pins, not custom marker children. | `MapScreen.tsx:164-182`. |
| Verified fact | Base marker colors are `#C76542` for people and `#41476E` for events. | `MapScreen.tsx:170`, `:180`; palette equivalents in `colors.ts:16`, `:23`, `:68`. |
| Verified fact | Existing app selection patterns prefer conditional styling over new interaction models. | `SettingsScreen.tsx:69-83`, `:200-203`; `DiveEventScreen.tsx:357-370`, `:497-500`. |
| Verified fact | Custom marker children are supported, but replace the native marker and can incur `tracksViewChanges` concerns. | Context7 `react-native-maps` marker docs. |
| Assumption | A brighter same-family `pinColor` plus `zIndex` will be visually distinct enough on the target simulator/device. | Must be proven by live Maestro MCP validation before implementation is considered done. |
| Assumption | No legend update is needed if the selected marker stays in the same color family and the base meaning (person vs event) remains intact. | Reasonable for scope, but should be revisited only if validation shows confusion. |
| Assumption | Marker visuals may not be inspectable in the Maestro hierarchy, so screenshot evidence will be the primary proof for the highlight itself. | Plan validation should use hierarchy for sheet state and screenshots for marker appearance. |

## UI/UX Composition Specification

### Screen Composition

#### [Zone: Map Canvas] (full-screen, unchanged layout)
├── Existing person markers remain in their current positions
├── Existing event markers remain in their current positions
└── Exactly one marker may render in a highlighted state while its detail sheet is open

#### [Zone: Detail Bottom Sheet] (existing component, unchanged placement)
├── Opens after selecting a marker or list result
└── Continues to be the source-of-truth lifecycle for clearing the highlight on dismiss

### Action Placement Rules

| Action | Position | Variant | Visibility Condition |
|---|---|---|---|
| Select marker | Existing map marker tap target | unchanged | always |
| Dismiss detail | Existing sheet close / swipe-down | unchanged | while detail sheet is open |

### Content Flow (Reading Order)

1. User sees the unchanged map and markers.
2. User taps a map marker or selects a result from the list sheet.
3. The existing detail bottom sheet opens.
4. While that sheet is open, the matching map marker shows the selected-state highlight.
5. When the sheet closes, the marker returns to its default appearance.

### Component Mapping

| Need | Reuse Existing | New Component | Reference Pattern |
|---|---|---|---|
| Marker selection source of truth | `selectedDetail` in `MapScreen.tsx` | — | existing selection flow |
| Highlight colors | `app/theme/colors.ts` palette | — | existing theme tokens |
| Detail lifetime | existing `BottomSheetModal` in `MapScreen.tsx` | — | existing dismiss behavior |

### Responsive Behavior

No layout changes. The change is marker-state only and should behave identically across supported screen sizes.

### States

| State | Affected Zone | Treatment |
|---|---|---|
| No selection | Map Canvas | all markers use current default colors |
| Person selected | Map Canvas + Detail Sheet | only the selected person marker uses highlight color + raised z-index while sheet is open |
| Event selected | Map Canvas + Detail Sheet | only the selected event marker uses highlight color + raised z-index while sheet is open |
| Detail dismissed | Map Canvas | highlight removed immediately because `selectedDetail` becomes `null` |

## Phased Implementation

---

## Phase 1: Wire selection-aware marker props in `MapScreen`

**Owner**: @implementer
**Dependencies**: None
**Complexity**: LOW

### Tasks

- [ ] Replace hardcoded marker colors in `app/screens/main/MapScreen.tsx` with selection-aware values derived from `selectedDetail`.
- [ ] For person markers, compare `selectedDetail` against `marker.userId` and use a brighter primary shade only when selected.
- [ ] For event markers, compare `selectedDetail` against `dive.id` and use a brighter secondary shade only when selected.
- [ ] Add `zIndex` for the selected marker so highlight visibility is not lost when markers overlap.
- [ ] Keep the current `selectUserMarker`, `selectDiveMarker`, and `handleSheetClose` flow unchanged so the highlight automatically tracks the existing bottom-sheet lifecycle.
- [ ] Prefer theme/palette tokens already present in `app/theme/colors.ts` instead of introducing new color constants unless implementation proves existing tokens are insufficient.
- [ ] If extracting a tiny local helper improves readability, keep it in the `MapScreen` module or a nearby screen-local helper file only; do not introduce new shared abstractions.
- [ ] Run `pnpm compile` after the change.

### Acceptance Criteria

- [ ] `MapScreen` highlights the currently selected person marker only when `selectedDetail.type === "person"` and ids match.
- [ ] `MapScreen` highlights the currently selected event marker only when `selectedDetail.type === "event"` and ids match.
- [ ] The highlighted marker returns to its default color when `selectedDetail` becomes `null`.
- [ ] No imports, services, navigation handlers, or bottom sheet structure outside the marker render loops need to change.

---

## Phase 2: Validate highlight visibility and preserve existing behavior

**Owner**: @implementer
**Dependencies**: Phase 1
**Complexity**: LOW

### Tasks

- [ ] Validate compile/lint path for the touched file(s).
- [ ] Use **live Maestro MCP tools** on the booted simulator; do **not** create or edit `.maestro/*.yaml` for this task.
- [ ] Reuse the existing `map-search-area` regression path concept from `.maestro/flows/map-search-area.yaml:1-75` as a manual validation checklist, but execute it through Maestro MCP interaction/screenshot tools rather than authored YAML.
- [ ] Open a known person detail and capture screenshot evidence showing the highlighted person marker while the bottom sheet is open.
- [ ] Dismiss the person detail sheet and capture screenshot evidence showing that the highlight is removed.
- [ ] Repeat for a known event detail.
- [ ] If the selected color is not visibly distinct in screenshots, stop and switch to the documented fallback: a tiny custom marker child component in a follow-up commit, not a broader redesign.

### Acceptance Criteria

- [ ] Live Maestro MCP validation proves the selected person marker is visibly distinct while the detail sheet is open.
- [ ] Live Maestro MCP validation proves the selected event marker is visibly distinct while the detail sheet is open.
- [ ] Live Maestro MCP validation proves the highlight disappears after dismissing the detail sheet.
- [ ] Existing map search/list/detail flow still works end-to-end.

## Exact Files Likely Touched

| File | Expected change |
|---|---|
| `app/screens/main/MapScreen.tsx` | Primary implementation: selection-aware `pinColor` and `zIndex` logic in marker render loops. |
| `app/screens/main/mapMarkerHighlight.ts` *(optional only if a tiny helper is needed for readability/testability)* | Local helper for selected-marker comparison/color selection. |
| `app/screens/main/mapMarkerHighlight.test.ts` *(optional only if helper is extracted)* | Small unit test for helper logic; skip if logic remains inline and validation stays compile + Maestro only. |

### Files Expected **Not** to Change

- `app/components/map/MapMarkerDetailCard.tsx`
- `app/components/map/MapMarkerLegend.tsx`
- `app/components/map/SearchResultsSheet.tsx`
- `app/services/location/*`
- `app/services/dives/*`
- navigation files
- `.maestro/*.yaml`

## Blast Radius / Affected Entry Points

| Entry point / caller | Why affected |
|---|---|
| `MapScreen` marker tap flow | Selected marker must visually reflect the already-selected detail record. |
| `SearchResultsSheet` → `selectUserMarker` / `selectDiveMarker` path | Opening detail from the list sheet should highlight the corresponding map marker exactly the same as direct map selection. |
| Detail bottom sheet dismiss path | Highlight removal depends on the existing `selectedDetail = null` behavior remaining intact. |

Blast radius is intentionally limited to `MapScreen` marker rendering. No persistence, fetch, navigation, or cross-screen state contracts should change.

## Invariants

| Invariant | Why it matters | How to verify |
|---|---|---|
| `selectedDetail` remains the only selection source of truth | Prevents duplicate state and desync bugs | Code review + MapScreen inspection |
| Only one marker can be highlighted at a time | Matches existing single-detail-sheet UX | Live Maestro validation by opening one detail at a time |
| Detail sheet dismiss still clears selection | Highlight must not persist after close | Dismiss sheet and confirm marker reverts |
| Person/event base color families remain recognizable | Legend meaning must stay intact | Screenshot review before/after selection |

## Behavior That Must Not Change

- Marker selection must still open the same bottom sheet content for people and events.
- Search/list flow must still open detail correctly after selecting a row from `SearchResultsSheet`.
- The list pill must remain hidden while `selectedDetail !== null` (`MapScreen.tsx:188-203`).
- Map data fetching in `searchThisArea()` (`MapScreen.tsx:85-114`) must remain untouched.
- Chat start/navigation behavior from the detail sheet (`MapScreen.tsx:116-135`, `:251-267`) must remain untouched.

## Validation Matrix

| Check | Command / method | Proves |
|---|---|---|
| TypeScript regression check | `pnpm compile` | The touched map screen still type-checks. |
| Exact regression path | Live Maestro MCP on the booted simulator using the existing sign-in → map → search-area → select-result path | Highlight behavior works in the real app flow. |
| Person highlight visible | Maestro MCP screenshot with a person detail sheet open | Selected person marker is distinguishable while open. |
| Event highlight visible | Maestro MCP screenshot with an event detail sheet open | Selected event marker is distinguishable while open. |
| Highlight removal | Maestro MCP screenshot immediately after dismissing the detail sheet | Selection visual is tied to bottom-sheet lifetime. |
| Behavior preservation | Confirm detail sheet content, list-sheet behavior, and status overlays still behave the same during the same Maestro session | Existing map UX is preserved. |

### Live Maestro MCP Validation Steps

1. Use `maestro_list_devices` to confirm the active simulator.
2. Launch or connect to the existing app build and sign in with known seeded map data.
3. Reach the Map tab and trigger the existing search flow (same user journey covered by `.maestro/flows/map-search-area.yaml:8-65`, but executed interactively through Maestro MCP).
4. Select a known person result (direct marker tap if practical; otherwise from the existing list sheet).
5. Use `maestro_take_screenshot` once the person detail sheet is open; confirm the correct pin is highlighted.
6. Dismiss the detail sheet, take another screenshot, and confirm the highlight is gone.
7. Repeat steps 4-6 for a known event.
8. Use `maestro_inspect_screen` to confirm sheet state transitions if needed; rely on screenshots for marker-appearance proof.

## Risks / Rollback Notes

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Highlight shade is too subtle on-device | Medium | Medium | Validate with live Maestro screenshots before closing the task. |
| `pinColor` shade renders inconsistently on a platform | Medium | Medium | Keep scope small; if validation fails, roll forward to a tiny custom marker child component as the fallback implementation. |
| Accidental scope drift into map redesign | Low | Medium | Restrict changes to marker render logic in `MapScreen`. |

### Rollback

- Safe rollback is a single-file revert of the `MapScreen.tsx` marker color/z-index changes.
- Because the chosen approach does not alter data contracts, navigation, or persistent state, rollback risk is low.
- If fallback is required, do **not** expand this task into broader map UI work; replace only the selected-marker rendering strategy.

## Remaining Assumptions Requiring Validation

1. A same-family brighter `pinColor` is visually strong enough to count as a highlight on the target simulator/device.
2. Screenshot-based Maestro proof is sufficient because the marker itself may not be represented in the hierarchy tree.
