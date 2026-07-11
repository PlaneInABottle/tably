#!/usr/bin/env sh
set -eu

DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
psql "$DB_URL" -X -f scripts/verify-tably-sql.sql
