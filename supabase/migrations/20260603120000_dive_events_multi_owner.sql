alter table public.dives
  drop constraint if exists dives_created_by_key;

create or replace function public.list_own_dives()
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
as $function$
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
  order by d.event_at asc;
$function$;

create or replace function public.get_own_dive()
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
as $function$
  select d.id,
         d.title,
         d.description,
         d.event_at,
         d.latitude,
         d.longitude,
         d.location_id,
         d.location_label_snapshot,
         d.created_by,
         d.created_at,
         d.updated_at
  from public.list_own_dives() d
  order by d.event_at desc, d.created_at desc
  limit 1;
$function$;

revoke all on function public.upsert_own_dive(double precision, double precision, timestamptz, text, text) from authenticated;
revoke all on function public.upsert_own_dive_from_location(uuid, timestamptz, text, text) from authenticated;
revoke all on function public.delete_own_dive() from authenticated;

drop function if exists public.delete_own_dive();
drop function if exists public.upsert_own_dive(double precision, double precision, timestamptz, text, text);
drop function if exists public.upsert_own_dive_from_location(uuid, timestamptz, text, text);

create or replace function public.delete_own_dive(p_dive_id uuid)
returns table (deleted_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_deleted_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_dive_id is null then
    raise exception 'Dive event id is required';
  end if;

  perform set_config('app.dive_rpc', 'on', true);

  delete from public.dives
  where id = p_dive_id and created_by = v_user_id
  returning id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'Dive event not found';
  end if;

  return query select v_deleted_id;
end;
$function$;

create or replace function public.upsert_own_dive(
  p_lng double precision,
  p_lat double precision,
  p_event_at timestamptz,
  p_description text,
  p_title text default null,
  p_dive_id uuid default null
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
as $function$
declare
  v_user_id uuid := auth.uid();
  v_description text := btrim(coalesce(p_description, ''));
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_dive public.dives;
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

  if p_dive_id is null then
    insert into public.dives (created_by, title, description, event_at, location)
    values (
      v_user_id,
      v_title,
      v_description,
      p_event_at,
      extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::geography
    )
    returning * into v_dive;
  else
    update public.dives
    set title = v_title,
        description = v_description,
        event_at = p_event_at,
        location = extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::geography
    where public.dives.id = p_dive_id
      and public.dives.created_by = v_user_id
    returning * into v_dive;

    if v_dive.id is null then
      raise exception 'Dive event not found';
    end if;
  end if;

  return query
  select v_dive.id,
         v_dive.title,
         v_dive.description,
         v_dive.event_at,
         extensions.ST_Y(v_dive.location::geometry)::double precision,
         extensions.ST_X(v_dive.location::geometry)::double precision,
         v_dive.created_by,
         v_dive.created_at,
         v_dive.updated_at;
end;
$function$;

create or replace function public.upsert_own_dive_from_location(
  p_location_id uuid,
  p_event_at timestamptz,
  p_description text,
  p_title text default null,
  p_dive_id uuid default null
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
as $function$
declare
  v_user_id uuid := auth.uid();
  v_description text := btrim(coalesce(p_description, ''));
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_location extensions.geography;
  v_location_label text;
  v_dive public.dives;
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

  if p_dive_id is null then
    insert into public.dives (created_by, title, description, event_at, location, location_id, location_label_snapshot)
    values (v_user_id, v_title, v_description, p_event_at, v_location, p_location_id, v_location_label)
    returning * into v_dive;
  else
    update public.dives
    set title = v_title,
        description = v_description,
        event_at = p_event_at,
        location = v_location,
        location_id = p_location_id,
        location_label_snapshot = v_location_label
    where public.dives.id = p_dive_id
      and public.dives.created_by = v_user_id
    returning * into v_dive;

    if v_dive.id is null then
      raise exception 'Dive event not found';
    end if;
  end if;

  return query
  select v_dive.id,
         v_dive.title,
         v_dive.description,
         v_dive.event_at,
         extensions.ST_Y(v_dive.location::geometry)::double precision,
         extensions.ST_X(v_dive.location::geometry)::double precision,
         v_dive.location_id,
         v_dive.location_label_snapshot,
         v_dive.created_by,
         v_dive.created_at,
         v_dive.updated_at;
end;
$function$;

grant execute on function public.list_own_dives() to authenticated;
grant execute on function public.upsert_own_dive(double precision, double precision, timestamptz, text, text, uuid) to authenticated;
grant execute on function public.upsert_own_dive_from_location(uuid, timestamptz, text, text, uuid) to authenticated;
grant execute on function public.delete_own_dive(uuid) to authenticated;
