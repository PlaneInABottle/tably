# Map, Saved Locations, and Events UX Redesign - Implementation Plan

## Status

**READY**

No unresolved HIGH or CRITICAL assumptions remain. The plan chooses the smallest robust path that satisfies the requested UX: saved user locations, saved-location event creation, scanned event list, marker bottom sheets, and distinct person/event map markers.

## Problem Statement

The current app stores only one profile map location on `profiles.location`/`show_location`, creates at most one dive event from a GPS-only/manual coordinate picker, and shows marker details in cramped inline map panels. Users need a dedicated map-based add-location flow with a draggable marker, multiple saved locations, event creation from any saved location, a scanned-events list after map search, and clear marker detail cards/bottom sheets for people and events.

## Approach

Incremental redesign with backward-compatible persistence first: introduce `profile_locations` as the source of saved user locations, keep `dives.location` as the immutable event location snapshot for map search and history, optionally link each dive to the saved location used at creation with `location_id`, then refactor UI into focused screens/components with Maestro and SQL verification at every slice.

---

## Current State (Evidence)

### Verified Facts

| Fact | Evidence |
|---|---|
| App uses React Navigation native stack plus bottom tabs, not Expo Router file routes. | `app/navigators/AppNavigator.tsx:38-44`; `app/navigators/MainTabNavigator.tsx:36-56`; `app/navigators/navigationTypes.ts:26-32` |
| Main tabs include `Map` and `DiveEvent`; tab test IDs already exist. | `app/navigators/MainTabNavigator.tsx:36-41` (`tab-map`, `tab-dive`) |
| Deep links include `/map` and `/dive-event`. | `app/app.tsx:63-76` |
| Current `MapScreen` is a single 393-line component with local `useState` for region, pending coordinate, user markers, dive markers, selected user, selected dive, loading and messages. | `app/screens/main/MapScreen.tsx:28-42` |
| Current map press sets `pendingCoordinate` from `event.nativeEvent.coordinate`. | `app/screens/main/MapScreen.tsx:56-58` |
| Current map scan calls `mapService.getUsersInView(bounds)` and `diveEventService.getDivesInView(bounds)` in parallel. | `app/screens/main/MapScreen.tsx:134-163` |
| Current map renders pending location marker, user markers, and purple dive markers. | `app/screens/main/MapScreen.tsx:188-224` |
| Current marker detail is inline inside the bottom panel, not a real bottom sheet/card system. | `app/screens/main/MapScreen.tsx:234-296` |
| Current map includes inline pressable lists for user markers and dive markers, but no dedicated scanned events list screen/sheet. | `app/screens/main/MapScreen.tsx:255-277` |
| Current save/delete location mutates `profiles.location` via RPCs. | `app/screens/main/MapScreen.tsx:94-132`; `app/services/location/mapService.ts:72-93` |
| Current event screen supports one own event with empty/detail/form states. | `app/screens/main/DiveEventScreen.tsx:182-339` |
| Current event form has `Use Current Location` only; there is no saved-location selector. | `app/screens/main/DiveEventScreen.tsx:229-339` |
| Current event service uses RPCs `get_own_dive`, `upsert_own_dive`, `delete_own_dive`, and `dives_in_view`. | `app/services/dives/diveEventService.ts:77-109` |
| `profiles` already has `location geography(Point,4326)` and `show_location boolean`. | `supabase/migrations/20260525150000_auth_profiles.sql:3-14` |
| `profiles.location` has a GiST index. | `supabase/migrations/20260525150000_auth_profiles.sql:18` |
| Direct profile location edits are protected by `protect_profile_server_fields`; location RPCs use `app.location_rpc = 'on'`. | `supabase/migrations/20260526120000_map_location_rpcs.sql:1-35`, `:60-64`, `:91-96` |
| `users_in_view` currently reads `profiles.location/show_location`, excludes self, and limits to 250. | `supabase/migrations/20260526120000_map_location_rpcs.sql:105-146` |
| `dives` has `location geography(Point,4326)` and `unique(created_by)`, so each user has one own event today. | `supabase/migrations/20260527120000_dive_events.sql:1-11` |
| Dive table direct access is revoked; access is through security-definer RPCs. | `supabase/migrations/20260527120000_dive_events.sql:17-20`, `:227-235` |
| `upsert_own_dive` writes `ST_MakePoint(p_lng, p_lat)`, preserving longitude/latitude order. | `supabase/migrations/20260527120000_dive_events.sql:96-108` |
| `dives_in_view` joins `dives` to `profiles`, returns marker fields, orders by `event_at`, and limits to 250. | `supabase/migrations/20260527120000_dive_events.sql:178-225` |
| Generated DB types currently include existing RPCs only; PostGIS columns are typed as `unknown`. | `app/services/supabase/database.types.ts:103-143`, `:186-224`, `:229-402` |
| Test convention is stable ASCII kebab-case `testID` plus `accessibilityLabel` for interactive elements. | Examples: `app/screens/auth/SignInScreen.tsx:51-86`; `app/screens/main/MapScreen.tsx:258-269`; `app/screens/main/SettingsScreen.tsx:76-77` |
| i18n keys use `screenName:keyName` via `Text tx`, `Button tx`, and `translate()`. | `app/i18n/index.ts:65-86`; `app/i18n/translate.ts:1-33`; `app/i18n/en.ts:46-101` |
| Existing Maestro flows cover location add/delete, map search, event CRUD, event map search, chat from markers, and full integration. | `.maestro/flows/map-location-add-delete.yaml`; `.maestro/flows/map-search-area.yaml`; `.maestro/flows/dive-event-create-update-delete.yaml`; `.maestro/flows/dive-event-map-search.yaml`; `.maestro/flows/chat-start-from-dive-event.yaml`; `.maestro/flows/full-integration.yaml` |
| Existing seed SQL creates profiles with locations and dives using `ST_MakePoint(longitude, latitude)`. | `scripts/seed-maestro-data.sql:96-121` |
| `react-native-maps` supports draggable markers with `draggable` and `onDragEnd={(e) => setState(e.nativeEvent.coordinate)}`. | Context7 `/react-native-maps/react-native-maps`, README draggable marker example |

### Assumptions (No HIGH/CRITICAL)

| Assumption | Level | Why Acceptable | Validation / Mitigation |
|---|---:|---|---|
| Keep one own dive event per user for this redesign by preserving `unique(created_by)`. | MEDIUM | Existing `DiveEvent` tab and services are singular; user asked to choose among multiple saved locations for event creation, not to create multiple own events. | Analyzer must verify no UX copy promises multiple own events. If product later needs multiple own events, remove `unique(created_by)` in a separate plan. |
| `profile_locations` stores private saved locations for event selection, while `profiles.location/show_location` remains the explicit public map-discovery location mirror. | MEDIUM | Separates privacy-sensitive saved locations from public person discovery while preserving current map RPC compatibility. | SQL verification proves private saved locations do not affect `profiles.show_location` or `users_in_view`; only explicit “Share on map” actions update the public mirror. |
| Bottom sheet/card can be implemented with existing React Native primitives first, not a new dependency. | LOW | Current app already uses custom `Screen`, `Button`, `Text`, and `TextField`; no dependency is required for a first-class card overlay. | Maestro screenshots and hierarchy checks validate spacing, no overlap, and actionable controls. |
| Maestro can simulate marker dragging only if target hierarchy/coordinate gestures are stable; otherwise use map tap plus SQL/API verification for exact drag coordinates. | MEDIUM | Mobile map gestures are often flaky in E2E; Context7 confirms runtime API support, not test automation reliability. | Add testIDs and fallback to tap/map-point + psql coordinate assertions. Analyzer reviews flow flakiness. |

---

## Architecture Decisions Summary

| Decision | Chosen | Rejected | Rationale | Evidence |
|---|---|---|---|---|
| Saved location storage | New `public.profile_locations` table with `owner_id`, `label`, `location geography(Point,4326)`, `is_active`, optional `is_public_map_location`, timestamps; app writes are RPC-only. | Continue overloading `profiles.location` only. | Multiple private saved locations require a child table; RPC-only writes centralize ownership, validation, privacy, and one-public-location semantics. | Existing single point in `profiles`: `auth_profiles.sql:9-10` |
| Public person marker source | `users_in_view` uses only `profiles.location/show_location` or an explicitly shared `profile_locations.is_public_map_location=true` mirror. | Use all active saved locations for person discovery. | Saved event locations are private by default; creating or using one for an event must not publish a person marker. | Current public discovery source is `profiles.location/show_location`: `map_location_rpcs.sql:105-146` |
| Event location model | `dives.location` remains required snapshot; add nullable `location_id` and `location_label_snapshot`. | Only reference `profile_locations.id` from `dives`. | Historical integrity: event stays where it was created even if saved location is renamed/moved/deleted. The FK helps trace source but does not control event position after creation. | Current `dives.location` is used for search: `dive_events.sql:7`, `:215-225` |
| Own event cardinality | Preserve one own event per user for now. | Multi-event-per-user redesign. | Avoids a larger product change not explicitly requested; keeps `DiveEvent` tab behavior compatible. | `unique(created_by)`: `dive_events.sql:10`; current screen singular: `DiveEventScreen.tsx:182-339` |
| Location picker | Dedicated reusable `LocationPickerScreen` for add/edit saved location, using `MapView`, draggable `Marker`, label field, save/cancel. | Keep picker embedded in `MapScreen`/`DiveEventScreen`. | Dedicated flow prevents map controls from overlapping scan controls and supports reuse from event creation. | Current `MapScreen` is overloaded: `MapScreen.tsx:28-333` |
| Marker detail UX | A shared bottom card component for person/event marker taps. | Full-screen event detail from marker tap. | User requested bottom sheet/card and explicitly rejected current full-screen/poor detail pattern. | Current inline detail cards: `MapScreen.tsx:234-296` |
| Scanned event list | Add list button after successful scan opening a dedicated event list card/screen from current scan results. | Inline list permanently under map. | Keeps map uncluttered and discoverable; aligns with requested “opened by a list button after/near map scan.” | Current inline list exists but no dedicated list: `MapScreen.tsx:265-277` |
| New dependencies | None unless analyzer finds an existing installed sheet library. | Add bottom-sheet dependency immediately. | KISS/YAGNI: existing primitives are enough for card overlays; fewer native dependency risks. | Existing custom components support UI composition. |

---

## Success Criteria

- [ ] Users can open a dedicated add-location flow/page from Map and/or Dive Event UI.
- [ ] Add-location flow shows a map, draggable marker, label field, empty/loading/error/saving states, and Save/Cancel actions.
- [ ] Users can save multiple private locations, list them, explicitly choose whether one is shared on the public map, and delete/deactivate locations they own.
- [ ] Creating/updating an event requires selecting a saved location or adding one first; no GPS-only limitation remains.
- [ ] Events preserve a coordinate snapshot even if the saved location changes later.
- [ ] Map scan clearly renders separate people and event marker types and provides a legend/labels.
- [ ] Tapping a person marker opens a bottom card with person details and message action where applicable.
- [ ] Tapping an event marker opens a bottom card with event details and message organizer action where applicable.
- [ ] A list button appears after/near map scan and opens scanned-area events list with empty/loading/error states.
- [ ] Existing Dive Event tab remains available for managing the user's own event.
- [ ] No Google Maps, push notifications, group chat, or account deletion is added.
- [ ] SQL/RPC and Maestro verification cover RPC-only writes, direct DML denial, ownership checks, private-vs-public visibility, coordinate order, event snapshots, marker detail cards, and scanned event list.

---

## Target Data Architecture

### New Table: `public.profile_locations`

Recommended columns:

```sql
id uuid primary key default gen_random_uuid(),
owner_id uuid not null references public.profiles(id) on delete cascade,
label text not null check (char_length(trim(label)) between 1 and 80),
location extensions.geography(Point, 4326) not null,
is_active boolean not null default true,
is_public_map_location boolean not null default false,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
```

Recommended indexes:

- `profile_locations_owner_idx` on `(owner_id)`.
- `profile_locations_owner_public_uidx` partial unique on `(owner_id)` where `is_public_map_location and is_active`.
- `profile_locations_location_gix` GiST on `location` where `is_active`.
- Optional `profile_locations_owner_label_idx` on `(owner_id, lower(label))` only if duplicate labels become confusing; do not enforce uniqueness unless product requires it.

Recommended protections:

- Enable RLS.
- Direct app-role DML must be denied/revoked:
  - Revoke table `INSERT`, `UPDATE`, and `DELETE` from `anon` and `authenticated`.
  - Do **not** add direct app-role insert/update/delete RLS policies.
  - Add a trigger guard similar to existing profile/dive guards so writes require an internal setting such as `app.profile_location_rpc = 'on'`.
- Direct SELECT may remain owner-only if useful for simple reads:
  - `select_own_profile_locations`: owner can select own rows.
  - If direct SELECT is not needed, revoke it too and use only `list_own_profile_locations()`.
- All writes must go through security-definer RPCs that enforce `auth.uid()` ownership, label validation, coordinate validation, private/public visibility semantics, safe deactivate/delete, and mirror updates only when explicitly requested.

### Migration / Backfill from `profiles.location/show_location`

Backfill each profile with an existing shown public map location into one saved location explicitly marked as public. This preserves current public discovery state without publishing any new private saved locations:

```sql
insert into public.profile_locations (owner_id, label, location, is_public_map_location, is_active)
select id, 'Public map location', location, true, true
from public.profiles
where show_location = true and location is not null
on conflict do nothing;
```

Compatibility mirror:

- Keep `profiles.location` and `profiles.show_location` during this redesign.
- Creating the first saved location must **not** automatically set `profiles.show_location=true` and must **not** publish the user on the map.
- `share_profile_location_on_map(p_id)` or `set_public_map_location(p_id)` is the only RPC that marks a saved location as public, clears other public saved locations for the owner, and mirrors that point to `profiles.location/show_location=true` using `app.location_rpc='on'`.
- `unshare_profile_location_from_map()` clears all `is_public_map_location` flags for the owner and mirrors `profiles.location=null, show_location=false` using `app.location_rpc='on'`.
- `delete_profile_location` or `deactivate_profile_location` clears `profiles.location/show_location=false` only if the deleted/deactivated location was the explicit public map location. Private saved locations can be deleted/deactivated without touching the public mirror.
- Existing `update_own_location` / `delete_own_location` should either:
  1. become compatibility wrappers around explicit public map-location share/unshare RPCs; or
  2. remain temporarily for old UI only, then be unused after UI migration.
- Prefer option 1 before deleting old code because existing Maestro flows and old screens already call these RPC names.

Privacy rule:

- A saved location is private and usable for event selection by default.
- Using a private saved location to create an event publishes the event at the copied event snapshot coordinate, but it must not publish a person marker for the event creator.
- `users_in_view` must use only `profiles.location/show_location=true` (or the explicitly mirrored `is_public_map_location` row) and must never infer visibility from active/private saved locations or `dives.location`.

### Event Location Design

Modify `public.dives`:

```sql
alter table public.dives
  add column location_id uuid references public.profile_locations(id) on delete set null,
  add column location_label_snapshot text;
```

Keep existing:

- `dives.location geography(Point,4326) not null`
- `unique(created_by)` for one own event per user.

Update `upsert_own_dive` contract:

- New preferred parameter: `p_location_id uuid`.
- RPC validates the location exists, `owner_id = auth.uid()`, and `is_active = true`.
- RPC copies `profile_locations.location` into `dives.location` and copies `profile_locations.label` into `dives.location_label_snapshot` at save time.
- Avoid taking `p_lng/p_lat` from the client for event creation after this phase. This prevents coordinate spoofing and ensures event uses a saved location.

Backward compatibility option:

- During migration, keep the old signature only if Postgres function overloading/type generation remains manageable. Simpler implementation: create a new `upsert_own_dive_from_location(p_location_id, p_event_at, p_description, p_title)` RPC, update the client to call it, then leave old `upsert_own_dive` unused until a cleanup plan.

### RPCs / Functions

New or updated RPCs:

| RPC | Purpose | Notes |
|---|---|---|
| `list_own_profile_locations()` | Return own active saved locations with lat/lng and public-map flag. | Ordered public map location first, then updated desc/label asc; safe alternative if direct SELECT is revoked. |
| `create_profile_location(p_label, p_lng, p_lat, p_share_on_map default false)` | Create private saved location by default. | Validate auth, label trim/length, finite lat/lng ranges; only mirror to `profiles` when `p_share_on_map=true`. First saved location is **not** automatically public. |
| `update_profile_location(p_id, p_label, p_lng, p_lat)` | Edit label/point of an owned active saved location. | Owner-only; validate label/coordinates; if the row is already public, mirror updated point to `profiles`, otherwise do not touch `profiles`. |
| `delete_profile_location(p_id)` or `deactivate_profile_location(p_id)` | Remove saved location safely. | Prefer soft delete `is_active=false` to preserve `dives.location_id`; if row is public, clear public mirror; private deletes do not touch `profiles`. |
| `share_profile_location_on_map(p_id)` / `set_public_map_location(p_id)` | Explicitly publish one owned saved location as the person marker. | Clears other public flags in same transaction and mirrors to `profiles.location/show_location=true`. |
| `unshare_profile_location_from_map()` | Stop public person discovery. | Clears public flags and mirrors `profiles.location=null, show_location=false`. |
| `upsert_own_dive_from_location(...)` | Create/update own event using saved location. | Copies location point and label snapshot. |
| `get_own_dive()` | Include `location_id` and `location_label_snapshot`. | Keep existing fields for UI compatibility. |
| `dives_in_view(...)` | Include `location_label_snapshot`. | Continue searching `dives.location` snapshot. |
| `users_in_view(...)` | Read only explicit public map location (`profiles.location/show_location=true` or public mirror). | Continue returning one marker per user and excluding self; never expose private saved event locations. |

RPC validation requirements for every write RPC:

- Require `(select auth.uid()) is not null` and use it as the only owner identity.
- Reject blank labels and labels over 80 characters after trimming.
- Reject non-finite coordinates, latitude outside `[-90, 90]`, and longitude outside `[-180, 180]`.
- Check `owner_id = auth.uid()` and `is_active=true` for row-specific updates/deletes/event creation.
- Use a transaction/CTE pattern so only one active `is_public_map_location=true` row can exist per owner.
- Set an internal guard setting (`app.profile_location_rpc='on'`) before mutating `profile_locations`; never rely on client-supplied `owner_id`.
- Mirror `profiles.location/show_location` only in explicit share/unshare paths, or when updating/deleting a row that is already public.

### Coordinate Order Invariant

All SQL point writes must use:

```sql
ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
```

All SQL point reads must return:

```sql
ST_Y(location::geometry) as latitude,
ST_X(location::geometry) as longitude
```

This matches current code and seed data: `map_location_rpcs.sql:62-64`, `dive_events.sql:102`, `scripts/seed-maestro-data.sql:96-121`.

---

## Target UI / Navigation Architecture

### Screens and Components

| Area | File(s) Expected | Purpose |
|---|---|---|
| Navigation types | `app/navigators/navigationTypes.ts` | Add stack route(s) for location picker/list if using native stack modals. |
| App navigator | `app/navigators/AppNavigator.tsx` | Register `LocationPicker` / `SavedLocations` route(s) for authenticated users. |
| Location picker screen | `app/screens/main/LocationPickerScreen.tsx` | Dedicated add/edit saved location flow: map, draggable marker, label, save/cancel. |
| Saved locations service | `app/services/location/locationService.ts` or extend `mapService.ts` | CRUD/list/share/unshare RPC wrappers and normalization. |
| Saved location types | `app/services/location/types.ts` | `SavedLocation`, inputs, result types. |
| Map screen | `app/screens/main/MapScreen.tsx` | Refactor scan controls, legend, marker rendering, bottom cards, event list button. |
| Map marker detail card | `app/components/map/MapMarkerDetailCard.tsx` | Shared person/event bottom card. |
| Event scan list | `app/components/map/ScannedEventsList.tsx` or screen | List of current `diveMarkers` opened by list button. |
| Event screen | `app/screens/main/DiveEventScreen.tsx` | Use saved-location selector/add-new button; remove GPS-only event location path. |
| Event service/types | `app/services/dives/diveEventService.ts`, `app/services/dives/types.ts` | Call new RPC and expose location snapshot fields. |
| i18n | `app/i18n/en.ts` plus other locale files | Add all visible strings; prefer ASCII accessibility labels/testIDs. |

### LocationPicker/AddLocation UX

Required behavior:

- Route opened from Map and Dive Event screens.
- Header/title communicates add vs edit mode.
- Map initializes to:
  1. passed coordinate if editing;
  2. currently selected scan region center;
  3. default Istanbul region fallback from current map (`MapScreen.tsx:20-25`).
- Marker is draggable:
  - `<Marker draggable coordinate={coordinate} onDragEnd={(e) => setCoordinate(e.nativeEvent.coordinate)} />`
  - Also allow map tap to reposition for accessibility/test fallback.
- Label field required, max 80 characters.
- Include an explicit privacy toggle/label such as “Share on map” / “Publicly visible to nearby divers”. It must default off for new saved locations unless editing an already-public location.
- The UI must explain that private saved locations can be used for events without showing the user's person marker on the public map.
- Save button disabled while saving or when label/coordinate invalid.
- Explicit empty/loading/error/success states.
- `testID` examples:
  - `location-picker-screen`
  - `location-picker-map`
  - `location-picker-marker`
  - `location-picker-label-input`
  - `location-picker-save-button`
  - `location-picker-cancel-button`
  - `location-picker-error`

### Event Creation UX

Required behavior:

- Dive Event tab remains the entry point for managing own event.
- Event form shows saved-location selector, not only GPS.
- Empty saved locations state shows clear CTA: “Add a saved location first”.
- Selector displays label and coordinate summary.
- “Add location” opens `LocationPickerScreen`; returning to event form refreshes saved locations and can preselect the new location.
- Event save calls `upsert_own_dive_from_location`, not client-provided raw coordinates.
- Existing date/title/description validation remains.
- Show selected saved location label in own event detail.

### Map UX

Required behavior:

- Keep map scan/manual refresh pattern (`Search this area`) but improve layout.
- Show marker legend with two types:
  - People: one color/icon/label, e.g. blue/teal person pin.
  - Events: distinct color/icon/label, e.g. purple calendar/dive pin.
- Use custom marker views or clearly distinct `pinColor` plus legend. Do not rely on color alone; include icons/text labels where feasible.
- Tapping person marker opens bottom card:
  - display name
  - summary
  - avatar placeholder/path if already available
  - message action when not self
  - close action
- Tapping event marker opens bottom card:
  - title/fallback
  - date/time
  - description
  - location label snapshot if available
  - organizer display name/summary
  - message organizer action when not own
  - close action
- List button appears after scan near scan status/control area:
  - Disabled/hidden before first scan.
  - Opens scanned event list for current `diveMarkers`.
  - Empty state says no scanned events in current area.
- Avoid overlap:
  - Floating controls above bottom safe area.
  - Bottom card should not cover primary scan/list buttons without a close affordance.
  - Use spacing scale 4/8/16/24/32 and accessible text sizes.

---

## Phased Implementation Slices and Expected Commits

Each phase is independently committable. Keep implementation phases to 1-3 primary app files plus tests/migration where practical. Run analyzer gates after each phase.

## Phase 1: Saved Locations Schema and Compatibility RPCs

**Owner**: @implementer (Supabase/PostGIS)
**Dependencies**: None
**Complexity**: MEDIUM
**Expected commits**: 2

### Commit 1.1: Add `profile_locations` migration

Files:

- `supabase/migrations/<timestamp>_profile_locations.sql`
- `scripts/seed-maestro-data.sql` only if deterministic saved locations are needed immediately for SQL tests

Tasks:

- [ ] Create `profile_locations` table with owner, label, point, active flag, explicit public-map flag, timestamps.
- [ ] Add GiST and owner/public-map partial unique indexes.
- [ ] Enable RLS with owner-only SELECT if direct reads are kept.
- [ ] Revoke/deny direct `INSERT`, `UPDATE`, and `DELETE` for `anon` and `authenticated`; do not create direct app-role write policies.
- [ ] Add trigger guard so `profile_locations` writes require an internal RPC setting such as `app.profile_location_rpc='on'`.
- [ ] Add `set_updated_at` trigger if existing helper is available.
- [ ] Backfill existing `profiles.location/show_location=true` rows as explicit public map saved locations only.
- [ ] Add psql verification queries for table, indexes, RLS, direct DML denial, and backfill count.

Acceptance criteria:

- [ ] Existing profiles with `show_location=true` get exactly one active public map saved location.
- [ ] Profiles without public location get no saved location from backfill.
- [ ] RLS is enabled and authenticated users cannot select another user's saved locations directly if direct SELECT remains.
- [ ] Authenticated users cannot directly insert/update/delete even their own `profile_locations`; write attempts fail outside RPCs.

### Commit 1.2: Add saved-location RPCs and wrappers

Files:

- `supabase/migrations/<timestamp>_profile_locations.sql` or follow-up migration if split
- `scripts/verify-phase6-final-sql.sh` or new focused `scripts/verify-map-location-events-sql.sh`

Tasks:

- [ ] Add `list_own_profile_locations`.
- [ ] Add `create_profile_location`.
- [ ] Add `update_profile_location`.
- [ ] Add `share_profile_location_on_map` / `set_public_map_location`.
- [ ] Add `unshare_profile_location_from_map`.
- [ ] Add `delete_profile_location`/`deactivate_profile_location`.
- [ ] Ensure creating the first saved location remains private unless `p_share_on_map=true` is explicitly passed.
- [ ] Ensure explicit share mirrors `profiles.location/show_location=true` under `app.location_rpc='on'`.
- [ ] Ensure explicit unshare mirrors `profiles.location=null, show_location=false` under `app.location_rpc='on'`.
- [ ] Update existing `update_own_location` and `delete_own_location` as compatibility wrappers around public share/unshare if feasible.
- [ ] Grant execute to authenticated and revoke public.
- [ ] Enforce `auth.uid()` ownership, label validation, coordinate validation, one-public-location semantics, and safe deactivate/delete in each write RPC.

Acceptance criteria:

- [ ] A user can create two private saved locations and neither creates a public person marker.
- [ ] A user can explicitly share one saved location on the map and only one active saved location can be public.
- [ ] Sharing updates `profiles.location/show_location=true`; unsharing clears `profiles.location/show_location=false`.
- [ ] Deleting/deactivating the public map location clears public visibility; deleting/deactivating a private saved location does not alter `profiles.location/show_location`.
- [ ] Coordinate order psql test proves `longitude` maps to `ST_X`, `latitude` maps to `ST_Y`.
- [ ] Another authenticated user cannot update/delete/list someone else’s saved locations through RPCs or direct table access.
- [ ] Direct app-role INSERT/UPDATE/DELETE denial is proven for own and other-user rows.

Rollback:

- Keep old `profiles.location/show_location` intact.
- If migration fails, drop `profile_locations` and new RPCs; old map location RPCs still support current UI if wrappers were not deployed or are reverted.

---

## Phase 2: Event RPCs Use Saved Location Snapshot

**Owner**: @implementer (Supabase + service contracts)
**Dependencies**: Phase 1
**Complexity**: MEDIUM
**Expected commits**: 2

### Commit 2.1: Add event source location fields and RPC

Files:

- `supabase/migrations/<timestamp>_dive_saved_location.sql`
- `scripts/verify-map-location-events-sql.sh`

Tasks:

- [ ] Add `dives.location_id uuid references public.profile_locations(id) on delete set null`.
- [ ] Add `dives.location_label_snapshot text` with max length aligned to saved location label.
- [ ] Add `upsert_own_dive_from_location(p_location_id, p_event_at, p_description, p_title default null)`.
- [ ] Validate selected location belongs to `auth.uid()` and is active.
- [ ] Copy location point into `dives.location` and label into `dives.location_label_snapshot`.
- [ ] Preserve `unique(created_by)`.
- [ ] Update `get_own_dive` and `dives_in_view` return columns to include location source/snapshot.

Acceptance criteria:

- [ ] Creating an event from saved location A stores A’s coordinates in `dives.location`.
- [ ] Renaming/moving/deleting location A after event creation does not change existing `dives.location` or `location_label_snapshot`.
- [ ] Another user's location ID is rejected.
- [ ] Existing `dives_in_view` search still finds events by `dives.location` snapshot.
- [ ] Creating an event from private saved location A does not set `profiles.show_location=true` and does not make the creator appear in `users_in_view`.

### Commit 2.2: Regenerate types and update TS service contracts

Files:

- `app/services/supabase/database.types.ts`
- `app/services/dives/types.ts`
- `app/services/dives/diveEventService.ts`
- `app/services/location/types.ts` if shared saved-location type is introduced now

Tasks:

- [ ] Regenerate Supabase TypeScript types after migrations.
- [ ] Add `locationId` and `locationLabelSnapshot` to `DiveEvent` and `DiveEventMarker`.
- [ ] Add `upsertOwnDiveFromLocation` service method.
- [ ] Keep existing `upsertOwnDive` method only if still used by old UI during transition; mark internal/deprecated in code comments if needed.
- [ ] Normalize errors using existing service pattern.

Acceptance criteria:

- [ ] TypeScript services compile.
- [ ] Existing map scan service methods still return compatible marker objects.
- [ ] Unit/logic checks cover row mapping for new fields where project test pattern already exists.

Rollback:

- If UI migration is not ready, keep existing event UI calling old `upsert_own_dive` until Phase 5; new columns are additive.

---

## Phase 3: Saved Location Service and Dedicated Location Picker Screen

**Owner**: @implementer (React Native UI + Supabase service)
**Dependencies**: Phase 1
**Complexity**: MEDIUM
**Expected commits**: 2

### Commit 3.1: Add saved location service and navigation route

Files:

- `app/services/location/types.ts`
- `app/services/location/mapService.ts` or new `app/services/location/locationService.ts`
- `app/navigators/navigationTypes.ts`
- `app/navigators/AppNavigator.tsx`

Tasks:

- [ ] Add `SavedLocation` type with `id`, `label`, `coordinate`, `isDefault`, `isActive`, timestamps.
- [ ] Add service methods for list/create/update/delete/setDefault.
- [ ] Register authenticated stack route for `LocationPicker` with params for mode, optional location ID, initial coordinate, and return intent.
- [ ] Keep route params simple and serializable.

Acceptance criteria:

- [ ] Navigation types compile.
- [ ] Service methods map lat/lng fields consistently.
- [ ] Existing map and dive services remain callable.

### Commit 3.2: Implement `LocationPickerScreen`

Files:

- `app/screens/main/LocationPickerScreen.tsx`
- `app/i18n/en.ts` and locale files
- `.maestro/flows/saved-location-picker.yaml`

Tasks:

- [ ] Build fixed `Screen` with map area and bottom form panel.
- [ ] Render draggable marker and update coordinate on `onDragEnd` per Context7 fact.
- [ ] Allow map tap to reposition marker for accessibility and Maestro fallback.
- [ ] Add label `TextField`, save/cancel `Button`s, loading/error states.
- [ ] Save via saved-location service; support explicit share-on-map flag if included in route/state, defaulting off for new saved locations.
- [ ] Return/navigate back after save.
- [ ] Add stable testIDs and ASCII accessibility labels.
- [ ] Add Maestro flow covering add location with map tap/drag fallback and psql verification of saved coordinate.

Acceptance criteria:

- [ ] User can add a saved location without using GPS.
- [ ] Invalid empty label blocks save and shows an error.
- [ ] Saved location persists with correct label and coordinates.
- [ ] Marker dragging/tapping updates coordinate before save.

Rollback:

- Route is additive; remove route registration and screen if needed without affecting current Map/DiveEvent screens.

---

## Phase 4: Map Screen UX - Marker Types, Bottom Cards, and Scanned Event List

**Owner**: @implementer (React Native map UX)
**Dependencies**: Phase 2 for event fields; Phase 3 for add-location route
**Complexity**: HIGH
**Expected commits**: 3

### Commit 4.1: Extract marker detail card component

Files:

- `app/components/map/MapMarkerDetailCard.tsx`
- `app/screens/main/MapScreen.tsx`
- `app/i18n/en.ts` and locale files

Tasks:

- [ ] Add discriminated props for `type: "person" | "event"`.
- [ ] Move selected user/event detail UI out of `MapScreen` into the card.
- [ ] Preserve message-diver and message-organizer behavior.
- [ ] Add close action and safe spacing.
- [ ] Add testIDs: `map-marker-detail-card`, `map-person-detail-card`, `map-event-detail-card`, `map-marker-detail-close-button`.

Acceptance criteria:

- [ ] Tapping existing user marker/list item opens person card.
- [ ] Tapping existing event marker/list item opens event card.
- [ ] Chat entry points still navigate to the existing one-on-one chat flow.
- [ ] No full-screen marker detail route is introduced.

### Commit 4.2: Make marker types visually distinct and add legend

Files:

- `app/screens/main/MapScreen.tsx`
- `app/components/map/MapMarkerLegend.tsx` or inline component if small
- `app/i18n/en.ts` and locale files

Tasks:

- [ ] Replace same-looking default pins with two visually distinct marker types.
- [ ] Add legend overlay or compact labels: “People” and “Events”.
- [ ] Ensure marker types are not distinguished by color alone; use icon/text/shape where feasible.
- [ ] Keep performance simple: if using custom marker views, set `tracksViewChanges={false}` after render where appropriate.
- [ ] Preserve `map-view` and existing scan testIDs.

Acceptance criteria:

- [ ] Users can tell people and events apart at a glance.
- [ ] Legend is visible and does not overlap critical controls.
- [ ] Existing scan area functionality still returns users and dives.

### Commit 4.3: Add scanned event list button and list view/card

Files:

- `app/components/map/ScannedEventsList.tsx`
- `app/screens/main/MapScreen.tsx`
- `app/i18n/en.ts` and locale files
- `.maestro/flows/map-scanned-events-list.yaml`

Tasks:

- [ ] Track “hasScanned” state separate from `diveMarkers.length`.
- [ ] Show `map-scanned-events-list-button` after a scan.
- [ ] Open list as modal/card/bottom panel with `map-scanned-events-list` testID.
- [ ] Render current `diveMarkers` with title, date, organizer, and location label snapshot.
- [ ] Empty state when scan succeeds but no events are found.
- [ ] Tapping an event list item selects the marker and opens event detail card.

Acceptance criteria:

- [ ] List button appears after scan.
- [ ] List shows all scanned-area events from current scan results.
- [ ] Empty scanned event list is clear and non-error.
- [ ] Selecting list event opens same event bottom card as map marker tap.

Rollback:

- Component extraction is reversible; preserve old `MapScreen` markers and scan service methods until all Maestro flows pass.

---

## Phase 5: Dive Event Screen Uses Saved Locations

**Owner**: @implementer (React Native form UX + service integration)
**Dependencies**: Phase 2, Phase 3
**Complexity**: MEDIUM
**Expected commits**: 2

### Commit 5.1: Add saved-location selector to event form

Files:

- `app/screens/main/DiveEventScreen.tsx`
- `app/services/location/locationService.ts` or `mapService.ts`
- `app/i18n/en.ts` and locale files

Tasks:

- [ ] Load own saved locations when event form opens.
- [ ] Replace GPS-only location action with selector/list of saved locations.
- [ ] Add “Add saved location” CTA that navigates to `LocationPickerScreen`.
- [ ] Auto-refresh locations when returning to screen.
- [ ] Show empty state if no saved locations exist.
- [ ] Preserve title/description/date validation.

Acceptance criteria:

- [ ] Event cannot be saved without selecting a saved location.
- [ ] User can select among multiple saved locations.
- [ ] User can add a new location first and then select it for the event.

### Commit 5.2: Save event from selected saved location

Files:

- `app/screens/main/DiveEventScreen.tsx`
- `app/services/dives/diveEventService.ts`
- `app/services/dives/types.ts`
- `.maestro/flows/dive-event-create-from-saved-location.yaml`

Tasks:

- [ ] Call `upsertOwnDiveFromLocation` with selected `locationId`.
- [ ] Render selected/snapshot location label in saved event detail.
- [ ] Remove or demote `dive-event-use-current-location-button`; do not leave GPS as the only path.
- [ ] Update Maestro event CRUD flow to create multiple saved locations and select the intended one.

Acceptance criteria:

- [ ] Event created from saved location appears in map scan at that saved location’s coordinates.
- [ ] Changing saved location after event creation does not move the event.
- [ ] Existing own event edit/delete still works.

Rollback:

- Keep old RPC and coordinate form code until this phase is validated; then remove old GPS-only UI in the same commit or a follow-up cleanup commit.

---

## Phase 6: Verification, Seeds, Regression, and Documentation Link

**Owner**: @implementer + @analyzer
**Dependencies**: Phases 1-5
**Complexity**: MEDIUM
**Expected commits**: 2

### Commit 6.1: Update deterministic seeds and SQL verification

Files:

- `scripts/seed-maestro-data.sql`
- `scripts/seed-maestro-data.sh` if env variables change
- `scripts/verify-map-location-events-sql.sh` or `scripts/verify-phase6-final-sql.sh`

Tasks:

- [ ] Seed users with multiple saved locations.
- [ ] Seed one event from a saved location and assert snapshot behavior.
- [ ] Add SQL checks for RPC-only write enforcement, direct DML denial, ownership checks, private-vs-public visibility, coordinate order, one-public-location semantics, event snapshot/reference, and map RPC outputs.
- [ ] Ensure full seed remains deterministic for existing flows.

Acceptance criteria:

- [ ] SQL verification passes on a reset local Supabase DB.
- [ ] Seeded in-bounds/out-of-bounds map tests remain deterministic.

### Commit 6.2: Update Maestro full regression and plan references

Files:

- `.maestro/flows/full-integration.yaml`
- `.maestro/flows/map-location-add-delete.yaml` or replacement saved-location flow
- `.maestro/flows/map-search-area.yaml`
- `.maestro/flows/dive-event-map-search.yaml`
- `.maestro/flows/chat-start-from-dive-event.yaml`
- `docs/diving-buddies-redesign.plan.md` only if adding a short reference to this focused plan is still useful

Tasks:

- [ ] Add/adjust Maestro flows for saved location picker, multiple saved locations, selected-location event creation, marker bottom cards, and scanned event list.
- [ ] Preserve existing auth/chat/profile regression coverage.
- [ ] Capture screenshots at key redesigned states.
- [ ] Optionally add one short link from main redesign plan to this file; do not duplicate the full plan.

Acceptance criteria:

- [ ] `npm run test:maestro` or the project’s documented Maestro orchestration passes.
- [ ] Full integration verifies saved location -> event -> scan -> bottom card -> chat path.
- [ ] No scope creep into Google Maps, push, group chat, or account deletion.

Rollback:

- Revert Maestro flow changes separately from app code if test flake is isolated.
- Keep old flows available under renamed legacy files until the new suite is stable if needed.

---

## Deliverables

| Phase | Files Created/Modified |
|---|---|
| Phase 1 | `supabase/migrations/<timestamp>_profile_locations.sql`, `scripts/verify-map-location-events-sql.sh` |
| Phase 2 | `supabase/migrations/<timestamp>_dive_saved_location.sql`, `app/services/supabase/database.types.ts`, `app/services/dives/types.ts`, `app/services/dives/diveEventService.ts` |
| Phase 3 | `app/services/location/types.ts`, `app/services/location/locationService.ts` or `mapService.ts`, `app/navigators/navigationTypes.ts`, `app/navigators/AppNavigator.tsx`, `app/screens/main/LocationPickerScreen.tsx`, `.maestro/flows/saved-location-picker.yaml` |
| Phase 4 | `app/components/map/MapMarkerDetailCard.tsx`, `app/components/map/MapMarkerLegend.tsx`, `app/components/map/ScannedEventsList.tsx`, `app/screens/main/MapScreen.tsx`, `.maestro/flows/map-scanned-events-list.yaml` |
| Phase 5 | `app/screens/main/DiveEventScreen.tsx`, `app/services/dives/diveEventService.ts`, `app/services/dives/types.ts`, `.maestro/flows/dive-event-create-from-saved-location.yaml` |
| Phase 6 | `scripts/seed-maestro-data.sql`, `scripts/verify-map-location-events-sql.sh`, `.maestro/flows/full-integration.yaml`, optional `docs/diving-buddies-redesign.plan.md` reference |

---

## Blast Radius / Affected Entry Points

- `Map` tab (`app/screens/main/MapScreen.tsx`) - scan, marker rendering, marker detail, list button, add location entry.
- `DiveEvent` tab (`app/screens/main/DiveEventScreen.tsx`) - event creation/edit now depends on saved locations.
- Authenticated stack navigation (`AppNavigator.tsx`, `navigationTypes.ts`) - add location picker route.
- Supabase map RPCs - `users_in_view`, RPC-only location CRUD, explicit public share/unshare, compatibility wrappers.
- Supabase dive RPCs - event creation/update from saved location, marker search return shape.
- Generated Supabase types - service compile-time shape changes.
- Maestro suite - existing location/event flows need selector/testID updates.
- Seed data - deterministic users/events must include saved locations.
- Chat from map markers - must continue to use existing `upsertConversation` path.

---

## Allowed Scope / Forbidden Scope

### Allowed

- Add saved locations table, RLS/read policy if needed, RPC-only write path, indexes, backfill.
- Add event `location_id` and `location_label_snapshot` while keeping `dives.location` snapshot.
- Add/update services, types, navigation, map/event screens, focused map components.
- Add dedicated location picker screen with `react-native-maps` draggable marker.
- Update i18n strings and Maestro flows for changed UX.
- Update SQL verification and deterministic seed data.

### Forbidden

- No Google Maps setup/API keys.
- No push notifications.
- No group chat or chat model redesign.
- No account deletion.
- No multi-event-per-user redesign in this plan.
- No broad styling/theme rewrite unrelated to map/location/event UX.
- No direct client access to service-role credentials or unrestricted Supabase tables.
- No direct app-role `INSERT`/`UPDATE`/`DELETE` to `profile_locations`; writes must remain RPC-only.

---

## Invariants

| Invariant | Why it matters | How to verify |
|---|---|---|
| Coordinate write order is longitude, latitude. | Reversed coordinates silently place users/events in wrong countries. | psql `ST_X/ST_Y` assertions after create/update saved location and event. |
| Event location is a snapshot. | Historical events must not move when saved locations change. | Create event from location A, update A coordinate, assert `dives.location` unchanged. |
| Saved location writes are RPC-only. | Prevents clients bypassing validation, one-public-location semantics, and privacy mirror rules. | Authenticated direct `INSERT`/`UPDATE`/`DELETE` attempts fail; same changes succeed only through RPCs. |
| Only owner can CRUD saved locations through RPCs. | Privacy/security. | Auth as user B and attempt list/update/delete user A location via RPC/direct table. |
| Only own saved locations can be used for own event. | Prevent spoofing and unauthorized references. | Call event RPC with another user's `location_id`; expect error/no row. |
| Saved event locations are private by default. | Adding/using a location for events must not publish user whereabouts. | Create first saved location with no share flag; assert `profiles.show_location=false` and no `users_in_view` person marker. |
| One explicit public map location per user. | Person marker should be deterministic and user-controlled. | Share multiple locations in sequence; assert partial unique/index and RPC transaction produce one public row and matching `profiles.location`. |
| `users_in_view` returns only explicit public person markers, not private saved locations. | Prevent private saved location exposure. | Seed private saved location in bounds and public location out of bounds; assert no person marker in private bounds. |
| `dives_in_view` searches event snapshot, not current saved location. | Event scan results remain stable. | Move saved location after event creation; assert scan by original bounds still finds event. |
| Existing one-on-one chat entry points from marker details still work. | Avoid regression in Phase 4 chat flows. | Maestro `chat-start-from-user-marker` and `chat-start-from-dive-event` updated and passing. |

---

## Behavior That Must Not Change

- Auth sign-in/sign-up/session restore flows remain unchanged; validate via existing auth Maestro flows.
- Profile display name/summary updates remain direct profile updates and do not require saved locations; validate profile/settings flow.
- Existing chat conversations and messages remain one-on-one; validate chat flows and do not alter chat schema.
- Map scan remains explicit/manual via “Search this area”; no auto-refresh or background location polling is introduced.
- Dive Event tab remains the place to manage the user's own event; marker taps do not navigate to a full-screen event detail.
- `dives_in_view` continues to return no more than 250 results unless separately planned.

---

## Validation Matrix

| Check | Command / Method | Proves |
|---|---|---|
| Schema objects exist | `psql "$SUPABASE_DB_URL" -f scripts/verify-map-location-events-sql.sh` or script wrapper | Tables, indexes, RLS, RPC grants are present. |
| Direct DML denial | psql/Supabase REST as authenticated app user attempts direct `INSERT`, `UPDATE`, `DELETE` on `profile_locations` | App roles cannot bypass RPC validation, even for own rows. |
| Saved locations RLS/ownership | psql with two seeded JWT/auth contexts or Supabase REST/RPC calls as two users | Users cannot access or mutate others' saved locations; direct SELECT is owner-only if enabled. |
| RPC validation | RPC calls with blank/overlong labels, bad lat/lng, missing auth, inactive rows | Write RPCs reject invalid inputs and unauthorized state transitions. |
| Coordinate order | psql query `ST_X(location::geometry), ST_Y(location::geometry)` after known insert | Longitude/latitude order is correct. |
| Public map invariant | Create two private locations, share each in sequence, query public count and `profiles.location` | Exactly one active public map location per user and mirror matches shared row. |
| Backfill | Reset DB with legacy `profiles.location/show_location`, run migration, query `profile_locations` | Legacy public profile location migrates to explicit public saved location. |
| Event snapshot | Create event from saved location, move saved location, query `dives.location` | Event coordinates and label snapshot remain unchanged. |
| Private saved location visibility | Create private saved location in scan bounds and no public share; call `users_in_view` | Private saved location does not create a person marker. |
| Private event location visibility | Create event from private saved location in scan bounds; call `dives_in_view` and `users_in_view` | Event appears in event scan, but creator does not appear as person marker unless explicitly shared. |
| `users_in_view` output | Seed explicit public location in bounds and private saved location elsewhere | One person marker at explicit public location only. |
| `dives_in_view` output | Seed event in bounds using saved location | Event appears with title, organizer, snapshot label. |
| Add-location picker | Maestro `.maestro/flows/saved-location-picker.yaml` | User can add saved location from map + label. |
| Multiple saved locations | Maestro + psql count | User can maintain/select more than one saved location. |
| Event from selected location | Maestro `.maestro/flows/dive-event-create-from-saved-location.yaml` + psql | Event uses selected saved location, not GPS. |
| Person marker bottom card | Maestro updated map flow tapping user marker/list item | Person card opens with message action. |
| Event marker bottom card | Maestro updated event map flow tapping event marker/list item | Event card opens with organizer action. |
| Scanned event list | Maestro `.maestro/flows/map-scanned-events-list.yaml` | List button opens scanned-area events list and empty state works. |
| Full regression | `npm run test:maestro` | Auth, map, event, chat, profile/settings flows still work together. |
| Static/TS validation | Existing project TypeScript/Jest/unit command, e.g. `npm run test:unit` if configured | Service mappings and screen imports compile. |

---

## Test Plan Details

### Maestro Flows to Add/Update

- `.maestro/flows/saved-location-picker.yaml`
  - Sign in/sign up.
  - Open location picker.
  - Tap/drag marker fallback.
  - Enter label.
  - Save.
  - Assert saved location appears in selector/list or map status.
- `.maestro/flows/multiple-saved-locations.yaml`
  - Add two saved locations.
  - Verify both are listed and private by default.
  - Explicitly share one on the map and verify public/share indicator is visible.
- `.maestro/flows/dive-event-create-from-saved-location.yaml`
  - Add/select saved location.
  - Fill event form.
  - Save event.
  - Assert event detail shows selected location label.
- `.maestro/flows/map-marker-bottom-cards.yaml`
  - Search seeded area.
  - Tap person marker/list fallback, assert `map-person-detail-card`.
  - Close.
  - Tap event marker/list fallback, assert `map-event-detail-card`.
- `.maestro/flows/map-scanned-events-list.yaml`
  - Search seeded area.
  - Tap `map-scanned-events-list-button`.
  - Assert seeded event visible.
  - Tap event, assert detail card.
- Update `.maestro/flows/full-integration.yaml`
  - Include saved location -> event creation -> map scan -> event list -> bottom card -> chat.

Maestro selector rules:

- Use ASCII-only testIDs and accessibility labels.
- Avoid Turkish special characters in selectors.
- Preserve shared Expo dev-client bootstrap flows.

### SQL/API Tests

- Prefer psql scripts for schema, RLS, coordinate order, snapshots.
- Use Supabase REST/RPC/Hurl only where user-context RPC testing is easier than psql.
- Do not write language-specific integration tests for Supabase boundaries.
- Required negative cases:
  - Direct authenticated `INSERT`, `UPDATE`, and `DELETE` on `profile_locations` fail for own and other-user rows.
  - RPC update/delete/share fails for another user's saved location ID.
  - RPC create/update rejects blank labels, labels over 80 chars, invalid latitude/longitude ranges, and non-finite coordinates where representable.
  - Creating the first saved location without `p_share_on_map=true` leaves `profiles.show_location=false` and produces no `users_in_view` marker.
  - Creating an event from a private saved location produces a `dives_in_view` event marker but no `users_in_view` person marker.
  - Updating/deactivating the source saved location after event creation does not change `dives.location` or `location_label_snapshot`.

---

## Analyzer Gates

| Gate | After Phase | Focus Area | Proof Required |
|---|---|---|---|
| Gate 1 | Phase 1 | `profile_locations` schema, RPC-only writes, direct DML denial, ownership checks, private/public visibility, public mirror | Migration diff review + psql output. |
| Gate 2 | Phase 2 | Event snapshot/reference design and unauthorized `location_id` rejection | psql/RPC output proving snapshot and owner checks. |
| Gate 3 | Phase 3 | Navigation route safety, draggable marker implementation, service error handling | TS compile + Maestro picker flow + Context7-aligned marker usage. |
| Gate 4 | Phase 4 | Map UX no overlap, distinct marker types, bottom card behavior, chat preservation | Maestro screenshots/hierarchy + updated chat marker flow. |
| Gate 5 | Phase 5 | Event form saved-location selector and no GPS-only regression | Maestro event creation from selected location + psql snapshot check. |
| Gate 6 | Phase 6 | Full regression, forbidden scope, flake risk | `npm run test:maestro`, SQL verification, scope grep/review. |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---:|---:|---|
| RLS/RPC bug exposes saved private locations. | MEDIUM | HIGH | Direct DML denial, owner-only SELECT/RPC checks, security-definer owner checks, analyzer Gate 1, negative SQL tests. |
| Coordinate order regression. | MEDIUM | HIGH | Centralize point conversion in RPCs; psql `ST_X/ST_Y` verification every phase touching coordinates. |
| Event moves when saved location changes. | LOW | HIGH | Keep `dives.location` snapshot and test move-after-create. |
| Bottom card overlaps controls on small screens. | MEDIUM | MEDIUM | Use safe-area-aware layout, screenshots, Maestro hierarchy, refactoring-ui spacing scale. |
| Maestro map drag is flaky. | MEDIUM | MEDIUM | Support map tap fallback; assert persistence with psql; keep marker drag API covered in unit/manual QA. |
| Existing flows fail due to testID changes. | MEDIUM | MEDIUM | Preserve existing testIDs where possible; add new IDs without removing old until flows are updated. |
| Function overloading complicates Supabase type generation. | MEDIUM | MEDIUM | Prefer new `upsert_own_dive_from_location` RPC instead of replacing old signature in-place. |
| Public-location mirror creates inconsistent `profiles.location`. | MEDIUM | MEDIUM | Update mirror only in explicit share/unshare or already-public update/delete transactions; SQL invariant compares public saved point and profile point. |

---

## Failure Signals

- SQL verification shows direct authenticated `profile_locations` writes succeed outside RPCs.
- SQL verification shows more than one active public map location for a user.
- Creating the first saved location automatically sets `profiles.show_location=true` without explicit share.
- `users_in_view` returns a marker for a private saved location or for an event-only private saved location.
- `users_in_view` returns multiple markers for one user because of multiple saved locations.
- Event scan result changes after editing/deleting the saved location used to create it.
- A user can pass another user's `location_id` to event RPC.
- Maestro needs arbitrary sleeps rather than waiting for visible IDs/states.
- Map card/list obscures scan controls without close affordance.
- Implementation adds Google Maps, push, group chat, account deletion, or multi-event-per-user scope.
- Existing chat marker flows stop navigating to `ConversationDetail`.

---

## Review Checklist Before Implementation Starts

- [ ] Confirm migration order after current last migration `20260527220000_avatars_storage.sql`.
- [ ] Decide exact migration timestamp names.
- [ ] Confirm local Supabase type generation command from repo scripts or Supabase CLI.
- [ ] Confirm whether to create `locationService.ts` or extend `mapService.ts`; prefer new service if `mapService.ts` would become too broad.
- [ ] Confirm locale update strategy for seven locales; at minimum keep all files syntactically complete.
- [ ] Confirm no installed bottom-sheet library exists before adding any dependency; default is no new dependency.

---

## Notes for Implementers

- Follow existing service result pattern: `{ ok: true; data } | { ok: false; error }` in `app/services/location/types.ts:31-35` and current services.
- Keep screen strings in i18n; avoid hard-coded visible text except stable ASCII accessibility labels if existing pattern allows.
- Use existing `Button`, `Text`, `TextField`, and `Screen` components for visual consistency.
- Apply refactoring-ui guidance: hierarchy by spacing/weight first, constrained spacing scale, accessible contrast, no overlap.
- Use `react-native-maps` draggable marker exactly as documented by Context7: `draggable` plus `onDragEnd` reading `e.nativeEvent.coordinate`.
- Do not remove old RPCs in the same plan unless all references and tests are updated; additive compatibility is safer.
