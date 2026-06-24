#!/bin/sh
set -eu

SUPABASE_DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
with checks(check_name, ok) as (
  values
    ('profiles_table_exists', to_regclass('public.profiles') is not null),
    ('profiles_rls_enabled', coalesce((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), false)),
    ('profile_owner_policies_exist', (
      select count(*) >= 2
      from pg_policies
      where schemaname = 'public'
        and tablename = 'profiles'
        and policyname in ('profiles_select_own', 'profiles_update_own')
    )),
    ('location_rpcs_exist', (
      select count(*) = 3
      from pg_proc
      where proname in ('update_own_location', 'delete_own_location', 'users_in_view')
    )),
    ('dives_table_exists', to_regclass('public.dives') is not null),
    ('dives_rls_enabled', coalesce((select relrowsecurity from pg_class where oid = 'public.dives'::regclass), false)),
    ('dive_created_by_unique', (
      select count(*) = 1
      from pg_constraint
      where conrelid = 'public.dives'::regclass
        and conname = 'dives_created_by_key'
    )),
    ('dive_rpcs_exist', (
      select count(*) = 4
      from pg_proc
      where proname in ('upsert_own_dive', 'delete_own_dive', 'get_own_dive', 'dives_in_view')
    )),
    ('chat_tables_exist', to_regclass('public.conversations') is not null
      and to_regclass('public.conversation_participants') is not null
      and to_regclass('public.messages') is not null),
    ('messages_rls_enabled', coalesce((select relrowsecurity from pg_class where oid = 'public.messages'::regclass), false)),
    ('chat_rpcs_exist', (
      select count(*) = 4
      from pg_proc
      where proname in (
        'upsert_conversation',
        'get_conversations_with_latest_message',
        'get_messages_by_conversation_id',
        'send_message'
      )
    )),
    ('messages_realtime_publication', (
      select count(*) = 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'messages'
    )),
    ('avatar_bucket_private', coalesce((
      select public = false
      from storage.buckets
      where id = 'avatars'
    ), false)),
    ('avatar_storage_policies_exist', (
      select count(*) >= 5
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname like 'avatars_%'
    )),
    ('avatar_rpcs_exist', (
      select count(*) = 2
      from pg_proc
      where proname in ('update_own_avatar_path', 'clear_own_avatar_path')
    )),
    ('maestro_seed_users_present', (
      select count(*) >= 8
      from auth.users
      where email like 'phase%.%@example.com'
    )),
    ('maestro_seed_conversation_present', exists (
      select 1
      from public.messages
      where body = 'Seeded chat from Phase Four Event'
    ))
)
select check_name, ok
from checks;

with checks(check_name, ok) as (
  values
    ('profiles_table_exists', to_regclass('public.profiles') is not null),
    ('profiles_rls_enabled', coalesce((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), false)),
    ('profile_owner_policies_exist', (
      select count(*) >= 2 from pg_policies where schemaname = 'public' and tablename = 'profiles'
    )),
    ('location_rpcs_exist', (select count(*) = 3 from pg_proc where proname in ('update_own_location', 'delete_own_location', 'users_in_view'))),
    ('dives_table_exists', to_regclass('public.dives') is not null),
    ('dives_rls_enabled', coalesce((select relrowsecurity from pg_class where oid = 'public.dives'::regclass), false)),
    ('dive_created_by_unique', (select count(*) = 1 from pg_constraint where conrelid = 'public.dives'::regclass and conname = 'dives_created_by_key')),
    ('dive_rpcs_exist', (select count(*) = 4 from pg_proc where proname in ('upsert_own_dive', 'delete_own_dive', 'get_own_dive', 'dives_in_view'))),
    ('chat_tables_exist', to_regclass('public.conversations') is not null and to_regclass('public.conversation_participants') is not null and to_regclass('public.messages') is not null),
    ('messages_rls_enabled', coalesce((select relrowsecurity from pg_class where oid = 'public.messages'::regclass), false)),
    ('chat_rpcs_exist', (select count(*) = 4 from pg_proc where proname in ('upsert_conversation', 'get_conversations_with_latest_message', 'get_messages_by_conversation_id', 'send_message'))),
    ('messages_realtime_publication', (select count(*) = 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages')),
    ('avatar_bucket_private', coalesce((select public = false from storage.buckets where id = 'avatars'), false)),
    ('avatar_storage_policies_exist', (select count(*) >= 5 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'avatars_%')),
    ('avatar_rpcs_exist', (select count(*) = 2 from pg_proc where proname in ('update_own_avatar_path', 'clear_own_avatar_path'))),
    ('maestro_seed_users_present', (select count(*) >= 8 from auth.users where email like 'phase%.%@example.com')),
    ('maestro_seed_conversation_present', exists (select 1 from public.messages where body = 'Seeded chat from Phase Four Event'))
)
select case
  when bool_and(ok) then 'phase6_final_sql_checks_passed'
  else (select 'phase6_final_sql_checks_failed: ' || string_agg(check_name, ', ') from checks where not ok)
end as result
from checks;

\gset
select :'result' as result;
select case
  when :'result' = 'phase6_final_sql_checks_passed' then 1
  else 1 / 0
end as phase6_final_sql_assertion;
SQL
