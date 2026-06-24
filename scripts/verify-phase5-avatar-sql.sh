#!/bin/sh
set -eu

SUPABASE_DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
select 'avatar_bucket_private' as check, public = false as ok
from storage.buckets
where id = 'avatars';

select 'avatar_rpc_exists' as check, count(*) = 2 as ok
from pg_proc
where proname in ('update_own_avatar_path', 'clear_own_avatar_path');

select 'avatar_policies_exist' as check, count(*) >= 5 as ok
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'avatars_%';
SQL
