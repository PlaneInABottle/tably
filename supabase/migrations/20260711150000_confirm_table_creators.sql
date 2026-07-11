create or replace function public.create_social_table(
  p_activity text,
  p_title text,
  p_note text,
  p_vibe text,
  p_area_label text,
  p_starts_at timestamptz,
  p_lng double precision,
  p_lat double precision,
  p_min_seats integer default 3,
  p_max_seats integer default 5,
  p_intro_prompt text default 'What are you hoping this plan feels like?'
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_table_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_activity not in ('coffee','dinner','drinks','walk','run','cinema','coworking','culture','sports','explore') then raise exception 'Invalid activity'; end if;
  if p_starts_at < now() + interval '15 minutes' or p_starts_at >= date_trunc('day', now()) + interval '2 days' then raise exception 'Tables must start at least 15 minutes from now and no later than tomorrow'; end if;
  if p_lng is null or p_lat is null or p_lng < -180 or p_lng > 180 or p_lat < -90 or p_lat > 90 then raise exception 'Invalid coordinates'; end if;

  perform set_config('app.tably_rpc', 'on', true);

  insert into public.social_tables (
    created_by,
    activity,
    title,
    note,
    vibe,
    area_label,
    starts_at,
    min_seats,
    max_seats,
    intro_prompt,
    location
  )
  values (
    v_user_id,
    p_activity,
    btrim(p_title),
    btrim(coalesce(p_note, '')),
    btrim(coalesce(p_vibe, 'casual')),
    btrim(p_area_label),
    p_starts_at,
    p_min_seats,
    p_max_seats,
    btrim(p_intro_prompt),
    extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::geography
  )
  returning social_tables.id into v_table_id;

  insert into public.table_members (
    table_id,
    profile_id,
    status,
    intro_due_at,
    confirm_due_at,
    confirmed_at
  )
  values (v_table_id, v_user_id, 'confirmed', now(), now(), now());

  return query select v_table_id;
end;
$$;

revoke all on function public.create_social_table(text, text, text, text, text, timestamptz, double precision, double precision, integer, integer, text) from public;
grant execute on function public.create_social_table(text, text, text, text, text, timestamptz, double precision, double precision, integer, integer, text) to authenticated;
