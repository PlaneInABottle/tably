create or replace function public.protect_profile_server_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'profiles.id is read-only';
  end if;

  if new.email is distinct from old.email then
    raise exception 'profiles.email is read-only';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'profiles.created_at is read-only';
  end if;

  if new.updated_at is distinct from old.updated_at then
    raise exception 'profiles.updated_at is trigger-managed';
  end if;

  if new.avatar_path is distinct from old.avatar_path then
    raise exception 'profiles.avatar_path is reserved for Phase 5 avatar storage';
  end if;

  if (new.location is distinct from old.location or new.show_location is distinct from old.show_location)
    and coalesce(current_setting('app.location_rpc', true), '') <> 'on' then
    raise exception 'profiles.location requires Phase 2 location RPCs';
  end if;

  return new;
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
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_lng is null or p_lat is null or p_lng < -180 or p_lng > 180 or p_lat < -90 or p_lat > 90 then
    raise exception 'Invalid coordinates';
  end if;

  perform set_config('app.location_rpc', 'on', true);

  update public.profiles
  set location = extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::geography,
      show_location = true
  where id = v_user_id;

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

  perform set_config('app.location_rpc', 'on', true);

  update public.profiles
  set location = null,
      show_location = false
  where id = v_user_id;

  return query
  select p.id, p.show_location, p.updated_at
  from public.profiles p
  where p.id = v_user_id;
end;
$$;

create or replace function public.users_in_view(
  min_lat double precision,
  min_long double precision,
  max_lat double precision,
  max_long double precision
)
returns table (
  user_id uuid,
  display_name text,
  summary text,
  avatar_path text,
  latitude double precision,
  longitude double precision,
  is_self boolean
)
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  select p.id as user_id,
         p.display_name,
         p.summary,
         p.avatar_path,
         extensions.ST_Y(p.location::geometry)::double precision as latitude,
         extensions.ST_X(p.location::geometry)::double precision as longitude,
         p.id = auth.uid() as is_self
  from public.profiles p
  where auth.uid() is not null
    and p.show_location = true
    and p.location is not null
    and p.id <> auth.uid()
    and min_lat between -90 and 90
    and max_lat between -90 and 90
    and min_long between -180 and 180
    and max_long between -180 and 180
    and min_lat <= max_lat
    and min_long <= max_long
    and extensions.ST_Y(p.location::geometry) between min_lat and max_lat
    and extensions.ST_X(p.location::geometry) between min_long and max_long
  order by p.updated_at desc
  limit 250;
$$;

revoke all on function public.update_own_location(double precision, double precision) from public;
revoke all on function public.delete_own_location() from public;
revoke all on function public.users_in_view(double precision, double precision, double precision, double precision) from public;

grant execute on function public.update_own_location(double precision, double precision) to authenticated;
grant execute on function public.delete_own_location() to authenticated;
grant execute on function public.users_in_view(double precision, double precision, double precision, double precision) to authenticated;
