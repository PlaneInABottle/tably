alter table public.profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists moderation_status text not null default 'active'
    check (moderation_status in ('active', 'limited', 'suspended', 'deleted'));

update public.profiles
set terms_accepted_at = coalesce(terms_accepted_at, now()),
    terms_version = coalesce(terms_version, '2026-06-ugc-v1')
where terms_accepted_at is null;

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

create table public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  reported_user_id uuid references public.profiles(id) on delete set null,
  target_type text not null check (target_type in ('profile', 'dive', 'message', 'conversation')),
  target_id uuid not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 80),
  details text not null default '' check (char_length(details) <= 1000),
  snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index moderation_reports_status_created_idx on public.moderation_reports (status, created_at desc);
create index moderation_reports_reporter_idx on public.moderation_reports (reporter_id);
create index moderation_reports_reported_user_idx on public.moderation_reports (reported_user_id);

alter table public.user_blocks enable row level security;
alter table public.moderation_reports enable row level security;

revoke all on table public.user_blocks from anon;
revoke all on table public.user_blocks from authenticated;
revoke all on table public.moderation_reports from anon;
revoke all on table public.moderation_reports from authenticated;

create trigger trg_20_set_moderation_reports_updated_at
before update on public.moderation_reports
for each row
execute function public.set_updated_at();

create or replace function public.contains_objectionable_content(p_text text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(p_text, '') ~* '([[:<:]]fuck[[:>:]]|[[:<:]]shit[[:>:]]|[[:<:]]bitch[[:>:]]|[[:<:]]asshole[[:>:]]|[[:<:]]cunt[[:>:]]|[[:<:]]faggot[[:>:]]|[[:<:]]nigger[[:>:]]|[[:<:]]kill[[:space:]]+yourself[[:>:]]|[[:<:]]suicide[[:space:]]+bait[[:>:]])';
$$;

create or replace function public.reject_objectionable_text(p_text text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.contains_objectionable_content(p_text) then
    raise exception 'Content contains language that is not allowed.';
  end if;
end;
$$;

create or replace function public.ensure_terms_accepted()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.terms_accepted_at is not null
      and p.moderation_status = 'active'
  ) then
    raise exception 'Terms must be accepted before sharing content.';
  end if;
end;
$$;

create or replace function public.is_blocked_between(p_first uuid, p_second uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_blocks ub
    where (ub.blocker_id = p_first and ub.blocked_id = p_second)
       or (ub.blocker_id = p_second and ub.blocked_id = p_first)
  );
$$;

create or replace function public.can_current_user_read_conversation(p_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.conversation_participants own_participant
    where own_participant.conversation_id = p_conversation_id
      and own_participant.profile_id = auth.uid()
  )
  and not exists (
    select 1
    from public.conversation_participants opponent_participant
    where opponent_participant.conversation_id = p_conversation_id
      and opponent_participant.profile_id <> auth.uid()
      and public.is_blocked_between(auth.uid(), opponent_participant.profile_id)
  );
$$;

drop policy if exists messages_select_participants on public.messages;

create policy messages_select_participants
on public.messages for select
to authenticated
using (public.can_current_user_read_conversation(messages.conversation_id));

create or replace function public.accept_current_terms()
returns table (terms_accepted_at timestamptz, terms_version text)
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

  update public.profiles
  set terms_accepted_at = now(),
      terms_version = '2026-06-ugc-v1'
  where id = v_user_id;

  return query
  select p.terms_accepted_at, p.terms_version
  from public.profiles p
  where p.id = v_user_id;
end;
$$;

create or replace function public.block_user(p_blocked_id uuid, p_reason text default null)
returns table (blocked_id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_blocked_id is null or p_blocked_id = v_user_id then
    raise exception 'Blocked user is invalid';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_blocked_id) then
    raise exception 'User was not found';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id, reason)
  values (v_user_id, p_blocked_id, v_reason)
  on conflict on constraint user_blocks_pkey do update
  set reason = excluded.reason
  returning user_blocks.blocked_id, user_blocks.created_at into blocked_id, created_at;

  return next;
end;
$$;

create or replace function public.unblock_user(p_blocked_id uuid)
returns table (blocked_id uuid)
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

  delete from public.user_blocks
  where blocker_id = v_user_id and user_blocks.blocked_id = p_blocked_id;

  blocked_id := p_blocked_id;
  return next;
end;
$$;

create or replace function public.list_blocked_users()
returns table (
  blocked_id uuid,
  display_name text,
  summary text,
  avatar_path text,
  created_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select ub.blocked_id,
         p.display_name,
         p.summary,
         p.avatar_path,
         ub.created_at
  from public.user_blocks ub
  join public.profiles p on p.id = ub.blocked_id
  where auth.uid() is not null
    and ub.blocker_id = auth.uid()
  order by ub.created_at desc;
$$;

create or replace function public.submit_report(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_details text default ''
)
returns table (id uuid, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_target_type text := lower(btrim(coalesce(p_target_type, '')));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_details text := btrim(coalesce(p_details, ''));
  v_reported_user_id uuid;
  v_snapshot jsonb := '{}'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_target_type not in ('profile', 'dive', 'message', 'conversation') then
    raise exception 'Report target is invalid';
  end if;

  if p_target_id is null then
    raise exception 'Report target is required';
  end if;

  if char_length(v_reason) < 1 or char_length(v_reason) > 80 then
    raise exception 'Report reason must be 1-80 characters';
  end if;

  if char_length(v_details) > 1000 then
    raise exception 'Report details must be 1000 characters or fewer';
  end if;

  if v_target_type = 'profile' then
    select p.id,
           jsonb_build_object('display_name', p.display_name, 'summary', p.summary, 'avatar_path', p.avatar_path)
      into v_reported_user_id, v_snapshot
    from public.profiles p
    where p.id = p_target_id;
  elsif v_target_type = 'dive' then
    select d.created_by,
           jsonb_build_object('title', d.title, 'description', d.description, 'event_at', d.event_at, 'location_label_snapshot', d.location_label_snapshot)
      into v_reported_user_id, v_snapshot
    from public.dives d
    where d.id = p_target_id;
  elsif v_target_type = 'message' then
    select m.sender_id,
           jsonb_build_object('conversation_id', m.conversation_id, 'body', m.body, 'created_at', m.created_at)
      into v_reported_user_id, v_snapshot
    from public.messages m
    where m.id = p_target_id
      and public.is_conversation_participant(m.conversation_id, v_user_id);
  elsif v_target_type = 'conversation' then
    select cp.profile_id,
           jsonb_build_object('conversation_id', c.id, 'updated_at', c.updated_at)
      into v_reported_user_id, v_snapshot
    from public.conversations c
    join public.conversation_participants cp
      on cp.conversation_id = c.id
     and cp.profile_id <> v_user_id
    where c.id = p_target_id
      and public.is_conversation_participant(c.id, v_user_id)
    limit 1;
  end if;

  if v_reported_user_id is null then
    raise exception 'Report target was not found';
  end if;

  insert into public.moderation_reports (
    reporter_id,
    reported_user_id,
    target_type,
    target_id,
    reason,
    details,
    snapshot
  )
  values (
    v_user_id,
    v_reported_user_id,
    v_target_type,
    p_target_id,
    v_reason,
    v_details,
    v_snapshot
  )
  returning moderation_reports.id, moderation_reports.status, moderation_reports.created_at
  into id, status, created_at;

  return next;
end;
$$;

create or replace function public.reject_objectionable_profile_text()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.reject_objectionable_text(new.display_name);
  perform public.reject_objectionable_text(new.summary);
  return new;
end;
$$;

drop trigger if exists trg_05_reject_objectionable_profile_text on public.profiles;
create trigger trg_05_reject_objectionable_profile_text
before insert or update on public.profiles
for each row
execute function public.reject_objectionable_profile_text();

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
    and p.moderation_status = 'active'
    and not public.is_blocked_between(auth.uid(), p.id)
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
    and p.moderation_status = 'active'
    and not public.is_blocked_between(auth.uid(), p.id)
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

revoke all on function public.contains_objectionable_content(text) from public;
revoke all on function public.reject_objectionable_text(text) from public;
revoke all on function public.ensure_terms_accepted() from public;
revoke all on function public.is_blocked_between(uuid, uuid) from public;
revoke all on function public.can_current_user_read_conversation(uuid) from public;
revoke all on function public.accept_current_terms() from public;
revoke all on function public.block_user(uuid, text) from public;
revoke all on function public.unblock_user(uuid) from public;
revoke all on function public.list_blocked_users() from public;
revoke all on function public.submit_report(text, uuid, text, text) from public;

grant execute on function public.can_current_user_read_conversation(uuid) to authenticated;
grant execute on function public.accept_current_terms() to authenticated;
grant execute on function public.block_user(uuid, text) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.list_blocked_users() to authenticated;
grant execute on function public.submit_report(text, uuid, text, text) to authenticated;

create or replace function public.upsert_conversation(p_other_user_id uuid)
returns table (
  conversation_id uuid,
  opponent_id uuid,
  opponent_display_name text,
  opponent_summary text,
  opponent_avatar_path text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_conversation_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_other_user_id is null then
    raise exception 'Other participant is required';
  end if;

  if p_other_user_id = v_user_id then
    raise exception 'Cannot start a conversation with yourself';
  end if;

  if public.is_blocked_between(v_user_id, p_other_user_id) then
    raise exception 'You cannot message this diver.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_other_user_id and p.moderation_status = 'active'
  ) then
    raise exception 'Other participant was not found';
  end if;

  v_low := least(v_user_id, p_other_user_id);
  v_high := greatest(v_user_id, p_other_user_id);

  perform set_config('app.chat_rpc', 'on', true);

  insert into public.conversations (participant_low, participant_high)
  values (v_low, v_high)
  on conflict (participant_low, participant_high) do update
  set updated_at = public.conversations.updated_at
  returning id into v_conversation_id;

  insert into public.conversation_participants (conversation_id, profile_id)
  values (v_conversation_id, v_user_id), (v_conversation_id, p_other_user_id)
  on conflict do nothing;

  return query
  select v_conversation_id,
         p.id,
         p.display_name,
         p.summary,
         p.avatar_path
  from public.profiles p
  where p.id = p_other_user_id;
end;
$$;

create or replace function public.get_conversations_with_latest_message()
returns table (
  conversation_id uuid,
  opponent_id uuid,
  opponent_display_name text,
  opponent_summary text,
  opponent_avatar_path text,
  latest_message_id uuid,
  latest_message_body text,
  latest_message_created_at timestamptz,
  latest_message_sender_id uuid,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select c.id,
         opponent.id,
         opponent.display_name,
         opponent.summary,
         opponent.avatar_path,
         latest.id,
         latest.body,
         latest.created_at,
         latest.sender_id,
         c.updated_at
  from public.conversations c
  join public.conversation_participants own_participant
    on own_participant.conversation_id = c.id
   and own_participant.profile_id = auth.uid()
  join public.conversation_participants opponent_participant
    on opponent_participant.conversation_id = c.id
   and opponent_participant.profile_id <> auth.uid()
  join public.profiles opponent on opponent.id = opponent_participant.profile_id
  left join lateral (
    select m.id, m.body, m.created_at, m.sender_id
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) latest on true
  where auth.uid() is not null
    and opponent.moderation_status = 'active'
    and not public.is_blocked_between(auth.uid(), opponent.id)
  order by coalesce(latest.created_at, c.updated_at) desc;
$$;

create or replace function public.get_messages_by_conversation_id(
  p_conversation_id uuid,
  p_before_message_created_at timestamptz default null,
  p_page_size int default 50
)
returns table (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  sender_display_name text,
  sender_avatar_path text,
  body text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_page_size int := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_opponent_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_conversation_participant(p_conversation_id, v_user_id) then
    raise exception 'Conversation not found';
  end if;

  select cp.profile_id into v_opponent_id
  from public.conversation_participants cp
  where cp.conversation_id = p_conversation_id
    and cp.profile_id <> v_user_id
  limit 1;

  if v_opponent_id is not null and public.is_blocked_between(v_user_id, v_opponent_id) then
    raise exception 'Conversation not found';
  end if;

  return query
  select m.id,
         m.conversation_id,
         m.sender_id,
         p.display_name,
         p.avatar_path,
         m.body,
         m.created_at,
         m.updated_at
  from public.messages m
  join public.profiles p on p.id = m.sender_id
  where m.conversation_id = p_conversation_id
    and (p_before_message_created_at is null or m.created_at < p_before_message_created_at)
  order by m.created_at desc
  limit v_page_size;
end;
$$;

create or replace function public.send_message(
  p_conversation_id uuid,
  p_body text
)
returns table (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  sender_display_name text,
  sender_avatar_path text,
  body text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_message_id uuid;
  v_opponent_id uuid;
begin
  perform public.ensure_terms_accepted();

  if not public.is_conversation_participant(p_conversation_id, v_user_id) then
    raise exception 'Conversation not found';
  end if;

  select cp.profile_id into v_opponent_id
  from public.conversation_participants cp
  where cp.conversation_id = p_conversation_id
    and cp.profile_id <> v_user_id
  limit 1;

  if v_opponent_id is not null and public.is_blocked_between(v_user_id, v_opponent_id) then
    raise exception 'You cannot message this diver.';
  end if;

  if char_length(v_body) < 1 or char_length(v_body) > 1000 then
    raise exception 'Message must be 1-1000 characters.';
  end if;

  perform public.reject_objectionable_text(v_body);
  perform set_config('app.chat_rpc', 'on', true);

  insert into public.messages (conversation_id, sender_id, body)
  values (p_conversation_id, v_user_id, v_body)
  returning messages.id into v_message_id;

  update public.conversations c
  set updated_at = now()
  where c.id = p_conversation_id;

  return query
  select m.id,
         m.conversation_id,
         m.sender_id,
         p.display_name,
         p.avatar_path,
         m.body,
         m.created_at,
         m.updated_at
  from public.messages m
  join public.profiles p on p.id = m.sender_id
  where m.id = v_message_id;
end;
$$;

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
as $$
declare
  v_user_id uuid := auth.uid();
  v_description text := btrim(coalesce(p_description, ''));
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_dive public.dives;
begin
  perform public.ensure_terms_accepted();

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

  perform public.reject_objectionable_text(v_title);
  perform public.reject_objectionable_text(v_description);
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
$$;

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
as $$
declare
  v_user_id uuid := auth.uid();
  v_description text := btrim(coalesce(p_description, ''));
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_location extensions.geography;
  v_location_label text;
  v_dive public.dives;
begin
  perform public.ensure_terms_accepted();

  if p_event_at is null then
    raise exception 'Event date is required';
  end if;

  if char_length(v_description) < 1 or char_length(v_description) > 500 then
    raise exception 'Description must be 1-500 characters';
  end if;

  if v_title is not null and char_length(v_title) > 80 then
    raise exception 'Title must be 80 characters or fewer';
  end if;

  perform public.reject_objectionable_text(v_title);
  perform public.reject_objectionable_text(v_description);

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
$$;
