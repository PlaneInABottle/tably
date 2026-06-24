create table public.profile_locations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  location extensions.geography(Point, 4326) not null,
  is_active boolean not null default true,
  is_public_map_location boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profile_locations_owner_idx on public.profile_locations (owner_id);
create unique index profile_locations_owner_public_uidx
on public.profile_locations (owner_id)
where is_public_map_location and is_active;
create index profile_locations_location_gix
on public.profile_locations using gist (location)
where is_active;

alter table public.profile_locations enable row level security;

revoke all on table public.profile_locations from anon;
revoke all on table public.profile_locations from authenticated;
grant select on table public.profile_locations to authenticated;

create policy profile_locations_select_own
on public.profile_locations for select
to authenticated
using ((select auth.uid()) = owner_id);

create or replace function public.protect_profile_location_writes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('app.profile_location_rpc', true), '') <> 'on' then
    raise exception 'profile_locations require saved-location RPCs';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger trg_10_protect_profile_location_writes
before insert or update or delete on public.profile_locations
for each row
execute function public.protect_profile_location_writes();

create trigger trg_20_set_profile_locations_updated_at
before update on public.profile_locations
for each row
execute function public.set_updated_at();

select set_config('app.profile_location_rpc', 'on', true);

insert into public.profile_locations (owner_id, label, location, is_public_map_location, is_active)
select id, 'Public map location', location, true, true
from public.profiles
where show_location = true and location is not null;

create or replace function public.validate_profile_location_input(
  p_label text,
  p_lng double precision,
  p_lat double precision
)
returns table (label text, location extensions.geography)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_label text := btrim(coalesce(p_label, ''));
begin
  if char_length(v_label) < 1 or char_length(v_label) > 80 then
    raise exception 'Location label must be 1-80 characters';
  end if;

  if p_lng is null or p_lat is null
    or p_lng::text in ('NaN', 'Infinity', '-Infinity')
    or p_lat::text in ('NaN', 'Infinity', '-Infinity')
    or p_lng < -180 or p_lng > 180 or p_lat < -90 or p_lat > 90 then
    raise exception 'Invalid coordinates';
  end if;

  return query
  select v_label,
         extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::geography;
end;
$$;

create or replace function public.mirror_public_profile_location(
  p_owner_id uuid,
  p_location extensions.geography
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform set_config('app.location_rpc', 'on', true);

  update public.profiles
  set location = p_location,
      show_location = p_location is not null
  where id = p_owner_id;
end;
$$;

create or replace function public.list_own_profile_locations()
returns table (
  id uuid,
  label text,
  latitude double precision,
  longitude double precision,
  is_active boolean,
  is_public_map_location boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  select pl.id,
         pl.label,
         extensions.ST_Y(pl.location::geometry)::double precision as latitude,
         extensions.ST_X(pl.location::geometry)::double precision as longitude,
         pl.is_active,
         pl.is_public_map_location,
         pl.created_at,
         pl.updated_at
  from public.profile_locations pl
  where auth.uid() is not null
    and pl.owner_id = auth.uid()
    and pl.is_active = true
  order by pl.is_public_map_location desc, pl.updated_at desc, lower(pl.label) asc;
$$;

create or replace function public.create_profile_location(
  p_label text,
  p_lng double precision,
  p_lat double precision,
  p_share_on_map boolean default false
)
returns table (
  id uuid,
  label text,
  latitude double precision,
  longitude double precision,
  is_active boolean,
  is_public_map_location boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_label text;
  v_location extensions.geography;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select input.label, input.location into v_label, v_location
  from public.validate_profile_location_input(p_label, p_lng, p_lat) input;

  perform set_config('app.profile_location_rpc', 'on', true);

  if coalesce(p_share_on_map, false) then
    update public.profile_locations
    set is_public_map_location = false
    where profile_locations.owner_id = v_user_id
      and profile_locations.is_public_map_location = true;
  end if;

  insert into public.profile_locations (owner_id, label, location, is_public_map_location)
  values (v_user_id, v_label, v_location, coalesce(p_share_on_map, false))
  returning profile_locations.id into v_id;

  if coalesce(p_share_on_map, false) then
    perform public.mirror_public_profile_location(v_user_id, v_location);
  end if;

  return query select * from public.list_own_profile_locations() l where l.id = v_id;
end;
$$;

create or replace function public.update_profile_location(
  p_id uuid,
  p_label text,
  p_lng double precision,
  p_lat double precision
)
returns table (
  id uuid,
  label text,
  latitude double precision,
  longitude double precision,
  is_active boolean,
  is_public_map_location boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_label text;
  v_location extensions.geography;
  v_was_public boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select input.label, input.location into v_label, v_location
  from public.validate_profile_location_input(p_label, p_lng, p_lat) input;

  select pl.is_public_map_location into v_was_public
  from public.profile_locations pl
  where pl.id = p_id and pl.owner_id = v_user_id and pl.is_active = true;

  if v_was_public is null then
    raise exception 'Saved location not found';
  end if;

  perform set_config('app.profile_location_rpc', 'on', true);

  update public.profile_locations
  set label = v_label,
      location = v_location
  where profile_locations.id = p_id;

  if v_was_public then
    perform public.mirror_public_profile_location(v_user_id, v_location);
  end if;

  return query select * from public.list_own_profile_locations() l where l.id = p_id;
end;
$$;

create or replace function public.share_profile_location_on_map(p_id uuid)
returns table (
  id uuid,
  label text,
  latitude double precision,
  longitude double precision,
  is_active boolean,
  is_public_map_location boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_location extensions.geography;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select pl.location into v_location
  from public.profile_locations pl
  where pl.id = p_id and pl.owner_id = v_user_id and pl.is_active = true;

  if v_location is null then
    raise exception 'Saved location not found';
  end if;

  perform set_config('app.profile_location_rpc', 'on', true);

  update public.profile_locations
  set is_public_map_location = false
  where profile_locations.owner_id = v_user_id
    and profile_locations.is_public_map_location = true;

  update public.profile_locations
  set is_public_map_location = true
  where profile_locations.id = p_id;

  perform public.mirror_public_profile_location(v_user_id, v_location);

  return query select * from public.list_own_profile_locations() l where l.id = p_id;
end;
$$;

create or replace function public.unshare_profile_location_from_map()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform set_config('app.profile_location_rpc', 'on', true);

  update public.profile_locations
  set is_public_map_location = false
  where profile_locations.owner_id = v_user_id
    and profile_locations.is_public_map_location = true;

  perform public.mirror_public_profile_location(v_user_id, null);
end;
$$;

create or replace function public.delete_profile_location(p_id uuid)
returns table (deleted_id uuid, was_public boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_was_public boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select pl.is_public_map_location into v_was_public
  from public.profile_locations pl
  where pl.id = p_id and pl.owner_id = v_user_id and pl.is_active = true;

  if v_was_public is null then
    raise exception 'Saved location not found';
  end if;

  perform set_config('app.profile_location_rpc', 'on', true);

  update public.profile_locations
  set is_active = false,
      is_public_map_location = false
  where profile_locations.id = p_id
    and profile_locations.owner_id = v_user_id;

  if v_was_public then
    perform public.mirror_public_profile_location(v_user_id, null);
  end if;

  return query select p_id, v_was_public;
end;
$$;

create or replace function public.update_own_location(p_lng double precision, p_lat double precision)
returns table (
  user_id uuid,
  latitude double precision,
  longitude double precision,
  show_location boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_id uuid;
  v_location_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select pl.id into v_existing_id
  from public.profile_locations pl
  where pl.owner_id = v_user_id and pl.is_active = true and pl.is_public_map_location = true
  limit 1;

  if v_existing_id is null then
    select c.id into v_location_id
    from public.create_profile_location('Public map location', p_lng, p_lat, true) c;
  else
    select u.id into v_location_id
    from public.update_profile_location(v_existing_id, 'Public map location', p_lng, p_lat) u;
    perform public.share_profile_location_on_map(v_existing_id);
  end if;

  return query
  select p.id,
         extensions.ST_Y(p.location::geometry)::double precision,
         extensions.ST_X(p.location::geometry)::double precision,
         p.show_location,
         p.updated_at
  from public.profiles p
  where p.id = v_user_id;
end;
$$;

create or replace function public.delete_own_location()
returns table (user_id uuid, show_location boolean, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform public.unshare_profile_location_from_map();

  return query
  select p.id, p.show_location, p.updated_at
  from public.profiles p
  where p.id = v_user_id;
end;
$$;

alter table public.dives
  add column location_id uuid references public.profile_locations(id) on delete set null,
  add column location_label_snapshot text check (location_label_snapshot is null or char_length(location_label_snapshot) <= 80);

create index dives_location_id_idx on public.dives (location_id);

create or replace function public.upsert_own_dive_from_location(
  p_location_id uuid,
  p_event_at timestamptz,
  p_description text,
  p_title text default null
)
returns table (
  id uuid,
  title text,
  description text,
  event_at timestamptz,
  latitude double precision,
  longitude double precision,
  location_id uuid,
  location_label_snapshot text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_description text := btrim(coalesce(p_description, ''));
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_location extensions.geography;
  v_location_label text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_event_at is null then
    raise exception 'Event date is required';
  end if;

  if char_length(v_description) < 1 or char_length(v_description) > 500 then
    raise exception 'Description must be 1-500 characters';
  end if;

  if v_title is not null and char_length(v_title) > 80 then
    raise exception 'Title must be 80 characters or fewer';
  end if;

  select pl.location, pl.label into v_location, v_location_label
  from public.profile_locations pl
  where pl.id = p_location_id
    and pl.owner_id = v_user_id
    and pl.is_active = true;

  if v_location is null then
    raise exception 'Saved location not found';
  end if;

  perform set_config('app.dive_rpc', 'on', true);

  insert into public.dives (created_by, title, description, event_at, location, location_id, location_label_snapshot)
  values (v_user_id, v_title, v_description, p_event_at, v_location, p_location_id, v_location_label)
  on conflict on constraint dives_created_by_key do update
  set title = excluded.title,
      description = excluded.description,
      event_at = excluded.event_at,
      location = excluded.location,
      location_id = excluded.location_id,
      location_label_snapshot = excluded.location_label_snapshot;

  return query
  select d.id,
         d.title,
         d.description,
         d.event_at,
         extensions.ST_Y(d.location::geometry)::double precision,
         extensions.ST_X(d.location::geometry)::double precision,
         d.location_id,
         d.location_label_snapshot,
         d.created_by,
         d.created_at,
         d.updated_at
  from public.dives d
  where d.created_by = v_user_id;
end;
$$;

drop function public.get_own_dive();

create function public.get_own_dive()
returns table (
  id uuid,
  title text,
  description text,
  event_at timestamptz,
  latitude double precision,
  longitude double precision,
  location_id uuid,
  location_label_snapshot text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  select d.id,
         d.title,
         d.description,
         d.event_at,
         extensions.ST_Y(d.location::geometry)::double precision as latitude,
         extensions.ST_X(d.location::geometry)::double precision as longitude,
         d.location_id,
         d.location_label_snapshot,
         d.created_by,
         d.created_at,
         d.updated_at
  from public.dives d
  where auth.uid() is not null
    and d.created_by = auth.uid()
  limit 1;
$$;

drop function public.dives_in_view(double precision, double precision, double precision, double precision);

create function public.dives_in_view(
  min_lat double precision,
  min_long double precision,
  max_lat double precision,
  max_long double precision
)
returns table (
  id uuid,
  title text,
  description text,
  event_at timestamptz,
  latitude double precision,
  longitude double precision,
  location_id uuid,
  location_label_snapshot text,
  creator_id uuid,
  creator_display_name text,
  creator_summary text,
  creator_avatar_path text,
  is_own boolean
)
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  select d.id,
         d.title,
         d.description,
         d.event_at,
         extensions.ST_Y(d.location::geometry)::double precision as latitude,
         extensions.ST_X(d.location::geometry)::double precision as longitude,
         d.location_id,
         d.location_label_snapshot,
         p.id as creator_id,
         p.display_name as creator_display_name,
         p.summary as creator_summary,
         p.avatar_path as creator_avatar_path,
         p.id = auth.uid() as is_own
  from public.dives d
  join public.profiles p on p.id = d.created_by
  where auth.uid() is not null
    and min_lat between -90 and 90
    and max_lat between -90 and 90
    and min_long between -180 and 180
    and max_long between -180 and 180
    and min_lat <= max_lat
    and min_long <= max_long
    and extensions.ST_Y(d.location::geometry) between min_lat and max_lat
    and extensions.ST_X(d.location::geometry) between min_long and max_long
  order by d.event_at asc
  limit 250;
$$;

revoke all on function public.validate_profile_location_input(text, double precision, double precision) from public;
revoke all on function public.mirror_public_profile_location(uuid, extensions.geography) from public;
revoke all on function public.list_own_profile_locations() from public;
revoke all on function public.create_profile_location(text, double precision, double precision, boolean) from public;
revoke all on function public.update_profile_location(uuid, text, double precision, double precision) from public;
revoke all on function public.share_profile_location_on_map(uuid) from public;
revoke all on function public.unshare_profile_location_from_map() from public;
revoke all on function public.delete_profile_location(uuid) from public;
revoke all on function public.upsert_own_dive_from_location(uuid, timestamptz, text, text) from public;

grant execute on function public.list_own_profile_locations() to authenticated;
grant execute on function public.create_profile_location(text, double precision, double precision, boolean) to authenticated;
grant execute on function public.update_profile_location(uuid, text, double precision, double precision) to authenticated;
grant execute on function public.share_profile_location_on_map(uuid) to authenticated;
grant execute on function public.unshare_profile_location_from_map() to authenticated;
grant execute on function public.delete_profile_location(uuid) to authenticated;
grant execute on function public.upsert_own_dive_from_location(uuid, timestamptz, text, text) to authenticated;
