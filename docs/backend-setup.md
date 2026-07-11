# Tably backend setup

## Required environment values

The app needs `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Local SQL verification can use `SUPABASE_DB_URL`.

Use EAS environment variables for hosted builds. Do not commit `.env.local`, service-role keys, EAS tokens, signing credentials, or push credentials.

## Deployment order

1. Create or select a dedicated Supabase project.
2. Run `supabase link --project-ref <project-ref>`.
3. Run `supabase db push` and review the migration output.
4. Deploy `supabase functions deploy delete-account`.
5. Deploy `supabase functions deploy send-notifications`.
6. Configure Auth URLs for the deployed legal site and `tably://update-password`.
7. Create a protected schedule that invokes `send-notifications` regularly with the service-role
   key in the `Authorization: Bearer ...` header. User access tokens are rejected.
8. Add development, preview, and production Supabase values to their matching EAS environments.

## Verification

Use a disposable account to verify signup, recovery, table lifecycle, notifications, blocking, reporting, and deletion. Check final state with Supabase SQL or the dashboard rather than relying only on UI messages.
