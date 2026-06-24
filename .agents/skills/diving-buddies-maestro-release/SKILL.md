---
name: diving-buddies-maestro-release
description: Use for Diving Buddies simulator control, PM2 Metro management, Maestro MCP/YAML verification, screenshot capture, EAS builds, TestFlight/App Store submission checks, and release-readiness workflows.
---

# Diving Buddies Maestro Release

## Core Facts

- Installed local dev-client bundle id: `com.divingbuddies.app`.
- Preferred simulator: iPhone 17 Pro Max.
- Metro must be managed with PM2, not raw long-running shell commands.
- App Store Connect bundle IDs may differ from local dev-client config. Always verify `app.json`, `app.config.ts`, Apple Developer Identifiers, and App Store Connect before release/submission work.

For flow names and commands, read `references/verification-commands.md`.

## Runtime Workflow

1. Check current processes:

```bash
pm2 list
curl -fsS http://localhost:8081/status
```

2. If Metro is not running, start it through PM2:

```bash
pm2 start pnpm --name diving-expo-app -- start
```

3. Use Maestro MCP `list_devices` and prefer the connected iPhone 17 Pro Max.

## Maestro Rules

- Use Maestro MCP for live UI debugging and verification.
- Use `.maestro` YAML flows for repeatable regression checks.
- Use `appId: com.divingbuddies.app` for the installed dev-client unless the user has installed a different build.
- Always handle Expo dev-client screens (`DEVELOPMENT SERVERS`, `Continue`, `Reload`) when launching manually.
- Before tapping native map elements, take a screenshot or inspect the hierarchy. Map coordinates shift between launches.
- Avoid Turkish special characters in Maestro text selectors; prefer `testID`s and ASCII text.

## Release Checks

- Run `pnpm compile`, `pnpm lint:check`, and `pnpm test:unit` before build/release work.
- For EAS builds, use the existing package scripts:
  - `pnpm build:ios:sim`
  - `pnpm build:ios:device`
  - `pnpm build:ios:preview`
  - `pnpm build:ios:prod`
  - Android equivalents in `package.json`
- Before submitting to Apple, verify the Bundle ID in Apple Developer/App Store Connect matches the app config being built. Do not assume from prior conversations.
- App Store screenshot work should use real simulator screenshots from the required display classes; do not rely on resized screenshots unless Apple accepts the target dimensions.

## Verification Closure

When a mobile UI task is complete, report:

- device used
- Maestro flow or live MCP actions performed
- compile/lint/unit-test status
- any simulator/app id mismatch found
