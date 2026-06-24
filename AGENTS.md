# Tably Agent Guide

Use these repo-specific instructions in addition to the global Codex instructions.

## Project Facts

- This is an Expo React Native app using Expo 55, React Native 0.83, TypeScript, Supabase, React Navigation, Gorhom Bottom Sheet, and React Native Maps.
- Use `pnpm` for package scripts.
- The installed dev-client/app config bundle id is `com.tably.app`. Verify App Store Connect separately before release work.
- Prefer the iPhone 17 Pro Max simulator for local iOS verification unless the user asks for another device.
- Do not start long-lived dev servers directly. Use PM2 for Metro/dev-client processes and check `pm2 list` before starting another one.

## Local Skills

Load the relevant project skill before changing code in these areas:

- `.agents/skills/diving-buddies-map/SKILL.md` for Map screen work, marker taps, `react-native-maps`, bottom sheets, location search, and map Maestro flows.
- `.agents/skills/diving-buddies-supabase-safety/SKILL.md` for Supabase migrations/RPCs, blocking, reporting, chat safety, account deletion, and RLS-sensitive work.
- `.agents/skills/diving-buddies-maestro-release/SKILL.md` for simulator control, Maestro verification, screenshot flows, EAS/App Store release checks, and PM2 runtime handling.

## Code Patterns

- Keep UI inside the existing Ignite-style structure: screens in `app/screens`, reusable UI in `app/components`, services in `app/services`, route types in `app/navigators/navigationTypes.ts`.
- Use `useAppTheme()` and `ThemedStyle` for styles. Prefer existing components such as `Text`, `Button`, `InlineNotice`, `AppToasts`, map components, and screen wrappers.
- Put user-facing strings in `app/i18n/*.ts`; do not hard-code visible text unless the surrounding code already does.
- Service functions return `ServiceResult`-style discriminated unions. Normalize backend errors in the service that owns the call.
- Supabase app code should generally call RPCs or Edge Functions, not raw table mutations, unless a migration/service contract explicitly supports it.
- When touching external-library behavior that is subtle, check Context7 or official docs first. This especially applies to `@gorhom/bottom-sheet`, `react-native-maps`, Supabase, EAS, and Expo APIs.

## Verification

- For code changes, run at least `pnpm compile`, `pnpm lint:check`, and `pnpm test:unit`.
- For mobile UI behavior, verify with Maestro MCP on the simulator when feasible. Use screenshots/inspection before tapping native map elements; coordinates can shift between launches.
- For Supabase behavior, verify through RPC/service tests and direct local DB inspection when the change touches migrations, RLS, blocking/reporting, or account deletion.
- Keep commits focused. Do not mix unrelated cleanup with feature or bug-fix commits.
