# Diving Buddies Redesign - Architecture and Implementation Plan

## Status
READY for Phase 1 implementation, READY for Phase 2 implementation after Phase 1 is merged and verified, READY for Phase 3 implementation after Phase 2 is merged and verified, READY for Phase 4 implementation after Phase 3 is merged and verified, READY for Phase 5 implementation after Phase 4 is merged and verified, and READY for Phase 6 final polish after Phase 5 is merged and verified.

No CRITICAL or HIGH assumptions remain unresolved. Later product phases intentionally retain LOW/MEDIUM assumptions that must be rechecked before each phase starts.

## Problem Statement
Redesign `DivingBuddies` from the current Ignite-generated foundation into a production-oriented React Native app for diver discovery, location/map search, one active dive event per user, 1-on-1 chat, profile/settings, and regression-safe polish. Phase 1 must replace demo authentication with real Supabase email/password auth and establish the app architecture without copying the old app architecture.

## Approach
Use the current Ignite 11.5 / Expo 55 / React Navigation app as the source of truth, keep the fresh architecture simple, add only necessary dependencies, and verify every boundary with Maestro, Supabase REST/Hurl, and direct `psql` checks. The old app is used only for domain lessons: bounding-box RPCs, idempotent conversation RPC, one active dive per user, privacy-controlled location deletion, Apple Maps now, and deferred push/Google OAuth/Google Maps.

---

## Current State (Evidence)

| Area | Verified evidence | Implication |
|---|---|---|
| App foundation | `package.json:41-66` shows Expo 55.0.26, React 19.2.0, React Native 0.83.6, React Navigation packages, MMKV, Ignite scripts; `app.json:62-65` records Ignite 11.5.0. | Build on Ignite/React Navigation, do not replace with Expo Router. |
| Navigation | `app/navigators/navigationTypes.ts:18-24` has only `Welcome`, `Login`, `Demo`; `app/navigators/AppNavigator.tsx:30-63` conditionally renders `Login` or `Welcome`+`Demo`; `app/app.tsx:38-57` defines deep-link paths for demo routes. | Phase 1 must replace demo route graph with real auth and main-tab route values. |
| Current auth | `app/context/AuthContext.tsx:18-44` persists a fake auth token/email in MMKV; `isAuthenticated` is `!!authToken` at `AuthContext.tsx:34-36`. | Replace with Supabase session/user state; migrate/clear old `AuthProvider.*` MMKV keys. |
| Providers | `app/app.tsx:96-109` wraps `SafeAreaProvider > KeyboardProvider > AuthProvider > ThemeProvider > AppNavigator`. | Keep provider pattern; update `AuthProvider` and add no global state library unless needed. |
| Theme/design tokens | `app/theme/spacing.ts:4-13` has constrained 2-64 spacing scale; `app/theme/colors.ts:38-85` has semantic colors and neutral palette. | Use existing Ignite theme, grayscale-first refinements, no Tailwind/NativeWind churn. |
| Supabase local | `supabase/config.toml:5-18` project/API port 54321; `config.toml:27-36` DB port 54322/Postgres 17; `config.toml:88-102` Studio 54323 and Inbucket 54324; `config.toml:150-221` auth/email signup enabled and confirmations disabled locally; `supabase/migrations/20260525135648_enable_postgis.sql:1` enables PostGIS. | Add migrations on top of Phase 0; local auth can sign in immediately after signup. |
| Storage | `supabase/config.toml:109-123` storage enabled with 50MiB limit and S3 protocol. | Storage is available, but Phase 1 will not create avatar buckets/policies; avatar upload is deferred to Phase 5 to keep auth scope small. |
| Current tests | `package.json:20-22` has Jest and Maestro scripts; `.maestro/shared/_OnFlowStart.yaml:20-39` launches with clean state and handles dev server sheet. | Add Phase 1 Maestro auth flows and update shared bootstrap for current Expo overlays if needed. |
| Old app profile domain | Old app `store/userStore.ts:5-13` used `user_id`, `display_name`, `summary`, `avatar_url`, `is_first_login`, `show_notification`, `location`; `store/userStore.ts:43-63` upserted profiles. | Keep profile fields but version with clearer names and privacy defaults. |
| Old app map domain | Old app `store/markersStore.ts:14-20` calculated bounds; `store/markersStore.ts:30-54` called `users_in_view` and `dives_in_view`; location WKT used longitude first in `store/userStore.ts:100` and `store/diveStore.ts:53`. | Fresh architecture should centralize bounds math and use PostGIS RPCs. |
| Old app dive domain | Old app `store/diveStore.ts:46-72` upserted dives with `onConflict: 'created_by'`; `store/diveStore.ts:95-109` deleted current user's dive. | Keep v1 invariant: one active dive per user. |
| Old app chat domain | Old app `store/messageStore.ts:76-98` called `upsert_conversation` before inserting messages; `store/conversationStore.ts:25-39` used latest-message RPC. | Preserve idempotent conversation RPC and avoid stale local lookup bugs. |
| Old app privacy domain | Old app `store/userStore.ts:116-137` set profile location to null; settings logout reset local store in `app/(tabs)/settings.tsx:92-117`. | Include explicit location deletion and complete state reset in later settings/profile phases. |

---

## Verified Facts vs Assumptions

| Item | Type | Criticality | Evidence / decision | Validation method |
|---|---:|---:|---|---|
| Use React Navigation, not Expo Router. | Fact | HIGH | Existing route code in `app/navigators/*`; user states Ignite app intentionally uses React Navigation. | `npm run compile`; Maestro route flows. |
| Supabase URL/DB ports for local dev. | Fact | HIGH | User-provided verified facts and `supabase/config.toml:7-18`, `:27-36`, `:88-102`. | `supabase status`; `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres`. |
| Phase 1 local email signup can sign in without email confirmation. | Fact | HIGH | `supabase/config.toml:214-221` has email signup enabled and confirmations disabled. | Hurl sign-up/sign-in flow. |
| React Native Supabase auth needs custom storage and `detectSessionInUrl: false`. | Fact | HIGH | Context7 Supabase docs show React Native `createClient(... { auth: { storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }})`. | Compile plus auth persistence Maestro relaunch. |
| Use Expo SecureStore-backed encrypted session storage rather than MMKV for tokens. | Decision | HIGH | Supabase official Expo guidance supports SecureStore + encrypted AsyncStorage for larger values; current fake auth uses MMKV in `AuthContext.tsx:18-25` and should not persist real tokens there. | Inspect `AuthProvider.authToken` absent; relaunch session survives via Supabase storage. |
| Apple Maps works out of the box on iOS; Google Maps is optional on iOS and required/configured separately for Android. | Fact | MEDIUM | Context7 `react-native-maps` docs: iOS can use native Apple Maps out of the box; Android requires Google Maps API configuration. | Recheck during map phase with installed `react-native-maps` version; simulator map smoke. |
| Route names listed in this plan will be registered before use. | Decision | HIGH | Phase 1 route table below replaces current `navigationTypes.ts:18-24`. | TypeScript compile; Maestro tab navigation. |
| No feature flags are needed for Phase 1. | Decision | MEDIUM | Phase 1 replaces demo auth wholesale before release; no live users or partial rollout. | Future analyzer review confirms no hidden alternate route branch. |
| Phase 1 password reset scope is reset-email request only. | Decision | HIGH | Simplest Phase 1 path avoids deep-link/session-token ambiguity; local Supabase Inbucket can prove the email is sent. Full reset completion moves to Phase 5/deep-link hardening. | Maestro reset request + Inbucket HTTP check. |
| Later map/chat table fields are directional and will be revisited before implementation. | Assumption | LOW | User requested later phases detailed enough to preserve direction but revisited phase-by-phase. | New phase plan before Phase 2+. |

No CRITICAL or HIGH assumptions remain open.

---

## Architecture Decisions Summary

| Decision | Chosen | Rejected | Rationale | Evidence |
|---|---|---|---|---|
| Navigation | Ignite React Navigation native stack + bottom tabs | Expo Router rewrite | Current app already uses React Navigation and user explicitly says this is intentional. Rewriting creates churn with no Phase 1 value. | `app/navigators/AppNavigator.tsx:7-28`; `navigationTypes.ts:18-24`. |
| State | Existing React Context/hooks + small repository functions | MobX, Zustand, React Query in Phase 1 | KISS/DRY: existing app has Context/MMKV, no MobX/Zustand/React Query dependencies. Auth has simple session state. Add server-state library only when later phases prove cache complexity. | `AuthContext.tsx:1-51`; `EpisodeContext` reported as Context; `package.json:33-67` lacks these libraries. |
| Data access | Typed Supabase singleton plus focused `services/*` repository functions | Large repository hierarchy / generic DAO | Keeps Supabase query logic testable without parallel abstraction. | Existing `app/services/api/index.ts` uses singleton service pattern; Supabase skill recommends typed singleton. |
| Auth session storage | Supabase client with Expo SecureStore-backed encrypted AsyncStorage adapter | Fake MMKV token; plain AsyncStorage only | Avoid real tokens in app-owned fake MMKV keys while following official Expo RN Supabase storage behavior. | `AuthContext.tsx:18-25`; Context7 Supabase docs. |
| UI system | Existing Ignite components/theme, grayscale-first | NativeWind/Tailwind setup | Current theme and components are already present; user requested clean grayscale-first style, not new styling framework. | `app/theme/colors.ts:38-85`; `spacing.ts:4-13`; refactoring-ui skill. |
| Map provider | Apple Maps on iOS for v1; defer Google Maps | Immediate Google Maps/OAuth/push | User verified deferral and Context7 confirms Apple Maps works out of box on iOS. Android map support must be validated before Android release. | User facts; Context7 react-native-maps docs. |
| RPC-first spatial/chat invariants | `users_in_view`, `dives_in_view`, `upsert_conversation` | Client-side filtering/conversation lookup | Old app domain proved these are core invariants; server-side RLS/RPC avoids stale and privacy bugs. | Old app `markersStore.ts:30-54`, `messageStore.ts:76-98`. |
| Feature flags | N/A for Phase 1 | Boolean flags for auth | No users, no deployed production baseline, and auth is foundational. Flags add branches to test. Later risky features can use config gates if needed. | Phase 0 fresh app; `docs/phase0-pipeline-setup.plan.md:3-8`. |

---

## Target Route Map

All route values below must exist in `AppStackParamList`, `AuthStackParamList`, or `MainTabParamList` before any screen navigates to them.

| Navigator | Route | Params | Phase | Purpose |
|---|---|---|---:|---|
| `AppStack` | `Auth` | `NavigatorScreenParams<AuthStackParamList>` | 1 | Unauthenticated auth stack. |
| `AppStack` | `Main` | `NavigatorScreenParams<MainTabParamList>` | 1 | Authenticated tab shell. |
| `AuthStack` | `SignIn` | `undefined` | 1 | Email/password sign in. |
| `AuthStack` | `SignUp` | `undefined` | 1 | Email/password registration. |
| `AuthStack` | `ForgotPassword` | `undefined` | 1 | Send reset email. |
| `MainTab` | `Map` | `undefined` | 1 placeholder, Phase 2 real | Buddy/event map. |
| `MainTab` | `DiveEvent` | `undefined` | 1 placeholder, Phase 3 real | One active dive editor. |
| `MainTab` | `Chat` | `undefined` | 1 placeholder, Phase 4 real | Conversations list. |
| `MainTab` | `Profile` | `undefined` | 1 | Own profile form: read-only email, display name, summary. |
| `MainTab` | `Settings` | `undefined` | 1 | Sign out and account/settings entry. |
| `ChatStack` | `Conversation` | `{ conversationId: string; opponentUserId?: string }` | 4 | 1-on-1 chat detail. |

Deep-link config Phase 1:
- No password-reset callback route is required in Phase 1 because Phase 1 only requests reset emails and verifies receipt in local Inbucket.
- Full reset completion/deep-link handling is deferred to Phase 5/settings hardening if still desired.

Future Phase 5 route if full reset completion is implemented: `AuthStack` route `ResetPassword` with `{ accessToken?: string; refreshToken?: string } | undefined`.

---

## Target Data Architecture

### Phase 1 Auth/Profile Schema

Migration file: `supabase/migrations/<timestamp>_auth_profiles.sql`.

#### Extensions
```sql
create extension if not exists pgcrypto with schema extensions;
-- PostGIS already enabled by 20260525135648_enable_postgis.sql.
```

#### Enums / Constants
No database enum is required in Phase 1. App constants must be plain string unions:
- `AuthStatus`: `"initializing" | "signedOut" | "signedIn"`
- `Route names`: exactly as in Target Route Map.

#### `public.profiles`

| Field | Type | Null | Default | RLS / constraints | Purpose |
|---|---|---:|---|---|---|
| `id` | `uuid` | no | none | PK, FK `auth.users(id) on delete cascade`; row owner. | Stable user/profile id. |
| `email` | `text` | no | none from trigger | Own profile only; update from auth only in v1. | Display/read-only account email. |
| `display_name` | `text` | no | `''` | `char_length(display_name) <= 80`; owner can update. | Public profile display name. |
| `summary` | `text` | no | `''` | `char_length(summary) <= 500`; owner can update. | Diving experience/bio. |
| `avatar_path` | `text` | yes | `null` | Reserved for future profile display compatibility; Phase 1 clients cannot update it. | Future storage object path, set in Phase 5. |
| `location` | `geography(Point,4326)` | yes | `null` | Phase 1 clients cannot update it; Phase 2 will introduce reviewed location RPCs. | Future user map point. |
| `show_location` | `boolean` | no | `false` | Phase 1 clients cannot update it; Phase 2 will introduce reviewed location RPCs. | Future privacy gate for map discoverability. |
| `is_first_login` | `boolean` | no | `true` | Owner can update false after profile completion. | Onboarding cue. |
| `created_at` | `timestamptz` | no | `now()` | Immutable. | Audit. |
| `updated_at` | `timestamptz` | no | `now()` | Trigger-updated. | Audit/cache. |

Indexes:
- `profiles_email_idx` on `lower(email)` for admin/debug lookup.
- `profiles_location_gix` using gist on `location` where `location is not null` for Phase 2 RPCs.

Functions/triggers:
- `public.set_updated_at()` trigger function for `updated_at`, created with `security definer set search_path = public, pg_temp` and fully qualified table/column references where applicable. It must run after `public.protect_profile_server_fields()` so legitimate updates can receive a server timestamp while caller-supplied `updated_at` is still rejected.
- `public.protect_profile_server_fields()` before-update trigger that rejects Phase 1 changes to server-owned/read-only fields: `id`, `email`, `created_at`, `updated_at`, `avatar_path`, `location`, and `show_location`. Only `display_name`, `summary`, and `is_first_login` are client-updatable in Phase 1.
- `public.handle_new_user()` security definer trigger on `auth.users after insert`, created with `set search_path = public, auth, pg_temp`, inserting into fully qualified `public.profiles` from fully qualified `auth.users` trigger `new` values.

SQL direction for trigger hardening:
```sql
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Trigger order matters: PostgreSQL fires same-kind triggers alphabetically by name.
-- Use names such as `trg_10_protect_profile_server_fields` and
-- `trg_20_set_profiles_updated_at` so caller-supplied `updated_at` is
-- rejected before the server-managed timestamp is set.

create or replace function public.protect_profile_server_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'profiles.id is read-only';
  end if;
  if new.email is distinct from old.email then
    raise exception 'profiles.email is read-only';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'profiles.created_at is read-only';
  end if;
  if new.updated_at is distinct from old.updated_at then
    raise exception 'profiles.updated_at is trigger-managed';
  end if;
  if new.avatar_path is distinct from old.avatar_path then
    raise exception 'profiles.avatar_path is reserved for Phase 5 avatar storage';
  end if;
  if new.location is distinct from old.location then
    raise exception 'profiles.location requires Phase 2 location RPCs';
  end if;
  if new.show_location is distinct from old.show_location then
    raise exception 'profiles.show_location requires Phase 2 location RPCs';
  end if;
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(coalesce(new.email, ''), '@', 1))
  );
  return new;
end;
$$;
```

RLS:
```sql
alter table public.profiles enable row level security;

create policy profiles_select_own
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy profiles_update_own
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Insert is normally handled by trigger. Keep client insert impossible in Phase 1 unless analyzer proves signup race requires owner insert.
```

#### Phase 1 storage scope

No storage bucket, storage RLS policy, image picker dependency, avatar upload component, or avatar upload test is part of Phase 1. `profiles.avatar_path` remains nullable and read-only in Phase 1 solely so later profile display and Phase 5 avatar upload can use one stable field without a data migration.

### Later Phase Schema Direction

Later schemas must be re-planned before implementation, but these invariants are preserved:

| Domain | Tables/RPC direction | Non-negotiable invariant |
|---|---|---|
| Map/location | `profiles.location`, `profiles.show_location`, RPC `users_in_view(min_lat,min_long,max_lat,max_long)` returning only discoverable fields; shared `calculateBounds(region)` utility. | No direct public `profiles` location select; delete location sets `location = null` and `show_location = false`. |
| Dive events | `dives(id uuid, created_by uuid unique, event_date timestamptz, description text, location geography(Point,4326), created_at, updated_at)`, RPC `dives_in_view`. | One active dive per user for v1 via unique `created_by`. |
| Chat | `conversations`, `conversation_participants`, `messages`, RPCs `upsert_conversation`, `get_conversations_with_latest_message`, `get_messages_by_conversation_id`. | Conversation creation is idempotent for unordered user pair. |
| Settings/privacy | Account sign out, location delete, future blocked users. | Logout clears all local app state and Supabase session; no stale profile/dive/chat data remains. |
| Avatar/profile media | Phase 5 creates private `avatars` bucket, storage policies, image picker UI, and `avatar_path` updates. | Phase 1 never uploads avatars or grants storage access. |

---

# Phase 1: Authentication and Profile Foundation - Detailed Implementation Plan

## Phase 1 Success Criteria
- [ ] Supabase email/password signup, sign-in, sign-out, reset-email request, and session restore work in the Expo dev client.
- [ ] New users get exactly one `public.profiles` row via trigger.
- [ ] RLS allows authenticated users to select/update only their own Phase 1 profile row.
- [ ] Auth tokens are persisted through Supabase auth storage, not fake `AuthProvider.authToken` MMKV keys.
- [ ] The app route graph contains only real auth/main routes; no demo screen is reachable in normal navigation.
- [ ] Profile and settings screens are functional enough for own read-only email display, display name/summary update, and sign out.
- [ ] Maestro, Hurl/API, and `psql` checks prove the happy path, malformed/negative path, and preservation path.

---

## Phase 1.1: Dependencies, Environment, and Supabase Client
**Owner**: @implementer (React Native/Supabase)
**Dependencies**: None
**Complexity**: MEDIUM

### Files Created/Modified
- `package.json`
- `pnpm-lock.yaml`
- `.env.example`
- `.env.local` (local developer file, do not commit if gitignored)
- `app/services/supabase/client.ts` (new)
- `app/services/supabase/secureAuthStorage.ts` (new)
- `app/services/supabase/database.types.ts` (generated after migration in Phase 1.2; placeholder import can be added after generation)

### Runtime dependencies allowed for Phase 1
- `@supabase/supabase-js`
- `react-native-url-polyfill`
- `@react-native-async-storage/async-storage`
- `expo-secure-store`
- `react-native-get-random-values`
- `aes-js`

Do not add `expo-image-picker`, storage/upload dependencies, Zustand, MobX, React Query, NativeWind, Google OAuth, push notification libraries, or Google Maps keys in Phase 1.

### Tasks
- [ ] Install only the allowed dependencies with Expo-compatible versions where applicable (`pnpm expo install` for Expo modules; `pnpm add` for non-Expo packages).
- [ ] Add `.env.example` entries:
  - `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY=<local-anon-key-from-supabase-status>`
  - `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres` for CLI verification only.
- [ ] Implement `secureAuthStorage.ts` as a Supabase storage adapter with async `getItem`, `setItem`, `removeItem`, using Expo SecureStore for the encryption key and AsyncStorage for encrypted values to avoid SecureStore size limits.
- [ ] Import `react-native-url-polyfill/auto` and `react-native-get-random-values` before `createClient`.
- [ ] Implement `client.ts` singleton:
  - `createClient<Database>(url, anonKey, { auth: { storage: secureAuthStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })`.
- [ ] Validate required env values at module load with a clear development error; do not log anon key.
- [ ] Keep service-role keys out of app code.

### Acceptance Criteria
- [ ] `pnpm compile` succeeds after dependency install and client creation.
- [ ] No imports of Supabase client inside React components except through service/context modules.
- [ ] No real token is written to `AuthProvider.authToken` or `AuthProvider.authEmail`.

### Verification
| Check | Command / method | Proves |
|---|---|---|
| Compile | `pnpm compile` | Dependencies and TypeScript imports are valid. |
| Dependency scope | `node -e "const p=require('./package.json'); console.log(p.dependencies)"` | Only allowed deps added. |
| Env example | `test -f .env.example && grep EXPO_PUBLIC_SUPABASE_URL .env.example` | Local setup is documented. |

### Rollback
- Remove added dependencies and new `app/services/supabase/*` files if client initialization blocks builds.
- Phase 0 is expected to have initialized git; first try `git status --short` and restore `package.json`/lockfile from the previous git state.
- If git is unexpectedly unavailable, use `pnpm-lock.yaml`/`package.json` backups created before dependency install or manually remove only the Phase 1 dependencies listed above, then run `pnpm install` to regenerate the lockfile. Do not delete app source directories as rollback.

---

## Phase 1.2: Auth/Profile Migration, RLS, Trigger Hardening, and Types
**Owner**: @implementer (Supabase schema/RLS)
**Dependencies**: Phase 1.1
**Complexity**: HIGH

### Files Created/Modified
- `supabase/migrations/<timestamp>_auth_profiles.sql` (new)
- `app/services/supabase/database.types.ts` (generated)
- Optional `supabase/seed.sql` only if deterministic local auth seed is needed; otherwise leave untouched.

### Tasks
- [ ] Create migration with the exact Phase 1 schema/RLS/trigger hardening listed in Target Data Architecture.
- [ ] Add `handle_new_user()` trigger on `auth.users` with safe `search_path` and fully qualified `public.profiles` insert.
- [ ] Add `set_updated_at()` and `protect_profile_server_fields()` before-update triggers with safe `search_path`.
- [ ] Add `profiles` indexes.
- [ ] Do not add `avatars` bucket or storage policies in Phase 1.
- [ ] Do not add password reset redirect URLs in Phase 1; reset completion/deep links are deferred to Phase 5.
- [ ] Apply migration locally: `supabase db reset` or `supabase migration up` depending on current local state.
- [ ] Generate types: `supabase gen types typescript --local > app/services/supabase/database.types.ts`.

### Acceptance Criteria
- [ ] `public.profiles` exists with all fields listed above.
- [ ] RLS is enabled on `public.profiles`.
- [ ] Creating a Supabase auth user creates exactly one profile row.
- [ ] Anonymous REST calls cannot read profiles.
- [ ] Authenticated user A cannot update user B's profile.
- [ ] Authenticated users cannot update server-owned/read-only profile fields: `id`, `email`, `created_at`, `updated_at`, `avatar_path`, `location`, `show_location`.

### Verification
Use local environment variables:
```bash
export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
export SUPABASE_ANON_KEY=<from supabase status>
```

| Check | Command / method | Proves |
|---|---|---|
| Schema columns | `psql "$SUPABASE_DB_URL" -c "select column_name,data_type,is_nullable from information_schema.columns where table_schema='public' and table_name='profiles' order by ordinal_position;"` | All fields exist with expected nullability. |
| RLS enabled | `psql "$SUPABASE_DB_URL" -c "select relrowsecurity from pg_class where relname='profiles';"` | RLS is on. |
| Policies | `psql "$SUPABASE_DB_URL" -c "select policyname, cmd from pg_policies where schemaname='public' and tablename='profiles' order by policyname;"` | Expected profile policies exist. |
| Signup/profile trigger | Hurl or curl `POST /auth/v1/signup`, then `psql "$SUPABASE_DB_URL" -c "select id,email,display_name from public.profiles order by created_at desc limit 1;"` | Trigger creates profile. |
| RLS negative | REST `GET /rest/v1/profiles` with anon key only must return no data/permission denied; authenticated B update A must fail. | RLS isolation. |
| Read-only field negative | REST update own `email`, `avatar_path`, `location`, or `show_location`; expect database error and unchanged row. | Trigger blocks server-owned and future-phase fields. |
| No Phase 1 avatar bucket | `psql "$SUPABASE_DB_URL" -c "select count(*) from storage.buckets where id='avatars';"` returns `0`. | Avatar storage remains deferred. |

### Rollback
- Add a down migration only if implementation creates irreversible objects incorrectly; otherwise reset local DB and replace the migration before any remote push.
- Never disable RLS to unblock the app; fix policies or service calls.
- Phase 0 git is expected; use `git status --short` to identify migration/type files to restore. If git is unavailable, remove only the newly created Phase 1 migration and regenerated `database.types.ts`, then run `supabase db reset` from the remaining known-good migrations.

---

## Phase 1.3: Auth Context, Session Lifecycle, Repositories, and Legacy State Handling
**Owner**: @implementer (state/data access)
**Dependencies**: Phase 1.1, Phase 1.2
**Complexity**: HIGH

### Files Created/Modified
- `app/context/AuthContext.tsx` (replace fake token state)
- `app/services/auth/authService.ts` (new)
- `app/services/profiles/profileService.ts` (new)
- `app/utils/storage/index.ts` (read/remove existing MMKV keys only if helper needed)
- `app/devtools/ReactotronConfig.ts` only if dev reset command must clear auth/profile state.

### Auth context state shape
```ts
type AuthStatus = "initializing" | "signedOut" | "signedIn"
type AuthContextType = {
  status: AuthStatus
  session: Session | null
  user: User | null
  profile: Profile | null
  authError: string | null
  refreshProfile: () => Promise<void>
  signIn: (email: string, password: string) => Promise<Result>
  signUp: (email: string, password: string, displayName?: string) => Promise<Result>
  sendPasswordReset: (email: string) => Promise<Result>
  updateProfile: (patch: ProfilePatch) => Promise<Result>
  signOut: () => Promise<void>
}
```

### Tasks
- [ ] Replace fake MMKV token logic in `AuthContext.tsx:18-44` with Supabase `onAuthStateChange` and initial session load.
- [ ] Use `supabase.auth.getSession()` once during initialization, then subscribe with `supabase.auth.onAuthStateChange` and cleanup subscription on unmount.
- [ ] On `SIGNED_IN`, `INITIAL_SESSION`, `TOKEN_REFRESHED`, and `USER_UPDATED`, set session/user and load own profile via `profileService.getOwnProfile(user.id)`.
- [ ] On `SIGNED_OUT`, set `session=null`, `user=null`, `profile=null`, `status='signedOut'`.
- [ ] On first startup, remove stale Ignite fake auth keys: `AuthProvider.authToken` and `AuthProvider.authEmail` from MMKV. This is a one-way local cleanup; do not call `storage.clear()` because navigation/theme use MMKV too.
- [ ] Implement `authService` functions wrapping Supabase auth calls with normalized result/error strings.
- [ ] `authService.sendPasswordReset` must request a reset email only; it must not implement token parsing, `setSession`, or password update in Phase 1.
- [ ] Implement `profileService` functions selecting/updating only explicit columns; no `select('*')`.
- [ ] `profileService.updateOwnProfile` must whitelist only `display_name`, `summary`, and `is_first_login`; never pass caller-provided `id`, `email`, `created_at`, `updated_at`, `avatar_path`, `location`, or `show_location` to Supabase.
- [ ] Keep dependency direction one-way: Context -> services -> Supabase client. Components do not call `supabase.from(...)` directly.
- [ ] Ensure sign-out calls `supabase.auth.signOut({ scope: 'local' })` and then resets local context state.

### Acceptance Criteria
- [ ] Relaunch after sign-in restores session and own profile.
- [ ] Logout clears session/profile and shows `SignIn` route.
- [ ] Stale fake MMKV auth does not authenticate a user.
- [ ] Failed sign-in surfaces a user-readable error without throwing to ErrorBoundary.

### Verification
| Check | Command / method | Proves |
|---|---|---|
| Compile | `pnpm compile` | Context/service types valid. |
| Fake auth cleanup | Before run, write old MMKV keys with current app if feasible; after launch, app remains signed out unless Supabase session exists. | Legacy persisted state cannot bypass auth. |
| Session restore | Maestro: sign in, stop app, relaunch without `clearState`, assert `Map` or `Profile` tab visible. | Supabase storage persists session. |
| Error path | Maestro invalid password flow asserts ASCII error text. | Negative auth handling. |

### Rollback
- Restore previous `AuthContext.tsx` only if app is unusable in local dev; do not merge rollback with schema changes.
- If session storage fails, switch temporarily to official AsyncStorage-only adapter while analyzer reviews SecureStore adapter; keep `detectSessionInUrl: false`.
- Phase 0 git is expected; if git is unavailable, restore `AuthContext.tsx` from a pre-edit copy or re-apply the previous fake auth context from file history in this plan's evidence, then remove new service files. Do not clear all MMKV as rollback.

---

## Phase 1.4: Navigation Shell and Auth Screens
**Owner**: @implementer (React Navigation/UI)
**Dependencies**: Phase 1.3
**Complexity**: MEDIUM

### Files Created/Modified
- `app/navigators/navigationTypes.ts`
- `app/navigators/AppNavigator.tsx`
- `app/navigators/AuthNavigator.tsx` (new)
- `app/navigators/MainTabNavigator.tsx` (new)
- `app/app.tsx`
- `app/screens/auth/SignInScreen.tsx` (new)
- `app/screens/auth/SignUpScreen.tsx` (new)
- `app/screens/auth/ForgotPasswordScreen.tsx` (new)
- `app/screens/main/MapScreen.tsx` placeholder (new)
- `app/screens/main/DiveEventScreen.tsx` placeholder (new)
- `app/screens/main/ChatScreen.tsx` placeholder (new)
- `app/screens/main/ProfileScreen.tsx` may be Phase 1.5; placeholder here if needed.
- `app/screens/main/SettingsScreen.tsx` may be Phase 1.5; placeholder here if needed.

### Tasks
- [ ] Replace `AppStackParamList` with the Target Route Map.
- [ ] Build `AuthNavigator` native stack with `SignIn`, `SignUp`, and `ForgotPassword` only. Do not add `ResetPassword` in Phase 1.
- [ ] Build `MainTabNavigator` bottom tabs with `Map`, `DiveEvent`, `Chat`, `Profile`, `Settings`.
- [ ] Update `AppNavigator` to render:
  - loading screen/null only while `status === 'initializing'`;
  - `Auth` stack when signed out;
  - `Main` tabs when signed in.
- [ ] Update `app/app.tsx` linking config to match the Target Route Map. Remove demo linking paths (`showroom`, `debug`, `podcast`, `community`) from normal config.
- [ ] Keep demo files untouched or delete them in a dedicated cleanup commit only if compile/i18n tests still pass; do not mix broad demo deletion with auth logic.
- [ ] Implement auth screens with existing Ignite `Screen`, `Text`, `TextField`, `Button` components.
- [ ] Use ASCII accessibility labels and Maestro selectors: `Email`, `Password`, `Display name`, `Sign in`, `Create account`, `Forgot password`, `Send reset email`.
- [ ] Apply refactoring-ui: form width constrained, clear hierarchy, neutral backgrounds, color only for primary actions/errors, 4/8/16/24 spacing scale.

### Acceptance Criteria
- [ ] Signed-out app opens `SignIn`.
- [ ] Sign-up screen can navigate back to sign-in.
- [ ] Forgot-password screen can send reset email and return to sign-in.
- [ ] Signed-in app opens `Main` tabs and all five tab route names are registered.
- [ ] No navigation call references `Welcome`, `Demo`, or demo tab routes after Phase 1.4, unless demo cleanup is explicitly deferred and unreachable.

### Verification
| Check | Command / method | Proves |
|---|---|---|
| Type route safety | `pnpm compile` | All route names/params registered. |
| Route grep | `rg "Welcome|DemoShowroom|DemoPodcastList|DemoCommunity|DemoDebug|Demo" app` and review remaining matches | Demo routes not used in normal navigation. |
| Maestro route smoke | `.maestro/flows/auth-signin.yaml` | Signed-out/signed-in branches render. |

### Rollback
- Keep route changes isolated from schema. If navigation breaks, restore `AppNavigator.tsx`, `navigationTypes.ts`, and linking config while preserving Supabase services for debugging.
- Phase 0 git is expected; if git is unavailable, keep a pre-edit copy of navigator files before modifying them and restore those files only. Do not revert schema/client work as part of navigation rollback.

---

## Phase 1.5: Profile, Settings, and Sign Out
**Owner**: @implementer (profile/settings UI)
**Dependencies**: Phase 1.4
**Complexity**: MEDIUM

### Files Created/Modified
- `app/screens/main/ProfileScreen.tsx`
- `app/screens/main/SettingsScreen.tsx`
- `app/services/profiles/profileService.ts`
- `app/i18n/en.ts` and other locale files only for new visible strings if the app keeps i18n coverage test strict.

### Tasks
- [ ] Implement own profile screen fields: email read-only, display name, summary.
- [ ] Implement `Save profile` action that updates only `display_name`, `summary`, and `is_first_login=false` as applicable.
- [ ] Validate display name length <= 80 and summary <= 500 before calling Supabase.
- [ ] Do not render avatar upload controls, do not install `expo-image-picker`, and do not call Supabase Storage in Phase 1.
- [ ] Implement settings screen with Sign out, Privacy Policy, Terms, About, Contact placeholders/links.
- [ ] Sign out must call AuthContext `signOut`, reset profile/session, and land on `SignIn`.
- [ ] Keep map/dive/chat tabs as clear placeholders: “Map coming next”, “Dive events coming next”, “Chat coming next”.

### Acceptance Criteria
- [ ] User can edit own display name/summary and see persisted values after app relaunch.
- [ ] User cannot edit email on profile screen.
- [ ] Sign out clears auth and returns to SignIn.
- [ ] Profile update cannot mutate `avatar_path`, `location`, `show_location`, `email`, `id`, or timestamp fields even if a malicious REST request includes them.

### Verification
| Check | Command / method | Proves |
|---|---|---|
| Profile persistence | Maestro edit profile -> `psql "$SUPABASE_DB_URL" -c "select display_name,summary from public.profiles where email='<test email>';"` | UI saved expected row. |
| RLS negative | Auth user B attempts REST update of user A profile id; expect 0 rows/403. | Own-profile isolation. |
| Sign out | Maestro sign out -> assert `Sign in` visible; relaunch with no session if signed out. | Session cleared. |
| Server-owned fields negative | Auth user attempts REST update of own `email`, `avatar_path`, `location`, or `show_location`; expect database error and unchanged values. | Profile update hardening. |

### Rollback
- If profile/settings UI creates instability, restore only `ProfileScreen.tsx`, `SettingsScreen.tsx`, and related i18n strings from git or pre-edit copies. Schema/auth/session work should remain independently shippable.

---

## Phase 1.6: Maestro, API, psql, and Regression Verification
**Owner**: @implementer for evidence, @analyzer for review gate
**Dependencies**: Phase 1.1-1.5
**Complexity**: MEDIUM

### Files Created/Modified
- `.maestro/shared/_OnFlowStart.yaml`
- `.maestro/flows/auth-signup-signout.yaml` (new)
- `.maestro/flows/auth-signin-restore.yaml` (new)
- `.maestro/flows/auth-invalid-signin.yaml` (new)
- `.maestro/flows/auth-forgot-password.yaml` (new)
- Optional `hurl/auth-flow.hurl` or `supabase/playbooks/local-auth.hurl` if repo convention prefers checked-in Hurl playbooks.

### Maestro flow requirements
All selectors must be ASCII-only to avoid Maestro Turkish-character hangs.

1. `.maestro/flows/auth-signup-signout.yaml`
   - Launch with `clearState: true`, `clearKeychain: true` via shared bootstrap.
   - Assert `Sign in` visible.
   - Tap `Create account`.
   - Fill deterministic env email/password/display name.
   - Tap `Create account`.
   - Assert `Map` tab or `Profile` tab visible.
   - Navigate to `Settings`.
   - Tap `Sign out`.
   - Assert `Sign in` visible.

2. `.maestro/flows/auth-signin-restore.yaml`
   - Launch without clearing state after API-created test user or previous signup.
   - Sign in.
   - Stop app.
   - Relaunch without clear state.
   - Assert `Map`/`Profile` visible.
   - Sign out for cleanup.

3. `.maestro/flows/auth-invalid-signin.yaml`
   - Launch clear state.
   - Enter malformed email or wrong password.
   - Tap `Sign in`.
   - Assert readable error such as `Invalid login credentials` or `Enter a valid email`.

4. `.maestro/flows/auth-forgot-password.yaml`
   - Launch clear state.
   - Tap `Forgot password`.
   - Enter test email.
   - Tap `Send reset email`.
   - Assert `Check your email`.
   - Verify Inbucket message separately with HTTP/psql, because Maestro should not scrape local web UI.

### API/psql verification requirements
- Hurl/curl signup -> profile trigger row.
- REST own profile select with JWT succeeds.
- REST anonymous profile select fails/returns no rows.
- REST cross-user update fails/updates zero rows.
- REST malicious own-profile update for `email`, `avatar_path`, `location`, and `show_location` fails and leaves values unchanged.
- Inbucket receives reset email; no Phase 1 full reset-password completion is claimed.

### Regression set
Run after Phase 1 implementation:
```bash
pnpm compile
pnpm lint:check
pnpm test:unit
pnpm depcruise
pnpm test:maestro
```

If `pnpm test` fails only because demo tests reference removed demo strings, update/remove those tests in the smallest dedicated commit and preserve coverage for app utilities/components.

### Acceptance Criteria
- [ ] All Phase 1 Maestro flows pass on iOS dev client.
- [ ] psql/API checks prove profile trigger, RLS isolation, and read-only/future-phase field protection.
- [ ] Existing compile/lint/unit/dependency-cruiser checks pass or have documented demo-test cleanup.
- [ ] Future analyzer review gate approves auth storage, RLS, route graph, and logout reset before Phase 1 is considered complete.

---

# Later Phase Direction

Phase 2 is now detailed enough for implementation. Phases 3+ remain directional and must be refined with fresh repo evidence before implementation.

## Phase 2: Map and User Location Discovery
**Owner**: @implementer (map/location) with @analyzer review gates
**Dependencies**: Phase 1 approved/authenticated main-tab app
**Complexity**: HIGH

### Phase 2 Status
READY for Phase 2 implementation after Phase 1 is merged and verified.

### Phase 2 Problem Statement
Replace the Phase 1 `Map` placeholder with an iOS-first Apple Maps screen that lets an authenticated user opt in to showing their own location, delete that location, and search the current map viewport for visible nearby users. Keep the implementation intentionally narrow: no Google Maps keys, no push notifications, no dive-event markers, no chat entry points, and no clustering until the marker count proves it is necessary.

### Phase 2 Current State (Evidence)

| Area | Verified evidence | Phase 2 implication |
|---|---|---|
| Map route exists | Current Phase 1 app registers `MainTab` route `Map`; Phase 2 explore found `app/navigators/MainTabNavigator.tsx` tab `Map` and `app/navigators/navigationTypes.ts` `Map: undefined`. | Keep the existing `Map` route value and replace only the placeholder screen/component. |
| Map screen is placeholder | Phase 2 explore found `app/screens/main/PlaceholderScreens.tsx` exporting `MapScreen` as `PlaceholderScreen title="Map" message="Map coming next"`. | Replace placeholder with real `MapScreen`; keep visible text/accessibility label `Map` for existing auth-flow assertions. |
| Map dependencies absent | Phase 2 explore found `react-native-maps` and `expo-location` are not in `package.json`. | Add only these Phase 2 runtime dependencies with Expo-compatible versions. |
| Location columns exist but direct writes are blocked | Phase 1 profile schema has `profiles.location geography(Point,4326)` and `show_location boolean`; `protect_profile_server_fields()` blocks direct writes to both until Phase 2. | Add location RPCs and relax the trigger only for RPC-mediated location updates; do not allow direct client table updates. |
| Spatial index exists | Phase 1 plan/schema created `profiles_location_gix` on non-null `location`. | Reuse index for `users_in_view`; do not add a new location table. |
| App config plugin pattern exists | `app.json` already has plugin entries for Expo modules and `expo-build-properties`. | Add `expo-location` plugin/permission text in the same style. |
| UI components exist | Phase 2 explore found Ignite `Card`, `Button`, `Screen`, `Header`, `colors`, and `spacing` suitable for map overlays. | Use existing components and theme; do not add `@gorhom/bottom-sheet` for Phase 2. |
| Maestro auth flows exist | Phase 2 explore found current `.maestro/flows/auth-*` patterns with env vars, ASCII selectors, screenshots, and shared bootstrap. | Add focused map flows and run the full Phase 1 regression set. |

### Phase 2 Verified Facts vs Assumptions

| Item | Type | Criticality | Evidence / decision | Validation method |
|---|---:|---:|---|---|
| Apple Maps is the iOS provider for Phase 2. | Fact | HIGH | Context7 `react-native-maps` docs state Apple Maps works out-of-the-box on iOS and Google Maps is optional on iOS. | iOS simulator map smoke without `PROVIDER_GOOGLE` or Google API keys. |
| Android Google Maps readiness is not in Phase 2. | Decision | HIGH | Context7 `react-native-maps` docs state Android requires Google Maps API configuration; user explicitly says no Google Maps API. | Dependency/config grep confirms no Google Maps key/provider. |
| Expo Location foreground permission API is sufficient. | Fact | HIGH | Context7 Expo docs show `Location.requestForegroundPermissionsAsync()` and `Location.getCurrentPositionAsync()` for current location. | Maestro permission/use-current-location flow. |
| Phase 2 updates `profiles.location` only through RPCs. | Decision | HIGH | Phase 1 trigger blocks direct `location/show_location` updates; requirement says no direct location table updates from app. | REST direct update fails; RPC update/delete succeeds. |
| PostGIS coordinate order is longitude first. | Fact | HIGH | Old app WKT wrote `POINT(longitude latitude)`; PostGIS `ST_MakePoint(x,y)` uses X=longitude/Y=latitude. | psql `ST_X`/`ST_Y` checks after RPC update. |
| No clustering or bottom sheet for Phase 2. | Decision | MEDIUM | KISS: v1 needs simple marker list and action card only; `@gorhom/bottom-sheet` adds gesture complexity without required value. | Dependency grep excludes clustering/bottom-sheet packages; UI review. |
| Simulator permission dialogs can vary by iOS version. | Assumption | LOW | Maestro supports optional selectors; location can also be verified by RPC/psql. | Use optional permission taps plus API/psql proof. |

No unresolved CRITICAL or HIGH Phase 2 assumptions remain.

### Global UI/UX/i18n Quality Invariants (All Remaining Phases)

These apply to Phase 2 and every remaining phase before analyzer approval:

| Invariant | Why it matters | How to verify |
|---|---|---|
| Use the existing Ignite theme spacing scale. Visible controls must have clear grouping, gaps, and alignment. | Prevents ad-hoc layout drift and crowded mobile screens. | Code review of styles using theme spacing tokens; Maestro screenshots for critical screens. |
| Apply refactoring-ui principles: visual hierarchy, constrained widths/forms, accessible contrast, and clear empty/loading/error states. | Keeps product screens understandable and polished without adding a new design system. | Analyzer UI/UX verdict plus screenshots for happy, empty/loading, and error states where applicable. |
| Every new visible string goes through the existing i18n pattern unless a documented technical reason prevents it. | Preserves translation readiness and existing i18n test expectations. | `pnpm compile`, i18n/unit tests, and grep/review for hardcoded visible strings. |
| Maestro selectors use stable ASCII labels/strings while remaining compatible with translated UI where possible via accessibility labels. | Avoids Maestro Turkish-character hangs and makes tests resilient when UI text is translated. | Maestro flows use `id`/accessibility labels or ASCII labels; hierarchy dump if selectors fail. |
| Each remaining phase includes UI/UX review and i18n coverage checks before analyzer approval. | Makes quality a release criterion, not optional polish. | Phase-specific acceptance criteria and review gates include UI/UX/i18n evidence. |

Global validation commands/checks for UI phases:
```bash
pnpm compile
pnpm test:unit
pnpm lint:check
```
Plus Maestro screenshot capture for critical screens/flows and an analyzer UI/UX verdict before approval.

### Phase 2 Decisions Summary

| Decision | Chosen | Rejected | Rationale |
|---|---|---|---|
| Map provider | `react-native-maps` default provider on iOS (Apple Maps) | `PROVIDER_GOOGLE`, Google Maps API keys | Meets user requirement and avoids external API keys/billing. |
| Location dependency | `expo-location` foreground permission/current position | Background location, continuous tracking | Phase 2 is opt-in save/delete, not live tracking. |
| Data writes | `update_own_location(lng,lat)` and `delete_own_location()` RPCs | Direct `profiles` update from app | Preserves Phase 1 protected-field trigger and keeps privacy logic server-side. |
| Discovery | `users_in_view(min_lat,min_long,max_lat,max_long)` RPC | Client-side filtering/selecting all profiles | Prevents direct exposure of private profile/location columns. |
| State | Local screen state + `mapService` + `calculateBounds` utility | New global store/React Query/Zustand/MobX | Map state is screen-local; no cross-screen cache need yet. |
| UI surface | Map with simple overlay card/action buttons and marker list | Bottom sheet/clustering | KISS and easier Maestro verification. |
| Feature flags | N/A for Phase 2 | Config flag around map | Phase 2 replaces an authenticated placeholder before broad release; route remains stable and regression tests cover it. |

---

## Phase 2.1: Dependencies, App Config, and Native Permission Setup
**Owner**: @implementer (Expo/native config)
**Dependencies**: Phase 1 merged
**Complexity**: MEDIUM
**Expected commit**: `phase2: add map and location dependencies`

### Files Created/Modified
- `package.json`
- `pnpm-lock.yaml`
- `app.json`
- `app.config.ts` only if existing dynamic config must merge `infoPlist` safely

### Tasks
- [ ] Install only Phase 2 runtime dependencies: `npx expo install react-native-maps expo-location`.
- [ ] Do not install `@gorhom/bottom-sheet`, clustering libraries, Google Maps packages, push-notification packages, or chat/event dependencies.
- [ ] Add Expo Location config plugin to `app.json` plugins:
  ```json
  [
    "expo-location",
    {
      "locationWhenInUsePermission": "Diving Buddies uses your location to show nearby divers when you choose to save it.",
      "locationAlwaysAndWhenInUsePermission": "Diving Buddies uses your location to show nearby divers when you choose to save it."
    }
  ]
  ```
- [ ] Add/merge iOS `infoPlist.NSLocationWhenInUseUsageDescription` with the same user-facing text if the plugin does not already generate it in the app's current config path.
- [ ] Keep `app.json` free of Google Maps API keys and do not set `PROVIDER_GOOGLE` in app code.
- [ ] Document that permission/app config changes require a rebuilt dev client (`npx expo run:ios` or EAS dev build) before Maestro location tests.

### Acceptance Criteria
- [ ] `package.json` includes `react-native-maps` and `expo-location` only as new map/location runtime deps.
- [ ] `app.json` has foreground location permission text.
- [ ] No Google Maps API key/provider appears in config or app code.

### Verification
| Check | Command / method | Proves |
|---|---|---|
| Dependency scope | `node -e "const p=require('./package.json'); console.log(p.dependencies)"` | Only Phase 2 allowed deps added. |
| Google exclusion | `rg "PROVIDER_GOOGLE|googleMapsApiKey|iosGoogleMapsApiKey|androidGoogleMapsApiKey|GMS" app app.json app.config.ts package.json` returns no Phase 2 additions | No Google Maps integration. |
| Native config | `npx expo config --type public` and inspect location permission strings | App config includes permission text. |

### Rollback
- Phase 0/1 git is expected; restore `package.json`, `pnpm-lock.yaml`, and `app.json` from git.
- If git is unavailable, manually remove only `react-native-maps`, `expo-location`, and the `expo-location` plugin entry, then run `pnpm install`.

---

## Phase 2.2: Location RPC Migration and Trigger Hardening
**Owner**: @implementer (Supabase/PostGIS)
**Dependencies**: Phase 2.1 can be parallel, Phase 1 schema required
**Complexity**: HIGH
**Expected commit**: `phase2: add location RPCs`

### Files Created/Modified
- `supabase/migrations/<timestamp>_map_location_rpcs.sql`
- `app/services/supabase/database.types.ts` (regenerated)

### Schema/RPC Direction
Keep `public.profiles` as the only Phase 2 location persistence table. Do not add a location history table.

Create or replace `public.protect_profile_server_fields()` so it still rejects direct writes to `id`, `email`, `created_at`, `updated_at`, and `avatar_path`, and rejects `location/show_location` unless a local server-side marker is set by approved RPCs:

```sql
if (new.location is distinct from old.location or new.show_location is distinct from old.show_location)
   and coalesce(current_setting('app.location_rpc', true), '') <> 'on' then
  raise exception 'profiles.location requires Phase 2 location RPCs';
end if;
```

Use trigger names that preserve ordering: `trg_10_protect_profile_server_fields` before `trg_20_set_profiles_updated_at`.

Create RPCs with safe search paths and explicit grants:

```sql
create or replace function public.update_own_location(p_lng double precision, p_lat double precision)
returns table (
  user_id uuid,
  latitude double precision,
  longitude double precision,
  show_location boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_lng is null or p_lat is null or p_lng < -180 or p_lng > 180 or p_lat < -90 or p_lat > 90 then
    raise exception 'Invalid coordinates';
  end if;

  perform set_config('app.location_rpc', 'on', true);

  update public.profiles
  set location = extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::geography,
      show_location = true
  where id = v_user_id;

  return query
  select p.id,
         extensions.ST_Y(p.location::geometry)::double precision,
         extensions.ST_X(p.location::geometry)::double precision,
         p.show_location,
         p.updated_at
  from public.profiles p
  where p.id = v_user_id;
end;
$$;

create or replace function public.delete_own_location()
returns table (user_id uuid, show_location boolean, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform set_config('app.location_rpc', 'on', true);

  update public.profiles
  set location = null,
      show_location = false
  where id = v_user_id;

  return query
  select p.id, p.show_location, p.updated_at
  from public.profiles p
  where p.id = v_user_id;
end;
$$;

create or replace function public.users_in_view(
  min_lat double precision,
  min_long double precision,
  max_lat double precision,
  max_long double precision
)
returns table (
  user_id uuid,
  display_name text,
  summary text,
  avatar_path text,
  latitude double precision,
  longitude double precision,
  is_self boolean
)
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  select p.id as user_id,
         p.display_name,
         p.summary,
         p.avatar_path,
         extensions.ST_Y(p.location::geometry)::double precision as latitude,
         extensions.ST_X(p.location::geometry)::double precision as longitude,
         p.id = auth.uid() as is_self
  from public.profiles p
  where auth.uid() is not null
    and p.show_location = true
    and p.location is not null
    and min_lat between -90 and 90
    and max_lat between -90 and 90
    and min_long between -180 and 180
    and max_long between -180 and 180
    and min_lat <= max_lat
    and min_long <= max_long
    and extensions.ST_Y(p.location::geometry) between min_lat and max_lat
    and extensions.ST_X(p.location::geometry) between min_long and max_long
  order by p.updated_at desc
  limit 250;
$$;

revoke all on function public.update_own_location(double precision, double precision) from public;
revoke all on function public.delete_own_location() from public;
revoke all on function public.users_in_view(double precision, double precision, double precision, double precision) from public;
grant execute on function public.update_own_location(double precision, double precision) to authenticated;
grant execute on function public.delete_own_location() to authenticated;
grant execute on function public.users_in_view(double precision, double precision, double precision, double precision) to authenticated;
```

RLS policy decision: do not add a broad visible-profile select policy in Phase 2. Direct profile select remains own-row only; public discovery happens only through `users_in_view`, which returns a sanitized field list and never returns email or raw geography.

### Coordinate Invariants
- `update_own_location(p_lng, p_lat)` calls `ST_MakePoint(p_lng, p_lat)`; longitude is X, latitude is Y.
- `users_in_view` returns `latitude = ST_Y(location::geometry)` and `longitude = ST_X(location::geometry)`.
- Inputs outside latitude/longitude ranges fail fast.
- Anti-meridian wrapping is out of Phase 2; `min_long > max_long` is rejected and can be revisited if global-map behavior becomes necessary.

### Acceptance Criteria
- [ ] RPCs exist and are executable by authenticated users only.
- [ ] Direct REST update of `profiles.location` or `profiles.show_location` still fails.
- [ ] `update_own_location` stores longitude/latitude in correct PostGIS order and sets `show_location=true`.
- [ ] `delete_own_location` sets `location=null` and `show_location=false`.
- [ ] `users_in_view` returns only visible profiles inside the bounding box and only sanitized fields.

### Verification
| Check | Command / method | Proves |
|---|---|---|
| RPC list | `psql "$SUPABASE_DB_URL" -c "select proname from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='public' and proname in ('update_own_location','delete_own_location','users_in_view');"` | RPCs exist. |
| Coordinate order | Call `update_own_location(29.0,41.0)` as authenticated user, then `psql "$SUPABASE_DB_URL" -c "select ST_X(location::geometry), ST_Y(location::geometry), show_location from public.profiles where email='<test email>';"` | X=29.0, Y=41.0, visible true. |
| Delete | Call `delete_own_location()`, then `psql "$SUPABASE_DB_URL" -c "select location is null, show_location from public.profiles where email='<test email>';"` | Location privacy deletion works. |
| In-view positive/negative | Call `users_in_view(40.5,28.5,41.5,29.5)` and `users_in_view(0,0,1,1)` | Bounding-box filter works. |
| Direct update blocked | REST `PATCH /rest/v1/profiles?id=eq.<own id>` with `location/show_location` and user JWT fails/unchanged. | No direct app table updates. |
| Anonymous denied | Call RPCs without user JWT; expect auth error/no rows. | Auth required. |

### Rollback
- Restore/remove only the Phase 2 RPC migration and regenerated types, then run `supabase db reset` locally.
- If already applied remotely in the future, add a forward rollback migration dropping the three RPCs and restoring the Phase 1 trigger body that blocks `location/show_location` changes.
- Never disable RLS or expose direct profile location updates as rollback.

---

## Phase 2.3: Map Utilities and Location Service Layer
**Owner**: @implementer (service/util)
**Dependencies**: Phase 2.2
**Complexity**: MEDIUM
**Expected commit**: `phase2: add map services`

### Files Created/Modified
- `app/utils/map/calculateBounds.ts` (new)
- `app/services/location/mapService.ts` (new)
- `app/services/location/types.ts` (new if useful)
- `app/services/profiles/profileService.ts` only if own profile refresh needs to understand `show_location` display state

### Tasks
- [ ] Implement `calculateBounds(region)` once, with input shape `{ latitude, longitude, latitudeDelta, longitudeDelta }` and output `{ minLat, maxLat, minLong, maxLong }`.
- [ ] Clamp latitude to `[-90, 90]` and longitude to `[-180, 180]`; if a region crosses the anti-meridian, return a typed error or `unsupported=true` rather than silently querying wrong bounds.
- [ ] Implement `mapService.updateOwnLocation({ longitude, latitude })` calling `supabase.rpc('update_own_location', { p_lng: longitude, p_lat: latitude })`.
- [ ] Implement `mapService.deleteOwnLocation()` calling `delete_own_location`.
- [ ] Implement `mapService.getUsersInView(bounds)` calling `users_in_view` with `min_lat`, `min_long`, `max_lat`, `max_long`.
- [ ] Normalize RPC rows into `MapUserMarker` objects: `{ userId, displayName, summary, avatarPath, coordinate: { latitude, longitude }, isSelf }`.
- [ ] Handle Supabase errors with user-readable messages and no raw SQL leakage in UI.
- [ ] Do not add global state libraries; map data remains screen state.

### Acceptance Criteria
- [ ] Map services are the only app code calling Phase 2 map/location RPCs.
- [ ] `calculateBounds` avoids duplicated old-app bounding-box math.
- [ ] TypeScript types hide PostGIS `unknown` and expose only `latitude/longitude` numbers to UI.

### Verification
| Check | Command / method | Proves |
|---|---|---|
| Compile | `pnpm compile` | Service/util types valid. |
| RPC grep | `rg "update_own_location|delete_own_location|users_in_view" app` | Calls are centralized in map service except type/tests. |
| Unit-level utility check | Existing Jest may be used only for pure `calculateBounds` tests if desired; otherwise verify via a one-off TypeScript/Node invocation. | Bounds math is deterministic without integration mocks. |

### Rollback
- Remove `app/services/location/*` and `app/utils/map/calculateBounds.ts`; keep DB migration in place if already validated, because app code can simply stop calling RPCs.

---

## Phase 2.4: Real Map Screen UI
**Owner**: @implementer (React Native UI)
**Dependencies**: Phase 2.1, Phase 2.3
**Complexity**: HIGH
**Expected commit**: `phase2: implement map screen`

### Files Created/Modified
- `app/screens/main/MapScreen.tsx` or replace the `MapScreen` export in `app/screens/main/PlaceholderScreens.tsx` with a dedicated file
- `app/screens/main/PlaceholderScreens.tsx` if the Map placeholder is removed
- `app/navigators/MainTabNavigator.tsx` only if import path changes
- `app/i18n/en.ts` and locale files if current i18n tests require all visible strings

### UI Requirements
- Full-screen `MapView` using default provider on iOS; do not pass `PROVIDER_GOOGLE`.
- Initial region: use saved own location if available from profile/RPC; otherwise use a neutral default region (Istanbul/Turkey is acceptable from old domain) with moderate deltas.
- Local screen state only:
  - `region`
  - `pendingCoordinate` selected by `Use current location` or map press
  - `markers`
  - `selectedMarker`
  - `loading/error/statusMessage`
- Controls with stable ASCII accessibility labels and visible text:
  - `Map` heading/label remains visible for Phase 1 auth-flow assertions.
  - `Use current location`
  - `Save location`
  - `Delete location`
  - `Search this area`
- `Use current location` flow:
  - calls `Location.requestForegroundPermissionsAsync()`;
  - if granted, calls `Location.getCurrentPositionAsync({})`;
  - sets `pendingCoordinate` and animates map to the coordinate;
  - does not save to Supabase until user taps `Save location`.
- `Save location` calls `mapService.updateOwnLocation` with `pendingCoordinate`, refreshes markers by current bounds, and shows a success message like `Location saved`.
- `Delete location` calls `mapService.deleteOwnLocation`, clears pending/self marker state, refreshes markers, and shows `Location deleted`.
- `Search this area` calls `calculateBounds(region)` and `mapService.getUsersInView(bounds)`; shows a loading state and then marker count/list.
- Marker list/card:
  - simple card overlay or bottom-aligned panel using existing `Card`/`Button`/theme tokens;
  - shows display name and short summary for selected/listed users;
  - no chat buttons, no dive-event buttons, no profile navigation beyond optional non-interactive display.
- Map interactions:
  - `onRegionChangeComplete` updates region; do not rely on `gesture.isGesture` because Context7 docs note that gesture metadata is not available on Apple Maps.
  - `onPress` may set `pendingCoordinate` as a fallback/manual selection, with accessible status text `Location selected`.

### Design Requirements
- Use existing grayscale-first Ignite theme tokens.
- Keep overlay cards high contrast with enough scrim/elevation for map readability.
- Avoid dense controls: primary action row max 2 buttons per row or stacked buttons.
- Minimum tappable control height follows existing `Button` component standards.
- Every new visible string must use the existing i18n pattern unless a documented technical limitation prevents it.
- Accessibility labels for Maestro-critical controls must be stable ASCII labels compatible with translated visible UI.

### Acceptance Criteria
- [ ] Authenticated user sees the `Map` screen instead of `Map coming next`.
- [ ] User can set a pending coordinate from current location or map press without immediately publishing it.
- [ ] `Save location` publishes the coordinate and makes the user visible in `users_in_view`.
- [ ] `Delete location` removes the coordinate and hides the user from `users_in_view`.
- [ ] `Search this area` displays simple markers/list for visible users in the viewport.
- [ ] Existing `Map` tab label remains visible/accessible.
- [ ] No dive-event markers, chat entry points, push prompts, clustering, or Google Maps provider are present.
- [ ] UI/UX review passes for visual hierarchy, grouped controls, spacing/alignment, contrast, and empty/loading/error states.
- [ ] i18n coverage check passes for all new map strings; Maestro selectors use stable ASCII accessibility labels.

### Verification
| Check | Command / method | Proves |
|---|---|---|
| Compile | `pnpm compile` | Map UI types/imports valid. |
| Visual smoke | Maestro screenshot after opening Map | Map renders and overlay does not block tab nav. |
| Dependency grep | `rg "PROVIDER_GOOGLE|BottomSheet|Cluster|Dive|Chat" app/screens/main/MapScreen.tsx app/services/location app/utils/map` | Scope remains Phase 2-only. |
| i18n coverage | `pnpm test:unit` plus review changed visible strings in `app/i18n/*` | New map strings follow existing translation pattern. |
| UI/UX review | Analyzer reviews Maestro screenshots for map loading/empty/error/saved/deleted states | Refactoring-ui quality gate passes. |

### Rollback
- Restore the Phase 1 placeholder `MapScreen` import/export and leave service/RPC code unused.
- If native map package causes build failure, revert Phase 2.1 dependency/config commit and keep DB/service commits pending review.

---

## Phase 2.5: Maestro, API/psql Verification, and Regression
**Owner**: @implementer for evidence, @analyzer for review gates
**Dependencies**: Phase 2.1-2.4
**Complexity**: MEDIUM
**Expected commit**: `phase2: add map verification flows`

### Files Created/Modified
- `.maestro/flows/map-location-add-delete.yaml` (new)
- `.maestro/flows/map-search-area.yaml` (new or combined if runtime stays stable)
- Optional Hurl playbook: `hurl/map-location-rpcs.hurl` or `supabase/playbooks/map-location-rpcs.hurl`

### Maestro Flow Requirements
All selectors must be ASCII-only.

1. `.maestro/flows/map-location-add-delete.yaml`
   - Use existing auth setup/sign-in subflow or create a deterministic test user via API before running.
   - Launch app and assert `Map` visible.
   - Optionally handle iOS permission prompt with selectors such as `Allow While Using App`, `Allow Once`, and `Don’t Allow` using `optional: true`; prefer allowing when available.
   - Use Maestro `travel` to a deterministic coordinate if supported by the simulator, e.g. latitude `41.015137`, longitude `28.97953`.
   - Tap `Use current location`.
   - Assert `Location selected` or equivalent pending state.
   - Tap `Save location`.
   - Assert `Location saved`.
   - Tap `Search this area`.
   - Assert own marker/list entry appears, preferably with display name or `You`/`Your location` text.
   - Tap `Delete location`.
   - Assert `Location deleted`.
   - Take screenshots after save and delete states.

2. `.maestro/flows/map-search-area.yaml`
   - Seed two users through API/RPC: one inside Istanbul bounds, one outside.
   - Sign in as a user with saved location or use existing deterministic account.
   - Open `Map` and tap `Search this area`.
   - Assert inside user appears and outside user does not appear, using ASCII display names.

### API/psql Verification Requirements
- Authenticated RPC `update_own_location(29.0,41.0)` succeeds.
- psql confirms `ST_X(location::geometry)=29.0`, `ST_Y(location::geometry)=41.0`, `show_location=true`.
- `users_in_view(40.5,28.5,41.5,29.5)` returns the user; `users_in_view(0,0,1,1)` does not.
- `delete_own_location()` succeeds and psql confirms `location is null`, `show_location=false`.
- Direct REST update of `profiles.location/show_location` fails/unchanged.
- Anonymous RPC calls fail or return no data.
- No `dives` or chat tables/RPCs are introduced in Phase 2 migrations.

### Regression Set
Run after Phase 2 implementation:
```bash
pnpm compile
pnpm lint:check
pnpm test:unit
pnpm depcruise
pnpm test:maestro
maestro test -e MAESTRO_APP_ID=com.divingbuddies.app .maestro/flows/map-location-add-delete.yaml
maestro test -e MAESTRO_APP_ID=com.divingbuddies.app .maestro/flows/map-search-area.yaml
```

### Phase 2 Acceptance Criteria
- [ ] iOS map renders with Apple Maps/default provider and no Google key/provider.
- [ ] Location permission/current-location flow is handled gracefully for granted and denied states.
- [ ] Users can save and delete their own location only through RPCs.
- [ ] `users_in_view` returns only visible users inside the current bounds with correct latitude/longitude order.
- [ ] Direct location table updates remain blocked.
- [ ] Phase 1 auth/signup/signin/signout/reset-email/profile regressions still pass.
- [ ] No dive-event markers, chat, push, Google Maps, clustering, or bottom sheet dependencies are added.
- [ ] Phase 2 UI/UX and i18n quality gates pass before analyzer approval.

---

## Phase 2 Blast Radius / Affected Entry Points
- `package.json` / `pnpm-lock.yaml` for `react-native-maps` and `expo-location`.
- `app.json` / possibly `app.config.ts` for foreground location permission text.
- `supabase/migrations/*` for location RPCs and `protect_profile_server_fields()` change.
- `app/services/supabase/database.types.ts` regenerated after migration.
- `app/screens/main/MapScreen.tsx` or `PlaceholderScreens.tsx` map export.
- `app/navigators/MainTabNavigator.tsx` only if Map import changes; route name remains `Map`.
- `app/services/location/*` and `app/utils/map/calculateBounds.ts`.
- `.maestro/flows/*` map flows and the full Phase 1 regression suite.

## Phase 2 Allowed Scope / Forbidden Scope

### Allowed in Phase 2
- Add `react-native-maps` and `expo-location`.
- Add foreground location permission config.
- Add location RPC migration and regenerated Supabase types.
- Replace Map placeholder with real map UI and simple marker/list card.
- Add `mapService` and `calculateBounds`.
- Add Maestro/API/psql verification for location save/delete/search.

### Forbidden in Phase 2
- No Google Maps API keys, `PROVIDER_GOOGLE`, Google OAuth, or Google-specific config.
- No push notifications.
- No dive-event schema, dive markers, or dive-event UI beyond Phase 3 placeholders.
- No chat/conversation schema or chat entry points.
- No avatar storage/upload changes.
- No `@gorhom/bottom-sheet`, clustering, or global state library unless a blocker is documented and reviewed.
- No direct app writes to `profiles.location` or `profiles.show_location`.

## Phase 2 Invariants

| Invariant | Why it matters | How to verify |
|---|---|---|
| Location is opt-in and private by default. | Avoids exposing users without consent. | New profiles have `location=null`, `show_location=false`; users appear only after `Save location`. |
| Direct location table updates remain blocked. | Preserves server-side privacy control. | REST direct update fails/unchanged. |
| RPC coordinate order is longitude first for writes. | Prevents swapped markers. | `ST_X=longitude`, `ST_Y=latitude` psql checks. |
| RPC returns latitude from `ST_Y` and longitude from `ST_X`. | UI marker coordinates must be correct. | `users_in_view` output compared to psql. |
| `users_in_view` returns sanitized fields only. | Prevents leaking email/raw geography/private rows. | Inspect RPC return schema and REST output. |
| Map route name remains `Map`. | Preserves Phase 1 auth flow assertions and tab navigation. | Maestro auth regressions still assert `Map`. |
| No Google Maps/push/chat/dive scope enters Phase 2. | Keeps implementation small and reviewable. | Dependency/config/code grep. |

## Phase 2 Behavior That Must Not Change
- Phase 1 auth/session/profile/signout/reset-email flows still pass.
- Existing `Map`, `DiveEvent`, `Chat`, `Profile`, and `Settings` tab route values remain registered.
- Supabase local ports and PostGIS extension remain unchanged.
- `profiles.avatar_path` remains read-only until Phase 5.
- Dive-event markers remain absent until Phase 3.
- Reference old app remains read-only.

## Phase 2 Legacy / Malformed State Handling
- Existing users with `location=null` and `show_location=false` render a map with no self marker and a clear call to action to save location.
- If `profiles.location` is malformed or cannot cast to geometry, `users_in_view` should fail server-side during testing; implementation should fix data/migration rather than hiding corrupted rows silently.
- If location permission is denied, the UI must show a non-blocking message and still allow map browsing/search. Saving requires a `pendingCoordinate`; if no coordinate exists, `Save location` remains disabled or shows `Select a location first`.
- If stale Phase 1 navigation state opens `Map`, the real screen should render without requiring any migration data beyond nullable profile location fields.
- If `react-native-maps` native module is unavailable because the dev client was not rebuilt, fail clearly in implementation notes and rebuild the dev client; do not add web fallbacks or alternate map libraries.

## Phase 2 Validation Matrix

| Check | Command / Method | Proves |
|---|---|---|
| Exact regression path | Maestro `map-location-add-delete.yaml` | User can select, save, search, and delete own location. |
| Search bounds | Maestro `map-search-area.yaml` + seeded users | In-bounds users appear, out-of-bounds users do not. |
| Coordinate order | `psql` `ST_X/ST_Y` after `update_own_location(29,41)` | Longitude/latitude are not swapped. |
| Privacy delete | `delete_own_location()` + psql null/false check | Location deletion removes discoverability. |
| Direct update negative | REST `PATCH /profiles` with `location/show_location` | App cannot bypass RPCs. |
| Anonymous negative | unauthenticated RPC calls | Auth required for map RPCs. |
| Behavior preservation | Full Phase 1 Maestro suite and compile/lint/test/depcruise | Auth/profile regressions remain intact. |
| Phase 2 i18n coverage | `pnpm compile && pnpm test:unit` plus changed-string review | Map/location strings follow existing i18n pattern. |
| Phase 2 UI/UX evidence | Maestro screenshots for Map initial/search/saved/deleted/error states + analyzer UI/UX verdict | Map UI meets spacing, hierarchy, contrast, and state requirements. |
| Google exclusion | grep for Google provider/API keys | Apple Maps-only iOS v1. |
| Scope exclusion | migration/code grep for `dives`, `messages`, `conversations`, push APIs | No Phase 3/4/push leakage. |

## Phase 2 Review Gates

| Gate | After Phase | Focus Area |
|---|---|---|
| Gate 2.1 | 2.2 | RPC security, trigger bypass design, coordinate order, grants/revokes. |
| Gate 2.2 | 2.4 | Map UI scope, permission handling, no Google/provider leak, accessibility labels, i18n coverage, UI/UX screenshots. |
| Gate 2.3 | 2.5 | Evidence bundle: Maestro, psql/API, regression suite, screenshots, analyzer UI/UX verdict. |

## Phase 2 Risks and Rollback

| Risk | Likelihood | Impact | Mitigation / rollback |
|---|---:|---:|---|
| Native map module fails because dev client was not rebuilt. | MEDIUM | MEDIUM | Rebuild dev client after dependency/config changes; rollback dependency/config commit if native build fails. |
| Trigger bypass accidentally permits direct location updates. | LOW | HIGH | Use local GUC only inside RPC, direct REST negative test, analyzer Gate 2.1. |
| Latitude/longitude are swapped. | MEDIUM | HIGH | SQL direction mandates `ST_MakePoint(lng,lat)`, `ST_X`/`ST_Y` verification. |
| Permission prompt makes Maestro flaky. | MEDIUM | MEDIUM | Optional prompt selectors, simulator `travel`, API/psql backup evidence. |
| Marker count grows beyond simple rendering. | LOW | LOW in Phase 2 | Limit RPC to 250 rows; defer clustering until evidence requires it. |
| Android map is incomplete without Google key. | HIGH for Android | LOW for iOS Phase 2 | Explicitly scope Phase 2 to iOS Apple Maps; create separate Android readiness check later. |

## Phase 3: Diving Events
**Owner**: @planner then @implementer (events/schema)
**Dependencies**: Phase 2 merged and verified
**Complexity**: HIGH

### Problem Statement
Add the v1 diving-events experience: each authenticated user can publish exactly one active dive event with date/time, description, and location; nearby dive events appear on the map with sanitized creator public fields. The implementation must follow the Phase 2 RPC-first spatial/security model and must not introduce chat, push, Google Maps, avatar storage, or a new global state/cache library.

### Phase 3 Current State (Evidence)

| Area | Verified evidence | Implication |
|---|---|---|
| Route shell exists | `app/navigators/navigationTypes.ts:18` includes `DiveEvent: undefined`; `app/navigators/MainTabNavigator.tsx:6,36` imports/registers `DiveEventScreen`; `app/app.tsx:52` deep-links `DiveEvent` to `dive-event`. | Phase 3 replaces the placeholder screen, not the route graph. |
| Current UI is placeholder | `app/screens/main/PlaceholderScreens.tsx:25-27` exports `DiveEventScreen` with “Dive events coming next”. | Implement the real tab in this file or split to `app/screens/main/DiveEventScreen.tsx` and update the import. |
| Existing spatial service pattern | `app/services/location/mapService.ts` wraps Supabase RPCs as `ServiceResult<T>`, normalizes rows, and calls named RPC parameters (`update_own_location`, `delete_own_location`, `users_in_view`). | Add a focused `diveEventService` using the same result/error/normalizer style; no direct Supabase calls from screens. |
| Existing map integration | `app/screens/main/MapScreen.tsx:4,13,28-29,124,154,156-171` imports `MapView`/`Marker`, reuses `calculateBounds`, stores markers/selected marker state, and searches current map bounds. | Extend MapScreen with a parallel dive-event marker collection and selected event card while preserving existing diver marker behavior. |
| Bounds utility | `app/utils/map/calculateBounds.ts` returns `MapBounds` and rejects invalid/antimeridian regions; `MapBounds` lives in `app/services/location/types.ts:6-11`. | Reuse this utility for `dives_in_view`; do not add duplicate bounds math. |
| Date dependency missing | `package.json` and lockfile contain no `@react-native-community/datetimepicker`; existing date library is `date-fns`. | Add DateTimePicker through Expo install in Phase 3.1 and rebuild the dev client before Maestro. |
| Migration security pattern | Phase 2 `map_location_rpcs.sql` uses `security definer`, `set search_path = public, extensions, pg_temp`, `auth.uid()` checks, explicit `revoke all ... from public`, `grant execute ... to authenticated`, and trigger gating for direct location writes. | Mirror this pattern for dive RPCs and direct table mutation blocking. |
| Unit test command | `package.json:20-22` defines `test`, `test:unit`, and `test:watch`; `test:unit` is `jest --runInBand`. | Keep `pnpm test:unit` in Phase 3 validation; do not use malformed `pnpm test -- --runInBand`. |

### Phase 3 Verified Facts vs Assumptions

| Item | Type | Criticality | Evidence / decision | Validation method |
|---|---:|---:|---|---|
| `DiveEvent` route is already typed and registered. | Fact | HIGH | `navigationTypes.ts:18`, `MainTabNavigator.tsx:36`, `app.tsx:52`. | `pnpm compile`; Maestro tab tap. |
| No dive schema/service/UI exists yet. | Fact | HIGH | Only placeholder screen exists at `PlaceholderScreens.tsx:25-27`; no current `diveEventService`. | Code grep before implementation. |
| One active dive per user is required. | Decision | HIGH | Old app used `onConflict: 'created_by'` and user request requires one active dive. | Unique constraint + `upsert_own_dive` duplicate test. |
| Spatial writes/search use RPCs, not direct table writes. | Decision | HIGH | Phase 2 pattern and user request require blocked direct mutations. | REST direct insert/update/delete negative checks. |
| Event date/time picker uses `@react-native-community/datetimepicker`. | Decision | MEDIUM | User-confirmed dependency direction; package not currently installed. | Expo install + dev-client rebuild + Maestro date/time flow. |
| Phase 3 has no chat or push scope. | Decision | HIGH | Chat remains Phase 4; push remains deferred. | Dependency/code/schema grep. |
| No new global state/cache library is needed. | Decision | MEDIUM | Map/location flows use local screen state and services; package lacks MobX/Zustand/React Query. | Dependency grep and code review. |
| `pnpm test:unit` is the valid unit-test command. | Fact | HIGH | `package.json:21` defines `test:unit` as `jest --runInBand`. | Run `pnpm test:unit`; avoid `pnpm test -- --runInBand`. |

No unresolved CRITICAL or HIGH Phase 3 assumptions remain. Analyzer should recheck the MEDIUM native DateTimePicker/dev-client assumption during implementation.

### Phase 3 Decisions Summary

| Decision | Chosen | Rejected | Rationale | Evidence |
|---|---|---|---|---|
| Persistence model | `dives` table with `unique(created_by)` | Multiple active dives per user | Matches v1 product rule and old app lesson; simplest user mental model. | Old app `diveStore.ts` upsert-on-`created_by`; user requirement. |
| Mutation path | `upsert_own_dive`, `delete_own_dive`, `get_own_dive` RPCs | Client direct `insert/update/delete` | Keeps ownership, coordinate order, and future validations server-side. | Phase 2 RPC-first pattern. |
| Discovery path | `dives_in_view(min_lat,min_long,max_lat,max_long)` returning sanitized event + creator public fields | Client-side filtering or table select | Prevents leaking raw/private fields and reuses map bounds pattern. | Existing `users_in_view` approach. |
| Direct `public.dives` access | No direct table access for app roles; own reads use `get_own_dive`, discovery reads use `dives_in_view` | Direct own-row `SELECT` RLS policy | Simplest secure approach: one RPC surface controls raw-field exposure, coordinate mapping, and future privacy rules. | Phase 2 RPC-first pattern; review feedback. |
| Coordinate invariant | Store with `ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography`; return latitude from `ST_Y`, longitude from `ST_X` | Lat/lng WKT reversal | Avoids swapped markers. | Phase 2 invariant and old app longitude-first writes. |
| UI state | Local screen state + service module | MobX/Zustand/React Query/global event store | One own event plus map search state is small; avoid unnecessary cache layer. | Current map state pattern. |
| Map event detail | Lightweight inline card/callout using existing components | New bottom-sheet dependency | KISS; `@gorhom/bottom-sheet` is still forbidden unless an implementation blocker is documented. | Phase 2 forbidden scope. |

### Phase 3.1: Dependency and Type Preparation
**Owner**: @implementer (mobile dependencies)
**Dependencies**: Phase 2 merged
**Complexity**: LOW

#### Tasks
- [ ] Add `@react-native-community/datetimepicker` with `npx expo install @react-native-community/datetimepicker`; update `package.json` and lockfile only for that dependency.
- [ ] Rebuild the Expo dev client before Maestro verification; document the exact command used in implementation notes.
- [ ] Add generated Supabase TypeScript type update step after Phase 3 migration (`supabase gen types --local > app/services/supabase/database.types.ts`) but do not hand-edit generated types.
- [ ] Verify `pnpm compile` still runs after dependency install.

#### Acceptance Criteria
- [ ] DateTimePicker dependency is present and version-compatible with the installed Expo SDK.
- [ ] Dev client rebuild is complete before UI flows run; no native-module-missing runtime error.
- [ ] No unrelated dependency, map provider, push, chat, avatar, or global-state package is added.

### Phase 3.2: Dive Schema, RLS, RPCs, and Direct Mutation Blocking
**Owner**: @implementer (Supabase schema/security)
**Dependencies**: Phase 3.1
**Complexity**: HIGH

#### Tasks
- [ ] Create `supabase/migrations/<timestamp>_dive_events.sql` on top of Phase 2 migrations.
- [ ] Add `public.dives` with minimum fields: `id uuid primary key default gen_random_uuid()`, `created_by uuid not null references public.profiles(id) on delete cascade`, `title text`, `description text not null`, `event_at timestamptz not null`, `location geography(Point,4326) not null`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, plus `unique(created_by)`.
- [ ] Add validation constraints: bounded description length (implementation target: 1-500 chars unless analyzer/user changes it), optional title length if title is included, and future date/time guard if product accepts it; keep constraints simple and server-side.
- [ ] Enable RLS on `public.dives` and choose the simplest secure access model: no direct app-role table reads or writes. Do not add an authenticated own-row direct `SELECT` policy unless a future analyzer-approved blocker requires it.
- [ ] Revoke direct table privileges for app roles where applicable (`anon`, `authenticated`) so REST access to raw `public.dives` is denied or returns no rows; all own reads must go through `get_own_dive`, and all discovery reads must go through sanitized `dives_in_view`.
- [ ] Add a `protect_dive_server_fields()` trigger (or equivalent trigger guard) with explicit coverage: `BEFORE INSERT OR UPDATE OR DELETE ON public.dives FOR EACH ROW`. It must allow the operation only when `coalesce(current_setting('app.dive_rpc', true), '') = 'on'`; otherwise raise an exception for direct client mutations.
- [ ] Implement `upsert_own_dive(p_lng double precision, p_lat double precision, p_event_at timestamptz, p_description text, p_title text default null)` as `security definer` with `set search_path = public, extensions, pg_temp`; require `auth.uid()`; call `perform set_config('app.dive_rpc', 'on', true)` before insert/update; write `created_by = auth.uid()`; use longitude first in `ST_MakePoint`; return the normalized own event.
- [ ] Implement `delete_own_dive()` as `security definer` with the same search path/auth requirement; call `perform set_config('app.dive_rpc', 'on', true)` before delete; delete only `created_by = auth.uid()`; return a minimal success row or deleted id.
- [ ] Implement `get_own_dive()` as authenticated `security definer` RPC returning the current user's own active dive or zero rows/null, without requiring a direct table `SELECT` policy and without leaking other users.
- [ ] Implement `dives_in_view(min_lat double precision, min_long double precision, max_lat double precision, max_long double precision)` as authenticated `security definer` RPC returning event id, description/title, `event_at`, latitude/longitude, and creator public fields only (`creator_id`, `display_name`, `summary`, `avatar_path` if already public/read-only); exclude raw email, raw geography, and private profile fields.
- [ ] Explicitly `revoke all on function ... from public` and `grant execute ... to authenticated` for all four RPCs.
- [ ] Add spatial indexes as needed (`gist(location)`) and a supporting index for `created_by`; avoid speculative indexes beyond current query paths.
- [ ] Regenerate Supabase types after local migration reset/up.

#### Acceptance Criteria
- [ ] `upsert_own_dive` creates the first dive and updates the same row on the second call by the same user; no duplicate `created_by` rows exist.
- [ ] `delete_own_dive` removes only the caller's dive.
- [ ] `get_own_dive` returns only the caller's active dive.
- [ ] `dives_in_view` includes in-bounds dives, excludes out-of-bounds dives, returns correct latitude/longitude, and returns only sanitized creator public fields.
- [ ] REST direct `SELECT * FROM public.dives` attempts as anonymous and authenticated client roles cannot read raw rows/fields, including the caller's own row and other users' rows; reads must use `get_own_dive` or `dives_in_view`.
- [ ] Direct table insert/update/delete attempts as anonymous and authenticated client roles fail or leave data unchanged; trigger errors must prove non-RPC writes/deletes cannot bypass ownership/coordinate validation.
- [ ] Anonymous RPC calls fail.

### Phase 3.3: Dive Event Service and Local State Contract
**Owner**: @implementer (services)
**Dependencies**: Phase 3.2
**Complexity**: MEDIUM

#### Tasks
- [ ] Add `app/services/dives/types.ts` or reuse a colocated type file with `DiveEvent`, `DiveEventInput`, `DiveEventMarker`, and service result types aligned with `app/services/location/types.ts`.
- [ ] Add `app/services/dives/diveEventService.ts` with `getOwnDive`, `upsertOwnDive`, `deleteOwnDive`, and `getDivesInView` wrappers around the four RPCs.
- [ ] Normalize RPC rows so the UI receives `{ coordinate: { latitude, longitude } }` and never handles raw PostGIS shapes.
- [ ] Convert Supabase errors into concise UI-safe messages; do not log tokens, JWTs, or raw SQL errors containing sensitive data.
- [ ] Keep state local to `DiveEventScreen` and `MapScreen`; do not add a new provider/store/cache unless analyzer confirms a blocker.
- [ ] Add or update pure unit tests only for normalizers/bounds-compatible logic if the repo has existing unit-test patterns; integration behavior remains psql/Hurl/Maestro.

#### Acceptance Criteria
- [ ] Screens import service functions instead of calling `supabase.rpc` directly.
- [ ] Service input names match SQL RPC parameter names.
- [ ] Coordinate mapping is covered by psql/API checks and, where practical, a pure normalizer unit test.
- [ ] Sign-out does not leave previous user's own dive visible after signing in as another user; screen reload reads through `getOwnDive`.

### Phase 3.4: DiveEvent Tab UI/UX/i18n
**Owner**: @implementer (mobile UI)
**Dependencies**: Phase 3.3
**Complexity**: MEDIUM

#### Tasks
- [ ] Replace placeholder `DiveEventScreen` with a real screen, preferably `app/screens/main/DiveEventScreen.tsx`, and update `PlaceholderScreens.tsx`/`MainTabNavigator.tsx` imports minimally.
- [ ] On mount, call `diveEventService.getOwnDive()` and render clear loading, empty, form, saved, error, and deleting/saving states.
- [ ] Add event date/time input using DateTimePicker; store an ISO/timestamptz-compatible value; format display with existing `date-fns`/locale patterns already loaded by the app.
- [ ] Add description input with visible character counter and server-aligned limit; disable save or show validation before RPC when malformed.
- [ ] Add location capture using current foreground location from the Phase 2 location permission flow/service pattern; if permission is denied, show non-blocking guidance and keep save disabled until a coordinate exists.
- [ ] Add save/update action through `upsertOwnDive`; add delete action through `deleteOwnDive` behind an explicit confirmation dialog using accessible, non-ambiguous destructive copy.
- [ ] Add all new visible strings to the existing i18n files; use stable ASCII accessibility labels/test IDs for Maestro (for example: `Dive event tab`, `Dive event save`, `Dive event delete confirm`).
- [ ] Apply existing theme spacing (`spacing.ts`) and refactoring-ui hierarchy: grouped form sections, constrained content width where applicable, de-emphasized metadata, accessible contrast, and clear destructive-action hierarchy.

#### Acceptance Criteria
- [ ] Empty state explains that the user can publish one active dive.
- [ ] Create, update, and delete flows work from the tab without leaving stale UI.
- [ ] Date/time, description, and coordinate validation errors are visible and translated.
- [ ] Confirmation is required before delete.
- [ ] All selectors used by Maestro are ASCII and stable, not Turkish-character text matches.

### Phase 3.5: Map Dive Markers and Event Detail Card
**Owner**: @implementer (map integration)
**Dependencies**: Phase 3.3
**Complexity**: MEDIUM

#### Tasks
- [ ] Extend `app/screens/main/MapScreen.tsx` with a separate `diveMarkers`/`selectedDive` local state collection while preserving existing diver `markers`/`selectedMarker` behavior.
- [ ] Reuse `calculateBounds(region)` inside the current search-area flow to call both `getUsersInView` and `getDivesInView`; if one request fails, show a scoped error without discarding successful results from the other request.
- [ ] Render dive markers with a visually distinct but accessible treatment (pin color/icon/title) that does not rely on color alone; keep map provider unchanged.
- [ ] Add a lightweight event detail card/callout showing event date/time, description/title, creator display name/summary, and a disabled/deferred chat affordance only if useful copy is needed; no chat navigation until Phase 4.
- [ ] Add i18n strings and ASCII accessibility labels for event marker/detail interactions.
- [ ] Capture screenshots for map with only users, only dives, both marker types, selected dive detail, and no-results/error states.

#### Acceptance Criteria
- [ ] Existing user location marker/search behavior from Phase 2 remains unchanged.
- [ ] Dive markers appear only after search/in-bounds RPC response and disappear/update when the next search excludes them.
- [ ] Event detail card contains sanitized creator public fields only.
- [ ] No bottom-sheet, clustering, Google provider, chat schema, or push dependency is introduced.

### Phase 3.6: Verification Bundle and Analyzer Gate
**Owner**: @implementer then @analyzer
**Dependencies**: Phase 3.2-3.5
**Complexity**: MEDIUM

#### Tasks
- [ ] Add Maestro `dive-event-create-update-delete.yaml` covering empty state, current location selection, DateTimePicker, description counter, save, update, delete confirmation, and post-delete empty state.
- [ ] Add Maestro `dive-event-map-search.yaml` covering seeded in-bounds/out-of-bounds events, map search, marker visibility, and detail card.
- [ ] Run the full prior Phase 1/2 regression flows, especially auth sign-in/restore/sign-out and map location add/search/delete.
- [ ] Run psql/API checks for unique/upsert behavior, coordinate order, RLS/RPC auth, direct table mutation denial, and sanitized `dives_in_view` columns.
- [ ] Run `pnpm compile && pnpm lint:check && pnpm test:unit && pnpm depcruise`.
- [ ] Provide Maestro screenshots for tab empty/form/saved/error/delete-confirmation and map event marker/detail states.
- [ ] Ask @analyzer for Gate 3 review of SQL security, UI/UX/i18n/accessibility, regression evidence, and scope exclusions.

#### Acceptance Criteria
- [ ] All Phase 3 validation checks pass or have documented, user-approved deferrals.
- [ ] Analyzer does not find CRITICAL/HIGH issues in schema/RLS/RPC, coordinate order, direct mutation blocking, or scope leakage.
- [ ] Evidence bundle includes commands, screenshots, and psql/API outputs sufficient for reproduction.

### Phase 3 Deliverables

| Phase | Files Created/Modified |
|---|---|
| 3.1 | `package.json`, lockfile, `app/services/supabase/database.types.ts` after migration |
| 3.2 | `supabase/migrations/<timestamp>_dive_events.sql`, generated database types |
| 3.3 | `app/services/dives/diveEventService.ts`, `app/services/dives/types.ts` or equivalent |
| 3.4 | `app/screens/main/DiveEventScreen.tsx`, `app/screens/main/PlaceholderScreens.tsx` if import cleanup is needed, i18n locale files |
| 3.5 | `app/screens/main/MapScreen.tsx`, optional small presentational component if needed for event detail card, i18n locale files |
| 3.6 | `.maestro/flows/dive-event-create-update-delete.yaml`, `.maestro/flows/dive-event-map-search.yaml`, optional Hurl/SQL verification notes/playbooks |

### Phase 3 Blast Radius / Affected Entry Points
- `DiveEvent` tab route: placeholder becomes a real create/update/delete screen.
- `Map` tab route: existing diver marker search gains parallel dive-event discovery and detail state.
- Supabase local schema: new `dives` table, RLS policies, triggers, RPC functions, grants/revokes, and generated types.
- Location permission/current coordinate UX: DiveEvent tab reuses Phase 2 foreground-location behavior; permission denial must remain non-blocking.
- Maestro mobile flows: new DateTimePicker/native-module path requires rebuilt dev client and stable ASCII selectors.

### Allowed in Phase 3
- Add the `dives` table and dive RPCs listed above.
- Add DateTimePicker dependency through Expo install and rebuild the dev client.
- Replace DiveEvent placeholder with create/update/delete own active dive UI.
- Add dive markers and a lightweight event detail card to MapScreen.
- Add i18n strings, accessibility labels, and Maestro/psql/API verification for events.

### Forbidden in Phase 3
- No chat tables, message UI, realtime chat subscriptions, or navigation to chat; Phase 4 owns chat.
- No push notifications or notification permissions.
- No Google Maps provider/API keys or Google OAuth.
- No avatar upload/storage buckets, image picker, signed URLs, or `avatarService`.
- No new global state/cache library (MobX/Zustand/React Query) unless a documented blocker is reviewed.
- No bottom-sheet/clustering dependency unless analyzer confirms the simple card is insufficient.
- No direct client table mutations for `dives`.
- No direct client table reads from `public.dives`; own-event reads use `get_own_dive`, and map discovery reads use sanitized `dives_in_view`.

### Phase 3 Invariants

| Invariant | Why it matters | How to verify |
|---|---|---|
| One active dive per user. | Prevents duplicate event clutter and matches product rule. | Unique constraint; second `upsert_own_dive` updates same row. |
| Dive writes happen only through RPCs. | Keeps ownership, validation, and coordinate order server-controlled. | Direct REST/table insert/update/delete negative checks. |
| Dive reads happen only through RPCs. | Prevents raw `public.dives` field exposure and keeps discovery sanitized. | REST direct select negative checks for anon/authenticated; positive `get_own_dive` and `dives_in_view` checks. |
| Coordinates use longitude first in writes and `ST_X/ST_Y` in reads. | Prevents swapped map markers. | psql `ST_X=longitude`, `ST_Y=latitude`; `dives_in_view` output check. |
| `dives_in_view` returns sanitized creator public fields only. | Prevents profile/email/geography leakage. | Inspect RPC return columns and REST output. |
| Existing user map markers still work. | Phase 2 behavior must not regress. | Phase 2 map Maestro suite and screenshots. |
| DiveEvent strings are i18n-backed and Maestro selectors are ASCII. | Prevents locale/test flakiness. | Changed-string review; Maestro hierarchy dump if selector fails. |
| No chat/push/avatar/Google scope enters Phase 3. | Keeps phase independently reviewable. | Dependency/schema/code grep. |

### Phase 3 Behavior That Must Not Change
- Phase 1 auth/session/profile/signout/reset-email flows still pass.
- Phase 2 location save/search/delete and user markers still pass.
- `Map`, `DiveEvent`, `Chat`, `Profile`, and `Settings` route values remain registered.
- Apple Maps default provider remains unchanged; no `PROVIDER_GOOGLE` appears.
- `profiles.avatar_path` remains read-only and avatar storage remains deferred to Phase 5.
- Reference old app remains read-only.

### Phase 3 Legacy / Malformed State Handling
- If a user has no dive row, `get_own_dive` returns null/empty and the DiveEvent tab shows the empty/create state.
- If a stale row has `description` or `event_at` violating new constraints, the migration should either normalize/delete local test data before constraints or fail loudly during local reset; do not hide corrupted event data in the app.
- If DateTimePicker native module is missing, rebuild the dev client; do not add a web fallback or alternate picker package.
- If location permission is denied, the form remains usable for text/date but save is disabled or blocked with clear guidance until a coordinate is available.
- If `dives_in_view` has malformed geography, fix the migration/test data; do not silently swap or guess coordinates client-side.

### Phase 3 Validation Matrix

| Check | Command / Method | Proves |
|---|---|---|
| Exact regression path | Maestro `dive-event-create-update-delete.yaml` | User can create, update, and delete own active dive. |
| Map discovery | Maestro `dive-event-map-search.yaml` + seeded events | In-bounds dive markers and detail card appear; out-of-bounds events do not. |
| Unique active dive | psql/API double `upsert_own_dive` for same user | No duplicate `created_by`; same row updates. |
| Coordinate order | psql after `upsert_own_dive(29,41,...)` | `ST_X(location::geometry)=29`, `ST_Y(location::geometry)=41`. |
| Direct select negative | REST direct `SELECT *` / PostgREST `GET /dives` as anonymous and authenticated users, including attempts to read another user's row/raw fields | Raw `public.dives` reads are not exposed; app must use `get_own_dive` and `dives_in_view`. |
| Direct mutation negative | REST direct insert/update/delete against `dives` as anonymous and authenticated users | Client cannot bypass RPCs/GUC-protected trigger. |
| RPC auth negative | Unauthenticated calls to all dive RPCs | Auth required. |
| Sanitized RPC output | Inspect `dives_in_view` response/schema | No email/raw geography/private fields leak. |
| Behavior preservation | Full Phase 1/2 Maestro suite + `pnpm compile && pnpm lint:check && pnpm test:unit && pnpm depcruise` | Auth/profile/map regressions remain intact. |
| Phase 3 i18n coverage | Compile/unit tests plus changed-string review | New strings follow existing i18n pattern. |
| Phase 3 UI/UX evidence | Maestro screenshots + analyzer UI/UX verdict | Event form/map detail meet hierarchy, spacing, contrast, and state requirements. |
| Scope exclusion | Grep migrations/code/deps for chat/push/Google/avatar/bottom-sheet/global-state additions | Phase 3 stays bounded. |

### Phase 3 Review Gates

| Gate | After Phase | Focus Area |
|---|---|---|
| Gate 3.1 | 3.2 | Dive schema, one-active-dive uniqueness, RLS, security-definer search paths, grants/revokes, direct mutation blocking, coordinate order. |
| Gate 3.2 | 3.4 | Service boundaries, no direct Supabase calls from UI, DateTimePicker/dev-client readiness, i18n and ASCII selectors. |
| Gate 3.3 | 3.5 | Map integration preserves Phase 2 behavior, sanitized detail card, no bottom-sheet/chat/push/Google/avatar leakage. |
| Gate 3.4 | 3.6 | Full evidence bundle: Maestro, psql/API, compile/lint/test/depcruise, screenshots, analyzer UI/UX verdict. |

### Phase 3 Risks and Rollback

| Risk | Likelihood | Impact | Mitigation / rollback |
|---|---:|---:|---|
| DateTimePicker native module fails without dev-client rebuild. | MEDIUM | MEDIUM | Rebuild dev client immediately after Expo install; rollback dependency commit if build fails. |
| Direct table writes remain accidentally possible. | LOW | HIGH | Trigger guard + RLS + REST negative checks + analyzer Gate 3.1. |
| Coordinate order is swapped. | MEDIUM | HIGH | Mandate `ST_MakePoint(lng,lat)` and psql `ST_X/ST_Y` check. |
| MapScreen grows too complex with user and dive marker state. | MEDIUM | MEDIUM | Keep changes local and small; extract only a presentational detail card if needed; no new global store. |
| Date/time validation differs between client and DB. | MEDIUM | MEDIUM | Align UI validation with DB constraints; psql negative checks for malformed values. |
| Scope creep into chat from event detail. | MEDIUM | MEDIUM | Keep any chat affordance disabled/deferred; Phase 4 owns schema/navigation. |

### Phase 3 Expected Commit Slices
1. Dependency/type prep: DateTimePicker install and generated type workflow note.
2. Migration: `dives` schema, RLS, triggers, RPCs, grants/revokes, type generation.
3. Service: `diveEventService` and types/normalizers.
4. UI: DiveEvent tab create/update/delete with i18n/accessibility.
5. Map: dive markers/detail card preserving Phase 2 behavior.
6. Verification: Maestro flows, psql/API checks, screenshots, analyzer evidence bundle.

## Phase 4: 1-on-1 Chat
**Owner**: @planner then @implementer (chat/realtime)
**Dependencies**: Phase 3 merged and verified
**Complexity**: HIGH

### Problem Statement
Add v1 1-on-1 messaging so authenticated divers can start a private conversation from map user details or dive-event creator details, view a conversation list, open a chat detail screen, send messages, and receive new-message updates in the active conversation through Supabase Realtime. Phase 4 must preserve the Phase 1-3 RPC-first/security posture and must not add push notifications, Google Maps, group chat, moderation/blocking UI, or unnecessary chat UI dependencies.

### Phase 4 Current State (Evidence)

| Area | Verified evidence | Implication |
|---|---|---|
| Chat tab shell exists | `app/navigators/MainTabNavigator.tsx:7,38` imports/registers `ChatScreen`; `app/navigators/navigationTypes.ts:19` has `Chat: undefined`; `app/app.tsx:53` maps `Chat` to `chat`. | Phase 4 replaces placeholder tab content and can keep the public tab route value. |
| Current Chat UI is placeholder | `app/screens/main/PlaceholderScreens.tsx:25` exports `ChatScreen` with “Chat coming next”. | Implement real conversation list/detail screens; remove or stop importing the placeholder for Chat. |
| No nested Chat stack yet | `navigationTypes.ts:16-22` has flat `MainTabParamList`; `AppNavigator.tsx:16-41` uses AppStack/AuthStack/MainTabs; no nested stack under Chat exists. | Add a small Chat nested native stack inside the Chat tab for `ConversationList` and `ConversationDetail`. |
| Route target was anticipated | Target route map already lists Phase 4 `ChatStack` and `Conversation { conversationId: string; opponentUserId?: string }`. | Align implementation with the existing route-map intent rather than adding a parallel navigation model. |
| Existing service pattern | Auth/profile/location/dive services use typed Supabase singleton, local row types, normalizers, and `ServiceResult<T>`; `app/services/dives/diveEventService.ts` already wraps Phase 3 RPCs. | Add `app/services/chat/chatService.ts` and chat types using the same style. |
| Realtime not used yet | No `supabase.channel(...)` / `.on('postgres_changes', ...)` usage exists in `app/`. | Phase 4 introduces the first realtime subscription; cleanup and review are important. |
| Map entry points exist as local detail panels | `app/screens/main/MapScreen.tsx:178-196` selects user/dive markers; `MapScreen.tsx:205-212` renders selected user detail; Phase 3 plan adds selected dive detail and explicitly defers chat navigation. | Add explicit “Message” actions to user and dive creator detail surfaces in Phase 4. |
| Chat dependencies absent | `react-native-gifted-chat` is not in `package.json`; `@supabase/supabase-js` v2.106.2 is installed and includes Realtime. | Prefer custom simple UI to avoid a dependency unless analyzer finds a blocker. |
| i18n structure | `app/i18n/en.ts` has `mapScreen` and `diveEventScreen` keys but no chat keys; locale files include `en`, `ar`, `es`, `fr`, `hi`, `ja`, `ko`. | Add `chatScreen` keys to all existing locales, following current i18n pattern. |
| Tests/scripts | `package.json:20-22` has `test`, `test:unit`, `test:watch`; `test:unit` is `jest --runInBand`. | Keep validation commands using `pnpm test:unit`. |
| Chat migrations absent | Existing migrations stop at Phase 3 `dives`; generated Supabase types include `profiles`/`dives` and no `conversations`, `conversation_participants`, or `messages`. | Add one new Phase 4 migration and regenerate `database.types.ts`. |

### Phase 4 Verified Facts vs Assumptions

| Item | Type | Criticality | Evidence / decision | Validation method |
|---|---:|---:|---|---|
| Chat tab route is already registered. | Fact | HIGH | `MainTabNavigator.tsx:38`, `navigationTypes.ts:19`, `app.tsx:53`. | `pnpm compile`; Maestro tab tap. |
| Chat is currently a placeholder and no ChatStack exists. | Fact | HIGH | `PlaceholderScreens.tsx:25`; flat `MainTabParamList`. | Code grep before implementation. |
| Supabase Realtime is available through installed `@supabase/supabase-js`; no extra realtime package is needed. | Fact | HIGH | `package.json` has `@supabase/supabase-js` v2.106.2; Supabase skill documents `.channel().on('postgres_changes')`. | Compile and runtime subscription smoke. |
| `react-native-gifted-chat` is not installed. | Fact | MEDIUM | Package grep. | Dependency grep. |
| Use custom simple chat UI instead of `react-native-gifted-chat`. | Decision | HIGH | See UI dependency decision table below. | Dependency grep; Maestro selectors; analyzer UI review. |
| Use RPC-shaped chat reads/writes with a Realtime read exception. | Decision | HIGH | RPCs remain the normal app path for conversation list/history/send; participant-only direct `messages` SELECT is allowed solely so Supabase Realtime can deliver row changes. | REST direct select positive/negative checks, RPC checks, realtime participant/nonparticipant checks. |
| Use Supabase Realtime `postgres_changes` for active conversation messages. | Decision | HIGH | User requirement and Supabase Realtime docs pattern. | App Maestro realtime flow plus optional WebSocket/wscat check. |
| No push, group chat, Google Maps, or blocking/moderation UI in Phase 4. | Decision | HIGH | User scope constraint. | Dependency/schema/code grep. |
| Minimal blocking/moderation schema is not needed for Phase 4. | Decision | MEDIUM | User said no blocking/account moderation unless minimal schema needed; participant-only 1:1 chat works without it. | Analyzer confirms no schema dependency. |

No unresolved CRITICAL or HIGH Phase 4 assumptions remain. Analyzer should recheck MEDIUM realtime direct-WebSocket feasibility and whether minimal moderation schema remains unnecessary before approval.

### Phase 4 Decisions Summary

| Decision | Chosen | Rejected | Rationale | Evidence |
|---|---|---|---|---|
| Chat UI implementation | Custom simple React Native chat list/detail components using existing Ignite theme/components | `react-native-gifted-chat` | KISS/DRY: v1 needs bubbles, timestamps, input, send button, empty/loading/error states. Custom UI avoids dependency weight, style overrides, keyboard/test-selector uncertainty, and i18n/accessibility surprises. | Package absent; existing theme/screens; Maestro stability requirement. |
| Navigation | Nested `ChatStack` inside existing `Chat` tab with list and detail routes | New top-level app route or setTimeout navigation hack | Preserves tab route, supports list/detail flow, and gives Map/Dive entry points a typed navigation target. | Existing React Navigation stack/tab architecture. |
| Data access | RPCs are the app's normal shaped read/write path; `public.messages` additionally has participant-only `SELECT` for Realtime | Direct app reads of `conversations` / `conversation_participants`; direct message mutations | Supabase Realtime `postgres_changes` requires row visibility through RLS. KISS path: allow participants to see raw message rows, keep conversation/list shaping in RPCs, and block all direct mutations. | Analyzer feedback; Supabase Realtime/RLS behavior. |
| Conversation identity | Store canonical unordered pair using generated columns or least/greatest pair uniqueness; participants table remains source for membership | Client-side duplicate checks | Prevents duplicate 1:1 conversations under races. | Old app `upsert_conversation`; Phase invariant. |
| Realtime | Subscribe to `postgres_changes` `INSERT` on `messages` for the current conversation; support it with participant-only `messages` SELECT RLS and cleanup channel on unmount/conversation switch | Polling or global all-message subscription | Meets realtime requirement with minimal blast radius and no push while making the RLS/direct-read exception explicit. | Supabase Realtime `postgres_changes` pattern; analyzer feedback. |
| Scope | 1-on-1 messages only; no push/group/moderation UI | Group chat, notifications, blocking/account moderation | User scope and YAGNI. Participant-only RLS is sufficient for v1. | User request. |

### Phase 4.1: Chat Schema, RLS, RPCs, and Realtime Publication
**Owner**: @implementer (Supabase schema/security/realtime)
**Dependencies**: Phase 3 merged
**Complexity**: HIGH

#### Tasks
- [ ] Create `supabase/migrations/<timestamp>_chat_conversations.sql` on top of Phase 3 migrations.
- [ ] Add `public.conversations` with `id uuid primary key default gen_random_uuid()`, `created_at`, `updated_at`, and canonical pair columns for v1 1-on-1 uniqueness (for example `participant_low uuid not null`, `participant_high uuid not null`, `check (participant_low < participant_high)`, `unique(participant_low, participant_high)`).
- [ ] Add `public.conversation_participants` with `conversation_id`, `profile_id`, `created_at`, primary/unique key on `(conversation_id, profile_id)`, and foreign keys to `conversations` and `profiles`; ensure exactly two participants are inserted by the RPC for v1.
- [ ] Add `public.messages` with `id uuid primary key default gen_random_uuid()`, `conversation_id`, `sender_id`, `body text not null`, `created_at`, optional `updated_at`, and length constraints (implementation target: 1-1000 chars unless analyzer/user changes it).
- [ ] Enable RLS on all three tables. Keep `conversations` and `conversation_participants` direct app-role reads blocked; shaped list/detail metadata reads go through RPCs.
- [ ] Add a participant-only `SELECT` policy on `public.messages` specifically to support Supabase Realtime `postgres_changes` and participant direct visibility of message rows. Document this as the only Phase 4 direct-read exception: RPCs remain the app's normal history/list read path for shaped data, but participants may select raw rows from `messages` by RLS.
- [ ] Add trigger guards for direct mutations: `BEFORE INSERT OR UPDATE OR DELETE` on `conversations`, `conversation_participants`, and `messages`; allow only when `coalesce(current_setting('app.chat_rpc', true), '') = 'on'`, otherwise raise.
- [ ] Implement `upsert_conversation(other_user_id uuid)` as `security definer` with `set search_path = public, pg_temp`; require `auth.uid()`, reject self-conversation, canonicalize unordered pair, `set_config('app.chat_rpc','on', true)`, insert conversation/participants idempotently, and return conversation id plus sanitized opponent public fields.
- [ ] Implement `get_conversations_with_latest_message()` as authenticated `security definer` RPC returning only conversations where `auth.uid()` is a participant, latest message preview/timestamp/sender, unread count only if cheap/simple, and sanitized opponent public fields (`id`, `display_name`, `summary`, `avatar_path` if public/read-only); do not return emails/private fields.
- [ ] Implement `get_messages_by_conversation_id(input_conversation_id uuid, before_message_created_at timestamptz default null, page_size int default 50)` as authenticated `security definer` RPC; verify caller is a participant; return messages ordered for UI pagination with sanitized sender public fields.
- [ ] Implement `send_message(input_conversation_id uuid, input_body text)` as authenticated `security definer` RPC; verify caller is a participant; validate body length/trim; set `app.chat_rpc` before insert; return the inserted normalized message.
- [ ] Explicitly `revoke all on function ... from public` and `grant execute ... to authenticated` for chat RPCs; revoke direct table privileges from `anon` where applicable; grant only the minimum table privileges required for authenticated realtime `SELECT` on `messages` and no direct mutation privileges.
- [ ] Add `messages` to Supabase realtime publication (`alter publication supabase_realtime add table public.messages`) and document that participant-only `messages` SELECT RLS governs which clients can receive row events.
- [ ] Add indexes for current paths only: unique canonical pair, participant lookup by profile, messages by `(conversation_id, created_at desc)`.
- [ ] Regenerate Supabase types after migration.

#### Acceptance Criteria
- [ ] Double-calling `upsert_conversation(other_user_id)` from either participant returns the same conversation id and creates exactly one conversation with two participant rows.
- [ ] Nonparticipants cannot read conversations/messages or send into the conversation via RPC.
- [ ] Participant can direct `SELECT` only messages in their own conversations; nonparticipant and anonymous users cannot direct-select those message rows.
- [ ] Direct REST/table select against `conversations` and `conversation_participants` as anon/authenticated remains blocked or returns no raw rows; shaped conversation reads use RPCs.
- [ ] Direct REST/table insert/update/delete against chat tables as anon/authenticated fails or leaves data unchanged.
- [ ] `messages` is present in the realtime publication; participant clients receive realtime inserts for their conversations; nonparticipant clients do not.

### Phase 4.2: Chat Service and Realtime Subscription Adapter
**Owner**: @implementer (services/realtime)
**Dependencies**: Phase 4.1
**Complexity**: MEDIUM

#### Tasks
- [ ] Add `app/services/chat/types.ts` with `ConversationSummary`, `ChatMessage`, `ChatParticipant`, `SendMessageInput`, and service result types matching existing service style.
- [ ] Add `app/services/chat/chatService.ts` with wrappers for `upsertConversation`, `getConversationsWithLatestMessage`, `getMessagesByConversationId`, and `sendMessage`.
- [ ] Add a small subscription helper such as `subscribeToConversationMessages(conversationId, onMessage, onError)` that uses `supabase.channel(...)`, `.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'conversation_id=eq.<id>' }, ...)`, and returns an unsubscribe cleanup function using `supabase.removeChannel(channel)`.
- [ ] Keep realtime subscription lifecycle owned by the chat detail screen; do not create a global realtime provider/store in Phase 4.
- [ ] Normalize payloads so RPC history/list UI uses shaped data. Realtime payloads may contain raw `messages` rows visible to participants by RLS; if payload lacks sanitized sender fields, fetch/merge through `get_messages_by_conversation_id` or append with known participant context and refetch on remote insert.
- [ ] Convert Supabase/realtime errors to UI-safe messages without logging JWTs, tokens, raw SQL, or private fields.
- [ ] Add pure unit tests only for normalizers/dedupe helpers if useful; integration remains psql/Hurl/Maestro/WebSocket.

#### Acceptance Criteria
- [ ] Screens call `chatService` methods instead of calling `supabase.rpc` or `supabase.channel` directly except through the adapter.
- [ ] Subscription cleanup runs on unmount and conversation id changes.
- [ ] Duplicate messages from optimistic send + realtime insert are deduped by message id.
- [ ] Sign-out/remount does not show previous user's conversations/messages.

### Phase 4.3: Navigation and Entry Points from Map/Dive Details
**Owner**: @implementer (navigation/integration)
**Dependencies**: Phase 4.2
**Complexity**: MEDIUM

#### Tasks
- [ ] Add `ChatStackParamList` with `ConversationList: undefined` and `ConversationDetail: { conversationId: string; opponentUserId?: string; opponentDisplayName?: string }`.
- [ ] Replace `Chat` tab placeholder with a nested native stack navigator that renders `ConversationListScreen` and `ConversationDetailScreen` while preserving the outer `Chat` tab route and `chat` deep link.
- [ ] Extend linking config to support nested chat detail only if needed; keep deep-link changes minimal and typed.
- [ ] Add a `Message` action to MapScreen selected user detail that calls `chatService.upsertConversation(marker.userId)` and navigates to `Chat -> ConversationDetail` with the returned id; no `setTimeout` navigation hack.
- [ ] Add a `Message organizer` action to Phase 3 dive event detail card for the event creator, using the same `upsertConversation` path; disable/hide when the event creator is the current user.
- [ ] Handle loading/error states for start-conversation actions inline without blocking map search results.
- [ ] Add i18n strings and stable ASCII accessibility labels for entry points (`Message diver`, `Message event organizer`, `Chat conversation detail`).

#### Acceptance Criteria
- [ ] Chat tab opens the conversation list.
- [ ] Starting a conversation from a user marker navigates to the detail screen with no navigation race/hack.
- [ ] Starting from a dive event creator detail uses the same idempotent RPC and does not duplicate conversations.
- [ ] Existing Map and DiveEvent marker/detail behavior remains unchanged except for the added message action.

### Phase 4.4: Conversation List UI
**Owner**: @implementer (mobile UI)
**Dependencies**: Phase 4.2-4.3
**Complexity**: MEDIUM

#### Tasks
- [ ] Add `app/screens/main/chat/ConversationListScreen.tsx` or equivalent under the current screen structure.
- [ ] On focus/mount, call `getConversationsWithLatestMessage` and render loading, empty, populated, refreshing, and error states.
- [ ] Render each conversation row with opponent display name, optional summary/avatar placeholder, latest message preview, timestamp, and unread indicator only if Phase 4.1 implemented unread cheaply; otherwise omit unread for v1.
- [ ] Use existing Ignite components/theme spacing and refactoring-ui hierarchy: strong opponent name, de-emphasized timestamp/preview, grouped empty-state action copy, accessible contrast.
- [ ] Pull-to-refresh if consistent with existing list patterns; otherwise provide retry button in error state.
- [ ] Add i18n keys to all locale files and ASCII accessibility labels/test IDs for Maestro.

#### Acceptance Criteria
- [ ] Empty state explains conversations start from diver/event details.
- [ ] Populated list opens the correct `ConversationDetail`.
- [ ] Latest message preview updates after sending a message and returning to the list.
- [ ] UI screenshots cover empty, populated, loading/error, and refreshed states.

### Phase 4.5: Conversation Detail UI and Realtime Updates
**Owner**: @implementer (mobile UI/realtime)
**Dependencies**: Phase 4.2-4.4
**Complexity**: HIGH

#### Tasks
- [ ] Add `ConversationDetailScreen` with message history loading via `getMessagesByConversationId`, simple pagination/load-older if needed, and an active `subscribeToConversationMessages` subscription.
- [ ] Build custom simple chat UI: `FlatList`/`ScrollView` message bubbles, own-vs-other alignment, timestamp treatment, text input, send button, keyboard-safe layout, loading/sending/error states.
- [ ] Keep message body validation consistent with DB constraints; trim empty messages and show translated error copy.
- [ ] On `sendMessage`, optimistically or post-RPC append the returned message, disable duplicate sends while pending, and dedupe if realtime returns the same message.
- [ ] Realtime handler appends only messages for the current conversation and ignores/handles stale channel events after cleanup.
- [ ] Clean up channel subscription on unmount, sign-out, and conversation id change.
- [ ] Add i18n keys and ASCII accessibility labels for input/send/error/loading states; avoid Turkish-character selectors.
- [ ] Capture screenshots for empty conversation, sent message, received realtime message, sending state, and error state.

#### Acceptance Criteria
- [ ] User can send a message and see it persist after leaving/reopening the conversation.
- [ ] A second participant's new message appears in the active conversation through realtime without manual refresh, or the implementation documents why Maestro verifies this through a controlled second-client/API insert plus app update.
- [ ] Keyboard-safe layout keeps input visible and tappable.
- [ ] Channel cleanup prevents duplicate messages after navigating away and back.

### Phase 4.6: Verification Bundle and Analyzer Gate
**Owner**: @implementer then @analyzer
**Dependencies**: Phase 4.1-4.5
**Complexity**: MEDIUM

#### Tasks
- [ ] Add Maestro `chat-start-from-user-marker.yaml`: sign in, use map search, open a user marker detail, tap message action, send message, return to list, assert conversation appears.
- [ ] Add Maestro `chat-start-from-dive-event.yaml`: open dive event marker/detail, tap organizer message action, send message, assert same list/detail behavior.
- [ ] Add Maestro `chat-realtime-message.yaml`: use two seeded participants or API-assisted message insert while the active conversation is open; assert new message appears without manual refresh if feasible.
- [ ] Run psql/API checks: idempotent `upsert_conversation`, unordered pair uniqueness, participant-only RPC access, nonparticipant read/send denial, participant-only direct `messages` SELECT, blocked direct reads for `conversations`/`conversation_participants`, direct mutation denial, sanitized profile fields only, and realtime publication includes `messages`.
- [ ] Realtime/WebSocket verification: prefer a small `wscat`/`websocat` or `python3 websockets` smoke against local Supabase Realtime only if token/channel protocol setup is practical in implementation time; otherwise document why direct WebSocket verification is deferred and rely on DB/API + app realtime Maestro evidence.
- [ ] Run full prior Phase 1-3 regression flows, especially auth restore/sign-out, map location/search, dive event create/update/delete, and map dive marker search.
- [ ] Run `pnpm compile && pnpm lint:check && pnpm test:unit && pnpm depcruise`.
- [ ] Provide screenshots for conversation list empty/populated/error and detail empty/sent/received/sending/error states.
- [ ] Ask @analyzer for Gate 4 review of SQL security, realtime lifecycle, navigation, UI/UX/i18n/accessibility, regression evidence, and scope exclusions.

#### Acceptance Criteria
- [ ] All Phase 4 validation checks pass or have documented, user-approved deferrals.
- [ ] Analyzer finds no CRITICAL/HIGH issues in participant isolation, direct access posture, realtime cleanup, navigation, or scope leakage.
- [ ] Evidence bundle includes reproducible commands, psql/API outputs, Maestro results, and screenshots.

### Phase 4 Deliverables

| Phase | Files Created/Modified |
|---|---|
| 4.1 | `supabase/migrations/<timestamp>_chat_conversations.sql`, generated `app/services/supabase/database.types.ts` |
| 4.2 | `app/services/chat/chatService.ts`, `app/services/chat/types.ts`, optional normalizer unit tests |
| 4.3 | `app/navigators/navigationTypes.ts`, `app/navigators/MainTabNavigator.tsx`, optional `ChatNavigator.tsx`, `app/app.tsx`, `app/screens/main/MapScreen.tsx` |
| 4.4 | `app/screens/main/chat/ConversationListScreen.tsx`, i18n locale files |
| 4.5 | `app/screens/main/chat/ConversationDetailScreen.tsx`, optional small presentational bubble/composer components, i18n locale files |
| 4.6 | `.maestro/flows/chat-start-from-user-marker.yaml`, `.maestro/flows/chat-start-from-dive-event.yaml`, `.maestro/flows/chat-realtime-message.yaml`, optional Hurl/SQL/WebSocket verification notes |

### Phase 4 Blast Radius / Affected Entry Points
- `Chat` tab route: placeholder becomes nested conversation list/detail stack.
- `Map` tab route: selected user and selected dive detail cards gain message entry points.
- Supabase schema: new chat tables, RLS, trigger guards, RPCs, grants/revokes, realtime publication for messages, generated types.
- Supabase realtime client lifecycle: first use of `supabase.channel()` and channel cleanup.
- i18n/locale files and Maestro flows for chat UI and stable selectors.

### Allowed in Phase 4
- Add 1-on-1 chat schema, participant table, message table, chat RPCs, RLS, trigger guards, grants/revokes, and realtime publication for messages.
- Add Chat nested stack/list/detail UI in current React Navigation architecture.
- Add message entry points from map user detail and dive event creator detail.
- Add custom simple message bubbles/composer using existing components/theme.
- Add Supabase Realtime `postgres_changes` subscription for current conversation messages.
- Add i18n strings, accessibility labels, Maestro/API/psql/realtime verification.

### Forbidden in Phase 4
- No push notifications, notification permissions, or background push delivery.
- No group chat or conversations with more than two participants.
- No Google Maps/provider/API keys or Google OAuth.
- No avatar upload/storage changes.
- No blocking/account moderation UI or schema unless analyzer identifies a security blocker; current plan intentionally omits it.
- No `react-native-gifted-chat` or other chat UI dependency unless custom UI fails a documented blocker and user/analyzer approve.
- No direct app table reads for `conversations` or `conversation_participants`; use RPCs for shaped conversation/list metadata.
- No direct app message history/list reads as the normal app path; use `get_messages_by_conversation_id` for shaped history. Exception: participant-only direct `SELECT` on `public.messages` is allowed by RLS to support Supabase Realtime row visibility.
- No direct app table mutations for `conversations`, `conversation_participants`, or `messages`; writes go through RPCs.
- No service-role keys in app code.

### Phase 4 Invariants

| Invariant | Why it matters | How to verify |
|---|---|---|
| Conversations are unique by unordered participant pair. | Prevents duplicate 1:1 threads. | Double `upsert_conversation` from both participants returns same id and one row. |
| Only participants can read conversation summaries/messages. | Privacy/security. | RPC negative checks; participant-only direct `messages` SELECT; direct table select denial for nonparticipant/anon. |
| Only participants can send messages. | Prevents spam/injection into private threads. | `send_message` negative as nonparticipant. |
| Chat direct table mutations are blocked. | Preserves server-side validation and participant checks. | REST direct insert/update/delete negative checks. |
| Chat raw table reads are limited. | Supports Realtime without leaking conversation metadata. | `messages` direct SELECT succeeds only for participants; `conversations` and `conversation_participants` direct reads remain blocked; anon/nonparticipant reads fail. |
| RPC outputs contain sanitized profile fields only. | Prevents profile/email leakage. | Inspect `get_conversations...` and message RPC responses. |
| Realtime channels are scoped by participant-visible messages and cleaned up. | Prevents duplicate events, stale auth, and nonparticipant leaks. | Participant receives own conversation insert; nonparticipant does not; navigate away/back and verify one rendered message per insert; code review cleanup. |
| UI uses i18n and ASCII Maestro selectors. | Prevents locale/test flakiness. | Changed-string review and Maestro hierarchy dump if selectors fail. |
| No push/group/moderation/Google/avatar scope enters Phase 4. | Keeps phase bounded. | Dependency/schema/code grep. |

### Phase 4 Behavior That Must Not Change
- Phase 1 auth/session/profile/signout/reset-email flows still pass.
- Phase 2 map location save/search/delete and user markers still pass.
- Phase 3 dive event create/update/delete and dive markers/detail cards still pass.
- `Map`, `DiveEvent`, `Chat`, `Profile`, and `Settings` tab route values remain registered.
- Apple Maps default provider remains unchanged; no `PROVIDER_GOOGLE` appears.
- `profiles.avatar_path` remains read-only and avatar storage remains deferred to Phase 5.
- Reference old app remains read-only.

### Phase 4 Legacy / Malformed State Handling
- If a user has no conversations, Chat tab shows an empty state and points users to map/dive details to start a message.
- If a conversation has missing or duplicate participants due to local test data corruption, RPCs should fail loudly during psql/API verification; do not hide corrupted membership in the app.
- If a message row has an empty/oversized body, migration constraints or RPC validation should reject it; UI should not attempt to render invalid persisted message bodies silently.
- If realtime connection is unavailable, chat detail still loads persisted messages and send RPC still works; UI shows a non-blocking realtime/offline warning and can refresh manually.
- If the app receives a realtime payload for a conversation that is no longer active, ignore it after cleanup or route it only through a future global notification system; do not update the wrong screen.

### Feature Flag Rationale
- No feature flag is planned for Phase 4 because chat is introduced after Phase 1-3 are merged in a local/pre-release app and is covered by schema rollback plus UI route rollback.
- If a deployed environment exists before Phase 4, implementation may add a simple environment/config gate for Chat tab visibility only with analyzer approval; do not build a generalized feature-flag system.

### Phase 4 Validation Matrix

| Check | Command / Method | Proves |
|---|---|---|
| Exact regression path | Maestro `chat-start-from-user-marker.yaml` | User can start conversation from map user marker and send a message. |
| Dive entry path | Maestro `chat-start-from-dive-event.yaml` | User can start conversation from dive event creator detail and send a message. |
| Realtime behavior | Maestro `chat-realtime-message.yaml` using second client/API-assisted insert while detail is open | New message appears without manual refresh, or documented fallback evidence is accepted. |
| Idempotent conversation | psql/API double `upsert_conversation` from both users | Same conversation id and no duplicate unordered pair. |
| Participant-only access | RPC calls as participant vs nonparticipant | Nonparticipants cannot list/read/send. |
| Message direct select positive/negative | REST direct select on `messages` as participant, nonparticipant, and anon | Participant can select own conversation messages for Realtime support; nonparticipant/anon cannot. |
| Conversation metadata direct select negative | REST direct selects on `conversations` and `conversation_participants` as anon/authenticated | Raw conversation metadata rows are not exposed; shaped reads use RPCs. |
| Direct mutation negative | REST direct insert/update/delete on chat tables as anon/authenticated | Client cannot bypass RPCs/trigger guards. |
| Realtime publication/RLS | psql `pg_publication_tables` includes `public.messages`; optional WebSocket smoke as participant/nonparticipant | Message inserts are eligible for Supabase Realtime and delivered only to participant-visible subscribers. |
| Sanitized RPC output | Inspect conversation/message RPC responses | No email/private/raw fields leak. |
| Behavior preservation | Full Phase 1-3 Maestro suite + `pnpm compile && pnpm lint:check && pnpm test:unit && pnpm depcruise` | Prior flows remain intact. |
| Phase 4 i18n coverage | Compile/unit tests plus changed-string review | New chat strings follow existing i18n pattern. |
| Phase 4 UI/UX evidence | Maestro screenshots + analyzer UI/UX verdict | List/detail/composer meet hierarchy, spacing, contrast, and state requirements. |
| Scope exclusion | Grep migrations/code/deps for push/group/Google/avatar/gifted-chat/moderation additions | Phase 4 stays bounded. |

### Phase 4 Review Gates

| Gate | After Phase | Focus Area |
|---|---|---|
| Gate 4.1 | 4.1 | Schema, unordered-pair uniqueness, participant-only RPCs, explicit `messages` SELECT exception for Realtime, conversation metadata direct-read blocking, direct mutation blocking, grants/revokes, realtime publication. |
| Gate 4.2 | 4.2 | Service boundaries, realtime subscription adapter, cleanup, dedupe, no direct Supabase calls from UI. |
| Gate 4.3 | 4.3 | Navigation typing, no setTimeout hack, Map/Dive entry point regression, no duplicate conversation creation. |
| Gate 4.4 | 4.5 | Conversation list/detail UI, keyboard-safe composer, i18n, ASCII selectors, screenshots, custom UI adequacy. |
| Gate 4.5 | 4.6 | Full evidence bundle: Maestro, psql/API, realtime/WebSocket evidence or justified fallback, compile/lint/test/depcruise, analyzer verdict. |

### Phase 4 Risks and Rollback

| Risk | Likelihood | Impact | Mitigation / rollback |
|---|---:|---:|---|
| Realtime RLS/publication setup is wrong and messages do not arrive live. | MEDIUM | HIGH | psql publication check, app Maestro realtime flow, optional WebSocket smoke; fallback to persisted reload while fixing migration. |
| Duplicate conversations under races. | MEDIUM | HIGH | DB unique canonical pair + idempotent `upsert_conversation`; psql double-call tests. |
| Direct chat table access leaks raw/private fields. | LOW | HIGH | Allow only participant `messages` SELECT for Realtime; keep conversation metadata direct reads blocked; direct select positive/negative checks; analyzer Gate 4.1. |
| Channel cleanup bug duplicates messages after navigation. | MEDIUM | MEDIUM | Explicit cleanup helper, dedupe by message id, navigate-away/back Maestro check. |
| Keyboard/composer UI is flaky on simulator. | MEDIUM | MEDIUM | Custom simple UI, keyboard-safe layout, Maestro screenshots/hierarchy. |
| Scope creep to push/group/moderation. | MEDIUM | MEDIUM | Forbidden scope checks and commit slice review. |

### Phase 4 Expected Commit Slices
1. Migration: chat schema, RLS, trigger guards, RPCs, grants/revokes, realtime publication, type generation.
2. Service/realtime: `chatService`, types, subscription adapter, normalizer/dedupe tests.
3. Navigation/entry points: ChatStack plus Map/Dive message actions.
4. Conversation list UI with i18n/accessibility.
5. Conversation detail UI with composer and realtime lifecycle.
6. Verification: Maestro chat flows, psql/API/realtime checks, screenshots, analyzer evidence bundle.

## Phase 5: Profile, Settings, Privacy Completion
**Owner**: @planner then @implementer (settings/privacy/auth-storage)
**Dependencies**: Phase 4 merged and verified
**Complexity**: HIGH

### Problem Statement
Complete the personal profile and settings surfaces after auth, maps, events, and chat are stable. Phase 5 adds avatar upload/storage, polished profile editing, richer settings, sign-out confirmation, persisted theme preference controls, signed-in password change, and a local/testable reset-password deep-link completion path. It must keep existing security invariants: avatar changes are owner-only, server-owned profile fields remain protected, storage is private, and there is no push, Google OAuth/Maps, or account deletion.

### Phase 5 Current State (Evidence)

| Area | Verified evidence | Implication |
|---|---|---|
| Profile route/screen exists | `app/navigators/MainTabNavigator.tsx:39` registers `Profile`; `navigationTypes.ts:25-31` includes `Profile`; `app/screens/main/ProfileScreen.tsx:12-89` edits `display_name`, `summary`, `is_first_login`, and shows email read-only. | Enhance existing screen; do not replace navigation model. |
| Settings route/screen is basic | `MainTabNavigator.tsx:40` registers `Settings`; `SettingsScreen.tsx:11-24` is a stub with static links and sign-out. | Replace stub with sectioned settings UI and confirmation flows. |
| Theme provider supports overrides | `app/theme/context.tsx:54-133` persists `ignite.themeScheme` with MMKV; `setThemeContextOverride("dark" | "light" | undefined)` exists; `DemoDebugScreen.tsx:37-72` demonstrates toggling/system reset. | Add system/light/dark selector in settings using existing provider/storage. |
| Auth reset/sign-out exists, password change absent | `AuthContext.tsx:148-155` signs out; `AuthContext.tsx:128-133` sends reset email; `authService.ts:40-53` has reset/signout; no `updatePassword`/`updateUser`. | Add signed-in password update support and reset completion handler. |
| Reset deep link needs manual handling | Supabase client has `detectSessionInUrl: false`; `app.json:4` scheme is `divingbuddies`; `app/app.tsx:38-64` has linking config but no `UpdatePassword` route/handler. | Add explicit recovery-link parsing + `supabase.auth.setSession()` before update-password screen. |
| Profile service selects avatar but cannot update it | `profileService.ts:27-38` selects `avatar_path`; `ProfilePatch` only allows display name, summary, `is_first_login`. | Add a reviewed avatar RPC/service path, not direct profile mutation. |
| DB trigger blocks avatar_path | `protect_profile_server_fields()` in Phase 1/2 migrations blocks `avatar_path` as “reserved for Phase 5 avatar storage”; location bypass uses `app.location_rpc`. | Relax trigger only behind a new avatar-specific RPC/GUC guard. |
| Storage available but no bucket | `supabase/config.toml:109-119` enables storage; no migrations create `avatars`; no seed file bucket. | Add private `avatars` bucket and storage policies in migration/config. |
| Image deps absent | `expo-image-picker` and `expo-image-manipulator` are not in `package.json`. | Add `expo-image-picker`; add `expo-image-manipulator` only if resizing/cropping is part of implementation. |
| iOS photo permission absent | `app.json`/`app.config.ts` include location permission but no photo/camera usage descriptions. | Add photo-library usage text; camera only if camera capture is included. |
| i18n gaps | Existing locales have no `profileScreen` or `settingsScreen` keys; current profile/settings strings are hardcoded. | Add profile/settings/avatar/password keys to all locale files. |
| Tests gap | No profile/settings Maestro flows exist; `package.json:20-22` has `test:unit = jest --runInBand`. | Add Phase 5 Maestro/API/psql coverage; keep `pnpm test:unit`. |

### Phase 5 Verified Facts vs Assumptions

| Item | Type | Criticality | Evidence / decision | Validation method |
|---|---:|---:|---|---|
| Profile and Settings tabs already exist. | Fact | HIGH | `MainTabNavigator.tsx:39-40`, `navigationTypes.ts:25-31`. | `pnpm compile`; Maestro tab taps. |
| `avatar_path` is currently protected by DB trigger. | Fact | HIGH | Phase 1/2 `protect_profile_server_fields()` raises for avatar changes. | Direct REST update negative before Phase 5; gated RPC positive after. |
| Avatar bucket does not exist. | Fact | HIGH | No storage bucket migration; storage config only enables storage. | psql `storage.buckets` query. |
| `expo-image-picker` is required for avatar selection. | Decision | HIGH | User requirement + dependency absent. | Expo install + dev-client rebuild + photo picker Maestro/manual evidence. |
| Use `expo-image-manipulator` only if resizing/cropping is implemented. | Decision | MEDIUM | Avoid extra dependency if `fetch(uri).arrayBuffer()` upload plus bucket size/mime constraints suffice. | Dependency grep; analyzer review of image size/perf. |
| Avatar upload can use `fetch(uri).arrayBuffer()` without extra binary dependencies. | Assumption | MEDIUM | User notes this preferred KISS path; Expo/RN commonly supports URI fetch. | Implementation smoke on simulator with picked image. |
| Theme toggle should use existing `ThemeProvider` override. | Decision | HIGH | `setThemeContextOverride` already supports light/dark/system. | Settings Maestro theme flow; MMKV key check if needed. |
| Signed-in password change uses Supabase `updateUser({ password })`. | Decision | HIGH | Supabase auth supports current-session password update; no service method yet. | API/UI flow sign in with new password. |
| Current-password reauth is not required in Phase 5. | Decision | MEDIUM | Supabase `updateUser` requires active session; adding reauth increases UX/API complexity. | Analyzer security review; optional future hardening. |
| Reset-password completion is feasible locally with custom recovery deep-link handling. | Decision | HIGH | App has scheme/linking; Inbucket available; client has `detectSessionInUrl:false`, so manual `setSession` is required. | Inbucket extraction + `openLink` + update password + sign in with new password. |
| No account deletion in Phase 5. | Decision | HIGH | User explicitly excludes unless separately reviewed. | Scope grep. |

No unresolved CRITICAL or HIGH Phase 5 assumptions remain. Analyzer should recheck MEDIUM assumptions around image resizing dependency and current-password reauth during implementation review.

### Phase 5 Decisions Summary

| Decision | Chosen | Rejected | Rationale | Evidence |
|---|---|---|---|---|
| Avatar storage/read model | Private Supabase `avatars` bucket; owner-only writes/deletes/list; authenticated users may read avatar objects only when object path is referenced by a visible profile/domain row | Public bucket; SQL-generated signed URLs; owner-only reads that break map/dive/chat avatar display | Supabase SQL cannot simply mint storage signed URLs, and the app needs to show other users' avatars in map/dive/chat/profile. KISS safe path: private bucket plus authenticated read policy constrained to referenced `profiles.avatar_path`; anonymous stays denied. | Supabase storage skill; analyzer feedback. |
| Avatar path update | `update_own_avatar_path(path text)` RPC guarded by `app.avatar_rpc`, validating caller-owned path prefix/pattern and object existence before updating profile | Direct profile update of `avatar_path`; accepting arbitrary path strings | Matches Phase 2/3 server-owned-field pattern; prevents users from pointing profiles at missing/cross-user objects; keeps `id/email/location/show_location` protected. | Existing trigger/GUC pattern. |
| Image picker deps | Add `expo-image-picker`; add `expo-image-manipulator` only when implementation commits to resize/crop | Add generic image libraries | Expo-native, minimal, dev-client-compatible. | User/Context7 ImagePicker guidance already checked. |
| Upload bytes | Prefer `fetch(uri).arrayBuffer()` upload to Supabase Storage | Extra filesystem/blob dependency | KISS: avoid dependencies if Expo URI fetch works. | User requirement. |
| Settings layout | Sectioned list using existing components/theme | New settings UI framework | Fits current Ignite architecture and refactoring-ui grouping. | Existing theme/components. |
| Theme mode | System/light/dark selector using `setThemeContextOverride(undefined | "light" | "dark")` | New theme state store | Reuse existing provider/MMKV key. | `theme/context.tsx`. |
| Password change | Active-session `updateUser({ password })` with strong confirmation copy; no current-password field in v1 | Reauth/current-password flow now | Supabase session is already the auth proof; reauth can be separately hardened if analyzer requires. | Existing auth flow and Supabase API. |
| Reset completion | Add `UpdatePassword` route and custom `type=recovery` deep-link handler using `setSession` | Keep reset-email only forever | User requested reset password in Phase 5; local Inbucket flow is testable. | App scheme/linking + Inbucket. |

### Phase 5.1: Dependencies, Config, and Native Permissions
**Owner**: @implementer (mobile dependencies/config)
**Dependencies**: Phase 4 merged
**Complexity**: LOW

#### Tasks
- [ ] Add `expo-image-picker` with `npx expo install expo-image-picker`.
- [ ] Add `expo-image-manipulator` only if implementation includes image resizing/cropping before upload; otherwise document why omitted and rely on bucket MIME/size limits.
- [ ] Add iOS `NSPhotoLibraryUsageDescription` / image picker permission text through `app.config.ts` or plugin config; add camera permission only if camera capture is implemented.
- [ ] Rebuild the Expo dev client after native dependency/config changes and document the command.
- [ ] Verify `pnpm compile` after dependency/config changes.

#### Acceptance Criteria
- [ ] Image picker dependency and permission text are present.
- [ ] No unrelated dependency, push, Google OAuth/Maps, or account deletion config is added.
- [ ] Dev client rebuild happens before Maestro/manual avatar picker verification.

### Phase 5.2: Storage Bucket, Avatar RPC, Trigger Relaxation, and Types
**Owner**: @implementer (Supabase storage/security)
**Dependencies**: Phase 5.1
**Complexity**: HIGH

#### Tasks
- [ ] Add `supabase/migrations/<timestamp>_avatars_storage.sql` or equivalent Phase 5 migration.
- [ ] Create private `avatars` bucket with conservative constraints: image MIME types only (`image/jpeg`, `image/png`, optionally `image/webp`) and size limit (implementation target: 2 MiB unless analyzer changes it).
- [ ] Add storage policies with split read/write posture: authenticated owners can upload/update/delete/list only objects under their own folder prefix `${auth.uid()}/...`; authenticated users can read/download avatar objects only when the object path is referenced by `profiles.avatar_path` for a profile visible through existing public-domain RPCs/screens; anonymous users cannot read; cross-user write/delete/list remains denied.
- [ ] State Phase 5 avatar visibility clearly: other authenticated users can see referenced avatars in map, dive event, chat, and profile displays; anonymous users cannot; unreferenced objects are not displayable by other users.
- [ ] Define avatar path invariant: require `path` to start with `auth.uid()::text || '/'` and match a canonical filename/type pattern such as `${auth.uid()}/avatar.(jpg|jpeg|png|webp)` or `${auth.uid()}/avatar-<version>.(jpg|jpeg|png|webp)`. Prefer single stable object path with upsert if cache behavior is acceptable; otherwise version path and delete old object.
- [ ] Replace/extend `protect_profile_server_fields()` to allow `avatar_path` changes only when `coalesce(current_setting('app.avatar_rpc', true), '') = 'on'`; keep `id`, `email`, `created_at`, trigger-managed `updated_at`, `location`, and `show_location` protections unchanged.
- [ ] Add `update_own_avatar_path(path text)` as a `security definer` RPC with `set search_path = public, storage, pg_temp`; require `auth.uid()`; validate `path` starts with `auth.uid()::text || '/'`, matches the canonical filename/type pattern, and exists in `storage.objects` with `bucket_id = 'avatars'` before setting `profiles.avatar_path`; set `app.avatar_rpc`; update only caller's profile row.
- [ ] Add `clear_own_avatar_path()` as a `security definer` RPC with `set search_path = public, pg_temp`; set `app.avatar_rpc` and clear only caller's `profiles.avatar_path`. Object deletion remains a storage API/service operation before or after RPC per documented compensation behavior.
- [ ] Explicitly revoke/grant avatar RPC execution to authenticated users only.
- [ ] Regenerate Supabase types after migration.

#### Acceptance Criteria
- [ ] Owner upload/update/delete/list in own folder succeeds.
- [ ] Other authenticated users can read/display only avatar objects referenced by visible profile/domain data; unreferenced cross-user object reads fail.
- [ ] Cross-user upload/update/delete/list and anonymous read/write access fail.
- [ ] `profiles.avatar_path` can change only through avatar RPCs; direct REST profile update remains blocked.
- [ ] `update_own_avatar_path` rejects paths outside caller folder, malformed filenames/extensions, and missing storage objects.
- [ ] Existing protected fields (`id`, `email`, `location`, `show_location`) remain blocked.

### Phase 5.3: Avatar/Profile Services and Authenticated Avatar Display
**Owner**: @implementer (services)
**Dependencies**: Phase 5.2
**Complexity**: MEDIUM

#### Tasks
- [ ] Add `app/services/storage/avatarService.ts` or `app/services/profiles/avatarService.ts` with `pickAvatar` integration kept in UI if cleaner, plus service functions `uploadOwnAvatar`, `removeOwnAvatar`, and `getAvatarDisplayUrl`/download helpers using authenticated storage reads for referenced avatar paths.
- [ ] Use Supabase Storage upload with `fetch(uri).arrayBuffer()` as the first implementation path; include content type, upsert/version behavior, and error normalization.
- [ ] If `expo-image-manipulator` is installed, resize/crop to a bounded square before upload; if not installed, validate file size/MIME and rely on bucket limits.
- [ ] Extend `profileService` carefully: keep `ProfilePatch` for editable text fields; add explicit avatar RPC functions rather than allowing arbitrary `avatar_path` direct patching.
- [ ] Use authenticated storage reads/download URLs for referenced avatar display under the private-bucket read policy; do not persist temporary URLs or downloaded blobs in `profiles`.
- [ ] Add initials fallback helper for missing/failed avatar display.

#### Acceptance Criteria
- [ ] Services never expose service-role keys or raw storage errors with sensitive details.
- [ ] Avatar upload updates storage object and then `profiles.avatar_path` through RPC.
- [ ] Avatar remove deletes object through Storage API when possible and clears `avatar_path` through `clear_own_avatar_path`; partial delete/clear failures are surfaced safely with documented compensation.
- [ ] Existing profile text updates still use the existing profile update path and do not gain access to server-owned fields.

### Phase 5.4: Profile UI Completion
**Owner**: @implementer (mobile UI)
**Dependencies**: Phase 5.3
**Complexity**: MEDIUM

#### Tasks
- [ ] Update `ProfileScreen` with avatar display, initials fallback, upload/change/remove actions, and authenticated avatar display refresh.
- [ ] Keep display name and summary form, but replace hardcoded strings with i18n keys and improve spacing/grouping using existing theme tokens.
- [ ] Add loading, uploading, saving, success, permission-denied, invalid-image, and error states.
- [ ] Show read-only email as de-emphasized account metadata; do not allow email editing in Phase 5.
- [ ] Add ASCII accessibility labels/test IDs for avatar/profile actions (`Profile avatar upload`, `Profile avatar remove`, `Profile save`).

#### Acceptance Criteria
- [ ] Profile renders with avatar image when present and initials fallback when absent.
- [ ] User can upload/replace/remove avatar and see result after app relaunch.
- [ ] Display name/summary validation and save still work.
- [ ] All visible profile strings are localized.

### Phase 5.5: Settings UI, Theme Mode, Sign-Out Confirmation, and Support Links
**Owner**: @implementer (mobile UI/settings)
**Dependencies**: Phase 5.1
**Complexity**: MEDIUM

#### Tasks
- [ ] Replace settings stub with a sectioned list: Account, Appearance, Support, Security.
- [ ] Add sign-out confirmation dialog before calling existing `signOut`; make destructive action hierarchy clear.
- [ ] Add theme mode selector for System, Light, Dark using existing `ThemeProvider` `setThemeContextOverride`; persist through existing MMKV key.
- [ ] Add local/no-op support links for Privacy Policy, Terms, About, Contact unless external URLs are configured; if using external links, use React Native Linking safely and handle failure.
- [ ] Add entry route/button for Change Password and Reset Password completion flow as described below.
- [ ] Add i18n keys and ASCII accessibility labels for all settings actions.

#### Acceptance Criteria
- [ ] Theme selection changes UI and persists across relaunch.
- [ ] Sign-out requires confirmation and still clears auth/domain state.
- [ ] Support links are safe: no crash if URLs are absent/unconfigured.
- [ ] Settings screenshots cover default, theme selector, sign-out confirmation, and error states.

### Phase 5.6: Password Change and Reset-Password Completion
**Owner**: @implementer (auth/deep-link)
**Dependencies**: Phase 5.1
**Complexity**: HIGH

#### Tasks
- [ ] Add `authService.updatePassword(newPassword)` wrapping `supabase.auth.updateUser({ password: newPassword })`; expose through `AuthContext` or a focused auth hook.
- [ ] Add a signed-in `ChangePasswordScreen` reachable from Settings; require new password + confirmation, validate password policy consistently with sign-up, call `updatePassword`, then require/encourage re-sign-in or show success based on Supabase session behavior.
- [ ] Add `UpdatePassword` route to auth/navigation types and navigator for recovery links.
- [ ] Update `sendPasswordReset(email)` to pass `redirectTo: Linking.createURL("update-password")` or the chosen recovery route.
- [ ] Add a deep-link handler in `app/app.tsx` or a small auth-link service that intercepts Supabase recovery URLs (`type=recovery`, `access_token`, `refresh_token` in hash/query), calls `supabase.auth.setSession({ access_token, refresh_token })`, and navigates to `UpdatePassword` without enabling generic `detectSessionInUrl`.
- [ ] Add `UpdatePasswordScreen` for reset completion: new password + confirmation, call `updatePassword`, clear transient recovery state, then navigate to sign-in or main app per Supabase session behavior.
- [ ] If local reset completion proves untestable with Inbucket/deep links during implementation, stop and document blocker; keep Phase 1 reset-email request intact and create a separate deep-link hardening plan rather than shipping a half-working reset completion.

#### Acceptance Criteria
- [ ] Signed-in user can change password and sign in with the new password afterward.
- [ ] Forgot-password email link can be extracted from Inbucket, opened via Maestro `openLink`, handled by custom recovery parser, and used to set a new password locally.
- [ ] Invalid/expired recovery links show safe localized errors and do not leave the app in a half-authenticated state.
- [ ] No service-role keys or password values appear in logs.

### Phase 5.7: Verification Bundle and Analyzer Gate
**Owner**: @implementer then @analyzer
**Dependencies**: Phase 5.1-5.6
**Complexity**: MEDIUM

#### Tasks
- [ ] Add Maestro `profile-edit-avatar.yaml`: edit profile text, pick/upload avatar, relaunch, assert avatar/profile persists, remove avatar.
- [ ] Add Maestro `settings-theme-signout.yaml`: change theme system/light/dark, relaunch/persist, open sign-out confirmation, cancel, confirm sign out.
- [ ] Add Maestro `settings-change-password.yaml`: signed-in password change, sign out, sign in with new password.
- [ ] Add Maestro `auth-reset-password-complete.yaml` if reset completion is implemented: request reset, extract Inbucket link, `openLink`, update password, sign in with new password.
- [ ] Run psql/API/storage checks: bucket private/configured, owner folder operations, referenced avatar authenticated read, cross-user write/delete/list denial, anonymous denial, avatar RPC-only path, path validation/object existence checks, and protected profile fields still blocked.
- [ ] Run full Phase 1-4 regression flows: auth, map, dive event, chat, profile/settings basics.
- [ ] Run `pnpm compile && pnpm lint:check && pnpm test:unit && pnpm depcruise`.
- [ ] Capture screenshots for profile avatar states, settings sections, theme selector, sign-out confirmation, change password, and reset completion if implemented.
- [ ] Ask @analyzer for Gate 5 review of storage/RLS, trigger relaxation, password/deep-link security, UI/UX/i18n/accessibility, and scope exclusions.

#### Acceptance Criteria
- [ ] All Phase 5 validation checks pass or have documented, user-approved deferrals.
- [ ] Analyzer finds no CRITICAL/HIGH issues in storage policy, avatar-path protection, password/deep-link handling, or scope leakage.
- [ ] Evidence bundle includes commands, psql/API/storage outputs, Maestro results, screenshots, and rollback notes.

### Phase 5 Deliverables

| Phase | Files Created/Modified |
|---|---|
| 5.1 | `package.json`, lockfile, `app.config.ts`/`app.json`, native permission config |
| 5.2 | `supabase/migrations/<timestamp>_avatars_storage.sql`, generated `app/services/supabase/database.types.ts`, optional `supabase/config.toml` bucket config |
| 5.3 | `app/services/storage/avatarService.ts` or equivalent, `app/services/profiles/profileService.ts` |
| 5.4 | `app/screens/main/ProfileScreen.tsx`, avatar presentational component if useful, i18n locale files |
| 5.5 | `app/screens/main/SettingsScreen.tsx`, theme/settings helpers if needed, i18n locale files |
| 5.6 | `app/services/auth/authService.ts`, `app/context/AuthContext.tsx`, `app/navigators/navigationTypes.ts`, `AuthNavigator.tsx`, `app/app.tsx`, `UpdatePasswordScreen.tsx`, `ChangePasswordScreen.tsx` |
| 5.7 | `.maestro/flows/profile-edit-avatar.yaml`, `.maestro/flows/settings-theme-signout.yaml`, `.maestro/flows/settings-change-password.yaml`, optional `.maestro/flows/auth-reset-password-complete.yaml`, storage/API verification notes |

### Phase 5 Blast Radius / Affected Entry Points
- `Profile` tab: avatar and profile edit UX changes.
- `Settings` tab: sectioned settings, theme, support links, sign-out confirmation, password routes.
- Auth deep links: reset recovery link parsing and `UpdatePassword` route.
- Supabase storage: new private `avatars` bucket and storage policies.
- Profile trigger: relax only avatar-path path behind `app.avatar_rpc`.
- Existing map/dive/chat profile displays: referenced avatar authenticated-read behavior may affect displayed avatar fields.

### Allowed in Phase 5
- Add avatar picker/upload/remove, private avatar storage, owner-folder write/list policies, referenced-avatar authenticated read policy, and avatar display helpers.
- Add profile UI polish for display name/summary/avatar.
- Add settings sectioned UI, theme selector, sign-out confirmation, safe support links.
- Add signed-in change password.
- Add local/testable reset-password completion deep-link handling if verified.
- Add i18n strings, accessibility labels, Maestro/API/psql/storage verification.

### Forbidden in Phase 5
- No push notifications or notification permission prompts.
- No Google OAuth or Google Maps/provider/API keys.
- No account deletion or user data erasure flow without separate security review.
- No public avatar bucket.
- No direct `avatar_path` updates from app/profile form; use reviewed RPC only.
- No service-role keys in app code.
- No broad relaxation of profile trigger for `id`, `email`, `location`, or `show_location`.

### Phase 5 Invariants

| Invariant | Why it matters | How to verify |
|---|---|---|
| Avatar bucket is private. | Prevents anonymous/public file access. | `storage.buckets.public=false`; anonymous storage read negative checks. |
| Referenced avatars are visible to authenticated users only. | Allows map/dive/chat/profile avatar display without public bucket. | Authenticated user can read avatar path referenced by visible profile/domain data; anonymous cannot; unreferenced cross-user object read fails. |
| Users can only manage their own avatar folder. | Prevents avatar overwrite/leak. | Owner positive and cross-user upload/update/delete/list negative checks. |
| `profiles.avatar_path` changes only through avatar RPC. | Preserves server-owned-field protection. | Direct REST update fails; RPC succeeds. |
| Avatar path RPC validates ownership, shape, and existence. | Prevents pointing profiles at missing/cross-user objects. | RPC rejects wrong prefix, malformed extension/name, and missing `storage.objects` row. |
| Existing protected profile fields remain protected. | Avoids regression from trigger relaxation. | Direct update attempts for `id`, `email`, `location`, `show_location` fail. |
| Temporary display URLs/blobs are not persisted in profiles. | Avoids stale/leaked temporary URLs or local artifacts. | psql profile row contains storage path only. |
| Theme mode uses existing provider/storage. | Avoids parallel theme state. | MMKV/theme relaunch check. |
| Password values/tokens are never logged. | Security. | Code review/log grep. |
| Reset recovery links are handled explicitly. | `detectSessionInUrl:false` requires manual session setup. | Inbucket deep-link flow test. |
| No push/Google/account-deletion scope enters Phase 5. | Keeps phase bounded. | Dependency/config/code grep. |

### Phase 5 Behavior That Must Not Change
- Phase 1 auth/session/sign-in/sign-out/reset-email request flows still pass.
- Phase 2 map location save/search/delete and user markers still pass.
- Phase 3 dive event create/update/delete and dive markers/detail cards still pass.
- Phase 4 chat list/detail/send/realtime flows still pass.
- `Map`, `DiveEvent`, `Chat`, `Profile`, and `Settings` tab route values remain registered.
- Apple Maps default provider remains unchanged; no `PROVIDER_GOOGLE` appears.
- Location and show-location remain controlled by Phase 2 RPCs, not profile form edits.
- Reference old app remains read-only.

### Phase 5 Legacy / Malformed State Handling
- If `profiles.avatar_path` points to a missing object, show initials fallback and offer upload/remove; do not crash profile/map/chat/dive screens.
- If authenticated avatar read/display fails, show fallback avatar and localized non-blocking error.
- If photo permission is denied, show guidance and keep text profile editing usable.
- If reset recovery link is expired/malformed, show localized error and return to sign-in/forgot-password without mutating session unexpectedly.
- If storage object delete fails during avatar removal, surface safe error; only clear `avatar_path` after storage/RPC state is consistent or document the chosen compensation behavior.
- If `profiles.avatar_path` references an object that no longer satisfies the referenced-avatar read policy, show fallback and allow the owner to replace/remove the avatar.

### Feature Flag Rationale
- No feature flag is planned for Phase 5 because profile/settings completion is foundational after Phase 1-4 and remains local/pre-release.
- If reset-password completion is risky in a deployed environment, implementation may gate only the new recovery-completion route with analyzer approval; do not add a general feature-flag framework.

### Phase 5 Validation Matrix

| Check | Command / Method | Proves |
|---|---|---|
| Profile/avatar path | Maestro `profile-edit-avatar.yaml` | Profile edit, avatar upload/remove, relaunch persistence. |
| Settings/theme/signout | Maestro `settings-theme-signout.yaml` | Theme persists and sign-out confirmation works. |
| Change password | Maestro `settings-change-password.yaml` | Signed-in user can change password and sign in with new password. |
| Reset completion | Maestro `auth-reset-password-complete.yaml` if implemented + Inbucket link extraction | Recovery deep link updates password locally. |
| Storage owner policy | Supabase Storage API/Hurl + psql | Owner can upload/update/delete/list own avatar folder. |
| Referenced avatar read | Storage API as another authenticated user for a path referenced by visible profile/domain data | Other authenticated users can display referenced avatars in map/dive/chat/profile. |
| Storage negative | Storage API as anon/cross-user/unreferenced object | Anonymous reads fail; cross-user writes/deletes/list fail; unreferenced object reads fail. |
| Avatar RPC path | psql/API direct update vs RPC | `avatar_path` changes only via RPC. |
| Avatar RPC validation | RPC calls with wrong prefix, malformed filename/extension, and missing object | Invalid avatar paths are rejected before profile update. |
| Protected fields preservation | REST updates for `id`, `email`, `location`, `show_location` | Existing trigger protections remain. |
| Avatar display path behavior | Service/API check + psql profile row | Display uses authenticated storage read for referenced path; DB stores path only. |
| Behavior preservation | Full Phase 1-4 Maestro suite + `pnpm compile && pnpm lint:check && pnpm test:unit && pnpm depcruise` | Prior flows remain intact. |
| Phase 5 i18n coverage | Compile/unit tests plus changed-string review | New profile/settings strings follow i18n pattern. |
| Phase 5 UI/UX evidence | Maestro screenshots + analyzer UI/UX verdict | Profile/settings/password screens meet hierarchy, spacing, contrast, and state requirements. |
| Scope exclusion | Grep config/code/deps for push/Google/account-deletion/service-role/public bucket | Phase 5 stays bounded. |

### Phase 5 Review Gates

| Gate | After Phase | Focus Area |
|---|---|---|
| Gate 5.1 | 5.2 | Storage bucket privacy, owner-folder write/list policies, referenced-avatar authenticated read policy, avatar trigger/RPC guard, path validation/existence check, protected-field preservation. |
| Gate 5.2 | 5.4 | Avatar service/UI, authenticated avatar display handling, image dependency/permission behavior, i18n/accessibility. |
| Gate 5.3 | 5.5 | Settings section UX, theme storage reuse, sign-out confirmation, support-link safety. |
| Gate 5.4 | 5.6 | Password change, reset deep-link session handling, token/password logging risks. |
| Gate 5.5 | 5.7 | Full evidence bundle: Maestro, storage/API/psql, compile/lint/test/depcruise, screenshots, analyzer verdict. |

### Phase 5 Risks and Rollback

| Risk | Likelihood | Impact | Mitigation / rollback |
|---|---:|---:|---|
| Avatar trigger relaxation permits broader profile mutation. | LOW | HIGH | GUC-scoped avatar RPC only; protected-field negative tests; analyzer Gate 5.1. |
| Storage policies leak anonymous or unreferenced cross-user access. | LOW | HIGH | Private bucket, referenced-avatar read policy only, owner-folder write/list policies, anon/cross-user/unreferenced negative tests. |
| Avatar path RPC accepts arbitrary or missing object path. | LOW | HIGH | Validate caller prefix, canonical filename/type, and `storage.objects` existence before profile update; negative RPC tests. |
| Image picker native permission/dev-client issue. | MEDIUM | MEDIUM | Add permission text, rebuild dev client, rollback dependency/config commit if needed. |
| URI upload bytes fail on simulator/device. | MEDIUM | MEDIUM | Test `fetch(uri).arrayBuffer()`; if blocked, add minimal Expo-compatible fallback only with analyzer approval. |
| Reset deep-link handling corrupts session. | MEDIUM | HIGH | Isolated handler for `type=recovery`, local Inbucket test, safe error path; defer if not testable. |
| Theme toggle creates parallel state. | LOW | MEDIUM | Use existing `ThemeProvider` API only. |
| Scope creep to account deletion/Google/push. | MEDIUM | MEDIUM | Forbidden scope grep and commit review. |

### Phase 5 Expected Commit Slices
1. Dependency/config: image picker permission config and dev-client rebuild note.
2. Storage/security: private avatars bucket, policies, avatar RPC/trigger guard, type generation.
3. Services: avatar storage service, profile/avatar RPC service updates, authenticated avatar display handling.
4. Profile UI: avatar display/upload/remove and i18n profile form polish.
5. Settings UI: sections, theme toggle, support links, sign-out confirmation.
6. Password flows: signed-in change password and reset deep-link completion if verified.
7. Verification: Maestro flows, storage/API/psql checks, screenshots, analyzer evidence bundle.

## Phase 6: Polish, Integration, and Final Cleanup
**Owner**: @implementer + @analyzer
**Dependencies**: Phase 5 merged and verified
**Complexity**: HIGH

### Problem Statement
Finalize the app after Phase 1-5 product scope is implemented. Phase 6 is not a new feature phase: it hardens edge cases, i18n/accessibility, UI consistency, migration reproducibility, full integration coverage, stale artifact cleanup, and evidence quality so the app can be reviewed as one coherent system.

### Phase 6 Current State (Evidence)

| Area | Verified evidence | Implication |
|---|---|---|
| Validation scripts exist | `package.json:14-24` defines `compile`, `lint:check`, `depcruise`, `test:unit`, `seed:maestro`, and `test:maestro`. | Phase 6 should run all standard checks and improve reliability rather than invent new runners. |
| Repo hygiene baseline required | `git status --short` before this analyzer-response edit showed ` M docs/diving-buddies-redesign.plan.md`, ` M tsconfig.json`, and untracked root screenshots: `phase1-forgot-password.png`, `phase5-change-password.png`, `phase5-profile-settings-profile.png`, `phase5-profile-settings-settings.png`. | Phase 6 implementation must classify dirty files first; do not absorb unrelated `tsconfig.json` drift or root generated artifacts into polish work. |
| Maestro runner is long/full-suite | `test:maestro` starts Metro with PM2, waits for `/status`, seeds data, runs flows sequentially, and traps cleanup. | Attempt uninterrupted full run; if simulator flakes, document exact failure and targeted reruns. |
| Existing flows cover phases | `.maestro/flows` includes auth, map, dive, chat, profile/settings/password flows; stale Ignite demo `Login.yaml`, `FavoritePodcast.yaml`, and `_Login.yaml` remain. | Final cleanup can remove stale demo flows if not referenced by runner. |
| Generated root screenshots may exist | Root screenshot files such as `phase1-forgot-password.png`, `phase5-change-password.png`, `phase5-profile-settings-profile.png`, and `phase5-profile-settings-settings.png` were found in exploration. | Remove, move, or ignore generated screenshots so git is clean and artifacts live in intentional evidence locations. |
| i18n test is narrow | `test/i18n.test.ts` validates used `tx`/`translate` keys against `en.ts`; hardcoded visible strings can still exist outside those patterns. | Phase 6 needs a manual/grep audit for remaining visible hardcoded strings and analyzer notes. |
| Demo code may remain | Ignite demo screens/navigator/context/i18n/demo Maestro flows are unused by app routes but may still exist. | Demo cleanup is optional and should be done only in isolated, tested commit slices; avoid risky broad deletion. |
| Supabase migrations are cumulative | Migrations now span PostGIS, profiles, map RPCs, dive events, chat, and avatar storage; seed scripts exist for Maestro. | Final `supabase db reset` must prove migrations are reproducible from scratch. |
| Realtime/storage paths exist | Phase 4 uses Supabase Realtime; Phase 5 uses private avatar storage and policies. | Include DB/API/RLS/storage/realtime verification scripts or documented commands. |
| Node/tooling caveat | `package.json` requires Node `>=20`; dependency-cruiser config is standard. | If `depcruise` fails due Node/tool mismatch, record exact Node version/output and rerun under supported Node before calling it a product failure. |

### Phase 6 Verified Facts vs Assumptions

| Item | Type | Criticality | Evidence / decision | Validation method |
|---|---:|---:|---|---|
| Phase 6 must not add product scope. | Decision | HIGH | User request and previous phase boundaries. | Scope grep and analyzer final review. |
| Dirty repo state must be classified before implementation. | Decision | HIGH | Analyzer NEEDS_CHANGES and pre-edit `git status --short` evidence. | Phase 6.0 baseline log, `tsconfig.json` revert/justification, root screenshot cleanup policy, final clean `git status --short`. |
| Full `pnpm test:maestro` should be attempted. | Decision | HIGH | User explicitly requires attempt; runner exists. | Full command output or documented simulator failure + targeted reruns. |
| Simulator/UI automation may flake. | Assumption | MEDIUM | Long sequential Maestro mobile flows are known to be timing-sensitive. | Targeted rerun evidence with exact failing flow/log. |
| Reset completion must be either proven or not claimed. | Decision | HIGH | User explicitly called out reset claim review. | Inbucket/deep-link E2E evidence or documented deferral. |
| Demo cleanup is optional. | Decision | MEDIUM | User says optional cleanup only if safe/tested. | Import grep, compile/test after isolated removal. |
| Root screenshots are generated artifacts, not source. | Assumption | LOW | Exploration found phase screenshot PNGs at repo root. | `git status`, artifact policy, remove/move/ignore decision. |
| Supabase migrations must reset cleanly. | Decision | HIGH | Final integration requires reproducible DB state. | `supabase db reset` + seed + verification scripts. |

No unresolved CRITICAL or HIGH Phase 6 assumptions remain. Analyzer should pay attention to MEDIUM simulator flakiness and optional demo cleanup risk.

### Phase 6 / Final Cleanup Decisions Summary

| Decision | Chosen | Rejected | Rationale | Evidence |
|---|---|---|---|---|
| Scope | Polish/integration/cleanup only | New product features | Prevents destabilizing completed phases. | User request. |
| Full E2E posture | Attempt full `pnpm test:maestro`; allow targeted reruns only after exact full-run evidence | Skip full suite and run selected flows only | Proves integration; still realistic about simulator flakes. | Existing runner. |
| Repo hygiene | Start Phase 6 with recorded `git status --short`; classify plan changes vs unrelated `tsconfig.json` drift vs generated root screenshots; finish with clean `git status --short` | Start polish work on a dirty tree and absorb unrelated config/artifacts | Prevents analyzer confusion and accidental unrelated changes. | Pre-edit status evidence. |
| Reset-password claim | Verify full Inbucket/deep-link E2E or explicitly mark deferred/not claimed | Assume it works from unit/API evidence | Avoids overstating auth recovery readiness. | Phase 5 risk. |
| Demo cleanup | Isolated optional cleanup only if imports/tests prove safe | Broad deletion of all Ignite artifacts | Demo code is not product-critical but deletion can break translations/tests if batched. | Exploration findings. |
| Screenshots | Keep screenshots in intentional evidence location or delete generated root files; do not leave root artifacts tracked accidentally | Let root PNGs accumulate | Keeps git clean and reviewable. | Root PNG findings. |
| Realtime verification | Include app Maestro realtime plus DB/realtime publication checks; use WebSocket smoke only if feasible | Require fragile raw WebSocket test as blocker | App behavior is the user-facing requirement; direct protocol testing is supplemental. | Phase 4 plan. |

### Phase 6.0: Repo Hygiene Baseline
**Owner**: @implementer (repo hygiene)
**Dependencies**: Phase 5 merged and verified
**Complexity**: LOW

#### Tasks
- [ ] Run and record `git status --short` before any Phase 6 implementation edits.
- [ ] Classify dirty files into: intentional plan/documentation changes, unrelated config drift, generated artifacts, and implementation changes.
- [ ] Treat `docs/diving-buddies-redesign.plan.md` changes for this analyzer-response revision as intentional plan documentation only.
- [ ] Treat dirty `tsconfig.json` as unrelated until proven otherwise; revert it or separately justify it before Phase 6 implementation begins. Do not absorb unrelated config drift into Phase 6 polish commits.
- [ ] Treat root screenshots as generated artifacts unless explicitly moved to a documented evidence location. Current examples to classify intentionally: `phase1-forgot-password.png`, `phase5-change-password.png`, `phase5-profile-settings-profile.png`, and `phase5-profile-settings-settings.png`.
- [ ] Remove, move to a documented evidence directory, or ignore root screenshot artifacts intentionally before final review.
- [ ] Ensure final `git status --short` returns clean output after Phase 6 changes are committed/reverted/removed as appropriate.

#### Acceptance Criteria
- [ ] Baseline `git status --short` is included in the evidence bundle.
- [ ] `tsconfig.json` is either reverted or has a separate documented justification with analyzer approval before Phase 6 implementation proceeds.
- [ ] Root screenshot artifacts are not left as unexplained untracked files.
- [ ] Final `git status --short` is clean.

### Phase 6.1: i18n, Hardcoded Strings, and Accessibility Audit
**Owner**: @implementer (i18n/accessibility)
**Dependencies**: Phase 6.0
**Complexity**: MEDIUM

#### Tasks
- [ ] Audit all production screens/components for hardcoded visible strings not covered by `tx`/`translate`, including low-priority analyzer notes from Phases 1-5.
- [ ] Move remaining production visible strings to existing locale files; update all supported locales with acceptable fallback translations if full translation quality is unavailable.
- [ ] Keep documented technical exceptions only where a visible string is truly not user-facing or is a stable test/debug artifact.
- [ ] Audit accessibility labels/testIDs for critical buttons, inputs, status text, markers, cards, chat composer, avatar actions, and password/reset flows.
- [ ] Improve accessible loading/error/success/status announcements where screens currently show only visual spinners/colors.
- [ ] Ensure Maestro selectors are ASCII/stable and avoid Turkish-character-sensitive text matches.

#### Acceptance Criteria
- [ ] `pnpm test:unit` i18n coverage passes.
- [ ] Analyzer accepts remaining hardcoded-string exceptions.
- [ ] Critical UI actions have stable labels/testIDs and accessible status states.

### Phase 6.2: UI/UX Consistency and Critical-State Polish
**Owner**: @implementer (UI polish)
**Dependencies**: Phase 6.1
**Complexity**: MEDIUM

#### Tasks
- [ ] Review spacing/alignment/hierarchy across `SignIn`, `SignUp`, `ForgotPassword`, `UpdatePassword`, `Map`, `DiveEvent`, `Chat` list/detail, `Profile`, `Settings`, and `ChangePassword`.
- [ ] Fix cramped buttons, dense cards, inconsistent section spacing, weak metadata hierarchy, and destructive-action emphasis only where evidence shows issues.
- [ ] Review empty/loading/error/success states for all main screens; add clear recovery actions where missing.
- [ ] Verify dark/light/system theme visual consistency after Phase 5 theme toggle.
- [ ] Capture final screenshots for critical happy/empty/error states and theme variants as feasible.
- [ ] Keep refactoring-ui goal at 10/10 or document remaining deltas with owner/priority.

#### Acceptance Criteria
- [ ] Screenshots cover critical screens and states.
- [ ] Analyzer UI/UX verdict is pass or only LOW documented deltas.
- [ ] No new dependencies or broad restyles are introduced.

### Phase 6.3: Final Integration Flow and Maestro Reliability
**Owner**: @implementer (E2E)
**Dependencies**: Phase 6.1-6.2
**Complexity**: HIGH

#### Tasks
- [ ] Add or update a full integration Maestro flow: sign up → add location → create dive → find diver → start chat/send message → edit profile/theme → logout → login.
- [ ] Keep the integration flow deterministic using seeded users/data where appropriate; avoid relying on wall-clock-only emails except where uniqueness is required.
- [ ] Attempt full uninterrupted `pnpm test:maestro`.
- [ ] If full run fails due simulator/device flake, capture exact command, flow name, screenshot/log/hierarchy, then rerun the failed flow and any dependent adjacent flows with exact evidence.
- [ ] Ensure PM2 Metro cleanup occurs after failures; do not leave orphaned processes.

#### Acceptance Criteria
- [ ] Integration flow passes.
- [ ] Full `pnpm test:maestro` passes, or documented flake evidence plus targeted reruns are sufficient for analyzer review.
- [ ] No Maestro flows rely on stale Ignite demo screens.

### Phase 6.4: Database/API/RLS/Storage/Realtime Reproducibility
**Owner**: @implementer (backend verification)
**Dependencies**: Phase 6.3 can run in parallel after migrations are stable
**Complexity**: HIGH

#### Tasks
- [ ] Run final `supabase db reset` from scratch and record output.
- [ ] Run Maestro seed script after reset and verify seeded data shape.
- [ ] Run or create lightweight verification scripts/commands for auth/profile RLS, map location RPCs, dive RPCs/direct mutation denial, chat participant/RLS/realtime publication, avatar storage policies/path validation, and protected profile fields.
- [ ] Verify `messages` realtime publication and participant/nonparticipant behavior using app Maestro evidence plus optional WebSocket smoke if practical.
- [ ] Verify avatar storage: private bucket, referenced authenticated read, owner-folder writes/deletes/list, anonymous/cross-user negatives.
- [ ] Verify no service-role keys are imported into `app/` and no secrets are logged.

#### Acceptance Criteria
- [ ] `supabase db reset` is reproducible.
- [ ] DB/API/RLS/storage/realtime evidence covers every phase boundary.
- [ ] Analyzer accepts any realtime WebSocket direct-test deferral if app+DB evidence is complete.

### Phase 6.5: Safe Cleanup of Artifacts and Optional Demo Code
**Owner**: @implementer (cleanup)
**Dependencies**: Phase 6.1-6.4 evidence captured first
**Complexity**: MEDIUM

#### Tasks
- [ ] Remove, move to an intentional evidence directory, or ignore generated root screenshots; ensure root is clean after validation.
- [ ] Remove stale Maestro demo flows (`Login.yaml`, `FavoritePodcast.yaml`, `_Login.yaml`) only after grep proves no production runner references them.
- [ ] Optionally remove unreachable Ignite demo screens/navigator/context/i18n demo files in isolated commit slices only if import grep, `pnpm compile`, `pnpm test:unit`, and `pnpm depcruise` pass after each slice.
- [ ] If demo i18n cleanup is too risky or noisy, leave demo translations and document them as retained non-product artifacts; do not block final release on broad deletion.
- [ ] Review orphan utility files only if dependency-cruiser flags them; avoid deleting shared utilities without direct evidence.
- [ ] Ensure `git status` is clean except intentional implementation changes before final analyzer review.

#### Acceptance Criteria
- [ ] No unintended generated screenshots or dependency graph files remain at repo root.
- [ ] No stale Maestro demo flow remains unless intentionally documented.
- [ ] Optional demo cleanup does not break compile/tests/navigation/i18n.

### Phase 6.6: Final Quality Gate and Analyzer Review
**Owner**: @implementer then @analyzer
**Dependencies**: Phase 6.1-6.5
**Complexity**: MEDIUM

#### Tasks
- [ ] Run `pnpm compile && pnpm lint:check && pnpm test:unit && pnpm depcruise`.
- [ ] If `depcruise` fails due Node/tool mismatch, capture `node --version`, command output, and rerun under supported Node `>=20` before treating it as a code failure.
- [ ] Run final scope grep: no push notifications, Google OAuth/Maps, account deletion, service-role key in app, public avatars bucket, group chat, or unapproved dependencies.
- [ ] Review reset completion status: either attach successful Inbucket/deep-link E2E evidence or mark reset completion deferred/not claimed in release notes/evidence.
- [ ] Verify `git status` and list intentional files only.
- [ ] Submit final analyzer review with commands, screenshots, DB/API evidence, Maestro outputs, scope grep, and known residual LOW issues.

#### Acceptance Criteria
- [ ] Analyzer final review has no CRITICAL/HIGH findings.
- [ ] Final evidence bundle is sufficient to reproduce all major flows.
- [ ] Any deferred item is explicitly marked and not represented as complete.

### Phase 6 Deliverables

| Phase | Files Created/Modified |
|---|---|
| 6.0 | Repo hygiene baseline evidence; `tsconfig.json` revert/justification; root screenshot artifact decision |
| 6.1 | i18n locale files, affected screens/components, Maestro selectors if needed |
| 6.2 | UI polish in existing screens/components only; screenshot evidence directory if used |
| 6.3 | `.maestro/flows/full-integration.yaml` or equivalent; flow updates for reliability |
| 6.4 | Verification scripts/notes for DB/API/RLS/storage/realtime if not already present |
| 6.5 | Removed/moved root screenshots; optional stale demo Maestro/demo code cleanup |
| 6.6 | Final evidence notes/checklist, no product-code changes unless fixing review findings |

### Phase 6 Blast Radius / Affected Entry Points
- All auth/main screens for i18n, accessibility, loading/error/empty state polish.
- Maestro flows and shared bootstrap.
- Supabase local database reset/seed/verification scripts.
- Repo hygiene baseline, including existing dirty `tsconfig.json` and generated root screenshots.
- Optional demo artifacts and generated screenshot files.
- No new product routes, tables, storage buckets, or dependencies unless analyzer identifies a blocker.

### Allowed in Phase 6
- i18n/accessibility/status-state fixes.
- Small UI spacing/hierarchy polish using existing components/theme.
- Maestro reliability improvements and a full integration flow.
- Verification scripts/notes for existing Phase 1-5 features.
- Generated artifact cleanup and optional safe demo cleanup.
- Repo hygiene classification before edits and clean final `git status --short`.

### Forbidden in Phase 6
- No new product features, schema scope, push notifications, Google OAuth/Maps, account deletion, group chat, or moderation features.
- No broad rewrites/restyles or new UI frameworks.
- No unreviewed dependency additions.
- No changing security posture except to fix analyzer-identified defects with targeted tests.
- No claiming reset-password completion unless Inbucket/deep-link E2E evidence exists.

### Phase 6 Invariants

| Invariant | Why it matters | How to verify |
|---|---|---|
| Phase 1-5 user journeys still work together. | Integration is the point of Phase 6. | Full integration Maestro flow + full suite. |
| Phase 6 starts from an understood repo state. | Prevents unrelated config drift/artifacts from being absorbed into implementation. | Baseline `git status --short`, dirty-file classification, final clean `git status --short`. |
| All production visible strings are localized or documented exceptions. | i18n quality. | i18n test + hardcoded-string audit. |
| Accessible status/loading/error states exist for critical flows. | Usability and test reliability. | Screenshots, hierarchy dumps where needed, analyzer review. |
| Migrations reset from scratch. | Reproducible backend state. | `supabase db reset` output. |
| Security boundaries remain intact. | Avoid polish regressions. | DB/API/RLS/storage/realtime verification. |
| No generated artifacts pollute repo root. | Review hygiene. | `git status` and file listing. |
| No new product scope enters Phase 6. | Stability. | Scope grep and analyzer review. |

### Phase 6 Behavior That Must Not Change
- All Phase 1 auth/session/reset-email/sign-out flows.
- All Phase 2 map location/search/delete flows.
- All Phase 3 dive event create/update/delete/map marker flows.
- All Phase 4 chat list/detail/send/realtime flows.
- All Phase 5 profile/avatar/settings/theme/password flows that were marked complete.
- Apple Maps default provider remains unchanged; no Google provider/key.
- Avatar bucket remains private and account deletion remains absent.

### Phase 6 Legacy / Malformed State Handling
- If `tsconfig.json` is dirty at Phase 6 start, revert it or separately justify it before implementation; do not hide unrelated config drift inside polish work.
- If stale generated screenshots are tracked or untracked at repo root, remove/move them deliberately and document the policy. Current explicit examples: `phase1-forgot-password.png`, `phase5-change-password.png`, `phase5-profile-settings-profile.png`, and `phase5-profile-settings-settings.png`.
- If demo i18n/screens remain, document that they are non-product retained artifacts; if removed, remove all imports/translations/tests consistently.
- If reset deep-link E2E cannot be proven, mark reset completion deferred/not claimed and keep reset-email request behavior intact.
- If full Maestro fails due simulator flake, preserve evidence and rerun targeted flows rather than hiding the failure.

### Phase 6 Validation Matrix

| Check | Command / Method | Proves |
|---|---|---|
| Repo hygiene baseline | Initial `git status --short`, dirty-file classification, final clean `git status --short` | Phase 6 does not absorb unrelated `tsconfig.json` drift or root screenshots. |
| Compile/lint/unit | `pnpm compile && pnpm lint:check && pnpm test:unit` | Type/lint/unit/i18n tests pass. |
| Dependency graph | `pnpm depcruise`; if Node mismatch, rerun under Node `>=20` with evidence | Architecture constraints remain. |
| DB reset | `supabase db reset` | Migrations reproduce from scratch. |
| DB/API/RLS/storage/realtime | Phase-specific Hurl/psql/storage/realtime scripts/commands | Security boundaries remain intact. |
| Full integration flow | Maestro full integration flow | End-to-end app journey works across phases. |
| Full Maestro suite | `pnpm test:maestro` attempted uninterrupted | Regression coverage; flakes documented with targeted reruns. |
| Screenshots/UI review | Critical screenshots + analyzer UI/UX verdict | Visual hierarchy, spacing, contrast, empty/loading/error states. |
| Reset completion claim | Inbucket/deep-link E2E evidence or explicit deferral | Auth recovery is not overstated. |
| Scope grep | grep/dependency/config checks for forbidden scope | No push/Google/account deletion/group chat/public avatars/service-role leak. |
| Repo hygiene | `git status`, generated artifact listing | Clean review state. |
| Final analyzer review | @analyzer final gate | No CRITICAL/HIGH residual issues. |

### Phase 6 Review Gates

| Gate | After Phase | Focus Area |
|---|---|---|
| Gate 6.0 | 6.0 | Baseline git status, dirty-file classification, `tsconfig.json` revert/justification, root screenshot artifact decision. |
| Gate 6.1 | 6.1 | i18n hardcoded-string audit, accessibility labels/status states, Maestro selector stability. |
| Gate 6.2 | 6.2 | UI hierarchy/spacing/contrast/screenshots across critical screens. |
| Gate 6.3 | 6.3 | Full integration flow and full Maestro attempt/flaky rerun evidence. |
| Gate 6.4 | 6.4 | DB reset, RLS/storage/realtime/security evidence. |
| Gate 6.5 | 6.5 | Cleanup safety, git hygiene, optional demo deletion risk. |
| Gate 6.6 | 6.6 | Final release-readiness evidence bundle and residual issue classification. |

### Phase 6 Risks and Rollback

| Risk | Likelihood | Impact | Mitigation / rollback |
|---|---:|---:|---|
| Broad demo cleanup breaks i18n/tests. | MEDIUM | MEDIUM | Optional isolated slices; rollback deletion; leave documented if risky. |
| Maestro full suite flakes. | HIGH | MEDIUM | Attempt full run, capture evidence, targeted reruns, stabilize selectors/waits. |
| UI polish causes regressions. | MEDIUM | MEDIUM | Small screen-scoped edits, screenshots, full regression. |
| DB reset reveals migration order issue. | LOW | HIGH | Fix migration in isolated commit before UI cleanup; rerun reset. |
| Reset completion is claimed without E2E proof. | MEDIUM | HIGH | Gate requires proof or explicit deferral. |
| Unrelated `tsconfig.json` drift is absorbed into Phase 6. | MEDIUM | MEDIUM | Phase 6.0 requires revert or separate documented justification before implementation. |
| Generated artifacts hide real changes. | MEDIUM | LOW | Cleanup policy and `git status` gate. |

### Phase 6 Expected Commit Slices
0. Repo hygiene baseline, `tsconfig.json` revert/justification, and root screenshot artifact decision.
1. i18n/accessibility audit fixes.
2. UI/UX spacing/status-state polish with screenshots.
3. Full integration Maestro flow and reliability updates.
4. DB/API/RLS/storage/realtime verification scripts/notes and reset evidence.
5. Generated artifact cleanup and optional safe demo cleanup.
6. Final evidence bundle updates and analyzer-driven fixes only.

---

## Deliverables

| Phase | Files Created/Modified |
|---|---|
| 1.1 | `package.json`, `pnpm-lock.yaml`, `.env.example`, `app/services/supabase/client.ts`, `app/services/supabase/secureAuthStorage.ts` |
| 1.2 | `supabase/migrations/<timestamp>_auth_profiles.sql`, `app/services/supabase/database.types.ts` |
| 1.3 | `app/context/AuthContext.tsx`, `app/services/auth/authService.ts`, `app/services/profiles/profileService.ts` |
| 1.4 | `app/navigators/navigationTypes.ts`, `AppNavigator.tsx`, `AuthNavigator.tsx`, `MainTabNavigator.tsx`, `app/app.tsx`, auth/main placeholder screens |
| 1.5 | `ProfileScreen.tsx`, `SettingsScreen.tsx`, i18n files |
| 1.6 | `.maestro/flows/auth-*.yaml`, `.maestro/shared/_OnFlowStart.yaml`, optional Hurl playbook |
| 2 | Map screen/services/RPC migration, `calculateBounds` utility |
| 3 | Dive schema/RPCs/screens/services |
| 4 | Chat schema/RPCs/screens/services/realtime |
| 5 | Settings/privacy/profile completion, avatar bucket/policies/upload UI/tests, optional full reset-password completion |
| 6 | Demo cleanup, polish, regression suite |

---

## Blast Radius / Affected Entry Points
- `index.tsx` / app startup indirectly through provider changes in `app/app.tsx:96-109`.
- Navigation root in `app/navigators/AppNavigator.tsx:66-78`.
- Auth context currently in `app/context/AuthContext.tsx:18-44`.
- MMKV storage wrapper in `app/utils/storage/index.ts` if stale fake auth cleanup needs helper calls.
- Supabase local schema and auth APIs through new migrations; storage APIs are explicitly not touched until Phase 5 avatar work.
- Maestro flows under `.maestro/flows` and shared bootstrap `.maestro/shared/_OnFlowStart.yaml`.
- Existing demo tests and i18n key tests may be affected if demo screens are removed.

---

## Allowed Scope / Forbidden Scope

### Allowed in Phase 1
- Replace fake auth with Supabase auth.
- Add auth/profile schema, RLS, trigger hardening, and reset-email request.
- Add real auth/main navigation shell.
- Add own profile/settings UI and placeholders for later tabs.
- Add minimal dependencies listed in Phase 1.1.
- Update tests/flows required for auth verification.

### Forbidden in Phase 1
- Do not modify `/Users/Y_ALTAY1/Documents/mobile/diving-buddy-master`.
- Do not copy old app architecture, Zustand stores, Expo Router route structure, or dashboard-only SQL.
- Do not add Google OAuth, push notifications, Google Maps, production SMTP, account deletion, or group chat.
- Do not add avatar upload/storage implementation, `avatars` bucket/policies, `expo-image-picker`, `AvatarPicker`, or `avatarService`.
- Do not add full reset-password completion/deep-link update-password flow.
- Do not disable RLS.
- Do not store service-role keys or Supabase tokens in app logs/client code.
- Do not introduce MobX/Zustand/React Query unless a concrete Phase 1 blocker is documented and reviewed.

---

## Invariants

| Invariant | Why it matters | How to verify |
|---|---|---|
| Authenticated state derives from Supabase session only. | Prevents fake MMKV token bypass. | Clear Supabase session but leave old MMKV keys; app remains signed out. |
| One auth user has one profile row. | Profile is the base for map/chat/events. | Signup twice with unique users; `select count(*) from profiles group by id` no duplicates. |
| Users can only select/update own Phase 1 profile directly. | Privacy/security. | REST/psql RLS negative checks. |
| Phase 1 never writes avatar storage or `avatar_path`. | Keeps auth/profile scope small and avoids premature storage surface. | Dependency check excludes `expo-image-picker`; psql bucket count for `avatars` is `0`; malicious `avatar_path` update fails. |
| Server-owned/future-phase profile fields are protected. | RLS only controls row ownership, not column ownership. | REST own-row attempts to update `id`, `email`, `created_at`, `updated_at`, `avatar_path`, `location`, and `show_location` fail. |
| Logout clears session and in-memory domain state. | Prevents next user seeing prior user's data. | Maestro sign out -> sign in as second user -> profile does not show first user's data. |
| Route names are typed and registered. | Prevents runtime navigation crashes. | `pnpm compile`; Maestro tab taps. |
| UI uses existing theme spacing and clear grouping/alignment. | Prevents inconsistent, crowded screens as phases add features. | Analyzer UI/UX review plus critical-screen screenshots. |
| Refactoring-ui hierarchy/contrast/state principles are applied. | Ensures screens remain understandable in happy, empty, loading, and error states. | Screenshots and analyzer UI/UX verdict before phase approval. |
| New visible strings follow the existing i18n pattern. | Keeps translation quality and i18n tests from regressing. | `pnpm compile`, `pnpm test:unit`, and changed-string review. |
| Maestro selectors remain stable ASCII/accessibility labels. | Avoids locale-sensitive E2E flakiness and Turkish-character hangs. | Maestro flow review and hierarchy dump when selectors fail. |
| Location is private by default. | User privacy. | New `profiles.show_location=false`, `location=null`. |
| One active dive per user in v1. | Core product rule from old app. | Phase 3 unique `created_by` constraint/upsert test. |
| Conversations are idempotent by unordered user pair. | Prevents duplicate chat threads. | Phase 4 double-RPC test returns same id. |

---

## Behavior That Must Not Change
- App still boots as Expo dev client with bundle/package id `com.divingbuddies.app` from `app.json:17-31`; verified by Maestro launch.
- Existing theme provider and dark/light behavior remain in place (`app/app.tsx:99-107`, `app/theme/context.tsx`); verified by compile and screen render.
- Existing i18n pattern remains the path for production visible strings; hardcoded visible strings require an explicit technical exception.
- Critical screen screenshots remain part of verification for each UI phase.
- Supabase local ports remain `54321`, `54322`, `54323`, `54324`; verified by `supabase status` and `config.toml`.
- PostGIS remains enabled; verified by `select extname from pg_extension where extname='postgis';`.
- Reference old app remains read-only; analyzer can compare checksums if any implementation touched sibling paths.
- Existing utility/component unit tests must keep passing unless demo-only tests are intentionally removed with replacement coverage.

---

## Legacy / Malformed Persisted-State Handling
- Remove only old fake auth keys `AuthProvider.authToken` and `AuthProvider.authEmail` on Phase 1 startup; do not clear all MMKV because navigation and theme use MMKV.
- If Supabase session storage contains malformed encrypted data, `secureAuthStorage.getItem` should return `null` after removing the bad key and should not crash app startup.
- If `profiles` row is missing for an authenticated user due to an old local DB reset or trigger race, default to signing out with a clear “Profile not found” error and fixing the migration/trigger. Any owner-safe repair insert requires a separately reviewed insert RLS policy and is not part of the default Phase 1 path.
- If old migrations exist locally, Phase 1 migrations must be additive on top of `20260525135648_enable_postgis.sql`; do not rewrite applied migrations after sharing.
- Navigation persisted state may point at old `Welcome`/`Demo` routes. On route graph replacement, invalid persisted navigation must be ignored/reset to the current auth branch instead of crashing. Verify by preserving `NAVIGATION_STATE` from Phase 0 and launching Phase 1.

---

## Validation Matrix

| Check | Command / Method | Proves |
|---|---|---|
| Exact regression path | Maestro `auth-signup-signout.yaml` | New user can create account, reach app, sign out. |
| Session preservation | Maestro `auth-signin-restore.yaml` | Supabase session persists across relaunch. |
| Negative auth | Maestro `auth-invalid-signin.yaml` | Invalid credentials/malformed input handled safely. |
| Password reset request | Maestro `auth-forgot-password.yaml` + Inbucket HTTP check | Reset email flow reaches local email UI. |
| Profile trigger | Hurl signup + psql profile query | `handle_new_user` creates profile. |
| RLS own select/update | REST with user JWT and psql row check | User can manage own profile. |
| RLS cross-user denial | REST update user A as user B | Privacy isolation. |
| Profile field hardening | REST own-row update of `email`, `avatar_path`, `location`, `show_location` | Server-owned/future-phase fields cannot be changed in Phase 1. |
| Avatar deferral | `psql "$SUPABASE_DB_URL" -c "select count(*) from storage.buckets where id='avatars';"` returns `0` | Phase 1 did not add avatar storage scope. |
| Behavior preservation | `pnpm compile && pnpm lint:check && pnpm test:unit && pnpm depcruise` | Existing app quality gates remain. |
| i18n coverage | `pnpm compile && pnpm test:unit` plus changed-string review | New visible strings follow existing translation pattern. |
| UI/UX evidence | Maestro screenshots for critical screens/states + analyzer UI/UX verdict | Refactoring-ui spacing, hierarchy, contrast, and state requirements are met. |
| Supabase preservation | `psql "$SUPABASE_DB_URL" -c "select extname from pg_extension where extname='postgis';"` | Phase 0 PostGIS still present. |
| Navigation preservation | Launch with stale `NAVIGATION_STATE` | Old route state does not crash app. |

---

## Evidence Owners

| Item | Owner | Proof Required |
|---|---|---|
| Supabase auth storage/session | @implementer | Maestro restore flow + code review of `client.ts` storage config. |
| Profiles schema/RLS | @implementer then @analyzer | Migration SQL + psql policy/schema output + REST negative checks. |
| Route graph | @implementer then @analyzer | `pnpm compile`, route grep, Maestro navigation. |
| Legacy fake auth cleanup | @implementer | Manual/automated stale key test notes. |
| UI quality/accessibility | @implementer then @analyzer | Screenshots, ASCII accessibility labels, contrast/spacing review. |
| i18n coverage | @implementer then @analyzer | Updated locale files or documented exceptions plus compile/i18n test output. |
| Reference app untouched | @analyzer if needed | Checksum/path diff for `/Users/Y_ALTAY1/Documents/mobile/diving-buddy-master`. |

---

## Failure Signals
- Any need to disable RLS to make the app work.
- Any Supabase service-role key imported into `app/`.
- Authenticated UI appears because old MMKV fake token exists without a Supabase session.
- Route names used in navigation are absent from TypeScript param lists.
- Cross-user profile update succeeds.
- Logout leaves prior profile/chat/dive data visible after signing in as another user.
- Maestro selectors use Turkish special characters or flaky text unavailable in hierarchy.
- New visible production strings are hardcoded without a documented exception.
- Critical screens lack screenshots or analyzer UI/UX verdict before phase approval.
- Later phase work (map/chat/dive) expands Phase 1 beyond placeholders.

---

## Review Gates

| Gate | After Phase | Focus Area |
|---|---|---|
| Gate 1 | 1.2 | Migration correctness, RLS, profile trigger, security-definer search paths, read-only/future-phase field protection. |
| Gate 2 | 1.3 | Supabase session lifecycle, SecureStore adapter, stale MMKV cleanup, logout reset. |
| Gate 3 | 1.4 | Route graph, linking config, demo route removal/unreachability. |
| Gate 4 | 1.6 | Full evidence bundle: Maestro, psql/API, compile/lint/test/depcruise, i18n coverage, screenshots, UI/UX verdict. |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---:|---:|---|
| Supabase SecureStore encrypted adapter bug blocks session restore. | MEDIUM | HIGH | Follow official Expo pattern; add restore Maestro flow; fallback to official AsyncStorage adapter only with analyzer approval. |
| RLS policy too strict blocks own profile. | MEDIUM | HIGH | Verify with REST own profile select/update before UI debugging; do not disable RLS. |
| RLS policy too loose exposes profiles. | LOW | HIGH | Cross-user negative REST checks and analyzer gate. |
| Navigation persisted state points to removed demo route. | MEDIUM | MEDIUM | Reset invalid nav state on auth route graph change; test stale state launch. |
| Password reset deep link is flaky locally. | LOW | LOW | Full reset completion is out of Phase 1; Phase 1 only verifies reset email receipt through Inbucket. |
| Demo cleanup breaks i18n/unit tests. | MEDIUM | LOW | Cleanup in dedicated commit; update tests with minimal replacements. |
| Avatar upload adds dependency/UI complexity. | LOW | MEDIUM | Defer avatar bucket/policies/image picker/upload tests to Phase 5. |

---

## Notes
- Skill implications: `react-native-expo` guidance generally emphasizes Expo Router/MobX, but current repo evidence and this plan choose Ignite React Navigation/context for KISS/DRY. Do not update skills during Phase 6 unless implementation changes reusable skill guidance. If a skill update is needed, load `skill-maintainer`/`skill-creator` and treat the skill change as a separate documented task, not as incidental Phase 6 polish.
- Context7 verified Supabase RN auth storage/session configuration and react-native-maps Apple Maps/provider assumptions.
- Use `python3` if any local helper scripts are needed.
- Use PM2 for app dev server during implementation if a persistent Expo process is needed; clean up processes after verification.
