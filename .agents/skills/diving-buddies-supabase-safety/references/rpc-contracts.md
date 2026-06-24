# Supabase RPC Contracts

Use this as a navigation aid, not a replacement for reading migrations.

## Primary Files

- Supabase client: `app/services/supabase/client.ts`
- Generated types: `app/services/supabase/database.types.ts`
- Migrations: `supabase/migrations/*.sql`
- Maestro seed: `scripts/seed-maestro-data.sql`
- Delete account function: `supabase/functions/delete-account/index.ts`

## App Service Mapping

- Auth/profile: `app/services/auth`, `app/services/profiles`
- Map users: `app/services/location/mapService.ts` -> `users_in_view`
- Dive events: `app/services/dives/diveEventService.ts` -> `list_own_dives`, `upsert_own_dive`, `upsert_own_dive_from_location`, `delete_own_dive`, `dives_in_view`
- Chat: `app/services/chat/chatService.ts` -> `upsert_conversation`, `get_conversations_with_latest_message`, `get_messages_by_conversation_id`, `send_message`
- Moderation: `app/services/moderation/moderationService.ts` -> `submit_report`, `block_user`, `unblock_user`, `list_blocked_users`
- Account deletion: `app/services/account/accountService.ts` -> Edge Function `delete-account`

## Safety-Critical Migration

`supabase/migrations/20260606100000_moderation_blocking_account_deletion.sql` adds or updates:

- `profiles.terms_accepted_at`, `profiles.terms_version`, `profiles.moderation_status`
- `user_blocks`
- `moderation_reports`
- `contains_objectionable_content`
- `reject_objectionable_text`
- `ensure_terms_accepted`
- `is_blocked_between`
- `accept_current_terms`
- `block_user`, `unblock_user`, `list_blocked_users`
- `submit_report`
- updated `users_in_view`, `dives_in_view`, chat RPCs, and dive upserts with blocking/content safeguards

## Required Behavior

- `users_in_view` must not return blocked users in either direction.
- `dives_in_view` must not return events from blocked users in either direction.
- `upsert_conversation` must reject blocked pairs.
- `get_conversations_with_latest_message` and `get_messages_by_conversation_id` must hide blocked conversations/messages.
- `send_message` must reject blocked pairs and objectionable content.
- `upsert_own_dive` and `upsert_own_dive_from_location` must require accepted terms and reject objectionable title/description content.
- `submit_report` must support `profile`, `dive`, `message`, and `conversation` target types.

## Local Verification Hints

- Use `SUPABASE_DB_URL` if set; otherwise local scripts default to `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
- Existing SQL helpers:
  - `scripts/verify-map-location-events-sql.sh`
  - `scripts/verify-phase5-avatar-sql.sh`
  - `scripts/verify-phase5-forbidden-scope.sh`
  - `scripts/verify-phase6-final-sql.sh`
- Seed Maestro data with:

```bash
pnpm seed:maestro
```
