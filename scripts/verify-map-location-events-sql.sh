#!/bin/sh
set -eu

SUPABASE_DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
begin;

do $$
declare
  v_owner uuid := '00000000-0000-4000-8000-00000000aa01';
  v_other uuid := '00000000-0000-4000-8000-00000000aa02';
  v_private_location uuid;
  v_public_location uuid;
  v_second_public uuid;
  v_dive_id uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'map-sql-owner@example.com', crypt('Password123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
    (v_other, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'map-sql-other@example.com', crypt('Password123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
  on conflict (id) do nothing;

  update public.profiles set display_name = 'Map SQL Owner', is_first_login = false where id = v_owner;
  update public.profiles set display_name = 'Map SQL Other', is_first_login = false where id = v_other;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  begin
    insert into public.profile_locations (owner_id, label, location)
    values (v_owner, 'Direct DML', ST_SetSRID(ST_MakePoint(28, 41), 4326)::geography);
    raise exception 'direct profile_locations insert unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;

  reset role;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  select id into v_private_location
  from public.create_profile_location('Private Reef', 28.979530, 41.015137, false);

  if exists (select 1 from public.users_in_view(41.0, 28.9, 41.1, 29.1) where user_id = v_owner) then
    raise exception 'private saved location leaked into users_in_view';
  end if;

  select id into v_public_location
  from public.share_profile_location_on_map(v_private_location);

  perform set_config('request.jwt.claim.sub', v_other::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  if (select count(*) from public.users_in_view(41.0, 28.9, 41.1, 29.1) where user_id = v_owner) <> 1 then
    raise exception 'public saved location missing from users_in_view';
  end if;

  if not exists (
    select 1
    from public.profile_locations
    where id = v_public_location
      and abs(ST_X(location::geometry) - 28.979530) < 0.000001
      and abs(ST_Y(location::geometry) - 41.015137) < 0.000001
  ) then
    raise exception 'coordinate order check failed';
  end if;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  select id into v_second_public
  from public.create_profile_location('Second Public Reef', 28.981000, 41.017000, true);

  if (select count(*) from public.profile_locations where owner_id = v_owner and is_active and is_public_map_location) <> 1 then
    raise exception 'one-public-location invariant failed';
  end if;

  perform set_config('request.jwt.claim.sub', v_other::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  begin
    perform public.update_profile_location(v_second_public, 'Other Edit', 28.982000, 41.018000);
    raise exception 'other user updated owner location';
  exception when raise_exception then
    null;
  end;

  begin
    perform public.upsert_own_dive_from_location(v_second_public, now() + interval '1 day', 'Other user dive', 'Other Dive');
    raise exception 'other user created dive from owner location';
  exception when raise_exception then
    null;
  end;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  select id into v_dive_id
  from public.upsert_own_dive_from_location(v_second_public, now() + interval '1 day', 'Snapshot dive', 'Snapshot Dive');

  perform public.update_profile_location(v_second_public, 'Moved Reef', 29.400000, 41.400000);

  if not exists (
    select 1
    from public.dives
    where id = v_dive_id
      and location_label_snapshot = 'Second Public Reef'
      and abs(ST_X(location::geometry) - 28.981000) < 0.000001
      and abs(ST_Y(location::geometry) - 41.017000) < 0.000001
  ) then
    raise exception 'event snapshot changed after saved location update';
  end if;

  if not exists (select 1 from public.dives_in_view(41.0, 28.9, 41.1, 29.1) where id = v_dive_id) then
    raise exception 'dives_in_view did not use snapshot location';
  end if;
end;
$$;

rollback;

select 'map_location_events_sql_checks_passed' as result;
SQL
