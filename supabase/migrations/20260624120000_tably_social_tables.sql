create table if not exists public.social_tables (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  activity text not null check (activity in ('coffee','dinner','drinks','walk','run','cinema','coworking','culture','sports','explore')),
  title text not null check (char_length(title) between 1 and 80),
  note text not null default '' check (char_length(note) <= 500),
  vibe text not null default 'casual' check (char_length(vibe) <= 80),
  area_label text not null check (char_length(area_label) between 1 and 120),
  starts_at timestamptz not null,
  min_seats integer not null default 3 check (min_seats between 2 and 6),
  max_seats integer not null default 5 check (max_seats between 3 and 8),
  intro_prompt text not null default 'What are you hoping this plan feels like?' check (char_length(intro_prompt) between 1 and 180),
  location extensions.geography(Point, 4326) not null,
  status text not null default 'forming' check (status in ('forming','confirmed','happening','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_seats <= max_seats)
);

create table if not exists public.table_members (
  table_id uuid not null references public.social_tables(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending_intro' check (status in ('pending_intro','pending_confirm','confirmed','left','replaced','no_show')),
  intro_answer text not null default '' check (char_length(intro_answer) <= 500),
  joined_at timestamptz not null default now(),
  intro_due_at timestamptz not null default (now() + interval '30 minutes'),
  confirm_due_at timestamptz not null default (now() + interval '30 minutes'),
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (table_id, profile_id)
);

create table if not exists public.table_waitlist (
  table_id uuid not null references public.social_tables(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (table_id, profile_id)
);

create table if not exists public.table_messages (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.social_tables(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.moderation_reports
drop constraint if exists moderation_reports_target_type_check;

alter table public.moderation_reports
add constraint moderation_reports_target_type_check
check (target_type in ('profile', 'table', 'table_message', 'message', 'conversation'));

create index if not exists social_tables_starts_at_idx on public.social_tables (starts_at);
create index if not exists social_tables_location_gix on public.social_tables using gist (location);
create index if not exists table_members_profile_idx on public.table_members (profile_id, status);
create index if not exists table_messages_table_created_idx on public.table_messages (table_id, created_at desc);

alter table public.social_tables enable row level security;
alter table public.table_members enable row level security;
alter table public.table_waitlist enable row level security;
alter table public.table_messages enable row level security;

revoke all on table public.social_tables from anon;
revoke all on table public.table_members from anon;
revoke all on table public.table_waitlist from anon;
revoke all on table public.table_messages from anon;

grant select on table public.table_messages to authenticated;

create or replace function public.is_current_table_member(p_table_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.table_members tm
    where tm.table_id = p_table_id
      and tm.profile_id = auth.uid()
      and tm.status in ('pending_intro','pending_confirm','confirmed')
  );
$$;

create policy table_messages_select_members
on public.table_messages for select
to authenticated
using (public.is_current_table_member(table_messages.table_id));

create or replace function public.protect_tably_server_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('app.tably_rpc', true), '') <> 'on' then
    raise exception 'Tably tables require RPC access';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger trg_10_protect_social_tables_server_fields
before insert or update or delete on public.social_tables
for each row execute function public.protect_tably_server_fields();

create trigger trg_10_protect_table_members_server_fields
before insert or update or delete on public.table_members
for each row execute function public.protect_tably_server_fields();

create trigger trg_10_protect_table_waitlist_server_fields
before insert or update or delete on public.table_waitlist
for each row execute function public.protect_tably_server_fields();

create trigger trg_10_protect_table_messages_server_fields
before insert or update or delete on public.table_messages
for each row execute function public.protect_tably_server_fields();

create trigger trg_20_set_social_tables_updated_at
before update on public.social_tables
for each row execute function public.set_updated_at();

create trigger trg_20_set_table_members_updated_at
before update on public.table_members
for each row execute function public.set_updated_at();

create trigger trg_20_set_table_messages_updated_at
before update on public.table_messages
for each row execute function public.set_updated_at();

create or replace function public.refresh_table_status(p_table_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_confirmed_count integer;
  v_starts_at timestamptz;
begin
  select starts_at into v_starts_at from public.social_tables where id = p_table_id;
  select count(*) into v_confirmed_count from public.table_members where table_id = p_table_id and status = 'confirmed';

  perform set_config('app.tably_rpc', 'on', true);

  update public.social_tables
  set status = case
    when status = 'cancelled' then 'cancelled'
    when v_starts_at <= now() and v_starts_at > now() - interval '6 hours' then 'happening'
    when v_starts_at <= now() - interval '6 hours' then 'completed'
    when v_confirmed_count >= min_seats then 'confirmed'
    else 'forming'
  end
  where id = p_table_id;
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

  return query select v_table_id;
end;
$$;

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
  is_waitlisted boolean
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
         exists(select 1 from public.table_waitlist own_wait where own_wait.table_id = st.id and own_wait.profile_id = auth.uid())
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
  group by st.id, p.id, own.status
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
  is_waitlisted boolean
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
         exists(select 1 from public.table_waitlist tw where tw.table_id = st.id and tw.profile_id = auth.uid())
  from public.social_tables st
  join public.profiles p on p.id = st.created_by
  left join public.table_members own on own.table_id = st.id and own.profile_id = auth.uid()
  where st.id = p_table_id
    and not public.is_blocked_between(auth.uid(), st.created_by);
end;
$$;

create or replace function public.list_table_members(p_table_id uuid)
returns table (profile_id uuid, display_name text, summary text, avatar_path text, status text, intro_answer text, confirmed_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform public.release_expired_table_seats(p_table_id);

  return query
  select p.id, p.display_name, p.summary, p.avatar_path, tm.status, tm.intro_answer, tm.confirmed_at
  from public.table_members tm
  join public.profiles p on p.id = tm.profile_id
  where tm.table_id = p_table_id
    and tm.status in ('pending_intro','pending_confirm','confirmed')
    and not public.is_blocked_between(auth.uid(), p.id)
  order by case tm.status when 'confirmed' then 1 when 'pending_confirm' then 2 else 3 end, tm.joined_at asc;
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
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  perform public.release_expired_table_seats(p_table_id);
  perform set_config('app.tably_rpc', 'on', true);

  update public.table_members
  set status = 'confirmed', confirmed_at = now()
  where table_id = p_table_id and profile_id = v_user_id and status in ('pending_confirm','confirmed');

  perform public.refresh_table_status(p_table_id);
  return query select tm.status from public.table_members tm where tm.table_id = p_table_id and tm.profile_id = v_user_id;
end;
$$;

create or replace function public.leave_social_table(p_table_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform set_config('app.tably_rpc', 'on', true);
  update public.table_members set status = 'left' where table_id = p_table_id and profile_id = auth.uid();
  delete from public.table_waitlist where table_id = p_table_id and profile_id = auth.uid();
  perform public.refresh_table_status(p_table_id);
end;
$$;

create or replace function public.list_my_active_tables()
returns table (id uuid, activity text, title text, starts_at timestamptz, area_label text, status text, member_status text, latest_message_body text, latest_message_created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform public.release_expired_table_seats(null);

  return query
  select st.id, st.activity, st.title, st.starts_at, st.area_label, st.status, tm.status,
         latest.body, latest.created_at
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

create or replace function public.list_table_messages(p_table_id uuid)
returns table (id uuid, table_id uuid, sender_id uuid, sender_display_name text, sender_avatar_path text, body text, created_at timestamptz, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_current_table_member(p_table_id) then raise exception 'Join this table to see chat'; end if;

  return query
  select m.id, m.table_id, m.sender_id, p.display_name, p.avatar_path, m.body, m.created_at, m.updated_at
  from public.table_messages m
  join public.profiles p on p.id = m.sender_id
  where m.table_id = p_table_id
    and not public.is_blocked_between(auth.uid(), m.sender_id)
  order by m.created_at asc;
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
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_current_table_member(p_table_id) then raise exception 'Join this table to chat'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 1 or char_length(btrim(coalesce(p_body, ''))) > 1000 then raise exception 'Message must be 1-1000 characters'; end if;

  perform set_config('app.tably_rpc', 'on', true);
  insert into public.table_messages (table_id, sender_id, body) values (p_table_id, auth.uid(), btrim(p_body)) returning table_messages.id into v_message_id;

  return query
  select m.id, m.table_id, m.sender_id, p.display_name, p.avatar_path, m.body, m.created_at, m.updated_at
  from public.table_messages m
  join public.profiles p on p.id = m.sender_id
  where m.id = v_message_id;
end;
$$;

grant execute on function public.release_expired_table_seats(uuid) to authenticated;
grant execute on function public.create_social_table(text, text, text, text, text, timestamptz, double precision, double precision, integer, integer, text) to authenticated;
grant execute on function public.list_social_tables(double precision, double precision, double precision, double precision) to authenticated;
grant execute on function public.get_social_table_detail(uuid) to authenticated;
grant execute on function public.list_table_members(uuid) to authenticated;
grant execute on function public.join_social_table(uuid) to authenticated;
grant execute on function public.answer_table_intro(uuid, text) to authenticated;
grant execute on function public.confirm_table_attendance(uuid) to authenticated;
grant execute on function public.leave_social_table(uuid) to authenticated;
grant execute on function public.list_my_active_tables() to authenticated;
grant execute on function public.list_table_messages(uuid) to authenticated;
grant execute on function public.send_table_message(uuid, text) to authenticated;

create or replace function public.submit_report(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_details text default ''
)
returns table (
  id uuid,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reporter_id uuid := auth.uid();
  v_target_type text := btrim(coalesce(p_target_type, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_details text := btrim(coalesce(p_details, ''));
  v_target_owner_id uuid;
  v_report public.moderation_reports;
begin
  if v_reporter_id is null then
    raise exception 'Authentication required';
  end if;

  if v_target_type not in ('profile', 'table', 'table_message', 'message', 'conversation') then
    raise exception 'Report target is invalid';
  end if;

  if v_reason not in (
    'Harassment or abuse',
    'Hate or discrimination',
    'Sexual content',
    'Spam or scam',
    'Unsafe meetup behavior',
    'Other'
  ) then
    raise exception 'Report reason is invalid';
  end if;

  if char_length(v_details) > 1000 then
    raise exception 'Report details must be 1000 characters or fewer';
  end if;

  if v_target_type = 'profile' then
    select p.id into v_target_owner_id
    from public.profiles p
    where p.id = p_target_id;
  elsif v_target_type = 'table' then
    select st.created_by into v_target_owner_id
    from public.social_tables st
    where st.id = p_target_id;
  elsif v_target_type = 'table_message' then
    select tm.sender_id into v_target_owner_id
    from public.table_messages tm
    where tm.id = p_target_id;
  elsif v_target_type = 'message' then
    select m.sender_id into v_target_owner_id
    from public.messages m
    where m.id = p_target_id;
  elsif v_target_type = 'conversation' then
    select cp.profile_id into v_target_owner_id
    from public.conversation_participants cp
    where cp.conversation_id = p_target_id
      and cp.profile_id <> v_reporter_id
    limit 1;
  end if;

  if v_target_owner_id is null then
    raise exception 'Report target was not found';
  end if;

  insert into public.moderation_reports (
    reporter_id,
    target_type,
    target_id,
    target_owner_id,
    reason,
    details
  )
  values (
    v_reporter_id,
    v_target_type,
    p_target_id,
    v_target_owner_id,
    v_reason,
    v_details
  )
  returning * into v_report;

  return query select v_report.id, v_report.status, v_report.created_at;
end;
$$;

grant execute on function public.submit_report(text, uuid, text, text) to authenticated;
