# Profile Saved Locations — Implementation Plan

## Goal
Move the "Add saved location" trigger from the Map screen's right-side FAB column to a real "Saved locations" section in the Profile screen. The Profile section manages a list (label, coords, delete) and exposes a `+ Add saved location` button. The Map FAB for personal saved locations is removed; the "Search this area" FAB stays.

## Verified Facts vs Assumptions
| # | Fact / Assumption | Source | Confidence |
|---|-------------------|--------|------------|
| 1 | FACT — `listOwnSavedLocations` returns `ServiceResult<SavedLocation[]>` via RPC `list_own_profile_locations` | `app/services/location/locationService.ts:55-61` | high (read code) |
| 2 | FACT — `deleteSavedLocation` returns `ServiceResult<{deletedId, wasPublic}>` | `app/services/location/locationService.ts:115-124` | high (read code) |
| 3 | FACT — `createSavedLocation` already exists and is wired through LocationPickerScreen | `locationService.ts:63-77`; `LocationPickerScreen.tsx:52-71` | high |
| 4 | FACT — `LocationPickerScreen.saveLocation` calls `navigation.goBack()` (not `navigate(returnTo)`), so it pops whatever pushed it | `LocationPickerScreen.tsx:70` | high (read code) |
| 5 | FACT — `route.params.returnTo` is read in MapScreen (`"Map"`) and DiveEventScreen (`"DiveEvent"`); adding `"Profile"` requires no logic change in LocationPicker | `MapScreen.tsx:330`; `DiveEventScreen.tsx:175` | high (read code) |
| 6 | FACT — `useFocusEffect` re-fires on focus, including when the user navigates back from a pushed screen; identical pattern is used by `DiveEventScreen` to refresh its saved-locations list on return from LocationPicker | `DiveEventScreen.tsx:68-72`; [Context7 — useFocusEffect](https://github.com/react-navigation/react-navigation.github.io/blob/main/versioned_docs/version-7.x/use-focus-effect.md) | **VERIFIED** (Context7 + existing in-repo pattern) |
| 7 | FACT — Map FAB column structure: `<View $fabColumn>` containing two `<MapFab>` children — `iconName="add"` (lines 322-334) to remove, `iconName="search"` (lines 335-341) to keep | `MapScreen.tsx:321-342` | high |
| 8 | FACT — Profile save button is at lines 231-237; the `<Screen>` wrapper closes at line 238 — new section must be inserted between line 237 and 238 | `ProfileScreen.tsx:231-238` | high |
| 9 | FACT — Existing card styles `$locationOption`, `$emptyLocationCard`, `$locationList` in DiveEventScreen are the visual template to mirror | `DiveEventScreen.tsx:477-500` | high (read code) |
| 10 | FACT — `tab-profile` testID exists on the tab bar — Maestro can switch tabs reliably | `MainTabNavigator.tsx:100` | high (read code) |
| 11 | FACT — All 6 non-English locales import the `Translations` type from `en.ts`; adding/removing a key in `en.ts` forces the same change in all 7 files via TypeScript | `app/i18n/ko.ts:2`; `en.ts:329` (`export type Translations = typeof en`) | high (read code) |
| 12 | FACT — `mapScreen.fabAddLocation` exists in all 7 locales; removing it requires removing from all 7 to satisfy the `Translations` type | `en.ts:76`; `ko.ts:77`; `ja.ts:78`; `hi.ts:77`; `fr.ts:78`; `es.ts:79`; `ar.ts:77` | high (grep verified) |
| 13 | FACT — Maestro flow uses `map-add-saved-location-button` at: `map-location-add-delete.yaml:33,41`; `map-saved-location-event-redesign.yaml:36,44,47,55`; `dive-event-create-update-delete.yaml:33,41`; `full-integration.yaml:36` | grep verified | high |
| 14 | FACT — The Map screen has a SEPARATE "current/selected location" feature with its own testIDs (`map-use-current-location-button`, `map-save-location-button`, `map-delete-location-button`) — those are NOT in scope | `map-location-add-delete.yaml:51,64,69` | high (read flow) |
| 15 | ASSUMPTION — `isLoading` state for the saved-locations list is desirable on first load and after add/delete (not just a silent re-fetch). Implemented as a small loading indicator or skeleton row. | n/a | medium (UX call — document in plan) |

## Design decisions
- **Section placement in Profile**: AFTER the save button (line 237), INSIDE the `<Screen>` wrapper. Visually grouped with a heading `tx="profileScreen:savedLocationsHeading"` and a sub-text `tx="profileScreen:savedLocationsSubheading"`. The section is the last thing on the screen, so it always sits at the bottom of the scroll.
- **Visual hierarchy** (refactoring-ui): heading is `preset="subheading"` (larger, semibold); sub-text is `size="sm"` in `colors.textDim`; list rows are bordered cards (`$locationOption`-style) with the label in `preset="bold"` and coords in `size="xs"` `colors.textDim`. The "Add" button is a primary `Button` (matches DiveEventScreen.tsx:338-344), placed AFTER the list / empty state, not inside each row.
- **Delete UX**: small "✕" `Pressable` (Ionicons `close`) at the right of each row, sized 32×32 for a 44pt tap target. On tap, calls `deleteSavedLocation(id)` and removes from local state. No swipe (no existing pattern; minimize new deps). On success, set the message `"Saved location deleted"` using the same status-text pattern as Profile's existing `message` state.
- **Add UX**: a single `Button tx="profileScreen:addSavedLocation"` at the bottom of the section, mirroring `DiveEventScreen.tsx:338-344`. Navigates to LocationPicker with `returnTo: "Profile"`.
- **Empty state**: bordered card (mirrors `$emptyLocationCard`) with `tx="profileScreen:noSavedLocations"` text and the add button inside it. Uses the same `testID="profile-saved-locations-empty"` pattern as `dive-event-no-saved-locations` (DiveEventScreen.tsx:351).
- **Refresh strategy**: `useFocusEffect` (same shape as DiveEventScreen.tsx:68-72) re-fetches via `listOwnSavedLocations()` on every focus. Cheap (single RPC <30ms local). **Do not** use `useEffect` with an empty dep array — that won't fire after the user comes back from LocationPicker.
- **List rendering**: `View` with `gap: spacing.sm` (matches `$locationList` from DiveEventScreen.tsx:485-488). For ≤20 saved locations (realistic ceiling), plain `View.map` is fine — no `FlatList` needed (avoids over-engineering; the parent `<Screen preset="auto">` already provides scrolling). Wrap with `testID="profile-saved-location-list"`.
- **Status message**: reuse the existing `message` / `setMessage` state and the success-style `Text` (lines 223-230) — set it to `"Saved location deleted"` / `"Saved location added"` after each operation. This matches the existing Profile messaging pattern.
- **Map FAB column**: keep `$fabColumn` style as-is; it works for a single FAB. Visual jump is acceptable — the only visual change is the loss of the `+` button on the right side.
- **Keep the DiveEvent add button** — different user intent: DiveEvent needs the location immediately to attach to an event, Profile is for management. The shared service handles both call sites.
- **Remove `mapScreen.fabAddLocation`** from all 7 locales to satisfy the `Translations` structural type.

## Phases (one commit per phase)

### Phase 1: Profile saved-locations section (new feature)
**Files**:
- `app/screens/main/ProfileScreen.tsx` — add section, state, effects, render
- `app/i18n/en.ts` — add keys to `profileScreen` block (after line 177):
  - `savedLocationsHeading: "Saved locations"`
  - `savedLocationsSubheading: "Private bookmarks you can attach to dive events. Tap a location to pick it on the map; tap + to add a new one."`
  - `noSavedLocations: "No saved locations yet."`
  - `addSavedLocation: "Add saved location"`
  - `deleteSavedLocation: "Delete saved location"` (accessibility label)
  - `savedLocationDeleted: "Saved location deleted"`
  - `savedLocationAdded: "Saved location added"`
- `app/i18n/ko.ts`, `ja.ts`, `hi.ts`, `fr.ts`, `es.ts`, `ar.ts` — same 7 keys, translated (see Risks #3 for fallback strategy)

**Implementation outline (ProfileScreen.tsx)**:
1. Add imports: `useCallback`, `useFocusEffect` from `@react-navigation/native`; `Ionicons` from `@expo/vector-icons`; `Pressable` from `react-native`; `deleteSavedLocation`, `listOwnSavedLocation`s from `@/services/location/locationService`; `SavedLocation` type from `@/services/location/types`.
2. Add state: `const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]); const [locationsMessage, setLocationsMessage] = useState(""); const [locationsError, setLocationsError] = useState(""); const [isLocationsLoading, setIsLocationsLoading] = useState(false);`.
3. Add `loadSavedLocations = useCallback(async () => { ... calls listOwnSavedLocations ... }, [])` mirroring `DiveEventScreen.tsx:41-66`.
4. Add `useFocusEffect(useCallback(() => { void loadSavedLocations() }, [loadSavedLocations]))` mirroring `DiveEventScreen.tsx:68-72`.
5. Add `deleteLocation = useCallback(async (id: string) => { setLocationsError(""); const result = await deleteSavedLocation(id); if (result.ok) { setSavedLocations((prev) => prev.filter((l) => l.id !== id)); setLocationsMessage(translate("profileScreen:savedLocationDeleted")); } else { setLocationsError(result.error); } }, [])`.
6. Wrap the existing `Button` save element (line 231-237) AND the new section in a fragment, then insert the new section between line 237 and the `</Screen>` at line 238:
   - `<View testID="profile-saved-locations-section" style={themed($savedLocationsSection)}>`
   - `<Text tx="profileScreen:savedLocationsHeading" preset="subheading" style={themed($sectionHeading)} />`
   - `<Text tx="profileScreen:savedLocationsSubheading" style={themed($sectionSubheading)} />`
   - Conditional render: empty card OR list of rows (see below)
   - Locations message / error (reuse the existing `message` state pattern but with a separate `locationsMessage` to avoid mixing with profile-form messages)
   - `<Button tx="profileScreen:addSavedLocation" testID="profile-add-saved-location-button" onPress={openLocationPicker} />`
7. Empty card: `<View testID="profile-saved-locations-empty" style={themed($emptyLocationCard)}><Text tx="profileScreen:noSavedLocations" /></View>` — mirrors DiveEvent.tsx:351.
8. List rows: `<View testID="profile-saved-location-list" style={themed($locationList)}>{savedLocations.map((location) => <View key={location.id} testID={`profile-saved-location-${location.id}`} style={themed($locationRow)}><View style={themed($locationRowText)}><Text text={location.label} preset="bold" /><Text text={`${location.coordinate.latitude.toFixed(4)}, ${location.coordinate.longitude.toFixed(4)}`} size="xs" style={themed($metadata)} /></View><Pressable testID={`profile-saved-location-delete-${location.id}`} accessibilityLabel={translate("profileScreen:deleteSavedLocation")} accessibilityRole="button" hitSlop={8} onPress={() => deleteLocation(location.id)} style={themed($deleteButton)}><Ionicons name="close" size={18} color={colors.textDim} /></Pressable></View>)}</View>`.
9. `openLocationPicker` (in-file helper): `() => navigation.navigate("LocationPicker", { returnTo: "Profile" })` — note: do NOT pass `initialLatitude/initialLongitude`; let the picker use its default center (matches user intent of "add a new spot").
10. Add new ThemedStyle constants at the bottom (mirror the DiveEventScreen definitions but rename to `$savedLocations*` to avoid future collision):
    - `$savedLocationsSection: { marginTop: spacing.xl, gap: spacing.sm }` — visual separation from the form above
    - `$sectionHeading: { marginTop: spacing.xs }`
    - `$sectionSubheading: { color: colors.textDim, marginBottom: spacing.md }`
    - `$emptyLocationCard: { borderColor: colors.separator, borderRadius: 12, borderWidth: 1, padding: spacing.md }` — copy of DiveEvent.tsx:477-483
    - `$locationList: { gap: spacing.sm }` — copy of DiveEvent.tsx:485-488
    - `$locationRow: { flexDirection: "row", alignItems: "center", borderColor: colors.separator, borderRadius: 12, borderWidth: 1, padding: spacing.md, gap: spacing.sm }`
    - `$locationRowText: { flex: 1, gap: spacing.xs }`
    - `$deleteButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 16 }`
    - `$metadata: { color: colors.textDim }` (copy of DiveEvent.tsx pattern)
    - `$locationsMessage: { color: colors.tint, marginTop: spacing.xs }`
    - `$locationsError: { color: colors.error, marginTop: spacing.xs }`

**Acceptance**:
- [ ] Profile screen shows "Saved locations" heading + subheading below the save button.
- [ ] Empty state: bordered card with "No saved locations yet." message.
- [ ] Non-empty: rows show `label` (bold) + `lat, lng` to 4 decimal places (matches DiveEvent.tsx:374).
- [ ] Each row has a `✕` delete button on the right (44pt tap target via 32px button + hitSlop=8).
- [ ] Add button at the bottom of the section navigates to `LocationPicker` with `returnTo: "Profile"`.
- [ ] After returning from LocationPicker, the new location appears in the list (via `useFocusEffect`).
- [ ] Tapping delete removes the row and shows `"Saved location deleted"`.
- [ ] `pnpm compile` clean (TypeScript passes — all 7 locales have the new keys).

### Phase 2: LocationPicker `returnTo = "Profile"` support
**Status: likely a no-op, verify only.**

**Verification steps**:
1. Confirm `LocationPickerScreen.saveLocation` calls `navigation.goBack()` — already confirmed at line 70. Since the user pushed onto the stack from Profile, `goBack()` pops the picker and re-focuses Profile, triggering `useFocusEffect` (Phase 1). **No code change needed.**
2. The `route.params.returnTo` value is not actually read by LocationPicker code — it only receives it. No type-narrowing change required.
3. Confirm TypeScript: `AppStackScreenProps<"LocationPicker">` `params` type does not restrict `returnTo` to a literal union. If it does, add `"Profile"` to the union. (Will be caught by `pnpm compile`.)

**If a code change IS needed** (only if step 3 fails):
- Add `"Profile"` to the `returnTo` literal union in `app/navigators/navigationTypes.ts`.

**Acceptance**:
- [ ] From Profile, tap `+ Add saved location` → LocationPicker opens.
- [ ] Enter label, tap Save → returns to Profile.
- [ ] New location appears in the list immediately.

### Phase 3: Remove Map FAB
**Files**:
- `app/screens/main/MapScreen.tsx` — delete the `<MapFab iconName="add" ... />` block (lines 322-334). Keep the search FAB (lines 335-341). Keep the `$fabColumn` style unchanged (it works for a single FAB).
- `app/i18n/en.ts` — delete `fabAddLocation: "Add saved location",` at line 76.
- `app/i18n/ko.ts`, `ja.ts`, `hi.ts`, `fr.ts`, `es.ts`, `ar.ts` — delete the same key.

**Acceptance**:
- [ ] Map screen has no `+` FAB.
- [ ] Search FAB still works (`map-search-this-area-button` testID still present, still tappable).
- [ ] `map-add-saved-location-button` testID no longer exists anywhere in the app.
- [ ] `pnpm compile` clean (TypeScript passes — all 7 locales lose the key, satisfying the `Translations` type).

### Phase 4: Maestro flow updates
**Files**:
- `.maestro/flows/map-location-add-delete.yaml` — replace the two `map-add-saved-location-button` taps (lines 33, 41) with the Profile-based path. Insert a tab switch before the first tap, and switch back to Map after.
- `.maestro/flows/map-saved-location-event-redesign.yaml` — same replacement (4 occurrences at lines 36, 44, 47, 55).
- `.maestro/flows/dive-event-create-update-delete.yaml` — same (2 occurrences at lines 33, 41).
- `.maestro/flows/full-integration.yaml` — same (1 occurrence at line 36).
- New file `.maestro/flows/profile-saved-locations.yaml` — focused regression flow.

**Replacement pattern** (apply to all 4 existing flows):
```yaml
# Was:
# - tapOn: { id: "map-add-saved-location-button" }
# Becomes:
- tapOn: { id: "tab-profile" }
- extendedWaitUntil: { visible: "Saved locations", timeout: 30000 }
- tapOn: { id: "profile-add-saved-location-button" }
# (LocationPicker flow is unchanged: label input → save button)
# After LocationPicker returns, switch back to Map if the next assertion is on Map:
- tapOn: { id: "tab-map" }
- extendedWaitUntil: { visible: "Map", timeout: 30000 }
```

**New file `.maestro/flows/profile-saved-locations.yaml`** (focused regression):
1. Sign in (or sign up if no user)
2. `tapOn: { id: "tab-profile" }`
3. `extendedWaitUntil: { visible: "Saved locations", timeout: 30000 }`
4. `assertVisible: { id: "profile-add-saved-location-button" }` (always present, even in empty state)
5. `tapOn: { id: "profile-add-saved-location-button" }`
6. `extendedWaitUntil: { visible: { id: "location-picker-label-input" }, timeout: 30000 }`
7. `tapOn: { id: "location-picker-label-input" }`
8. `inputText: "Regression Test Reef"`
9. `tapOn: { id: "location-picker-save-button" }`
10. `extendedWaitUntil: { visible: "Regression Test Reef", timeout: 30000 }`
11. `takeScreenshot: "profile-saved-location-added"`
12. `tapOn: { id: "profile-saved-location-delete-<captured-id>" }` — actually, since we don't know the ID, use accessibility: `tapOn: "Delete saved location"` won't work because it doesn't disambiguate. **Use the label text + position: `tapOn: { text: "Regression Test Reef", below: ... }`** — but that's brittle. Simplest: capture the row's testID via `assertVisible` first, then `tapOn` with that ID. **Concrete pattern**: the testID is the location's UUID. We can't predict it. **Solution**: re-tap by label, then tap the delete button on the same row. Maestro's `extendedWaitUntil: { visible: { id: "profile-saved-location-delete-*" } }` does NOT support wildcards. Workaround: scroll until visible, then tap. **Cleanest**: add a second sub-flow step that asserts the row by its visible label text (`assertVisible: "Regression Test Reef"`), then uses the Maestro `tapOn` with a position selector. **Pragmatic alternative for the new flow**: just assert the row was created and take a screenshot — don't try to delete in the new flow; the delete path is already covered by the modified `map-location-add-delete.yaml`. Drop the delete step from the new flow.
13. **Final form of the new flow**: assert add works, assert row appears, take screenshot, sign out. No delete.

**Acceptance**:
- [ ] All 4 modified flows + 1 new flow run green via `maestro test` against simulator `3D19ABFD-0C87-4E7F-ABCD-CA627221FBE9`.
- [ ] No flow references the removed `map-add-saved-location-button` testID.
- [ ] No flow asserts on `mapScreen.fabAddLocation` text.

### Phase 5: Review
**Owner**: `@analyzer`
**Focus areas**:
1. **Visual hierarchy in the new section** (refactoring-ui): heading > subheading > list > add-button. Spacing scale (4/8/16/24/32/48) used consistently — no magic numbers.
2. **i18n coverage in all 7 locales**: every new key has a translation; deleted `fabAddLocation` removed from all 7.
3. **Maestro flow correctness**: every replaced testID has a `tab-profile` switch and a `Saved locations` visibility wait before the tap.
4. **No regression in Map screen search FAB**: `map-search-this-area-button` still wired; status messages still render; no orphan styles.
5. **`useFocusEffect` correctness**: callback dependency array includes `loadSavedLocations`; cleanup function returned (implicit, since none needed here — matches DiveEventScreen.tsx:68-72).
6. **TypeScript clean**: `pnpm compile` passes — proves the `Translations` type is satisfied.

## Risks
1. **`useFocusEffect` re-fetch on every focus**: ~30ms local RPC; negligible. Tracked as a known behavior, not a perf issue.
2. **Map `$fabColumn` reduced to a single FAB**: small visual jump. Acceptable; the column style is still useful (positions the search FAB consistently). The pill button at the bottom center covers the same UX role the second FAB used to fill.
3. **5 Maestro flows updated**: 4 file changes; if any is wrong the regression test fails. **Mitigation**: use Maestro MCP `maestro run` (not `maestro test` in CI) to validate each flow interactively before committing.
4. **i18n in 7 locales** (14 string changes total: 7 deletes + 7 new × 1 key for the heading only, plus 6 more keys for the other locales). **Mitigation**: for locales you cannot translate, copy the English string as a fallback (the `Translations` structural type forces the key to exist; copying is allowed). The English string is itself a fallback until proper translation is done.
5. **Per-row delete "✕" is a destructive action with no confirm modal** (unlike `dive-event-delete-button` at DiveEventScreen.tsx:118 which has a confirm dialog). **Mitigation decision**: deletion is reversible-ish (re-add), the row data is small, and a confirm dialog on every delete is annoying. Acceptable for v1. Documented as a follow-up if user feedback demands confirmation.
6. **No FlatList for the list**: for >20 saved locations, the parent `<Screen preset="auto">` scroll handles it but render perf may degrade. **Mitigation**: realistic data ceiling is <10; revisit only if telemetry shows growth.

## Out of scope
- **Edit location label** (only add/delete for v1)
- **Map overlay of personal saved locations** on the Map screen (the Map screen does not currently show them; the search FAB is for divers/events)
- **Removing the DiveEvent add button** (the two buttons serve different intents)
- **"Share on map" toggle in the Profile list** (the location has `isPublicMapLocation`; surfacing it is future work)
- **Confirm-modal on delete** (see Risk #5)
- **FlatList virtualization** (see Risk #6)

## UI/UX Composition Specification

### Profile screen — new "Saved locations" section (added below save button)

#### [Zone: Section wrapper] (placed AFTER the save button, INSIDE `<Screen>`)
```
testID: profile-saved-locations-section
marginTop: spacing.xl (24px)  ← clear break from the form above
gap: spacing.sm (8px)         ← consistent internal rhythm
```

#### [Zone: Heading + Subheading]
- **Heading**: `tx="profileScreen:savedLocationsHeading"`, `preset="subheading"`, color `colors.text`
  - Hierarchy: below the screen title, above the list — reads as a peer to "Display name" / "Summary" labels
  - marginTop: spacing.xs (4px)
- **Subheading**: `tx="profileScreen:savedLocationsSubheading"`, `size="sm"`, color `colors.textDim`
  - marginBottom: spacing.md (16px)
  - Function: tells the user *what* the section is and *why* — answers "what is this for?" before they see the empty state

#### [Zone: Empty state] (when `savedLocations.length === 0`)
```
testID: profile-saved-locations-empty
borderColor: colors.separator
borderRadius: 12
borderWidth: 1
padding: spacing.md (16px)
content: single Text "No saved locations yet." (colors.textDim, size="sm")
```
**Note**: The Add button is NOT inside the empty card — it's a peer to the card, placed below it. This avoids the empty state being a "walled garden" the user must first escape to act.

#### [Zone: List] (when `savedLocations.length > 0`)
```
testID: profile-saved-location-list
gap: spacing.sm (8px) between rows
```
Each row:
```
testID: profile-saved-location-<id>
flexDirection: row, alignItems: center
borderColor: colors.separator
borderRadius: 12, borderWidth: 1
padding: spacing.md (16px)
gap: spacing.sm (8px)
```
Row contents (left → right):
1. **Text column** (flex: 1, gap: spacing.xs):
   - Label: `preset="bold"`, `colors.text`, 1 line, ellipsize if too long
   - Coords: `size="xs"`, `colors.textDim`, `${lat.toFixed(4)}, ${lng.toFixed(4)}`
2. **Delete button** (right, 32×32, tap target ~44pt with hitSlop=8):
   - testID: `profile-saved-location-delete-<id>`
   - accessibilityLabel: `tx="profileScreen:deleteSavedLocation"`
   - Icon: `Ionicons name="close" size={18} color={colors.textDim}`
   - On tap: no confirm — see Risk #5

#### [Zone: Status message] (after list or empty card, before add button)
- Success: `color={colors.tint}`, `testID="profile-saved-locations-message"`, text e.g. "Saved location deleted"
- Error: `color={colors.error}`, `testID="profile-saved-locations-error"`
- marginTop: spacing.xs (4px)
- Reuses the same `<Text accessibilityRole="alert" />` pattern as the existing profile form (lines 215-230)

#### [Zone: Add button] (bottom of the section)
```
testID: profile-add-saved-location-button
tx: "profileScreen:addSavedLocation"
accessibilityLabel: "Add saved location"
onPress: () => navigation.navigate("LocationPicker", { returnTo: "Profile" })
preset: default (NOT reversed) — primary action at the bottom
marginTop: spacing.md (16px)
```

#### Content flow (reading order)
1. Screen title "Profile" (existing)
2. Avatar section (existing)
3. Email (existing, read-only)
4. Display name (existing)
5. Summary (existing)
6. Error / success message (existing)
7. Save profile button (existing)
8. **[NEW] "Saved locations" heading**
9. **[NEW] Subheading**
10. **[NEW] Empty state card** OR list of rows
11. **[NEW] Locations message / error**
12. **[NEW] "Add saved location" button**

### Action placement rules
| Action | Position | Variant | Visibility |
|--------|----------|---------|-----------|
| Add saved location | Bottom of new section | primary (default) | Always |
| Delete per row | Right of row, 32×32 icon | ghost (icon only) | Always (no hover state needed on mobile) |

### Component mapping
| Need | Reuse Existing | New |
|------|---------------|-----|
| Section wrapper (`<View>`) | — | inline in ProfileScreen.tsx |
| Heading (`<Text preset="subheading">`) | `<Text>` from `@/components/Text` | — |
| Subheading (`<Text size="sm">`) | `<Text>` | — |
| Empty card style | `$emptyLocationCard` from DiveEvent.tsx:477 — duplicate locally with new name `$profileEmptyLocationCard` | — |
| List container style | `$locationList` from DiveEvent.tsx:485 — duplicate locally | — |
| Row card style | `$locationOption` from DiveEvent.tsx:490 — duplicate locally as `$profileLocationRow` | — |
| Add button | `<Button>` from `@/components/Button` | — |
| Delete button (icon Pressable) | — | new: inline `<Pressable><Ionicons /></Pressable>` |
| Status message | existing pattern in ProfileScreen.tsx:215-230 | — |
| `useFocusEffect` re-fetch | copy from DiveEvent.tsx:68-72 | — |

### Responsive behavior
- Profile screen is single-column at all breakpoints (mobile-first). No changes.
- Section padding inherits the existing `$container` (`paddingHorizontal: spacing.lg, paddingVertical: spacing.xxl`).
- List rows reflow to full width naturally via `flexDirection: row` + `flex: 1` on the text column.

### States
| State | Affected Zone | Treatment |
|-------|--------------|-----------|
| Initial load (no cached state) | List | `isLocationsLoading: true` → render 2 skeleton rows (gray rectangles with `$locationRow` shape, no text). `isLocationsLoading: false` after first `useFocusEffect` resolves. |
| Loaded, empty | List | Empty card + add button |
| Loaded, has rows | List | Rows + add button |
| Adding (in LocationPicker) | Section | User is on LocationPicker; Profile re-focuses on return. List re-fetches via `useFocusEffect`. No "loading" flash because the fetch is <30ms; just re-renders with the new row present. |
| Deleting | Section | Optimistic remove from local state on tap; if `deleteSavedLocation` fails, restore + show error in `locationsError` slot. |
| Error loading list | Section | Inline `locationsError` Text in `colors.error` above the add button. List is empty. Add button still tappable. |

### Accessibility
- Every interactive element has `accessibilityLabel` (English) and `accessibilityRole="button"`.
- Delete button has `hitSlop={8}` to expand the 32px visual to ~48px effective tap target (WCAG 2.5.5 minimum).
- Status messages have `accessibilityRole="alert"` for screen reader announcement.
- `testID`s follow the existing kebab-case `screen-element` pattern.

## Decision Log
| Decision | Chosen | Rejected | Rationale | Evidence |
|----------|--------|----------|-----------|----------|
| Where to refresh the list | `useFocusEffect` (mirrors DiveEvent.tsx:68-72) | `useEffect` with `[]` dep; `navigation.addListener("focus", ...)` | Matches existing in-repo pattern, automatic cleanup, fires on every focus including back-from-push | DiveEvent.tsx:68-72; Context7 docs |
| List implementation | Plain `View.map` | `FlatList` | Realistic data ceiling <10; over-engineering for v1. Parent `<Screen>` scroll handles overflow. | Risk #6 |
| Delete confirmation | None (single tap) | Modal confirm (mirrors dive-event-delete) | Delete is reversible (re-add), no destructive cross-entity effect, avoids annoying UX. Documented as future work. | Risk #5; DiveEvent.tsx:118 |
| Section placement in Profile | After save button | Top of screen (above avatar) | Section is a secondary concern; form is primary. Mirrors Settings screen pattern (sections below the title). | ProfileScreen.tsx structure |
| Reduce FAB column to 1 FAB | Keep `$fabColumn` style | Wrap remaining FAB in plain `View` | Style works fine for 1 FAB; minor visual jump is acceptable and documented. | MapScreen.tsx:409-415 |
| Add button preset | Default (primary) | `preset="reversed"` | Add is the primary CTA for this section. Reversed is for the form's "Save profile" which is the screen's main action. | Visual hierarchy: heading > add-button (primary) > row content |
| Pass `initialLatitude/initialLongitude` to LocationPicker from Profile? | No (let default) | Yes (pass profile's last-used) | User intent is "add a new spot" not "edit map center". Default center is fine. | LocationPickerScreen.tsx:35-38 default fallback |
| Per-row accessibility | `accessibilityLabel="Delete saved location"` (no label interpolation) | Interpolate location label | VoiceOver already reads the row's text content (label) before/after the button label. Concise label is sufficient. | iOS HIG |

## Evidence Owners
| Item | Owner | Proof Required |
|------|-------|----------------|
| Phase 1 list renders correctly | @implementer | Screenshot via Maestro + `assertVisible: "label"` |
| Phase 1 delete works | @implementer | Tap delete, assert row gone, assert success message |
| Phase 1 add returns new location | @implementer | Add via LocationPicker, assert row appears in Profile list |
| Phase 2 no code change needed | @analyzer | `git diff` shows only the (possible) type-union update; `pnpm compile` passes |
| Phase 3 no `+` FAB | @analyzer | Maestro `assertNotVisible: { id: "map-add-saved-location-button" }` |
| Phase 3 search FAB intact | @analyzer | `map-search-this-area-button` still in `MapScreen.tsx`; modified `map-location-add-delete.yaml:60` still passes |
| Phase 4 all 4 modified flows + 1 new flow pass | @implementer | `maestro test` output, all green |
| Phase 4 no flow references removed testID | @analyzer | `grep "map-add-saved-location-button" .maestro/` returns 0 matches |
| Phase 5 visual hierarchy | @analyzer | Refactoring-ui 7-principle audit; screenshot of new section |
| Phase 5 i18n coverage | @analyzer | `grep` all 7 locales for each new key — must be 7 matches per key |

## Failure Signals
- **`useFocusEffect` does NOT re-fire after LocationPicker returns**: list shows stale data; new location not visible. Cause: callback deps stale (e.g., forgot `loadSavedLocations` in dep array).
- **TypeScript compile fails on `Translations` type**: a new key in `en.ts` not added to a locale. Run `pnpm compile` to surface immediately.
- **Maestro flow hangs on `extendedWaitUntil: { visible: "Saved locations" }`**: section heading not rendering, or heading text changed. Check ProfileScreen.tsx for the i18n key match.
- **Maestro flow can't find `profile-add-saved-location-button`**: button testID is missing or in a conditional branch that doesn't render. Verify the button is outside any conditional.
- **Delete row still visible after tap**: optimistic local-state update didn't fire, OR `deleteSavedLocation` errored and the rollback didn't restore. Check `setSavedLocations((prev) => prev.filter(...))` order.
- **Map screen layout broken after FAB removal**: `$fabColumn` was removed or the wrapping `<View>` was deleted accidentally. Re-check MapScreen.tsx:321-342 — the wrapping `<View style={themed($fabColumn)}>` MUST stay.

## Notes
- **Translation strategy for 6 non-English locales**: en.ts is the source of truth. For locales the implementer cannot translate, copy the English string. This is a known v1 limitation; mark for professional translation in a follow-up.
- **Test file conventions**: this codebase does not have unit tests for screens (per the repo pattern — see DiveEventScreen and ProfileScreen having no `.test.tsx` companion). Do NOT add a `.test.tsx` for this change; validation is via Maestro + manual `pnpm compile`.
- **No new dependencies**: `Ionicons` is already imported in MapScreen, and `@expo/vector-icons` is a project dep. `useFocusEffect` is from `@react-navigation/native`, already a dep (used by DiveEvent and ConversationList). Zero new packages.
- **Do not commit the plan file**: per the hard rule, `docs/profile-saved-locations.plan.md` is delivered but not committed.
