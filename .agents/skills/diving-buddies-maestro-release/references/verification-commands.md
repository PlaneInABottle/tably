# Verification Commands

## Standard Checks

```bash
pnpm compile
pnpm lint:check
pnpm test:unit
```

## PM2 / Metro

```bash
pm2 list
curl -fsS http://localhost:8081/status
pm2 start pnpm --name diving-expo-app -- start
pm2 logs diving-expo-app --lines 120 --nostream
```

Use another PM2 process name only when there is a real port/process conflict and document it in the final answer.

## Maestro App ID

Local installed dev-client:

```yaml
appId: com.divingbuddies.app
```

Reusable flows usually use:

```yaml
appId: ${MAESTRO_APP_ID}
onFlowStart:
  - runFlow: ../shared/_OnFlowStart.yaml
```

## Useful Flow Files

- `.maestro/smoke-ios.yaml`
- `.maestro/flows/auth-signup-signout.yaml`
- `.maestro/flows/auth-signin-restore.yaml`
- `.maestro/flows/map-search-area.yaml`
- `.maestro/flows/dive-event-map-search.yaml`
- `.maestro/flows/map-saved-location-event-redesign.yaml`
- `.maestro/flows/chat-start-from-user-marker.yaml`
- `.maestro/flows/chat-start-from-dive-event.yaml`
- `.maestro/flows/chat-realtime-message.yaml`
- `.maestro/flows/profile-settings-basic.yaml`
- `.maestro/flows/settings-change-password.yaml`

Full scripted suite:

```bash
MAESTRO_APP_ID=com.divingbuddies.app pnpm test:maestro
```

## Seed Data

```bash
pnpm seed:maestro
```

The seed script uses `SUPABASE_DB_URL` when set, otherwise defaults to the local Supabase Postgres URL.

## Live MCP Launch Snippet

Use this pattern when running inline Maestro YAML through MCP:

```yaml
appId: com.divingbuddies.app
---
- stopApp
- launchApp
- runFlow:
    when:
      visible: "DEVELOPMENT SERVERS"
    commands:
      - tapOn: "http://localhost:8081"
      - waitForAnimationToEnd
- runFlow:
    when:
      visible: "Continue"
    commands:
      - tapOn: "Continue"
      - waitForAnimationToEnd
- runFlow:
    when:
      visible: "Reload"
    commands:
      - tapOn: "Reload"
      - waitForAnimationToEnd
```
