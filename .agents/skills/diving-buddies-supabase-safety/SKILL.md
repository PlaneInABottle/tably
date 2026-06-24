---
name: diving-buddies-supabase-safety
description: "Use for Diving Buddies Supabase work: migrations, RPCs, database types, RLS-sensitive changes, moderation/reporting/blocking, account deletion, chat safety, map/dive visibility filters, and Supabase Edge Functions."
---

# Diving Buddies Supabase Safety

## Scope

Load this skill before touching `supabase/`, `app/services/supabase`, or service code for auth, profiles, map visibility, dive events, chat, reports, blocking, or account deletion.

For detailed RPC/table contracts, read `references/rpc-contracts.md`.

## Backend Rules

- Prefer SQL RPCs for app behavior. Client services should call `supabase.rpc(...)` or `supabase.functions.invoke(...)`, not raw table writes, unless the table is intentionally exposed.
- Keep security-sensitive SQL as `security definer` with explicit `set search_path = public, pg_temp`.
- All user-generated content paths must preserve:
  - authentication checks
  - terms acceptance checks where required
  - objectionable-content rejection where required
  - block filtering in both directions
  - active/non-deleted profile filtering
- Migrations live in `supabase/migrations` and should be append-only. Do not edit old migrations unless the user explicitly asks and the database is disposable.
- Update `app/services/supabase/database.types.ts` when schema/RPC types change, or document why generation was not possible.

## Client Service Rules

- Keep service return shapes as `ServiceResult`.
- Normalize database/Edge Function errors in the service layer, not in screens.
- When adding RPC columns, update the row type and normalizer in the matching service.
- When adding safety features, update both UI actions and list/detail filtering. Blocking should remove blocked users' profiles, dive events, conversations, and messages where applicable.

## Account Deletion

- Account deletion is implemented by `supabase/functions/delete-account/index.ts`.
- The Edge Function uses the user JWT to identify the caller, removes avatar objects, inserts an actioned moderation report snapshot, and deletes the auth user through the service role client.
- Client entry point is `app/services/account/accountService.ts`.
- Never put the service role key in app code.

## Verification

- For app service logic, add/update Jest tests when possible.
- For migration behavior, use direct local DB inspection with `psql` and the local Supabase DB URL.
- For end-to-end safety behavior, seed deterministic data with `pnpm seed:maestro` and verify affected mobile flows with Maestro.
