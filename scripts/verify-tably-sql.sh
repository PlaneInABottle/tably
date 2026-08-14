#!/usr/bin/env sh
set -eu

DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
psql "$DB_URL" -X -f "$SCRIPT_DIR/verify-tably-sql.sql"
psql "$DB_URL" -X -f "$SCRIPT_DIR/acl-manifest-tably.sql"
