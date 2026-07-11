# Tably release checklist

## Automated gates

- `pnpm install --frozen-lockfile`
- `pnpm compile`
- `pnpm lint:check`
- `pnpm test:unit`
- `pnpm deps:check`
- `pnpm dlx expo-doctor`
- `supabase db reset --local --yes`
- `sh scripts/verify-tably-sql.sh`
- Run `.maestro/flows/table-core.yaml` on an iOS development build.
- Complete iOS and Android EAS development builds.

## Backend

- Link this repository to the production Supabase project.
- Apply every migration in `supabase/migrations`.
- Deploy `delete-account` and `send-notifications` Edge Functions.
- Schedule `send-notifications` with a server-side job authenticated by the service-role key.
- Configure production Auth site URL and `tably://update-password` redirect.
- Confirm the avatar bucket remains private.

## Store and operations

- Deploy `legal-site` at `https://tably.app` and verify every support URL.
- Confirm `com.tably.app` exists in App Store Connect and Google Play Console.
- Complete privacy/data-safety disclosures for account, profile, approximate location, user content, diagnostics, and push tokens.
- Upload phone screenshots without Expo development controls.
- Test account deletion from a production-backed build.
- Test report, block, leave, waitlist promotion, creator cancellation, and password recovery.
- Configure support mailbox monitoring for `support@tably.app`.
