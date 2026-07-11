# Tably Agent Guide

Use these repo-specific instructions in addition to the global Codex instructions.

## Project Facts

- This is an Expo React Native app using Expo 57, React Native 0.86, TypeScript, Supabase, React Navigation, and React Native Maps.
- Use `pnpm` for package scripts.
- The installed dev-client/app config bundle id is `com.tably.app`. Verify App Store Connect separately before release work.
- Prefer the iPhone 17 Pro Max simulator for local iOS verification unless the user asks for another device.
- Do not start long-lived dev servers directly. Use PM2 for Metro/dev-client processes and check `pm2 list` before starting another one.

## Local Skills

Load the relevant project skill before changing code in these areas:

- `.agents/skills/tably-mobile/SKILL.md` for table discovery, map/list UI, Supabase table RPCs, guided chat, join/confirmation flows, safety, and Maestro verification.

## Code Patterns

- Keep UI inside the existing Ignite-style structure: screens in `app/screens`, reusable UI in `app/components`, services in `app/services`, route types in `app/navigators/navigationTypes.ts`.
- Use `useAppTheme()` and `ThemedStyle` for styles. Prefer existing components such as `Text`, `Button`, `InlineNotice`, `AppToasts`, map components, and screen wrappers.
- Prefer `app/i18n/*.ts` for polished flows. Early Tably v1 screens may use local strings while the domain is moving quickly; consolidate them before release.
- Service functions return `ServiceResult`-style discriminated unions. Normalize backend errors in the service that owns the call.
- Supabase app code should generally call RPCs or Edge Functions, not raw table mutations, unless a migration/service contract explicitly supports it.
- When touching external-library behavior that is subtle, check Context7 or official docs first. This especially applies to `react-native-maps`, Supabase, EAS, and Expo APIs.

## Verification

- For code changes, run at least `pnpm compile`, `pnpm lint:check`, and `pnpm test:unit`.
- For mobile UI behavior, verify with Maestro MCP on the simulator when feasible. Use screenshots/inspection before tapping native map elements; coordinates can shift between launches.
- For Supabase behavior, verify through RPC/service tests and direct local DB inspection when the change touches migrations, RLS, blocking/reporting, or account deletion.
- Keep commits focused. Do not mix unrelated cleanup with feature or bug-fix commits.
