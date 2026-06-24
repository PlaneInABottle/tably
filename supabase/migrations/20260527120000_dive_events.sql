create table public.dives (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text check (title is null or char_length(title) <= 80),
  description text not null check (char_length(description) between 1 and 500),
  event_at timestamptz not null,
  location extensions.geography(Point, 4326) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by)
);

create index dives_created_by_idx on public.dives (created_by);
create index dives_event_at_idx on public.dives (event_at);
create index dives_location_gix on public.dives using gist (location);

alter table public.dives enable row level security;

revoke all on table public.dives from anon;
revoke all on table public.dives from authenticated;

create or replace function public.protect_dive_server_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('app.dive_rpc', true), '') <> 'on' then
    raise exception 'dives require Phase 3 dive RPCs';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger trg_10_protect_dive_server_fields
before insert or update or delete on public.dives
for each row
execute function public.protect_dive_server_fields();

create trigger trg_20_set_dives_updated_at
before update on public.dives
for each row
execute function public.set_updated_at();

create or replace function public.upsert_own_dive(
  p_lng double precision,
  p_lat double precision,
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
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_lng is null or p_lat is null or p_lng < -180 or p_lng > 180 or p_lat < -90 or p_lat > 90 then
    raise exception 'Invalid coordinates';
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

  perform set_config('app.dive_rpc', 'on', true);

  insert into public.dives (created_by, title, description, event_at, location)
  values (
    v_user_id,
    v_title,
    v_description,
    p_event_at,
    extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::geography
  )
  on conflict on constraint dives_created_by_key do update
  set title = excluded.title,
      description = excluded.description,
      event_at = excluded.event_at,
      location = excluded.location;

  return query
  select d.id,
         d.title,
         d.description,
         d.event_at,
         extensions.ST_Y(d.location::geometry)::double precision,
         extensions.ST_X(d.location::geometry)::double precision,
         d.created_by,
         d.created_at,
         d.updated_at
  from public.dives d
  where d.created_by = v_user_id;
end;
$$;

create or replace function public.delete_own_dive()
returns table (deleted_id uuid)
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

  perform set_config('app.dive_rpc', 'on', true);

  return query
  delete from public.dives d
  where d.created_by = v_user_id
  returning d.id;
end;
$$;

create or replace function public.get_own_dive()
returns table (
  id uuid,
  title text,
  description text,
  event_at timestamptz,
  latitude double precision,
  longitude double precision,
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
         d.created_by,
         d.created_at,
         d.updated_at
  from public.dives d
  where auth.uid() is not null
    and d.created_by = auth.uid()
  limit 1;
$$;

create or replace function public.dives_in_view(
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

revoke all on function public.upsert_own_dive(double precision, double precision, timestamptz, text, text) from public;
revoke all on function public.delete_own_dive() from public;
revoke all on function public.get_own_dive() from public;
revoke all on function public.dives_in_view(double precision, double precision, double precision, double precision) from public;

grant execute on function public.upsert_own_dive(double precision, double precision, timestamptz, text, text) to authenticated;
grant execute on function public.delete_own_dive() to authenticated;
grant execute on function public.get_own_dive() to authenticated;
grant execute on function public.dives_in_view(double precision, double precision, double precision, double precision) to authenticated;
