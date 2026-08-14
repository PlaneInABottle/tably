#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${TABLY_ARTIFACT_DIR:-$ROOT/artifacts/m4-security}"
DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
REST_URL="${SUPABASE_REST_URL:-http://127.0.0.1:54321/rest/v1}"
API_URL="${SUPABASE_API_URL:-http://127.0.0.1:54321}"
RESULTS="$(mktemp "${TMPDIR:-/tmp}/tably-security-results.XXXXXX")"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/tably-security.XXXXXX")"
FAILED=0
PHASE=initial

cleanup() {
  local rc=$?
  if [[ "$rc" -ne 0 ]]; then
    printf 'Tably security harness failed during %s\n' "$PHASE" >&2
    for log in "$WORK/${PHASE}.log" "$WORK/fixture.log" "$WORK/profile-fixture.log" "$WORK/auth-fixture.log"; do
      if [[ -f "$log" ]]; then
        awk '{ print }' "$log" >&2 || true
        break
      fi
    done
    if [[ -f "$RESULTS" ]]; then
      awk '{ print }' "$RESULTS" >&2 || true
    fi
  fi
  rm -rf "$WORK" "$RESULTS"
  return "$rc"
}
trap cleanup EXIT

record() {
  printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" >>"$RESULTS"
}

fail() {
  FAILED=1
  record "$1" "FAIL" "$2" "$3"
}

pass() {
  record "$1" "PASS" "$2" "$3"
}

expect_status() {
  local label="$1" expected="$2" observed="$3"
  if [[ ! "$observed" =~ ^[0-9]{3}$ ]]; then
    fail "$label" "HTTP $expected" "transport failure"
  elif [[ "$observed" == $expected ]]; then
    pass "$label" "HTTP $expected" "HTTP $observed"
  else
    fail "$label" "HTTP $expected" "HTTP $observed"
  fi
}

expect_non_2xx() {
  local label="$1" observed="$2"
  if [[ ! "$observed" =~ ^[0-9]{3}$ ]]; then
    fail "$label" "non-2xx" "transport failure"
  elif [[ "$observed" -lt 200 || "$observed" -ge 300 ]]; then
    pass "$label" "non-2xx" "HTTP $observed"
  else
    fail "$label" "non-2xx" "HTTP $observed"
  fi
}

expect_error() {
  local label="$1" expected="$2" status="$3" body_file="$4" message
  if ! message="$(jq -r '.message // .msg // .error_description // empty' "$body_file" 2>/dev/null)"; then
    fail "$label" "$expected" "invalid JSON response"
    return
  fi
  if [[ ! "$status" =~ ^[0-9]{3}$ ]]; then
    fail "$label" "$expected" "transport failure"
  elif [[ "$status" -ge 400 && "$status" -lt 500 && "$message" == "$expected" ]]; then
    pass "$label" "$expected" "HTTP $status"
  else
    fail "$label" "$expected" "HTTP $status message=${message:-redacted}"
  fi
}

request() {
  local method="$1" url="$2" token="$3" payload="$4" body_file="$5" api_key="${6:-$ANON_KEY}" result
  if [[ "${TABLY_HTTP_TEST_CURL_FAILURE:-0}" == 1 ]]; then return 1; fi
  if [[ "${TABLY_HTTP_TEST_EMPTY_STATUS:-0}" == 1 ]]; then printf ''; return 0; fi
  if [[ "${TABLY_HTTP_TEST_NON_THREE_DIGIT:-0}" == 1 ]]; then printf '20'; return 0; fi
  local -a args=(-sS -o "$body_file" -w '%{http_code}' -X "$method" "$url"
    -H "apikey: $api_key" -H "Authorization: Bearer $token" -H 'Content-Type: application/json')
  if [[ -n "$payload" ]]; then args+=(-d "$payload"); fi
  if ! result="$(curl "${args[@]}" 2>"$WORK/curl.err")"; then
    printf 'TRANSPORT_ERROR'
    return 0
  fi
  if [[ ! "$result" =~ ^[0-9]{3}$ ]]; then
    printf 'TRANSPORT_ERROR'
  else
    printf '%s' "$result"
  fi
}

valid_http_status() {
  [[ "$1" =~ ^[0-9]{3}$ ]]
}

state_snapshot() {
  state_snapshot_for 00000000-0000-4000-8000-000000000a01
}

state_snapshot_for() {
  local table_id="$1"
  psql "$DB_URL" -X -At -c "select coalesce((select status from public.social_tables where id='$table_id'::uuid),'missing') || '|' || (select count(*) from public.table_members where table_id='$table_id'::uuid) || '|' || (select count(*) from public.table_waitlist where table_id='$table_id'::uuid) || '|' || (select count(*) from public.notification_events where table_id='$table_id'::uuid) || '|' || (select count(*) from public.table_messages where table_id='$table_id'::uuid)"
}

login_user() {
  local email="$1" user_id="$2"
  JWT_SECRET="$JWT_SECRET" USER_ID="$user_id" USER_EMAIL="$email" python3 - <<'PY'
import base64
import hashlib
import hmac
import json
import os
import time

def encoded(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()

header = encoded(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
payload = encoded(json.dumps({
    "aud": "authenticated",
    "email": os.environ["USER_EMAIL"],
    "exp": int(time.time()) + 3600,
    "iat": int(time.time()),
    "role": "authenticated",
    "sub": os.environ["USER_ID"],
}, separators=(",", ":")).encode())
unsigned = f"{header}.{payload}".encode()
signature = encoded(hmac.new(os.environ["JWT_SECRET"].encode(), unsigned, hashlib.sha256).digest())
print(f"{header}.{payload}.{signature}")
PY
}

read_env_value() {
  local name="$1" value
  value="$(awk -F= -v key="$name" '$1 == key { print substr($0, index($0, "=") + 1) }' "$status_env")"
  value="${value#\"}"
  value="${value%\"}"
  printf '%s' "$value"
}

status_env="$WORK/status.env"
PHASE=status
supabase status -o env >"$status_env" 2>"$WORK/status.err" || exit 1
ANON_KEY="$(read_env_value ANON_KEY)"
SERVICE_KEY="$(read_env_value SERVICE_ROLE_KEY)"
JWT_SECRET="$(read_env_value JWT_SECRET)"
[[ -n "$ANON_KEY" && -n "$SERVICE_KEY" && -n "$JWT_SECRET" ]] || exit 1

if TABLY_HTTP_TEST_CURL_FAILURE=1 request GET "$API_URL/transport-test" "$ANON_KEY" '' "$WORK/transport-curl.json"; then
  fail http_transport_curl_failure 'curl failure rejected' 'accepted'
else
  pass http_transport_curl_failure 'curl failure rejected' 'rejected'
fi
empty_status="$(TABLY_HTTP_TEST_EMPTY_STATUS=1 request GET "$API_URL/transport-test" "$ANON_KEY" '' "$WORK/transport-empty.json")"
if valid_http_status "$empty_status"; then fail http_transport_empty_status 'empty rejected' 'accepted'; else pass http_transport_empty_status 'empty rejected' 'rejected'; fi
non_three_status="$(TABLY_HTTP_TEST_NON_THREE_DIGIT=1 request GET "$API_URL/transport-test" "$ANON_KEY" '' "$WORK/transport-non-three.json")"
if valid_http_status "$non_three_status"; then fail http_transport_non_three_digit 'non-three-digit rejected' 'accepted'; else pass http_transport_non_three_digit 'non-three-digit rejected' 'rejected'; fi
if valid_http_status 204; then pass http_transport_valid_status '204 accepted' '204'; else fail http_transport_valid_status '204 accepted' 'rejected'; fi

PHASE=reset
supabase db reset --local --no-seed >"$WORK/reset.log" 2>&1 || exit 1
PHASE=acl
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$ROOT/scripts/acl-manifest-tably.sql" >"$WORK/acl.log" 2>&1 || exit 1
psql "$DB_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >"$WORK/role-probe.log" 2>&1 || exit 1
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000b01', true);
  if public.admin_has_role('admin') is not false then raise exception 'admin role probe is not fail-safe false'; end if;
  if public.admin_has_role('reviewer') is not false then raise exception 'reviewer role probe is not fail-safe false'; end if;
  if public.admin_has_role('other') is not false then raise exception 'unapproved role probe is not fail-safe false'; end if;
end;
$$;
SQL

creator_email="m4.creator@example.invalid"
limited_email="m4.limited@example.invalid"
suspended_email="m4.suspended@example.invalid"
deleted_email="m4.deleted@example.invalid"
terms_email="m4.no-terms@example.invalid"
noprofile_email="m4.no-profile@example.invalid"
CREATOR_ID=00000000-0000-4000-8000-000000000b01
LIMITED_ID=00000000-0000-4000-8000-000000000b02
SUSPENDED_ID=00000000-0000-4000-8000-000000000b03
DELETED_ID=00000000-0000-4000-8000-000000000b04
TERMS_ID=00000000-0000-4000-8000-000000000b05
NOPROFILE_ID=00000000-0000-4000-8000-000000000b06
PHASE=auth-fixture
psql "$DB_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >"$WORK/auth-fixture.log" 2>&1 || exit 1
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, confirmation_token, recovery_token, email_change, email_change_token_new, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000b01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm4.creator@example.invalid', crypt('Password123!', gen_salt('bf')), '', '', '', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"M4 Creator"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000b02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm4.limited@example.invalid', crypt('Password123!', gen_salt('bf')), '', '', '', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"M4 Limited"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000b03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm4.suspended@example.invalid', crypt('Password123!', gen_salt('bf')), '', '', '', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"M4 Suspended"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000b04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm4.deleted@example.invalid', crypt('Password123!', gen_salt('bf')), '', '', '', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"M4 Deleted"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000b05', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm4.no-terms@example.invalid', crypt('Password123!', gen_salt('bf')), '', '', '', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"M4 No Terms"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000b06', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm4.no-profile@example.invalid', crypt('Password123!', gen_salt('bf')), '', '', '', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"M4 No Profile"}'::jsonb, now(), now());
SQL
CREATOR_TOKEN="$(login_user "$creator_email" "$CREATOR_ID")" || exit 1
LIMITED_TOKEN="$(login_user "$limited_email" "$LIMITED_ID")" || exit 1
SUSPENDED_TOKEN="$(login_user "$suspended_email" "$SUSPENDED_ID")" || exit 1
DELETED_TOKEN="$(login_user "$deleted_email" "$DELETED_ID")" || exit 1
TERMS_TOKEN="$(login_user "$terms_email" "$TERMS_ID")" || exit 1
NOPROFILE_TOKEN="$(login_user "$noprofile_email" "$NOPROFILE_ID")" || exit 1

PHASE=profile-fixture
psql "$DB_URL" -X -v ON_ERROR_STOP=1 \
  -v creator_id="$CREATOR_ID" -v limited_id="$LIMITED_ID" -v suspended_id="$SUSPENDED_ID" \
  -v deleted_id="$DELETED_ID" -v terms_id="$TERMS_ID" <<'SQL' >"$WORK/fixture.log" 2>&1 || exit 1
update public.profiles
set terms_accepted_at = now(), terms_version = '2026-06-ugc-v1', moderation_status = 'active'
where id in (:'creator_id'::uuid, :'limited_id'::uuid, :'suspended_id'::uuid, :'deleted_id'::uuid, :'terms_id'::uuid);
update public.profiles set display_name = 'M4 Limited', moderation_status = 'limited' where id = :'limited_id'::uuid;
update public.profiles set display_name = 'M4 Suspended', moderation_status = 'suspended' where id = :'suspended_id'::uuid;
update public.profiles set display_name = 'M4 Deleted', moderation_status = 'deleted' where id = :'deleted_id'::uuid;
update public.profiles set display_name = 'M4 No Terms', terms_accepted_at = null, terms_version = null where id = :'terms_id'::uuid;
delete from public.profiles where id = '00000000-0000-4000-8000-000000000b06';
select set_config('app.tably_rpc', 'on', false);
insert into public.social_tables (id, created_by, activity, title, note, vibe, area_label, starts_at, min_seats, max_seats, intro_prompt, location)
values ('00000000-0000-4000-8000-000000000a01', :'creator_id'::uuid, 'coffee', 'M4 security table', 'security fixture', 'casual', 'Kadikoy', now() + interval '4 hours', 2, 5, 'What brings you here?', extensions.ST_SetSRID(extensions.ST_MakePoint(29.025, 40.99), 4326)::geography);
insert into public.table_members (table_id, profile_id, status, intro_due_at, confirm_due_at, confirmed_at)
values ('00000000-0000-4000-8000-000000000a01', :'creator_id'::uuid, 'confirmed', now(), now(), now()),
       ('00000000-0000-4000-8000-000000000a01', :'limited_id'::uuid, 'confirmed', now(), now(), now());
insert into public.table_messages (id, table_id, sender_id, body)
values ('00000000-0000-4000-8000-000000000a02', '00000000-0000-4000-8000-000000000a01', :'limited_id'::uuid, 'limited sender message');
insert into public.notification_events (id, recipient_id, table_id, type, title, body, scheduled_for, status, dedupe_key, processing_started_at)
values
  ('00000000-0000-4000-8000-000000000a03', :'creator_id'::uuid, '00000000-0000-4000-8000-000000000a01', 'table_message', 'Processing failure', 'Processing failure fixture', now(), 'processing', 'm4-processing-failure', now()),
  ('00000000-0000-4000-8000-000000000a04', :'creator_id'::uuid, '00000000-0000-4000-8000-000000000a01', 'table_message', 'Queued rejection', 'Queued rejection fixture', now(), 'queued', 'm4-queued-rejection', null),
  ('00000000-0000-4000-8000-000000000a05', :'creator_id'::uuid, '00000000-0000-4000-8000-000000000a01', 'table_message', 'Processing sent', 'Processing sent fixture', now(), 'processing', 'm4-processing-sent', now()),
  ('00000000-0000-4000-8000-000000000a06', :'creator_id'::uuid, '00000000-0000-4000-8000-000000000a01', 'table_message', 'Processing skip', 'Processing skip fixture', now(), 'processing', 'm4-processing-skip', now()),
  ('00000000-0000-4000-8000-000000000a10', :'creator_id'::uuid, '00000000-0000-4000-8000-000000000a01', 'table_message', 'Mixed processing', 'Mixed processing fixture', now(), 'processing', 'm4-mixed-processing', now()),
  ('00000000-0000-4000-8000-000000000a11', :'creator_id'::uuid, '00000000-0000-4000-8000-000000000a01', 'table_message', 'Mixed sent', 'Mixed sent fixture', now(), 'sent', 'm4-mixed-sent', null)
on conflict (id) do nothing;
update public.notification_events
set sent_at = now() - interval '1 minute'
where id = '00000000-0000-4000-8000-000000000a06';
SQL

PHASE=postgrest-matrix
body="$WORK/allowed-patch.json"
STARTS_AT="$(date -u -v+4H '+%Y-%m-%dT%H:%M:%SZ')"
status="$(request PATCH "$REST_URL/profiles?id=eq.$CREATOR_ID" "$CREATOR_TOKEN" '{"display_name":"M4 Creator Updated","summary":"updated summary","is_first_login":false}' "$body")"
expect_status profile_allowed_patch 204 "$status"

declare -a forbidden_payloads=(
  '{"moderation_status":"suspended"}'
  '{"terms_accepted_at":null}'
  '{"terms_version":"forged"}'
  '{"email":"forged@example.invalid"}'
  '{"id":"00000000-0000-4000-8000-000000000999"}'
  '{"created_at":"2000-01-01T00:00:00Z"}'
  '{"updated_at":"2000-01-01T00:00:00Z"}'
  '{"avatar_path":"forged"}'
  '{"location":null}'
  '{"show_location":true}'
)
declare -a forbidden_names=(moderation_status terms_accepted_at terms_version email id created_at updated_at avatar_path location show_location)
for i in "${!forbidden_payloads[@]}"; do
  status="$(request PATCH "$REST_URL/profiles?id=eq.$CREATOR_ID" "$CREATOR_TOKEN" "${forbidden_payloads[$i]}" "$WORK/profile-${i}.json")"
  expect_non_2xx "profile_forbidden_${forbidden_names[$i]}" "$status"
done

for role in anon authenticated service_role; do
  case "$role" in
    anon) role_token="$ANON_KEY"; role_key="$ANON_KEY" ;;
    authenticated) role_token="$CREATOR_TOKEN"; role_key="$ANON_KEY" ;;
    service_role) role_token="$SERVICE_KEY"; role_key="$SERVICE_KEY" ;;
  esac
  status="$(request POST "$REST_URL/rpc/admin_has_role" "$role_token" '{"p_required_role":"admin"}' "$WORK/rpc-admin-has-role-${role}.json" "$role_key")"
  expect_non_2xx "direct_admin_has_role_${role}" "$status"
done
for rpc in require_active_profile current_profile_moderation_status; do
  status="$(request POST "$REST_URL/rpc/$rpc" "$CREATOR_TOKEN" '{}' "$WORK/rpc-${rpc}.json")"
  expect_non_2xx "direct_internal_${rpc}" "$status"
done
for rpc in claim_notification_events mark_notification_events; do
  payload='{"p_limit":1}'
  [[ "$rpc" == mark_notification_events ]] && payload='{"p_event_ids":[],"p_status":"sent"}'
  status="$(request POST "$REST_URL/rpc/$rpc" "$CREATOR_TOKEN" "$payload" "$WORK/rpc-${rpc}.json")"
  expect_non_2xx "direct_worker_${rpc}" "$status"
done

status="$(request POST "$REST_URL/rpc/mark_notification_events" "$SERVICE_KEY" '{"p_event_ids":["00000000-0000-4000-8000-000000000a04"],"p_status":"sent"}' "$WORK/service-mark-queued.json" "$SERVICE_KEY")"
expect_non_2xx service_mark_queued_rejected "$status"
status="$(request POST "$REST_URL/rpc/mark_notification_events" "$SERVICE_KEY" '{"p_event_ids":["00000000-0000-4000-8000-000000000a03"],"p_status":"failed","p_error":"Expo push send failed."}' "$WORK/service-mark-failed.json" "$SERVICE_KEY")"
expect_status service_mark_processing_failed 204 "$status"
failed_state="$(psql "$DB_URL" -X -Atc "select status || '|' || coalesce(error,'') || '|' || (processing_started_at is null)::int || '|' || (sent_at is null)::int from public.notification_events where id='00000000-0000-4000-8000-000000000a03'")"
if [[ "$failed_state" == 'failed|Expo push send failed.|1|1' ]]; then pass service_mark_failed_state exact "$failed_state"; else fail service_mark_failed_state exact "${failed_state:-missing}"; fi
status="$(request POST "$REST_URL/rpc/mark_notification_events" "$SERVICE_KEY" '{"p_event_ids":["00000000-0000-4000-8000-000000000a05"],"p_status":"sent","p_error":null}' "$WORK/service-mark-sent.json" "$SERVICE_KEY")"
expect_status service_mark_processing_sent 204 "$status"
sent_state="$(psql "$DB_URL" -X -Atc "select status || '|' || (sent_at is not null)::int || '|' || (processing_started_at is null)::int from public.notification_events where id='00000000-0000-4000-8000-000000000a05'")"
if [[ "$sent_state" == 'sent|1|1' ]]; then pass service_mark_sent_state exact "$sent_state"; else fail service_mark_sent_state exact "${sent_state:-missing}"; fi
old_skip_sent_at="$(psql "$DB_URL" -X -Atc "select sent_at from public.notification_events where id='00000000-0000-4000-8000-000000000a06'")"
status="$(request POST "$REST_URL/rpc/mark_notification_events" "$SERVICE_KEY" '{"p_event_ids":["00000000-0000-4000-8000-000000000a06"],"p_status":"skipped","p_error":"No push token for recipient."}' "$WORK/service-mark-skipped.json" "$SERVICE_KEY")"
expect_status service_mark_processing_skipped 204 "$status"
skip_state="$(psql "$DB_URL" -X -Atc "select status || '|' || coalesce(error,'') || '|' || (processing_started_at is null)::int || '|' || sent_at::text from public.notification_events where id='00000000-0000-4000-8000-000000000a06'")"
if [[ "$skip_state" == "skipped|No push token for recipient.|1|$old_skip_sent_at" ]]; then pass service_mark_skipped_state exact "skipped|No push token for recipient.|1|preserved"; else fail service_mark_skipped_state exact "${skip_state:-missing}"; fi
mixed_before="$(psql "$DB_URL" -X -Atc "select string_agg(id::text || ':' || status, ',' order by id) from public.notification_events where id in ('00000000-0000-4000-8000-000000000a10','00000000-0000-4000-8000-000000000a11')")"
status="$(request POST "$REST_URL/rpc/mark_notification_events" "$SERVICE_KEY" '{"p_event_ids":["00000000-0000-4000-8000-000000000a10","00000000-0000-4000-8000-000000000a11"],"p_status":"failed","p_error":"mixed batch"}' "$WORK/service-mark-mixed.json" "$SERVICE_KEY")"
expect_non_2xx service_mark_mixed_processing_terminal_rejected "$status"
mixed_after="$(psql "$DB_URL" -X -Atc "select string_agg(id::text || ':' || status, ',' order by id) from public.notification_events where id in ('00000000-0000-4000-8000-000000000a10','00000000-0000-4000-8000-000000000a11')")"
if [[ "$mixed_before" == "$mixed_after" ]]; then pass service_mark_mixed_state_unchanged unchanged "$mixed_after"; else fail service_mark_mixed_state_unchanged unchanged "$mixed_before -> $mixed_after"; fi

status="$(request POST "$REST_URL/social_tables" "$CREATOR_TOKEN" '{"created_by":"00000000-0000-4000-8000-000000000999","activity":"coffee","title":"forbidden","area_label":"x","starts_at":"2030-01-01T00:00:00Z","min_seats":2,"max_seats":3,"location":"SRID=4326;POINT(29 40)"}' "$WORK/direct-table.json")"
expect_non_2xx direct_social_table_insert "$status"
status="$(request POST "$REST_URL/table_messages" "$CREATOR_TOKEN" '{"table_id":"00000000-0000-4000-8000-000000000a01","sender_id":"00000000-0000-4000-8000-000000000999","body":"forbidden"}' "$WORK/direct-message.json")"
expect_non_2xx direct_table_message_insert "$status"

status="$(request POST "$REST_URL/rpc/create_social_table" "$CREATOR_TOKEN" "{\"p_activity\":\"coffee\",\"p_title\":\"M4 active positive\",\"p_note\":\"\",\"p_vibe\":\"casual\",\"p_area_label\":\"Kadikoy\",\"p_starts_at\":\"$STARTS_AT\",\"p_lng\":29.025,\"p_lat\":40.99,\"p_min_seats\":2,\"p_max_seats\":3,\"p_intro_prompt\":\"What brings you here?\"}" "$WORK/active-create.json")"
expect_status active_terms_create 200 "$status"

status="$(request POST "$REST_URL/rpc/create_social_table" "$TERMS_TOKEN" "{\"p_activity\":\"coffee\",\"p_title\":\"M4 no terms\",\"p_note\":\"\",\"p_vibe\":\"casual\",\"p_area_label\":\"Kadikoy\",\"p_starts_at\":\"$STARTS_AT\",\"p_lng\":29.025,\"p_lat\":40.99,\"p_min_seats\":2,\"p_max_seats\":3,\"p_intro_prompt\":\"What brings you here?\"}" "$WORK/no-terms.json")"
expect_error terms_gate_order 'Terms must be accepted before sharing content.' "$status" "$WORK/no-terms.json"
for pair in "limited:$LIMITED_TOKEN:Account limited" "suspended:$SUSPENDED_TOKEN:Account suspended" "deleted:$DELETED_TOKEN:Account not found" "no_profile:$NOPROFILE_TOKEN:Account not found"; do
  IFS=: read -r name token expected <<<"$pair"
  status="$(request POST "$REST_URL/rpc/create_social_table" "$token" "{\"p_activity\":\"coffee\",\"p_title\":\"M4 denied\",\"p_note\":\"\",\"p_vibe\":\"casual\",\"p_area_label\":\"Kadikoy\",\"p_starts_at\":\"$STARTS_AT\",\"p_lng\":29.025,\"p_lat\":40.99,\"p_min_seats\":2,\"p_max_seats\":3,\"p_intro_prompt\":\"What brings you here?\"}" "$WORK/${name}-create.json")"
  expect_error "${name}_write_gate" "$expected" "$status" "$WORK/${name}-create.json"
done

status="$(request POST "$REST_URL/rpc/join_social_table" "$CREATOR_TOKEN" '{"p_table_id":"00000000-0000-4000-8000-000000000aff"}' "$WORK/not-found.json")"
expect_error table_not_found_order 'Table not found' "$status" "$WORK/not-found.json"

read_payload() {
  case "$1" in
    list) printf '%s' '{"p_min_lat":-90,"p_min_lng":-180,"p_max_lat":90,"p_max_lng":180}' ;;
    detail|members|messages) printf '%s' '{"p_table_id":"00000000-0000-4000-8000-000000000a01"}' ;;
    active) printf '%s' '{}' ;;
  esac
}

read_rpc() {
  case "$1" in
    list) printf '%s' list_social_tables ;;
    detail) printf '%s' get_social_table_detail ;;
    members) printf '%s' list_table_members ;;
    active) printf '%s' list_my_active_tables ;;
    messages) printf '%s' list_table_messages ;;
  esac
}

read_shape() {
  case "$1" in
    list|members|active|messages) printf '%s' 'length >= 1' ;;
    detail) printf '%s' 'length == 1' ;;
  esac
}

for state_token in "active:$CREATOR_TOKEN" "limited:$LIMITED_TOKEN"; do
  IFS=: read -r read_state read_token <<<"$state_token"
  for read_name in list detail members active messages; do
    read_rpc_name="$(read_rpc "$read_name")"
    read_status="$(request POST "$REST_URL/rpc/$read_rpc_name" "$read_token" "$(read_payload "$read_name")" "$WORK/${read_state}-${read_name}.json")"
    if [[ "$read_status" == 200 ]] && jq -e "$(read_shape "$read_name")" "$WORK/${read_state}-${read_name}.json" >/dev/null 2>&1; then
      pass "${read_state}_${read_name}_shape" "HTTP 200 and $(read_shape "$read_name")" "HTTP $read_status"
    else
      fail "${read_state}_${read_name}_shape" "HTTP 200 and $(read_shape "$read_name")" "HTTP $read_status"
    fi
    if [[ "$read_state" == limited ]]; then
      read_before="$(state_snapshot)"
      read_status="$(request POST "$REST_URL/rpc/$read_rpc_name" "$read_token" "$(read_payload "$read_name")" "$WORK/${read_state}-${read_name}-pure.json")"
      read_after="$(state_snapshot)"
      if [[ "$read_status" == 200 && "$read_before" == "$read_after" ]]; then
        pass "${read_state}_${read_name}_pure" unchanged "$read_after"
      else
        fail "${read_state}_${read_name}_pure" unchanged "HTTP $read_status $read_before -> $read_after"
      fi
    fi
  done
done

for state_token in "suspended:$SUSPENDED_TOKEN" "deleted:$DELETED_TOKEN" "no_profile:$NOPROFILE_TOKEN"; do
  IFS=: read -r read_state read_token <<<"$state_token"
  for read_name in list detail members active messages; do
    read_rpc_name="$(read_rpc "$read_name")"
    read_status="$(request POST "$REST_URL/rpc/$read_rpc_name" "$read_token" "$(read_payload "$read_name")" "$WORK/${read_state}-${read_name}.json")"
    if [[ "$read_status" == 200 ]] && jq -e 'length == 0' "$WORK/${read_state}-${read_name}.json" >/dev/null 2>&1; then
      pass "${read_state}_${read_name}_hidden" 'empty projection' 'HTTP 200 empty'
    else
      fail "${read_state}_${read_name}_hidden" 'empty projection' "HTTP $read_status"
    fi
  done
done

PHASE=removed-table-fixture
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -v creator_id="$CREATOR_ID" -v limited_id="$LIMITED_ID" <<'SQL' >"$WORK/removed-table-fixture.log" 2>&1 || exit 1
select set_config('app.tably_rpc', 'on', false);
insert into public.social_tables (id, created_by, activity, title, note, vibe, area_label, starts_at, min_seats, max_seats, intro_prompt, location, status, content_removed_at)
values ('00000000-0000-4000-8000-000000000a07', :'creator_id'::uuid, 'coffee', 'Removed M4 table', 'removed fixture', 'casual', 'Kadikoy', now() + interval '4 hours', 2, 5, 'Removed?', extensions.ST_SetSRID(extensions.ST_MakePoint(29.025, 40.99), 4326)::geography, 'confirmed', now());
insert into public.table_members (table_id, profile_id, status, intro_due_at, confirm_due_at, confirmed_at)
values ('00000000-0000-4000-8000-000000000a07', :'creator_id'::uuid, 'confirmed', now(), now(), now());
insert into public.table_waitlist (table_id, profile_id)
values ('00000000-0000-4000-8000-000000000a07', :'limited_id'::uuid);
insert into public.table_messages (id, table_id, sender_id, body)
values ('00000000-0000-4000-8000-000000000a09', '00000000-0000-4000-8000-000000000a07', :'creator_id'::uuid, 'removed message');
insert into public.notification_events (id, recipient_id, table_id, type, title, body, scheduled_for, status, dedupe_key)
values ('00000000-0000-4000-8000-000000000a08', :'creator_id'::uuid, '00000000-0000-4000-8000-000000000a07', 'table_message', 'Removed notification', 'removed notification', now(), 'queued', 'm4-removed-notification');
SQL
for removed_write in join answer confirm send; do
  case "$removed_write" in
    join) removed_rpc=join_social_table; removed_payload='{"p_table_id":"00000000-0000-4000-8000-000000000a07"}' ;;
    answer) removed_rpc=answer_table_intro; removed_payload='{"p_table_id":"00000000-0000-4000-8000-000000000a07","p_answer":"removed"}' ;;
    confirm) removed_rpc=confirm_table_attendance; removed_payload='{"p_table_id":"00000000-0000-4000-8000-000000000a07"}' ;;
    send) removed_rpc=send_table_message; removed_payload='{"p_table_id":"00000000-0000-4000-8000-000000000a07","p_body":"removed"}' ;;
  esac
  removed_before="$(state_snapshot_for 00000000-0000-4000-8000-000000000a07)"
  status="$(request POST "$REST_URL/rpc/$removed_rpc" "$CREATOR_TOKEN" "$removed_payload" "$WORK/removed-${removed_write}.json")"
  expect_error "removed_${removed_write}" 'Table not found' "$status" "$WORK/removed-${removed_write}.json"
  removed_after="$(state_snapshot_for 00000000-0000-4000-8000-000000000a07)"
  if [[ "$removed_before" == "$removed_after" ]]; then pass "removed_${removed_write}_no_side_effect" unchanged "$removed_after"; else fail "removed_${removed_write}_no_side_effect" unchanged "$removed_before -> $removed_after"; fi
done

PHASE=limited-purity-fixture
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -v limited_id="$LIMITED_ID" <<'SQL' >"$WORK/limited-purity-fixture.log" 2>&1 || exit 1
select set_config('app.tably_rpc', 'on', false);
update public.table_members
set status = 'pending_intro', intro_due_at = now() - interval '1 minute'
where table_id = '00000000-0000-4000-8000-000000000a01' and profile_id = :'limited_id'::uuid;
SQL
limited_before="$(state_snapshot)"
status="$(request POST "$REST_URL/rpc/list_social_tables" "$LIMITED_TOKEN" '{"p_min_lat":-90,"p_min_lng":-180,"p_max_lat":90,"p_max_lng":180}' "$WORK/limited-list.json")"
if [[ "$status" == 200 ]] && jq -e 'length >= 1' "$WORK/limited-list.json" >/dev/null 2>&1; then pass limited_read_only 'visible list' 'one or more rows'; else fail limited_read_only 'visible list' "HTTP $status"; fi
limited_after="$(state_snapshot)"
if [[ "$limited_before" == "$limited_after" ]]; then pass limited_read_pure 'state unchanged' "$limited_before"; else fail limited_read_pure 'state unchanged' "$limited_before -> $limited_after"; fi
status="$(request POST "$REST_URL/rpc/list_social_tables" "$CREATOR_TOKEN" '{"p_min_lat":-90,"p_min_lng":-180,"p_max_lat":90,"p_max_lng":180}' "$WORK/active-housekeeping.json")"
active_housekeeping_state="$(psql "$DB_URL" -X -Atc "select status from public.table_members where table_id='00000000-0000-4000-8000-000000000a01' and profile_id='$LIMITED_ID'")"
if [[ "$status" == 200 && "$active_housekeeping_state" == replaced ]]; then pass active_read_housekeeping replaced "$active_housekeeping_state"; else fail active_read_housekeeping replaced "HTTP $status state=${active_housekeeping_state:-missing}"; fi
for read_name in detail members active messages; do
  read_rpc_name="$(read_rpc "$read_name")"
  status="$(request POST "$REST_URL/rpc/$read_rpc_name" "$CREATOR_TOKEN" "$(read_payload "$read_name")" "$WORK/active-${read_name}-after-housekeeping.json")"
  if [[ "$status" == 200 ]] && jq -e "$(read_shape "$read_name")" "$WORK/active-${read_name}-after-housekeeping.json" >/dev/null 2>&1; then
    pass "active_${read_name}_after_housekeeping" "HTTP 200 and $(read_shape "$read_name")" "HTTP $status"
  else
    fail "active_${read_name}_after_housekeeping" "HTTP 200 and $(read_shape "$read_name")" "HTTP $status"
  fi
done
status="$(request POST "$REST_URL/rpc/list_social_tables" "$SUSPENDED_TOKEN" '{"p_min_lat":-90,"p_min_lng":-180,"p_max_lat":90,"p_max_lng":180}' "$WORK/suspended-list.json")"
if [[ "$status" == 200 ]] && jq -e 'length == 0' "$WORK/suspended-list.json" >/dev/null 2>&1; then pass suspended_hidden_read 'empty list' 'empty list'; else fail suspended_hidden_read 'empty list' "HTTP $status"; fi

PHASE=target-state
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -v creator_id="$CREATOR_ID" -v limited_id="$LIMITED_ID" <<'SQL' >"$WORK/target-state.log" 2>&1 || exit 1
delete from public.user_blocks where blocker_id = :'creator_id'::uuid and blocked_id = :'limited_id'::uuid;
update public.profiles set moderation_status = 'limited' where id = :'creator_id'::uuid;
SQL
status="$(request POST "$REST_URL/rpc/list_social_tables" "$LIMITED_TOKEN" '{"p_min_lat":-90,"p_min_lng":-180,"p_max_lat":90,"p_max_lng":180}' "$WORK/limited-target-visible.json")"
if [[ "$status" == 200 ]] && jq -e 'length >= 1' "$WORK/limited-target-visible.json" >/dev/null 2>&1; then pass limited_target_visible 'visible list' 'one or more rows'; else fail limited_target_visible 'visible list' "HTTP $status"; fi
PHASE=target-state-2
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -v creator_id="$CREATOR_ID" <<'SQL' >"$WORK/target-state-2.log" 2>&1 || exit 1
update public.profiles set moderation_status = 'suspended' where id = :'creator_id'::uuid;
SQL
status="$(request POST "$REST_URL/rpc/list_social_tables" "$LIMITED_TOKEN" '{"p_min_lat":-90,"p_min_lng":-180,"p_max_lat":90,"p_max_lng":180}' "$WORK/suspended-target-hidden.json")"
if [[ "$status" == 200 ]] && jq -e 'length == 0' "$WORK/suspended-target-hidden.json" >/dev/null 2>&1; then pass suspended_target_hidden 'empty list' 'empty list'; else fail suspended_target_hidden 'empty list' "HTTP $status"; fi
PHASE=target-state-3
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -v creator_id="$CREATOR_ID" -v limited_id="$LIMITED_ID" <<'SQL' >"$WORK/target-state-3.log" 2>&1 || exit 1
update public.profiles set moderation_status = 'active' where id = :'creator_id'::uuid;
insert into public.user_blocks (blocker_id, blocked_id) values (:'creator_id'::uuid, :'limited_id'::uuid);
SQL
status="$(request POST "$REST_URL/rpc/list_social_tables" "$LIMITED_TOKEN" '{"p_min_lat":-90,"p_min_lng":-180,"p_max_lat":90,"p_max_lng":180}' "$WORK/blocked-list.json")"
if [[ "$status" == 200 ]] && jq -e 'length == 0' "$WORK/blocked-list.json" >/dev/null 2>&1; then pass block_filter_preserved 'empty list' 'empty list'; else fail block_filter_preserved 'empty list' "HTTP $status"; fi

write_rpc_payload() {
  case "$1" in
    create) printf '{"p_activity":"coffee","p_title":"M4 matrix","p_note":"","p_vibe":"casual","p_area_label":"Kadikoy","p_starts_at":"%s","p_lng":29.025,"p_lat":40.99,"p_min_seats":2,"p_max_seats":5,"p_intro_prompt":"What brings you here?"}' "$STARTS_AT" ;;
    join) printf '%s' '{"p_table_id":"00000000-0000-4000-8000-000000000a01"}' ;;
    answer) printf '%s' '{"p_table_id":"00000000-0000-4000-8000-000000000a01","p_answer":"M4 answer"}' ;;
    confirm) printf '%s' '{"p_table_id":"00000000-0000-4000-8000-000000000a01"}' ;;
    send) printf '%s' '{"p_table_id":"00000000-0000-4000-8000-000000000a01","p_body":"M4 message"}' ;;
  esac
}

for write in create join answer confirm send; do
  before="$(state_snapshot)"
  payload="$(write_rpc_payload "$write")"
  case "$write" in
    create) rpc_name=create_social_table ;;
    join) rpc_name=join_social_table ;;
    answer) rpc_name=answer_table_intro ;;
    confirm) rpc_name=confirm_table_attendance ;;
    send) rpc_name=send_table_message ;;
  esac
  status="$(request POST "$REST_URL/rpc/$rpc_name" "$TERMS_TOKEN" "$payload" "$WORK/terms-${write}.json")"
  expect_error "terms_${write}" 'Terms must be accepted before sharing content.' "$status" "$WORK/terms-${write}.json"
  after="$(state_snapshot)"
  if [[ "$before" == "$after" ]]; then pass "terms_${write}_no_side_effect" unchanged "$after"; else fail "terms_${write}_no_side_effect" unchanged "$before -> $after"; fi
done

for pair in "limited:$LIMITED_TOKEN:Account limited" "suspended:$SUSPENDED_TOKEN:Account suspended" "deleted:$DELETED_TOKEN:Account not found" "no_profile:$NOPROFILE_TOKEN:Account not found"; do
  IFS=: read -r state token expected <<<"$pair"
  for write in create join answer confirm send; do
    case "$write" in
      create) rpc_name=create_social_table ;;
      join) rpc_name=join_social_table ;;
      answer) rpc_name=answer_table_intro ;;
      confirm) rpc_name=confirm_table_attendance ;;
      send) rpc_name=send_table_message ;;
    esac
    before="$(state_snapshot)"
    payload="$(write_rpc_payload "$write")"
    status="$(request POST "$REST_URL/rpc/$rpc_name" "$token" "$payload" "$WORK/${state}-${write}.json")"
    expect_error "${state}_${write}" "$expected" "$status" "$WORK/${state}-${write}.json"
    after="$(state_snapshot)"
    if [[ "$before" == "$after" ]]; then pass "${state}_${write}_no_side_effect" unchanged "$after"; else fail "${state}_${write}_no_side_effect" unchanged "$before -> $after"; fi
  done
done

PHASE=five-write-positive-fixture
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -v limited_id="$LIMITED_ID" -v terms_id="$TERMS_ID" <<'SQL' >"$WORK/five-write-positive-fixture.log" 2>&1 || exit 1
update public.profiles set terms_accepted_at = now(), terms_version = '2026-06-ugc-v1' where id = :'terms_id'::uuid;
select set_config('app.tably_rpc', 'on', false);
update public.table_members
set status = 'confirmed', intro_due_at = now(), confirm_due_at = now(), confirmed_at = now()
where table_id = '00000000-0000-4000-8000-000000000a01' and profile_id = :'limited_id'::uuid;
SQL

status="$(request POST "$REST_URL/rpc/join_social_table" "$TERMS_TOKEN" "$(write_rpc_payload join)" "$WORK/active-join.json")"
if [[ "$status" == 200 ]] && jq -e '.[0].member_status == "pending_intro"' "$WORK/active-join.json" >/dev/null 2>&1; then pass active_join_shape 'pending_intro' 'pending_intro'; else fail active_join_shape 'pending_intro' "HTTP $status"; fi
status="$(request POST "$REST_URL/rpc/answer_table_intro" "$TERMS_TOKEN" "$(write_rpc_payload answer)" "$WORK/active-answer.json")"
if [[ "$status" == 200 ]] && jq -e '.[0].member_status == "pending_confirm"' "$WORK/active-answer.json" >/dev/null 2>&1; then pass active_answer_shape 'pending_confirm' 'pending_confirm'; else fail active_answer_shape 'pending_confirm' "HTTP $status"; fi
status="$(request POST "$REST_URL/rpc/confirm_table_attendance" "$TERMS_TOKEN" "$(write_rpc_payload confirm)" "$WORK/active-confirm.json")"
if [[ "$status" == 200 ]] && jq -e '.[0].member_status == "confirmed"' "$WORK/active-confirm.json" >/dev/null 2>&1; then pass active_confirm_shape 'confirmed' 'confirmed'; else fail active_confirm_shape 'confirmed' "HTTP $status"; fi
before_messages="$(psql "$DB_URL" -X -Atc "select count(*) from public.table_messages where table_id='00000000-0000-4000-8000-000000000a01'")"
status="$(request POST "$REST_URL/rpc/send_table_message" "$TERMS_TOKEN" "$(write_rpc_payload send)" "$WORK/active-send.json")"
after_messages="$(psql "$DB_URL" -X -Atc "select count(*) from public.table_messages where table_id='00000000-0000-4000-8000-000000000a01'")"
if [[ "$status" == 200 && "$after_messages" == $((before_messages + 1)) ]] && jq -e 'length == 1' "$WORK/active-send.json" >/dev/null 2>&1; then pass active_send_shape 'one message' "$after_messages"; else fail active_send_shape 'one message' "HTTP $status messages=$before_messages->$after_messages"; fi

PHASE=leave-fixture
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -v limited_id="$LIMITED_ID" <<'SQL' >"$WORK/leave-fixture.log" 2>&1 || exit 1
delete from public.user_blocks where blocker_id = '00000000-0000-0000-0000-000000000000';
select set_config('app.tably_rpc', 'on', false);
update public.table_members set status = 'confirmed' where table_id = '00000000-0000-4000-8000-000000000a01' and profile_id = :'limited_id'::uuid;
SQL
status="$(request POST "$REST_URL/rpc/leave_social_table" "$LIMITED_TOKEN" '{"p_table_id":"00000000-0000-4000-8000-000000000a01"}' "$WORK/limited-leave.json")"
expect_status limited_cleanup_leave 204 "$status"
leave_status="$(psql "$DB_URL" -X -Atc "select status from public.table_members where table_id='00000000-0000-4000-8000-000000000a01' and profile_id='$LIMITED_ID'")"
if [[ "$leave_status" == left ]]; then pass limited_leave_state left "$leave_status"; else fail limited_leave_state left "${leave_status:-missing}"; fi

publication="$(psql "$DB_URL" -X -Atc "select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename in ('social_tables','table_messages')")"
if [[ "$publication" == 2 ]]; then pass realtime_publication '2 tables' "$publication tables"; else fail realtime_publication '2 tables' "${publication:-0} tables"; fi
visible_indexes="$(psql "$DB_URL" -X -Atc "select count(*) from pg_indexes where schemaname='public' and ((indexname='social_tables_active_created_idx' and indexdef like '%(created_at DESC)%' and indexdef like '%WHERE (content_removed_at IS NULL)%') or (indexname='table_messages_visible_idx' and indexdef like '%(table_id, created_at)%' and indexdef like '%WHERE (content_removed_at IS NULL)%'))")"
if [[ "$visible_indexes" == 2 ]]; then pass visible_row_indexes '2 exact indexes' "$visible_indexes"; else fail visible_row_indexes '2 exact indexes' "${visible_indexes:-0}"; fi
profile_acl="$(psql "$DB_URL" -X -Atc "select has_table_privilege('authenticated','public.profiles','UPDATE')::int || ':' || has_column_privilege('authenticated','public.profiles','display_name','UPDATE')::int || ':' || has_column_privilege('authenticated','public.profiles','summary','UPDATE')::int || ':' || has_column_privilege('authenticated','public.profiles','is_first_login','UPDATE')::int")"
if [[ "$profile_acl" == 0:1:1:1 ]]; then pass profile_column_acl '0:1:1:1' "$profile_acl"; else fail profile_column_acl '0:1:1:1' "$profile_acl"; fi

objects="$(psql "$DB_URL" -X -Atc "select count(*) from pg_class where relnamespace='public'::regnamespace and relname in ('admin_roles','moderation_audit_log')")"
if [[ "$objects" == 0 ]]; then pass no_m42_tables '0' "$objects"; else fail no_m42_tables '0' "$objects"; fi
admin_functions="$(psql "$DB_URL" -X -Atc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('admin_get_my_role','admin_queue_list','admin_report_detail','admin_audit_list','moderation_claim','moderation_dismiss','moderation_action_content','admin_set_moderation_status','check_notification_event_sources')")"
if [[ "$admin_functions" == 0 ]]; then pass no_m42_functions '0' "$admin_functions"; else fail no_m42_functions '0' "$admin_functions"; fi

TABLY_WEB_ROOT="${TABLY_WEB_ROOT:-$ROOT/../diving-buddies-web}"
python3 - "$RESULTS" "$ROOT" "$TABLY_WEB_ROOT" "$ARTIFACT_DIR/behavior.json" "$ARTIFACT_DIR/changed-path-manifest.json" <<'PY'
import hashlib
import json
import pathlib
import re
import sys

results_path = pathlib.Path(sys.argv[1])
tably_root = pathlib.Path(sys.argv[2]).resolve()
web_root = pathlib.Path(sys.argv[3]).resolve()
behavior_path = pathlib.Path(sys.argv[4])
manifest_path = pathlib.Path(sys.argv[5])
results = []
for line in results_path.read_text().splitlines():
    parts = line.split("\t", 3)
    if len(parts) != 4:
        raise SystemExit("security result row is malformed")
    label, status, expected, observed = parts
    results.append({"id": label, "status": status, "expected": expected, "observed": observed})
if not results or any(result["status"] != "PASS" for result in results):
    raise SystemExit("security behavior artifact requires all results PASS")
required = {
    "active_terms_create", "terms_gate_order", "service_mark_mixed_processing_terminal_rejected",
    "service_mark_mixed_state_unchanged", "active_read_housekeeping", "realtime_publication",
    "visible_row_indexes", "profile_column_acl", "no_m42_tables", "no_m42_functions",
    "http_transport_curl_failure", "http_transport_empty_status", "http_transport_non_three_digit",
    "http_transport_valid_status", "service_mark_processing_failed", "service_mark_processing_sent",
    "service_mark_processing_skipped", "active_join_shape", "active_answer_shape",
    "active_confirm_shape", "active_send_shape", "limited_cleanup_leave",
}
for state in ("active", "limited"):
    for read_name in ("list", "detail", "members", "active", "messages"):
        required.add(f"{state}_{read_name}_shape")
        if state == "limited":
            required.add(f"{state}_{read_name}_pure")
for state in ("suspended", "deleted", "no_profile"):
    for read_name in ("list", "detail", "members", "active", "messages"):
        required.add(f"{state}_{read_name}_hidden")
for state in ("terms", "limited", "suspended", "deleted", "no_profile"):
    for write in ("create", "join", "answer", "confirm", "send"):
        required.update({f"{state}_{write}", f"{state}_{write}_no_side_effect"})
for write in ("join", "answer", "confirm", "send"):
    required.update({f"removed_{write}", f"removed_{write}_no_side_effect"})
ids = {result["id"] for result in results}
missing = sorted(required - ids)
if missing:
    raise SystemExit(f"security behavior artifact missing required cases: {missing}")

paths = [
    ("tably", tably_root, "supabase/migrations/20260814000000_tably_moderation_security_baseline.sql"),
    ("tably", tably_root, "supabase/functions/send-notifications/index.ts"),
    ("tably", tably_root, "scripts/acl-manifest-tably.sql"),
    ("tably", tably_root, "scripts/legacy-fixtures-tably.sql"),
    ("tably", tably_root, "scripts/test-tably-security.sh"),
    ("tably", tably_root, "scripts/verify-tably-sql.sql"),
    ("tably", tably_root, "scripts/verify-tably-sql.sh"),
    ("web", web_root, "scripts/notification-write-allowlist.json"),
    ("web", web_root, "scripts/verify-notification-write-ownership.sh"),
    ("web", web_root, "scripts/test-notification-write-ownership.sh"),
    ("web", web_root, "scripts/test-tably-upgrade-from-17.sh"),
    ("web", web_root, "scripts/tably-upgrade-cleanup.sh"),
    ("web", web_root, "scripts/test-tably-upgrade-cleanup.sh"),
]
entries = []
for repo, root, relative in paths:
    file_path = root / relative
    if not file_path.is_file():
        raise SystemExit(f"changed path missing: {repo}/{relative}")
    entries.append({"path": f"{repo}/{relative}", "sha256": hashlib.sha256(file_path.read_bytes()).hexdigest()})
fingerprint = hashlib.sha256(json.dumps(entries, separators=(",", ":"), sort_keys=True).encode()).hexdigest()
behavior = {"mode": "m4.1", "results": results, "result_count": len(results), "all_pass": True, "source_fingerprint": fingerprint}
manifest = {"changed_paths": [entry["path"] for entry in entries], "changed_path_sha256": {entry["path"]: entry["sha256"] for entry in entries}, "source_fingerprint": fingerprint}
behavior_path.parent.mkdir(parents=True, exist_ok=True)
manifest_path.parent.mkdir(parents=True, exist_ok=True)
behavior_path.write_text(json.dumps(behavior, indent=2, sort_keys=True) + "\n")
manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
behavior_data = json.loads(behavior_path.read_text())
manifest_data = json.loads(manifest_path.read_text())
if behavior_data.get("mode") != "m4.1" or behavior_data.get("all_pass") is not True:
    raise SystemExit("security behavior artifact schema mismatch")
if behavior_data.get("source_fingerprint") != manifest_data.get("source_fingerprint"):
    raise SystemExit("behavior/changed-path fingerprint mismatch")
for artifact in (behavior_path, manifest_path):
    text = artifact.read_text()
    if re.search(r"(?:eyJ[A-Za-z0-9_-]{20,}|sb_(?:publishable|secret)_[A-Za-z0-9_-]+|JWT_SECRET|Password123!|postgres(?:ql)?://\S+|pid[\"\s:=]+[0-9]{3,})", text, re.I):
        raise SystemExit(f"sanitized artifact contains secret or PID pattern: {artifact}")
print(f"security_artifact_validated mode=m4.1 all_pass=true result_count={len(results)} source_fingerprint={fingerprint}")
PY

if [[ "$FAILED" -ne 0 ]]; then
  printf 'Tably M4.1 security matrix failed; see sanitized artifact %s\n' "$ARTIFACT_DIR/behavior.json" >&2
  exit 1
fi
printf 'Tably M4.1 security matrix passed (%s checks)\n' "$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))["results"]))' "$ARTIFACT_DIR/behavior.json")"
