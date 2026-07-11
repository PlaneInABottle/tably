# Tably

Tably is an Expo React Native app for today/tomorrow small-group social plans. Users discover nearby tables, join through an intro prompt, confirm attendance, and chat inside the table.

## Stack

- Expo 57 / React Native 0.86
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

Copy `.env.example` to `.env.local` and fill in the local or hosted Supabase values. Keep `.env.local` private. See `docs/backend-setup.md` for production deployment.

Use PM2 for long-running Metro sessions when working with agents:

```bash
pm2 start pnpm --name tably-metro -- start
```

## Verification

```bash
pnpm compile
pnpm lint:check
pnpm test:unit
sh scripts/verify-tably-sql.sh
pnpm test:maestro
```

The Maestro core flow creates its own account and table against local Supabase. Start the local stack and use an Expo development build before running it.

## Product Shape

- `Today`: list-first discovery with a map toggle.
- `Create`: structured small-plan creation.
- `Chats`: active table chats and next actions.
- `Profile`: profile, trust, safety, account settings.

Core table lifecycle: `pending_intro` -> `pending_confirm` -> `confirmed`, with expired seats released and waitlisted users promoted through Supabase RPCs.

Release metadata and external launch gates are documented in `docs/store-listing.md` and `docs/release-checklist.md`.
