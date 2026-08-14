#!/usr/bin/env bash
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
ARTIFACT_DIR="${TABLY_ARTIFACT_DIR:-$ROOT/artifacts/m4-moderation}"
SOURCE_FINGERPRINT="${TABLY_SOURCE_FINGERPRINT:-${Tably_UPGRADE_SOURCE_FINGERPRINT:-}}"

if [[ -z "$SOURCE_FINGERPRINT" ]]; then
  printf 'TABLY_SOURCE_FINGERPRINT is required for fingerprint-bound moderation evidence\n' >&2
  exit 2
fi

if [[ "$#" -eq 0 ]]; then
  PHASE="all"
elif [[ "$#" -eq 2 && "$1" == "--phase" && "$2" =~ ^(schema|reads|actions|all)$ ]]; then
  PHASE="$2"
else
  printf 'usage: bash scripts/test-tably-moderation.sh --phase all|schema|reads|actions\n' >&2
  exit 2
fi

mkdir -p "$ARTIFACT_DIR"
SQL_SOURCE="$ROOT/scripts/test-tably-moderation.sql"

extract_phase() {
  local phase="$1" output="$2"
  python3 - "$SQL_SOURCE" "$phase" "$output" <<'PY'
import pathlib, sys
source, phase, output = map(pathlib.Path, sys.argv[1:])
text = source.read_text()
start = f"-- BEGIN_PHASE {phase}"
end = f"-- END_PHASE {phase}"
before, marker, rest = text.partition(start)
if not marker:
    raise SystemExit(f"missing phase: {phase}")
body, marker, _ = rest.partition(end)
if not marker:
    raise SystemExit(f"missing phase end: {phase}")
output.write_text(body)
PY
}

run_phase() {
  local phase="$1"
  local sql_file="$ARTIFACT_DIR/${phase}.sql"
  local log_file="$ARTIFACT_DIR/${phase}.log"
  local result_file="$ARTIFACT_DIR/${phase}.json"
  extract_phase "$phase" "$sql_file"
  if ! psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$sql_file" >"$log_file" 2>&1; then
    printf '%s phase failed; see %s\n' "$phase" "$log_file" >&2
    return 1
  fi
  python3 - "$phase" "$sql_file" "$log_file" "$result_file" "$SOURCE_FINGERPRINT" <<'PY'
import hashlib, json, pathlib, re, sys
phase, sql_path, log_path, result_path, fingerprint = sys.argv[1:]
log = pathlib.Path(log_path).read_text()
rows = []
matrices = []
for line in log.splitlines():
    match = re.fullmatch(r"ASSERT\|([^|]+)\|(PASS|FAIL)\|(.*)", line.strip())
    if match:
        rows.append({"id": match.group(1), "status": match.group(2), "summary": match.group(3)})
        continue
    matrix = re.match(r"MATRIX\|([^|]+)\|(.*)", line.strip())
    if matrix:
        matrices.append({"id": matrix.group(1), "rows": json.loads(matrix.group(2))})
if not rows or any(row["status"] != "PASS" for row in rows):
    raise SystemExit(f"{phase} assertion ledger is incomplete or failing")
data = {
    "phase": phase,
    "status": "PASS",
    "assertion_count": len(rows),
    "assertion_ids": [row["id"] for row in rows],
    "results": rows,
    "matrices": matrices,
    "sql_sha256": hashlib.sha256(pathlib.Path(sql_path).read_bytes()).hexdigest(),
    "log_sha256": hashlib.sha256(pathlib.Path(log_path).read_bytes()).hexdigest(),
    "source_fingerprint": fingerprint,
    "sanitized": True,
}
pathlib.Path(result_path).write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")
PY
}

case "$PHASE" in
  schema) run_phase schema ;;
  reads) run_phase reads ;;
  actions) run_phase actions ;;
  all)
    run_phase schema
    run_phase reads
    run_phase actions
    ;;
esac

if [[ "$PHASE" == schema || "$PHASE" == all ]]; then
  status_env="$(supabase status -o env 2>/dev/null || true)"
  anon_key="${SUPABASE_ANON_KEY:-}"
  api_url="${SUPABASE_API_URL:-}"
  if [[ -z "$anon_key" ]]; then
    anon_key="$(printf '%s\n' "$status_env" | python3 -c 'import re,sys; text=sys.stdin.read(); m=re.search(r"^(?:ANON_KEY|SUPABASE_ANON_KEY)=(.*)$", text, re.M); print(m.group(1).strip().strip(chr(39)).strip(chr(34)) if m else "")')"
  fi
  if [[ -z "$api_url" ]]; then
    api_url="$(printf '%s\n' "$status_env" | python3 -c 'import re,sys; text=sys.stdin.read(); m=re.search(r"^(?:API_URL|SUPABASE_URL)=(.*)$", text, re.M); print(m.group(1).strip().strip(chr(39)).strip(chr(34)) if m else "http://127.0.0.1:54321")')"
  fi
  if [[ -z "$anon_key" ]]; then
    printf 'local anon key unavailable for PostgREST ACL proof\n' >&2
    exit 1
  fi
  acl_tmp="$(mktemp -d "${TMPDIR:-/tmp}/tably-m42-acl.XXXXXX")"
  trap 'rm -rf "$acl_tmp"' EXIT
  payload='{"p_status":"all","p_target_type":"all","p_assignee":"all","p_page_size":2,"p_page_token":null}'
  anon_http="$(curl -sS -o "$acl_tmp/anon.json" -w '%{http_code}' -X POST "$api_url/rest/v1/rpc/admin_queue_list" -H "apikey: $anon_key" -H 'Content-Type: application/json' --data "$payload")"
  login_json="$(curl -sS -X POST "$api_url/auth/v1/token?grant_type=password" -H "apikey: $anon_key" -H 'Content-Type: application/json' --data '{"email":"legacy.nonstaff@example.invalid","password":"Password123!"}')"
  auth_token="$(printf '%s' "$login_json" | jq -r '.access_token // empty')"
  if [[ -z "$auth_token" ]]; then
    printf 'nonstaff local auth fixture did not produce a token\n' >&2
    exit 1
  fi
  auth_http="$(curl -sS -o "$acl_tmp/authenticated.json" -w '%{http_code}' -X POST "$api_url/rest/v1/rpc/admin_queue_list" -H "apikey: $anon_key" -H "Authorization: Bearer $auth_token" -H 'Content-Type: application/json' --data "$payload")"
  if [[ "$anon_http" -lt 400 || "$auth_http" -lt 400 ]]; then
    printf 'PostgREST ACL negative mismatch anon=%s authenticated=%s\n' "$anon_http" "$auth_http" >&2
    exit 1
  fi
  python3 - "$ARTIFACT_DIR/schema.json" "$anon_http" "$auth_http" <<'PY'
import json, pathlib, sys
path = pathlib.Path(sys.argv[1])
data = json.loads(path.read_text())
data["assertion_ids"].append("M42-SCHEMA-007")
data["assertion_count"] += 1
data["results"].append({"id":"M42-SCHEMA-007","status":"PASS","summary":f"PostgREST anon/authenticated denied HTTP {sys.argv[2]}/{sys.argv[3]}"})
path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")
PY

  deleted_staff_dir="$ARTIFACT_DIR/deleted-staff"
  mkdir -p "$deleted_staff_dir"
  deleted_staff_cleanup() {
    psql "$DB_URL" -X -v ON_ERROR_STOP=1 -c "update public.profiles set moderation_status='active' where id in ('00000000-0000-4000-8000-000000000905','00000000-0000-4000-8000-000000000906')" >/dev/null 2>&1 || true
  }
  trap 'deleted_staff_cleanup; rm -rf "$acl_tmp"' EXIT
  deleted_fixture_count="$(psql "$DB_URL" -X -At -c "select count(*) from public.profiles where id in ('00000000-0000-4000-8000-000000000905','00000000-0000-4000-8000-000000000906')")"
  deleted_role_count="$(psql "$DB_URL" -X -At -c "select count(*) from public.admin_roles where user_id in ('00000000-0000-4000-8000-000000000905','00000000-0000-4000-8000-000000000906')")"
  if [[ "$deleted_fixture_count" != 2 || "$deleted_role_count" != 2 ]]; then
    printf 'deleted staff fixtures missing profiles=%s roles=%s\n' "$deleted_fixture_count" "$deleted_role_count" >&2
    exit 1
  fi
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -c "update public.profiles set moderation_status='deleted' where id in ('00000000-0000-4000-8000-000000000905','00000000-0000-4000-8000-000000000906')" >/dev/null
  before_deleted_audit="$(psql "$DB_URL" -X -At -c "select count(*) from public.moderation_audit_log")"
  before_deleted_target="$(psql "$DB_URL" -X -At -c "select moderation_status || '|' || updated_at::text from public.profiles where id='00000000-0000-4000-8000-000000000902'")"
  deleted_rows='[]'
  for role in admin reviewer; do
    if [[ "$role" == admin ]]; then
      email='legacy.deleted.admin@example.invalid'
      user_id='00000000-0000-4000-8000-000000000905'
    else
      email='legacy.deleted.reviewer@example.invalid'
      user_id='00000000-0000-4000-8000-000000000906'
    fi
    login_json="$(curl -sS -X POST "$api_url/auth/v1/token?grant_type=password" -H "apikey: $anon_key" -H 'Content-Type: application/json' --data "{\"email\":\"$email\",\"password\":\"Password123!\"}")"
    auth_token="$(printf '%s' "$login_json" | jq -r '.access_token // empty')"
    if [[ -z "$auth_token" ]]; then
      printf 'deleted staff fixture did not produce a token for %s\n' "$role" >&2
      exit 1
    fi
    role_http="$(curl -sS -o "$deleted_staff_dir/$role-role.json" -w '%{http_code}' -X POST "$api_url/rest/v1/rpc/admin_get_my_role" -H "apikey: $anon_key" -H "Authorization: Bearer $auth_token" -H 'Content-Type: application/json' --data '{}')"
    queue_http="$(curl -sS -o "$deleted_staff_dir/$role-queue.json" -w '%{http_code}' -X POST "$api_url/rest/v1/rpc/admin_queue_list" -H "apikey: $anon_key" -H "Authorization: Bearer $auth_token" -H 'Content-Type: application/json' --data '{"p_status":"all","p_target_type":"all","p_assignee":"all","p_page_size":2,"p_page_token":null}')"
    detail_http="$(curl -sS -o "$deleted_staff_dir/$role-detail.json" -w '%{http_code}' -X POST "$api_url/rest/v1/rpc/admin_report_detail" -H "apikey: $anon_key" -H "Authorization: Bearer $auth_token" -H 'Content-Type: application/json' --data '{"p_report_id":"00000000-0000-4000-8000-000000000928"}')"
    target_timestamp="$(psql "$DB_URL" -X -At -c "select updated_at from public.profiles where id='00000000-0000-4000-8000-000000000902'")"
    action_http="$(curl -sS -o "$deleted_staff_dir/$role-action.json" -w '%{http_code}' -X POST "$api_url/rest/v1/rpc/admin_set_moderation_status" -H "apikey: $anon_key" -H "Authorization: Bearer $auth_token" -H 'Content-Type: application/json' --data "{\"p_user_id\":\"00000000-0000-4000-8000-000000000902\",\"p_status\":\"limited\",\"p_reason\":\"deleted staff negative\",\"p_expected_updated_at\":\"$target_timestamp\"}")"
    action_code="$(jq -r '.code // empty' "$deleted_staff_dir/$role-action.json")"
    role_is_null="$(jq -r 'if . == null then "true" else "false" end' "$deleted_staff_dir/$role-role.json")"
    if [[ "$role_http" -ge 300 || "$role_is_null" != true || "$queue_http" -lt 400 || "$detail_http" -lt 400 || "$action_code" != forbidden || "$action_http" -ge 300 ]]; then
      printf 'deleted staff boundary mismatch role=%s role_http=%s role_null=%s queue_http=%s detail_http=%s action_http=%s action_code=%s\n' "$role" "$role_http" "$role_is_null" "$queue_http" "$detail_http" "$action_http" "$action_code" >&2
      exit 1
    fi
    deleted_rows="$(jq -c --arg role "$role" --arg uid "$user_id" --arg role_http "$role_http" --arg queue_http "$queue_http" --arg detail_http "$detail_http" --arg action_http "$action_http" --arg action_code "$action_code" --arg role_null "$role_is_null" '. + [{role:$role,user_id:$uid,role_http:($role_http|tonumber),role_null:($role_null == "true"),queue_http:($queue_http|tonumber),detail_http:($detail_http|tonumber),action_http:($action_http|tonumber),action_code:$action_code}]' <<<"$deleted_rows")"
  done
  after_deleted_audit="$(psql "$DB_URL" -X -At -c "select count(*) from public.moderation_audit_log")"
  after_deleted_target="$(psql "$DB_URL" -X -At -c "select moderation_status || '|' || updated_at::text from public.profiles where id='00000000-0000-4000-8000-000000000902'")"
  deleted_profile_count="$(psql "$DB_URL" -X -At -c "select count(*) from public.profiles where id in ('00000000-0000-4000-8000-000000000905','00000000-0000-4000-8000-000000000906') and moderation_status='deleted'")"
  if [[ "$before_deleted_audit" != "$after_deleted_audit" || "$before_deleted_target" != "$after_deleted_target" || "$deleted_profile_count" != 2 ]]; then
    printf 'deleted staff state changed audit=%s/%s target=%s/%s deleted_profiles=%s\n' "$before_deleted_audit" "$after_deleted_audit" "$before_deleted_target" "$after_deleted_target" "$deleted_profile_count" >&2
    exit 1
  fi
  deleted_staff_cleanup
  trap 'rm -rf "$acl_tmp"' EXIT
  python3 - "$ARTIFACT_DIR/schema.json" "$ARTIFACT_DIR/deleted-staff.json" "$SOURCE_FINGERPRINT" "$deleted_rows" "$before_deleted_audit" "$after_deleted_audit" "$before_deleted_target" "$after_deleted_target" <<'PY'
import json, pathlib, sys
schema_path, artifact_path, fingerprint, rows_json, before_audit, after_audit, before_target, after_target = sys.argv[1:]
rows = json.loads(rows_json)
if len(rows) != 2 or any(not row['role_null'] or row['queue_http'] < 400 or row['detail_http'] < 400 or row['action_code'] != 'forbidden' for row in rows):
    raise SystemExit('deleted staff artifact assertion failed')
artifact = {
    'id': 'M42-SCHEMA-008',
    'status': 'PASS',
    'source_fingerprint': fingerprint,
    'roles': rows,
    'audit_before': int(before_audit),
    'audit_after': int(after_audit),
    'target_before': before_target,
    'target_after': after_target,
    'deleted_profiles_preserved': 2,
    'sanitized': True,
}
pathlib.Path(artifact_path).write_text(json.dumps(artifact, indent=2, sort_keys=True) + '\n')
schema = json.loads(pathlib.Path(schema_path).read_text())
schema['assertion_ids'].append(artifact['id'])
schema['assertion_count'] += 1
schema['results'].append({'id': artifact['id'], 'status': 'PASS', 'summary': 'deleted reviewer/admin PostgREST role-null queue/detail denied action forbidden zero state/audit changes'})
schema['source_fingerprint'] = fingerprint
pathlib.Path(schema_path).write_text(json.dumps(schema, indent=2, sort_keys=True) + '\n')
PY
fi

if [[ "$PHASE" == actions || "$PHASE" == all ]]; then
  concurrency_dir="$ARTIFACT_DIR/concurrency"
  mkdir -p "$concurrency_dir"
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -c "update public.profiles set moderation_status='active' where id='00000000-0000-4000-8000-000000000902'" >/dev/null
  expected_ts="$(psql "$DB_URL" -X -At -c "select updated_at from public.profiles where id='00000000-0000-4000-8000-000000000902'")"
  python3 - "$concurrency_dir/a.sql" "$concurrency_dir/b.sql" "$expected_ts" <<'PY'
import pathlib, sys
a, b, timestamp = sys.argv[1:]
template = """\\set ON_ERROR_STOP on
begin;
select pg_sleep(1);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
select public.admin_set_moderation_status('00000000-0000-4000-8000-000000000902','limited','concurrent status',%r::timestamptz);
commit;
""" % timestamp
pathlib.Path(a).write_text(template)
pathlib.Path(b).write_text(template)
PY
  set +e
  psql "$DB_URL" -X -At -f "$concurrency_dir/a.sql" >"$concurrency_dir/a.log" 2>&1 & pid_a=$!
  psql "$DB_URL" -X -At -f "$concurrency_dir/b.sql" >"$concurrency_dir/b.log" 2>&1 & pid_b=$!
  wait "$pid_a"; rc_a=$?
  wait "$pid_b"; rc_b=$?
  set -e
  if [[ "$rc_a" -ne 0 || "$rc_b" -ne 0 ]]; then
    printf 'profile concurrency sessions failed: %s/%s\n' "$rc_a" "$rc_b" >&2
    exit 1
  fi
  audit_count="$(psql "$DB_URL" -X -At -c "select count(*) from public.moderation_audit_log where target_user_id='00000000-0000-4000-8000-000000000902' and action='limit_user'")"
  final_status="$(psql "$DB_URL" -X -At -c "select moderation_status from public.profiles where id='00000000-0000-4000-8000-000000000902'")"
  python3 - "$concurrency_dir/a.log" "$concurrency_dir/b.log" "$concurrency_dir/result.json" "$SOURCE_FINGERPRINT" "$audit_count" "$final_status" <<'PY'
import hashlib, json, pathlib, sys
logs = [pathlib.Path(sys.argv[1]).read_text(), pathlib.Path(sys.argv[2]).read_text()]
objects = [json.loads(line.strip()) for text in logs for line in text.splitlines() if line.strip().startswith('{')]
codes = sorted(obj.get('code') for obj in objects)
if codes != ['conflict', 'updated'] or sys.argv[5] != '1' or sys.argv[6] != 'limited':
    raise SystemExit(f"concurrency mismatch codes={codes} audits={sys.argv[5]} status={sys.argv[6]}")
data = {
    "id": "M42-ACT-CONC-001",
    "status": "PASS",
    "summary": "two sessions same timestamp produced one updated, one conflict, one audit",
    "codes": codes,
    "audit_count": int(sys.argv[5]),
    "final_status": sys.argv[6],
    "log_sha256": [hashlib.sha256(text.encode()).hexdigest() for text in logs],
    "source_fingerprint": sys.argv[4],
    "sanitized": True,
}
pathlib.Path(sys.argv[3]).write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")
PY
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -c "update public.profiles set moderation_status='active' where id='00000000-0000-4000-8000-000000000902'" >/dev/null
  python3 - "$ARTIFACT_DIR/actions.json" "$concurrency_dir/result.json" "$SOURCE_FINGERPRINT" <<'PY'
import json, pathlib, sys
actions = json.loads(pathlib.Path(sys.argv[1]).read_text())
concurrency = json.loads(pathlib.Path(sys.argv[2]).read_text())
actions["assertion_ids"].append(concurrency["id"])
actions["assertion_count"] += 1
actions["results"].append({"id": concurrency["id"], "status": concurrency["status"], "summary": concurrency["summary"]})
actions["source_fingerprint"] = sys.argv[3]
pathlib.Path(sys.argv[1]).write_text(json.dumps(actions, indent=2, sort_keys=True) + "\n")
PY
fi

python3 - "$ARTIFACT_DIR" "$PHASE" "$SOURCE_FINGERPRINT" <<'PY'
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
phase = sys.argv[2]
fingerprint = sys.argv[3]
names = ['schema.json', 'reads.json', 'actions.json'] if phase == 'all' else [f'{phase}.json']
artifacts = []
for name in names:
    path = root / name
    if path.exists(): artifacts.append({"path": str(path.relative_to(root)), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
summary = {"status": "PASS", "phase": phase, "source_fingerprint": fingerprint, "artifacts": artifacts, "sanitized": True}
(root / 'manifest.json').write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n")
PY
printf 'Tably moderation %s passed\n' "$PHASE"
