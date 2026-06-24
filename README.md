# Tably

Tably is an Expo React Native app for today/tomorrow small-group social plans. Users discover nearby tables, join through an intro prompt, confirm attendance, and chat inside the table.

## Stack

- Expo 55 / React Native 0.83
- TypeScript
- Supabase + PostGIS
- React Navigation
- React Native Maps
- Jest
- Maestro

## Local Setup

```bash
pnpm install
pnpm start
```

Use PM2 for long-running Metro sessions when working with agents:

```bash
pm2 start pnpm --name tably-metro -- start
```

## Verification

```bash
pnpm compile
pnpm test:unit
pnpm test:maestro
```

The current Maestro script is a smoke entrypoint for the dev client. Add feature flows as table seed data matures.

## Product Shape

- `Today`: list-first discovery with a map toggle.
- `Create`: structured small-plan creation.
- `Chats`: active table chats and next actions.
- `Profile`: profile, trust, safety, account settings.

Core table lifecycle: `pending_intro` -> `pending_confirm` -> `confirmed`, with expired seats released and waitlisted users promoted through Supabase RPCs.
