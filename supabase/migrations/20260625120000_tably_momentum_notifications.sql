create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique check (char_length(token) between 20 and 500),
  platform text not null check (platform in ('ios', 'android', 'web', 'unknown')),
  device_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  seat_held_intro boolean not null default true,
  seat_confirm_due boolean not null default true,
  table_confirmed boolean not null default true,
  waitlist_promoted boolean not null default true,
  table_message boolean not null default true,
  table_starting_soon boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  table_id uuid references public.social_tables(id) on delete cascade,
  type text not null check (type in ('seat_held_intro','seat_confirm_due','table_confirmed','waitlist_promoted','table_message','table_starting_soon')),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 240),
  data jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  dedupe_key text,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists notification_events_dedupe_key_idx
on public.notification_events (dedupe_key)
where dedupe_key is not null;

create index if not exists push_tokens_profile_idx on public.push_tokens (profile_id);
create index if not exists notification_events_due_idx on public.notification_events (status, scheduled_for);
create index if not exists notification_events_recipient_idx on public.notification_events (recipient_id, created_at desc);

alter table public.push_tokens enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_events enable row level security;

revoke all on table public.push_tokens from anon;
revoke all on table public.push_tokens from authenticated;
revoke all on table public.notification_preferences from anon;
revoke all on table public.notification_preferences from authenticated;
revoke all on table public.notification_events from anon;
revoke all on table public.notification_events from authenticated;

create trigger trg_20_set_push_tokens_updated_at
before update on public.push_tokens
for each row execute function public.set_updated_at();

create trigger trg_20_set_notification_preferences_updated_at
before update on public.notification_preferences
for each row execute function public.set_updated_at();

create trigger trg_20_set_notification_events_updated_at
before update on public.notification_events
for each row execute function public.set_updated_at();

create or replace function public.ensure_notification_preferences(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notification_preferences (profile_id)
  values (p_profile_id)
  on conflict (profile_id) do nothing;
end;
$$;

create or replace function public.queue_notification_event(
  p_recipient_id uuid,
  p_table_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb,
  p_scheduled_for timestamptz default now(),
  p_dedupe_key text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_enabled boolean;
begin
  if p_recipient_id is null or p_type is null then
    return;
  end if;

  perform public.ensure_notification_preferences(p_recipient_id);

  select case p_type
    when 'seat_held_intro' then seat_held_intro
    when 'seat_confirm_due' then seat_confirm_due
    when 'table_confirmed' then table_confirmed
    when 'waitlist_promoted' then waitlist_promoted
    when 'table_message' then table_message
    when 'table_starting_soon' then table_starting_soon
    else false
  end
  into v_enabled
  from public.notification_preferences
  where profile_id = p_recipient_id;

  if not coalesce(v_enabled, false) then
    return;
  end if;

  insert into public.notification_events (
    recipient_id,
    table_id,
    type,
    title,
    body,
    data,
    scheduled_for,
    dedupe_key
  )
  values (
    p_recipient_id,
    p_table_id,
    p_type,
    btrim(p_title),
    btrim(p_body),
    coalesce(p_data, '{}'::jsonb),
    coalesce(p_scheduled_for, now()),
    nullif(btrim(coalesce(p_dedupe_key, '')), '')
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

create or replace function public.upsert_push_token(
  p_token text,
  p_platform text,
  p_device_id text default null
)
returns table (token text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid := auth.uid();
  v_platform text := lower(btrim(coalesce(p_platform, 'unknown')));
begin
  if v_profile_id is null then raise exception 'Authentication required'; end if;
  if char_length(btrim(coalesce(p_token, ''))) < 20 then raise exception 'Invalid push token'; end if;
  if v_platform not in ('ios', 'android', 'web') then v_platform := 'unknown'; end if;

  insert into public.push_tokens (profile_id, token, platform, device_id)
  values (v_profile_id, btrim(p_token), v_platform, nullif(btrim(coalesce(p_device_id, '')), ''))
  on conflict (token) do update
  set profile_id = excluded.profile_id,
      platform = excluded.platform,
      device_id = excluded.device_id,
      updated_at = now()
  returning push_tokens.token into token;

  perform public.ensure_notification_preferences(v_profile_id);
  return next;
end;
$$;

create or replace function public.delete_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  delete from public.push_tokens
  where profile_id = auth.uid()
    and token = btrim(coalesce(p_token, ''));
end;
$$;

create or replace function public.get_notification_preferences()
returns table (
  seat_held_intro boolean,
  seat_confirm_due boolean,
  table_confirmed boolean,
  waitlist_promoted boolean,
  table_message boolean,
  table_starting_soon boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform public.ensure_notification_preferences(auth.uid());

  return query
  select np.seat_held_intro,
         np.seat_confirm_due,
         np.table_confirmed,
         np.waitlist_promoted,
         np.table_message,
         np.table_starting_soon
  from public.notification_preferences np
  where np.profile_id = auth.uid();
end;
$$;

create or replace function public.update_notification_preferences(
  p_seat_held_intro boolean default null,
  p_seat_confirm_due boolean default null,
  p_table_confirmed boolean default null,
  p_waitlist_promoted boolean default null,
  p_table_message boolean default null,
  p_table_starting_soon boolean default null
)
returns table (
  seat_held_intro boolean,
  seat_confirm_due boolean,
  table_confirmed boolean,
  waitlist_promoted boolean,
  table_message boolean,
  table_starting_soon boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform public.ensure_notification_preferences(auth.uid());

  update public.notification_preferences
  set seat_held_intro = coalesce(p_seat_held_intro, seat_held_intro),
      seat_confirm_due = coalesce(p_seat_confirm_due, seat_confirm_due),
      table_confirmed = coalesce(p_table_confirmed, table_confirmed),
      waitlist_promoted = coalesce(p_waitlist_promoted, waitlist_promoted),
      table_message = coalesce(p_table_message, table_message),
      table_starting_soon = coalesce(p_table_starting_soon, table_starting_soon)
  where profile_id = auth.uid();

  return query select * from public.get_notification_preferences();
end;
$$;

create or replace function public.mark_notification_events(
  p_event_ids uuid[],
  p_status text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_status not in ('sent', 'failed', 'skipped') then
    raise exception 'Invalid notification status';
  end if;

  update public.notification_events
  set status = p_status,
      error = nullif(btrim(coalesce(p_error, '')), ''),
      sent_at = case when p_status = 'sent' then now() else sent_at end
  where id = any(p_event_ids)
    and status = 'queued';
end;
$$;

drop function if exists public.list_social_tables(double precision, double precision, double precision, double precision);
drop function if exists public.get_social_table_detail(uuid);
drop function if exists public.list_my_active_tables();

create or replace function public.list_social_tables(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision
)
returns table (
  id uuid,
  activity text,
  title text,
  note text,
  vibe text,
  area_label text,
  starts_at timestamptz,
  latitude double precision,
  longitude double precision,
  status text,
  min_seats integer,
  max_seats integer,
  confirmed_count integer,
  active_count integer,
  waitlist_count integer,
  creator_id uuid,
  creator_display_name text,
  creator_avatar_path text,
  my_member_status text,
  is_waitlisted boolean,
  intro_due_at timestamptz,
  confirm_due_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform public.release_expired_table_seats(null);

  return query
  select st.id, st.activity, st.title, st.note, st.vibe, st.area_label, st.starts_at,
         extensions.ST_Y(st.location::geometry)::double precision,
         extensions.ST_X(st.location::geometry)::double precision,
         st.status, st.min_seats, st.max_seats,
         count(tm_confirmed.profile_id)::integer,
         count(tm_active.profile_id)::integer,
         count(tw.profile_id)::integer,
         p.id, p.display_name, p.avatar_path,
         own.status,
         exists(select 1 from public.table_waitlist own_wait where own_wait.table_id = st.id and own_wait.profile_id = auth.uid()),
         own.intro_due_at,
         own.confirm_due_at
  from public.social_tables st
  join public.profiles p on p.id = st.created_by
  left join public.table_members own on own.table_id = st.id and own.profile_id = auth.uid()
  left join public.table_members tm_confirmed on tm_confirmed.table_id = st.id and tm_confirmed.status = 'confirmed'
  left join public.table_members tm_active on tm_active.table_id = st.id and tm_active.status in ('pending_intro','pending_confirm','confirmed')
  left join public.table_waitlist tw on tw.table_id = st.id
  where st.starts_at >= now() - interval '1 hour'
    and st.starts_at < date_trunc('day', now()) + interval '2 days'
    and st.status in ('forming','confirmed','happening')
    and extensions.ST_Y(st.location::geometry) between p_min_lat and p_max_lat
    and extensions.ST_X(st.location::geometry) between p_min_lng and p_max_lng
    and not public.is_blocked_between(auth.uid(), st.created_by)
  group by st.id, p.id, own.status, own.intro_due_at, own.confirm_due_at
  order by st.starts_at asc;
end;
$$;

create or replace function public.get_social_table_detail(p_table_id uuid)
returns table (
  id uuid,
  activity text,
  title text,
  note text,
  vibe text,
  area_label text,
  starts_at timestamptz,
  latitude double precision,
  longitude double precision,
  status text,
  min_seats integer,
  max_seats integer,
  intro_prompt text,
  creator_id uuid,
  creator_display_name text,
  my_member_status text,
  is_waitlisted boolean,
  intro_due_at timestamptz,
  confirm_due_at timestamptz,
  joined_at timestamptz,
  confirmed_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform public.release_expired_table_seats(p_table_id);

  return query
  select st.id, st.activity, st.title, st.note, st.vibe, st.area_label, st.starts_at,
         extensions.ST_Y(st.location::geometry)::double precision,
         extensions.ST_X(st.location::geometry)::double precision,
         st.status, st.min_seats, st.max_seats, st.intro_prompt,
         p.id, p.display_name, own.status,
         exists(select 1 from public.table_waitlist tw where tw.table_id = st.id and tw.profile_id = auth.uid()),
         own.intro_due_at,
         own.confirm_due_at,
         own.joined_at,
         own.confirmed_at
  from public.social_tables st
  join public.profiles p on p.id = st.created_by
  left join public.table_members own on own.table_id = st.id and own.profile_id = auth.uid()
  where st.id = p_table_id
    and not public.is_blocked_between(auth.uid(), st.created_by);
end;
$$;

create or replace function public.release_expired_table_seats(p_table_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member record;
  v_promoted uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  perform set_config('app.tably_rpc', 'on', true);

  for v_member in
    select tm.table_id, tm.profile_id
    from public.table_members tm
    join public.social_tables st on st.id = tm.table_id
    where (p_table_id is null or tm.table_id = p_table_id)
      and st.starts_at > now()
      and (
        (tm.status = 'pending_intro' and tm.intro_due_at < now()) or
        (tm.status = 'pending_confirm' and tm.confirm_due_at < now())
      )
  loop
    update public.table_members
    set status = 'replaced'
    where table_id = v_member.table_id and profile_id = v_member.profile_id;

    select tw.profile_id into v_promoted
    from public.table_waitlist tw
    where tw.table_id = v_member.table_id
    order by tw.created_at asc
    limit 1;

    if v_promoted is not null then
      delete from public.table_waitlist where table_id = v_member.table_id and profile_id = v_promoted;
      insert into public.table_members (table_id, profile_id, status, intro_due_at, confirm_due_at)
      values (v_member.table_id, v_promoted, 'pending_intro', now() + interval '30 minutes', now() + interval '30 minutes')
      on conflict (table_id, profile_id) do update
      set status = 'pending_intro', intro_due_at = excluded.intro_due_at, confirm_due_at = excluded.confirm_due_at;

      perform public.queue_notification_event(
        v_promoted,
        v_member.table_id,
        'waitlist_promoted',
        'A seat opened',
        'You were promoted from the waitlist. Answer the intro to keep your seat.',
        jsonb_build_object('tableId', v_member.table_id::text, 'type', 'waitlist_promoted'),
        now(),
        'waitlist_promoted:' || v_member.table_id::text || ':' || v_promoted::text
      );

      perform public.queue_notification_event(
        v_promoted,
        v_member.table_id,
        'seat_held_intro',
        'Keep your seat',
        'Answer the intro before your held seat expires.',
        jsonb_build_object('tableId', v_member.table_id::text, 'type', 'seat_held_intro'),
        now() + interval '20 minutes',
        'seat_held_intro:' || v_member.table_id::text || ':' || v_promoted::text
      );
    end if;

    perform public.refresh_table_status(v_member.table_id);
  end loop;
end;
$$;

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
  v_confirm_due_at timestamptz;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_activity not in ('coffee','dinner','drinks','walk','run','cinema','coworking','culture','sports','explore') then raise exception 'Invalid activity'; end if;
  if p_starts_at < now() or p_starts_at > (date_trunc('day', now()) + interval '2 days') then raise exception 'Tables must be today or tomorrow'; end if;
  if p_lng is null or p_lat is null or p_lng < -180 or p_lng > 180 or p_lat < -90 or p_lat > 90 then raise exception 'Invalid coordinates'; end if;

  v_confirm_due_at := least(p_starts_at - interval '2 hours', now() + interval '30 minutes');
  if v_confirm_due_at < now() then v_confirm_due_at := now() + interval '30 minutes'; end if;

  perform set_config('app.tably_rpc', 'on', true);

  insert into public.social_tables (created_by, activity, title, note, vibe, area_label, starts_at, min_seats, max_seats, intro_prompt, location)
  values (v_user_id, p_activity, btrim(p_title), btrim(coalesce(p_note, '')), btrim(coalesce(p_vibe, 'casual')), btrim(p_area_label), p_starts_at, p_min_seats, p_max_seats, btrim(coalesce(p_intro_prompt, 'What are you hoping this plan feels like?')), extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::geography)
  returning social_tables.id into v_table_id;

  insert into public.table_members (table_id, profile_id, status, intro_due_at, confirm_due_at)
  values (v_table_id, v_user_id, 'pending_intro', now() + interval '30 minutes', v_confirm_due_at);

  perform public.queue_notification_event(
    v_user_id,
    v_table_id,
    'seat_held_intro',
    'Keep your seat',
    'Answer the intro before your held seat expires.',
    jsonb_build_object('tableId', v_table_id::text, 'type', 'seat_held_intro'),
    now() + interval '20 minutes',
    'seat_held_intro:' || v_table_id::text || ':' || v_user_id::text
  );

  perform public.queue_notification_event(
    v_user_id,
    v_table_id,
    'table_starting_soon',
    'Your table starts soon',
    'Open the table and coordinate final details.',
    jsonb_build_object('tableId', v_table_id::text, 'type', 'table_starting_soon'),
    greatest(now(), p_starts_at - interval '30 minutes'),
    'table_starting_soon:' || v_table_id::text || ':' || v_user_id::text
  );

  return query select v_table_id;
end;
$$;

create or replace function public.join_social_table(p_table_id uuid)
returns table (member_status text, is_waitlisted boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_active_count integer;
  v_max_seats integer;
  v_creator uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  perform public.release_expired_table_seats(p_table_id);

  select st.max_seats, st.created_by into v_max_seats, v_creator from public.social_tables st where st.id = p_table_id and st.starts_at > now() and st.status in ('forming','confirmed');
  if v_max_seats is null then raise exception 'Table not found'; end if;
  if public.is_blocked_between(v_user_id, v_creator) then raise exception 'Table not found'; end if;

  if exists(select 1 from public.table_members where table_id = p_table_id and profile_id = v_user_id and status in ('pending_intro','pending_confirm','confirmed')) then
    return query select tm.status, false from public.table_members tm where tm.table_id = p_table_id and tm.profile_id = v_user_id;
    return;
  end if;

  select count(*) into v_active_count from public.table_members where table_id = p_table_id and status in ('pending_intro','pending_confirm','confirmed');
  perform set_config('app.tably_rpc', 'on', true);

  if v_active_count >= v_max_seats then
    insert into public.table_waitlist (table_id, profile_id) values (p_table_id, v_user_id) on conflict do nothing;
    return query select 'waitlisted'::text, true;
    return;
  end if;

  insert into public.table_members (table_id, profile_id, status, intro_due_at, confirm_due_at)
  values (p_table_id, v_user_id, 'pending_intro', now() + interval '30 minutes', now() + interval '30 minutes')
  on conflict (table_id, profile_id) do update set status = 'pending_intro', intro_due_at = excluded.intro_due_at, confirm_due_at = excluded.confirm_due_at;

  perform public.queue_notification_event(
    v_user_id,
    p_table_id,
    'seat_held_intro',
    'Keep your seat',
    'Answer the intro before your held seat expires.',
    jsonb_build_object('tableId', p_table_id::text, 'type', 'seat_held_intro'),
    now() + interval '20 minutes',
    'seat_held_intro:' || p_table_id::text || ':' || v_user_id::text
  );

  return query select 'pending_intro'::text, false;
end;
$$;

create or replace function public.answer_table_intro(p_table_id uuid, p_answer text)
returns table (member_status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_starts_at timestamptz;
  v_confirm_due_at timestamptz;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if char_length(btrim(coalesce(p_answer, ''))) < 1 then raise exception 'Intro answer is required'; end if;
  select starts_at into v_starts_at from public.social_tables where id = p_table_id;
  if v_starts_at is null then raise exception 'Table not found'; end if;
  v_confirm_due_at := least(v_starts_at - interval '2 hours', now() + interval '30 minutes');
  if v_confirm_due_at < now() then v_confirm_due_at := now() + interval '30 minutes'; end if;

  perform set_config('app.tably_rpc', 'on', true);
  update public.table_members
  set status = 'pending_confirm', intro_answer = btrim(p_answer), confirm_due_at = v_confirm_due_at
  where table_id = p_table_id and profile_id = v_user_id and status = 'pending_intro';

  perform public.queue_notification_event(
    v_user_id,
    p_table_id,
    'seat_confirm_due',
    'Confirm your seat',
    'Confirm attendance so everyone knows this table is real.',
    jsonb_build_object('tableId', p_table_id::text, 'type', 'seat_confirm_due'),
    least(v_confirm_due_at, now() + interval '20 minutes'),
    'seat_confirm_due:' || p_table_id::text || ':' || v_user_id::text
  );

  return query select tm.status from public.table_members tm where tm.table_id = p_table_id and tm.profile_id = v_user_id;
end;
$$;

create or replace function public.confirm_table_attendance(p_table_id uuid)
returns table (member_status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text;
  v_member record;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  perform public.release_expired_table_seats(p_table_id);
  perform set_config('app.tably_rpc', 'on', true);

  select status into v_status from public.social_tables where id = p_table_id;

  update public.table_members
  set status = 'confirmed', confirmed_at = now()
  where table_id = p_table_id and profile_id = v_user_id and status in ('pending_confirm','confirmed');

  perform public.refresh_table_status(p_table_id);

  if v_status is distinct from 'confirmed' and exists(select 1 from public.social_tables where id = p_table_id and status = 'confirmed') then
    for v_member in
      select profile_id from public.table_members where table_id = p_table_id and status = 'confirmed'
    loop
      perform public.queue_notification_event(
        v_member.profile_id,
        p_table_id,
        'table_confirmed',
        'Table confirmed',
        'Enough people confirmed. Open the chat and coordinate details.',
        jsonb_build_object('tableId', p_table_id::text, 'type', 'table_confirmed'),
        now(),
        'table_confirmed:' || p_table_id::text || ':' || v_member.profile_id::text
      );
    end loop;
  end if;

  return query select tm.status from public.table_members tm where tm.table_id = p_table_id and tm.profile_id = v_user_id;
end;
$$;

create or replace function public.list_my_active_tables()
returns table (
  id uuid,
  activity text,
  title text,
  starts_at timestamptz,
  area_label text,
  status text,
  member_status text,
  latest_message_body text,
  latest_message_created_at timestamptz,
  intro_due_at timestamptz,
  confirm_due_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform public.release_expired_table_seats(null);

  return query
  select st.id, st.activity, st.title, st.starts_at, st.area_label, st.status, tm.status,
         latest.body, latest.created_at, tm.intro_due_at, tm.confirm_due_at
  from public.table_members tm
  join public.social_tables st on st.id = tm.table_id
  left join lateral (
    select body, created_at from public.table_messages m where m.table_id = st.id order by created_at desc limit 1
  ) latest on true
  where tm.profile_id = auth.uid()
    and tm.status in ('pending_intro','pending_confirm','confirmed')
    and st.status in ('forming','confirmed','happening')
  order by coalesce(latest.created_at, st.starts_at) desc;
end;
$$;

create or replace function public.send_table_message(p_table_id uuid, p_body text)
returns table (id uuid, table_id uuid, sender_id uuid, sender_display_name text, sender_avatar_path text, body text, created_at timestamptz, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_message_id uuid;
  v_table_title text;
  v_recipient record;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_current_table_member(p_table_id) then raise exception 'Join this table to chat'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 1 or char_length(btrim(coalesce(p_body, ''))) > 1000 then raise exception 'Message must be 1-1000 characters'; end if;

  perform set_config('app.tably_rpc', 'on', true);
  insert into public.table_messages (table_id, sender_id, body) values (p_table_id, auth.uid(), btrim(p_body)) returning table_messages.id into v_message_id;
  select title into v_table_title from public.social_tables where id = p_table_id;

  for v_recipient in
    select tm.profile_id
    from public.table_members tm
    where tm.table_id = p_table_id
      and tm.profile_id <> auth.uid()
      and tm.status in ('pending_intro','pending_confirm','confirmed')
      and not public.is_blocked_between(auth.uid(), tm.profile_id)
  loop
    perform public.queue_notification_event(
      v_recipient.profile_id,
      p_table_id,
      'table_message',
      coalesce(v_table_title, 'New table message'),
      left(btrim(p_body), 160),
      jsonb_build_object('tableId', p_table_id::text, 'type', 'table_message'),
      now(),
      'table_message:' || v_message_id::text || ':' || v_recipient.profile_id::text
    );
  end loop;

  return query
  select m.id, m.table_id, m.sender_id, p.display_name, p.avatar_path, m.body, m.created_at, m.updated_at
  from public.table_messages m
  join public.profiles p on p.id = m.sender_id
  where m.id = v_message_id;
end;
$$;

revoke all on function public.ensure_notification_preferences(uuid) from public;
revoke all on function public.queue_notification_event(uuid, uuid, text, text, text, jsonb, timestamptz, text) from public;
revoke all on function public.mark_notification_events(uuid[], text, text) from public;
revoke all on function public.upsert_push_token(text, text, text) from public;
revoke all on function public.delete_push_token(text) from public;
revoke all on function public.get_notification_preferences() from public;
revoke all on function public.update_notification_preferences(boolean, boolean, boolean, boolean, boolean, boolean) from public;

grant execute on function public.upsert_push_token(text, text, text) to authenticated;
grant execute on function public.delete_push_token(text) to authenticated;
grant execute on function public.get_notification_preferences() to authenticated;
grant execute on function public.update_notification_preferences(boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
