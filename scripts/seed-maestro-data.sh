#!/usr/bin/env sh
set -eu

DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
PASSWORD="${MAESTRO_SEED_PASSWORD:-Password123!}"

psql "$DB_URL" -v password="$PASSWORD" -f scripts/seed-maestro-data.sql
