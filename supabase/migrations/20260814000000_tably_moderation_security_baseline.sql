-- M4.1 security foundation.  This migration is intentionally independent of
-- the M4.2 moderation schema and notification-identity migrations.

alter table public.social_tables
  add column if not exists content_removed_at timestamptz;

alter table public.table_messages
  add column if not exists content_removed_at timestamptz;

drop index if exists public.social_tables_content_removed_idx;
drop index if exists public.table_messages_content_removed_idx;

create index if not exists social_tables_active_created_idx
  on public.social_tables (created_at desc)
  where content_removed_at is null;

create index if not exists table_messages_visible_idx
  on public.table_messages (table_id, created_at)
  where content_removed_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'social_tables'
  ) then
    alter publication supabase_realtime add table public.social_tables;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'table_messages'
  ) then
    alter publication supabase_realtime add table public.table_messages;
  end if;
end;
$$;

-- ProfilePatch is deliberately the only direct authenticated profile update
-- surface.  Server-owned columns remain inaccessible even when a caller uses
-- PostgREST directly.
revoke update on table public.profiles from authenticated;
grant update (display_name, summary, is_first_login) on table public.profiles to authenticated;

create or replace function public.current_profile_moderation_status()
returns text
language sql
security definer
set search_path = public, pg_temp
as $$
  select p.moderation_status
  from public.profiles p
  where p.id = auth.uid();
$$;

create or replace function public.require_active_profile()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select p.moderation_status
  into v_status
  from public.profiles p
  where p.id = auth.uid();

  if v_status is null or v_status = 'deleted' then
    raise exception 'Account not found';
  elsif v_status = 'limited' then
    raise exception 'Account limited';
  elsif v_status = 'suspended' then
    raise exception 'Account suspended';
  end if;
end;
$$;

-- M4.1 has no admin schema.  Keep the role probe internal and safe so a
-- later append-only migration can replace the body without widening EXECUTE.
create or replace function public.admin_has_role(p_required_role text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
begin
  if v_user_id is null or p_required_role not in ('reviewer', 'admin') then
    return false;
  end if;

  if to_regclass('public.admin_roles') is null then
    return false;
  end if;

  execute 'select role from public.admin_roles where user_id = $1'
    into v_role
    using v_user_id;

  return v_role = p_required_role
    or (p_required_role = 'reviewer' and v_role = 'admin');
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

  if coalesce(array_length(p_event_ids, 1), 0) = 0 then
    return;
  end if;

  if exists (
    select 1
    from unnest(p_event_ids) requested(id)
    left join public.notification_events event on event.id = requested.id
    where event.id is null or event.status <> 'processing'
  ) then
    raise exception 'Notification event is not processing';
  end if;

  update public.notification_events
  set status = p_status,
      error = nullif(btrim(coalesce(p_error, '')), ''),
      processing_started_at = null,
      sent_at = case when p_status = 'sent' then now() else sent_at end
  where id = any(p_event_ids)
    and status = 'processing';
end;
$$;

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
  select st.starts_at
  into v_starts_at
  from public.social_tables st
  where st.id = p_table_id;

  if v_starts_at is null then
    return;
  end if;

  select count(*)
  into v_confirmed_count
  from public.table_members tm
  where tm.table_id = p_table_id
    and tm.status = 'confirmed';

  perform set_config('app.tably_rpc', 'on', true);

  update public.social_tables st
  set status = case
    when st.status = 'cancelled' then 'cancelled'
    when v_starts_at <= now() and v_starts_at > now() - interval '6 hours' then 'happening'
    when v_starts_at <= now() - interval '6 hours' then 'completed'
    when v_confirmed_count >= st.min_seats then 'confirmed'
    else 'forming'
  end
  where st.id = p_table_id;
end;
$$;

create or replace function public.release_expired_table_seats(p_table_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_table_id uuid;
  v_member record;
  v_promoted uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  perform set_config('app.tably_rpc', 'on', true);

  for v_table_id in
    select st.id
    from public.social_tables st
    where (p_table_id is null or st.id = p_table_id)
      and st.content_removed_at is null
      and st.starts_at > now()
      and exists (
        select 1
        from public.table_members expired_member
        where expired_member.table_id = st.id
          and (
            (expired_member.status = 'pending_intro' and expired_member.intro_due_at < now()) or
            (expired_member.status = 'pending_confirm' and expired_member.confirm_due_at < now())
          )
      )
    order by st.id
    for update of st skip locked
  loop
    for v_member in
      select tm.profile_id
      from public.table_members tm
      where tm.table_id = v_table_id
        and (
          (tm.status = 'pending_intro' and tm.intro_due_at < now()) or
          (tm.status = 'pending_confirm' and tm.confirm_due_at < now())
        )
      order by tm.joined_at
      for update skip locked
    loop
      update public.table_members tm
      set status = 'replaced'
      where tm.table_id = v_table_id
        and tm.profile_id = v_member.profile_id
        and (
          (tm.status = 'pending_intro' and tm.intro_due_at < now()) or
          (tm.status = 'pending_confirm' and tm.confirm_due_at < now())
        );

      v_promoted := null;
      select tw.profile_id
      into v_promoted
      from public.table_waitlist tw
      join public.profiles p on p.id = tw.profile_id
      where tw.table_id = v_table_id
        and p.moderation_status in ('active', 'limited')
        and not exists (
          select 1
          from public.table_members active_member
          where active_member.table_id = tw.table_id
            and active_member.profile_id = tw.profile_id
            and active_member.status in ('pending_intro', 'pending_confirm', 'confirmed')
        )
      order by tw.created_at asc
      for update of tw skip locked
      limit 1;

      if v_promoted is not null then
        delete from public.table_waitlist
        where table_id = v_table_id and profile_id = v_promoted;

        insert into public.table_members (table_id, profile_id, status, intro_due_at, confirm_due_at)
        values (v_table_id, v_promoted, 'pending_intro', now() + interval '30 minutes', now() + interval '30 minutes')
        on conflict (table_id, profile_id) do update
        set status = 'pending_intro',
            intro_due_at = excluded.intro_due_at,
            confirm_due_at = excluded.confirm_due_at;

        perform public.queue_notification_event(
          v_promoted,
          v_table_id,
          'waitlist_promoted',
          'A seat opened',
          'You were promoted from the waitlist. Answer the intro to keep your seat.',
          jsonb_build_object('tableId', v_table_id::text, 'type', 'waitlist_promoted'),
          now(),
          'waitlist_promoted:' || v_table_id::text || ':' || v_promoted::text
        );

        perform public.queue_notification_event(
          v_promoted,
          v_table_id,
          'seat_held_intro',
          'Keep your seat',
          'Answer the intro before your held seat expires.',
          jsonb_build_object('tableId', v_table_id::text, 'type', 'seat_held_intro'),
          now() + interval '20 minutes',
          'seat_held_intro:' || v_table_id::text || ':' || v_promoted::text
        );
      end if;

      perform public.refresh_table_status(v_table_id);
    end loop;
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
begin
  perform public.require_active_profile();
  perform public.ensure_terms_accepted();

  if p_activity not in ('coffee','dinner','drinks','walk','run','cinema','coworking','culture','sports','explore') then
    raise exception 'Invalid activity';
  end if;
  if p_starts_at < now() + interval '15 minutes' or p_starts_at >= date_trunc('day', now()) + interval '2 days' then
    raise exception 'Tables must start at least 15 minutes from now and no later than tomorrow';
  end if;
  if p_lng is null or p_lat is null or p_lng < -180 or p_lng > 180 or p_lat < -90 or p_lat > 90 then
    raise exception 'Invalid coordinates';
  end if;

  perform public.reject_objectionable_text(p_title);
  perform public.reject_objectionable_text(p_note);
  perform public.reject_objectionable_text(p_vibe);
  perform public.reject_objectionable_text(p_area_label);
  perform public.reject_objectionable_text(p_intro_prompt);

  perform set_config('app.tably_rpc', 'on', true);

  insert into public.social_tables (
    created_by, activity, title, note, vibe, area_label, starts_at,
    min_seats, max_seats, intro_prompt, location
  )
  values (
    v_user_id, p_activity, btrim(p_title), btrim(coalesce(p_note, '')),
    btrim(coalesce(p_vibe, 'casual')), btrim(p_area_label), p_starts_at,
    p_min_seats, p_max_seats,
    btrim(coalesce(p_intro_prompt, 'What are you hoping this plan feels like?')),
    extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::geography
  )
  returning social_tables.id into v_table_id;

  insert into public.table_members (table_id, profile_id, status, intro_due_at, confirm_due_at, confirmed_at)
  values (v_table_id, v_user_id, 'confirmed', now(), now(), now());

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
  id uuid, activity text, title text, note text, vibe text, area_label text,
  starts_at timestamptz, latitude double precision, longitude double precision,
  status text, min_seats integer, max_seats integer, confirmed_count integer,
  active_count integer, waitlist_count integer, creator_id uuid,
  creator_display_name text, creator_avatar_path text, my_member_status text,
  is_waitlisted boolean, intro_due_at timestamptz, confirm_due_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  v_status := public.current_profile_moderation_status();
  if v_status is null or v_status = 'deleted' or v_status = 'suspended' then
    return;
  end if;

  if v_status = 'active' then
    perform public.release_expired_table_seats(null);
  end if;

  return query
  select st.id, st.activity, st.title, st.note, st.vibe, st.area_label, st.starts_at,
         extensions.ST_Y(st.location::geometry)::double precision,
         extensions.ST_X(st.location::geometry)::double precision,
         st.status, st.min_seats, st.max_seats,
         count(distinct tm_confirmed.profile_id)::integer,
         count(distinct tm_active.profile_id)::integer,
         count(distinct tw.profile_id)::integer,
         p.id, p.display_name, p.avatar_path, own.status,
         exists(select 1 from public.table_waitlist own_wait where own_wait.table_id = st.id and own_wait.profile_id = auth.uid()),
         own.intro_due_at, own.confirm_due_at
  from public.social_tables st
  join public.profiles p on p.id = st.created_by and p.moderation_status in ('active', 'limited')
  left join public.table_members own on own.table_id = st.id and own.profile_id = auth.uid()
  left join public.table_members tm_confirmed on tm_confirmed.table_id = st.id and tm_confirmed.status = 'confirmed'
  left join public.table_members tm_active on tm_active.table_id = st.id and tm_active.status in ('pending_intro', 'pending_confirm', 'confirmed')
  left join public.table_waitlist tw on tw.table_id = st.id
  where st.content_removed_at is null
    and st.starts_at >= now() - interval '1 hour'
    and st.starts_at < date_trunc('day', now()) + interval '2 days'
    and st.status in ('forming', 'confirmed', 'happening')
    and extensions.ST_Y(st.location::geometry) between p_min_lat and p_max_lat
    and extensions.ST_X(st.location::geometry) between p_min_lng and p_max_lng
    and not public.is_blocked_between(auth.uid(), st.created_by)
  group by st.id, p.id, own.status, own.intro_due_at, own.confirm_due_at
  order by st.starts_at asc;
end;
$$;

create or replace function public.get_social_table_detail(p_table_id uuid)
returns table (
  id uuid, activity text, title text, note text, vibe text, area_label text,
  starts_at timestamptz, latitude double precision, longitude double precision,
  status text, min_seats integer, max_seats integer, intro_prompt text,
  creator_id uuid, creator_display_name text, my_member_status text,
  is_waitlisted boolean, intro_due_at timestamptz, confirm_due_at timestamptz,
  joined_at timestamptz, confirmed_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  v_status := public.current_profile_moderation_status();
  if v_status in ('suspended', 'deleted') or v_status is null then
    return;
  end if;

  if v_status = 'active' then
    perform public.release_expired_table_seats(p_table_id);
  end if;

  return query
  select st.id, st.activity, st.title, st.note, st.vibe, st.area_label, st.starts_at,
         extensions.ST_Y(st.location::geometry)::double precision,
         extensions.ST_X(st.location::geometry)::double precision,
         st.status, st.min_seats, st.max_seats, st.intro_prompt,
         p.id, p.display_name, own.status,
         exists(select 1 from public.table_waitlist tw where tw.table_id = st.id and tw.profile_id = auth.uid()),
         own.intro_due_at, own.confirm_due_at, own.joined_at, own.confirmed_at
  from public.social_tables st
  join public.profiles p on p.id = st.created_by and p.moderation_status in ('active', 'limited')
  left join public.table_members own on own.table_id = st.id and own.profile_id = auth.uid()
  where st.id = p_table_id
    and st.content_removed_at is null
    and st.status in ('forming', 'confirmed', 'happening')
    and not public.is_blocked_between(auth.uid(), st.created_by);
end;
$$;

create or replace function public.list_table_members(p_table_id uuid)
returns table (profile_id uuid, display_name text, summary text, avatar_path text, status text, intro_answer text, confirmed_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_can_view_intro boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  v_status := public.current_profile_moderation_status();
  if v_status is null or v_status in ('suspended', 'deleted') then
    return;
  end if;

   if v_status = 'active' then
     perform public.release_expired_table_seats(p_table_id);
   end if;
  v_can_view_intro := public.is_current_table_member(p_table_id);

  return query
  select p.id, p.display_name, p.summary, p.avatar_path, tm.status,
         case when v_can_view_intro then tm.intro_answer else ''::text end,
         tm.confirmed_at
  from public.table_members tm
  join public.profiles p on p.id = tm.profile_id and p.moderation_status in ('active', 'limited')
  join public.social_tables st on st.id = tm.table_id
    and st.content_removed_at is null
    and st.status in ('forming', 'confirmed', 'happening')
  where tm.table_id = p_table_id
    and tm.status in ('pending_intro', 'pending_confirm', 'confirmed')
    and not public.is_blocked_between(auth.uid(), p.id)
  order by case tm.status when 'confirmed' then 1 when 'pending_confirm' then 2 else 3 end,
           tm.joined_at asc;
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
  perform public.require_active_profile();
  perform public.ensure_terms_accepted();

  select st.max_seats, st.created_by
  into v_max_seats, v_creator
  from public.social_tables st
  join public.profiles creator on creator.id = st.created_by and creator.moderation_status in ('active', 'limited')
  where st.id = p_table_id
    and st.content_removed_at is null
    and st.starts_at > now()
    and st.status in ('forming', 'confirmed')
  for update of st;

  if v_max_seats is null or public.is_blocked_between(v_user_id, v_creator) then
    raise exception 'Table not found';
  end if;

  perform public.release_expired_table_seats(p_table_id);

  if exists (
    select 1 from public.table_members tm
    where tm.table_id = p_table_id and tm.profile_id = v_user_id
      and tm.status in ('pending_intro', 'pending_confirm', 'confirmed')
  ) then
    delete from public.table_waitlist where table_id = p_table_id and profile_id = v_user_id;
    return query select tm.status, false from public.table_members tm
      where tm.table_id = p_table_id and tm.profile_id = v_user_id;
    return;
  end if;

  select count(*) into v_active_count
  from public.table_members tm
  where tm.table_id = p_table_id and tm.status in ('pending_intro', 'pending_confirm', 'confirmed');

  perform set_config('app.tably_rpc', 'on', true);
  if v_active_count >= v_max_seats then
    insert into public.table_waitlist (table_id, profile_id)
    values (p_table_id, v_user_id) on conflict do nothing;
    return query select 'waitlisted'::text, true;
    return;
  end if;

  delete from public.table_waitlist where table_id = p_table_id and profile_id = v_user_id;
  insert into public.table_members (table_id, profile_id, status, intro_due_at, confirm_due_at)
  values (p_table_id, v_user_id, 'pending_intro', now() + interval '30 minutes', now() + interval '30 minutes')
  on conflict (table_id, profile_id) do update
  set status = 'pending_intro', intro_due_at = excluded.intro_due_at, confirm_due_at = excluded.confirm_due_at;

  perform public.queue_notification_event(
    v_user_id, p_table_id, 'seat_held_intro', 'Keep your seat',
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
  perform public.require_active_profile();
  perform public.ensure_terms_accepted();

  select st.starts_at into v_starts_at
  from public.social_tables st
  join public.profiles creator on creator.id = st.created_by and creator.moderation_status in ('active', 'limited')
  where st.id = p_table_id and st.content_removed_at is null
    and st.status in ('forming', 'confirmed', 'happening')
    and not public.is_blocked_between(auth.uid(), st.created_by);
  if v_starts_at is null then
    raise exception 'Table not found';
  end if;
  if char_length(btrim(coalesce(p_answer, ''))) < 1 then
    raise exception 'Intro answer is required';
  end if;
  perform public.reject_objectionable_text(p_answer);

  v_confirm_due_at := least(v_starts_at - interval '2 hours', now() + interval '30 minutes');
  if v_confirm_due_at < now() then v_confirm_due_at := now() + interval '30 minutes'; end if;

  perform set_config('app.tably_rpc', 'on', true);
  update public.table_members
  set status = 'pending_confirm', intro_answer = btrim(p_answer), confirm_due_at = v_confirm_due_at
  where table_id = p_table_id and profile_id = v_user_id and status = 'pending_intro';

  if exists (select 1 from public.table_members where table_id = p_table_id and profile_id = v_user_id and status = 'pending_confirm') then
    perform public.queue_notification_event(
      v_user_id, p_table_id, 'seat_confirm_due', 'Confirm your seat',
      'Confirm attendance so everyone knows this table is real.',
      jsonb_build_object('tableId', p_table_id::text, 'type', 'seat_confirm_due'),
      least(v_confirm_due_at, now() + interval '20 minutes'),
      'seat_confirm_due:' || p_table_id::text || ':' || v_user_id::text
    );
  end if;

  return query select tm.status from public.table_members tm
  where tm.table_id = p_table_id and tm.profile_id = v_user_id;
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
  perform public.require_active_profile();
  perform public.ensure_terms_accepted();

  select st.status into v_status
  from public.social_tables st
  join public.profiles creator on creator.id = st.created_by and creator.moderation_status in ('active', 'limited')
  where st.id = p_table_id and st.content_removed_at is null
    and st.status in ('forming', 'confirmed', 'happening')
    and not public.is_blocked_between(auth.uid(), st.created_by);
  if v_status is null then raise exception 'Table not found'; end if;

  perform public.release_expired_table_seats(p_table_id);
  perform set_config('app.tably_rpc', 'on', true);
  update public.table_members
  set status = 'confirmed', confirmed_at = now()
  where table_id = p_table_id and profile_id = v_user_id and status in ('pending_confirm', 'confirmed');

  perform public.refresh_table_status(p_table_id);

  if v_status is distinct from 'confirmed'
     and exists (select 1 from public.social_tables where id = p_table_id and status = 'confirmed') then
    for v_member in
      select tm.profile_id
      from public.table_members tm
      join public.profiles p on p.id = tm.profile_id and p.moderation_status in ('active', 'limited')
      where tm.table_id = p_table_id and tm.status = 'confirmed'
    loop
      perform public.queue_notification_event(
        v_member.profile_id, p_table_id, 'table_confirmed', 'Table confirmed',
        'Enough people confirmed. Open the chat and coordinate final details.',
        jsonb_build_object('tableId', p_table_id::text, 'type', 'table_confirmed'),
        now(), 'table_confirmed:' || p_table_id::text || ':' || v_member.profile_id::text
      );
    end loop;
  end if;

  return query select tm.status from public.table_members tm
  where tm.table_id = p_table_id and tm.profile_id = v_user_id;
end;
$$;

create or replace function public.leave_social_table(p_table_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile_status text;
  v_creator_id uuid;
  v_removed_at timestamptz;
  v_table_status text;
  v_promoted_id uuid;
  v_released_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select p.moderation_status into v_profile_status from public.profiles p where p.id = v_user_id;
  select st.created_by, st.content_removed_at, st.status
  into v_creator_id, v_removed_at, v_table_status
  from public.social_tables st where st.id = p_table_id;
  if v_creator_id is null then raise exception 'Table not found'; end if;

  perform set_config('app.tably_rpc', 'on', true);
  if v_profile_status is distinct from 'active' or v_removed_at is not null then
    update public.table_members set status = 'left'
    where table_id = p_table_id and profile_id = v_user_id
      and status in ('pending_intro', 'pending_confirm', 'confirmed');
    delete from public.table_waitlist where table_id = p_table_id and profile_id = v_user_id;
    return;
  end if;

  if v_table_status not in ('forming', 'confirmed') then raise exception 'Table not found'; end if;
  if v_creator_id = v_user_id then
    update public.social_tables set status = 'cancelled' where id = p_table_id;
    update public.table_members set status = 'left'
    where table_id = p_table_id and status in ('pending_intro', 'pending_confirm', 'confirmed');
    delete from public.table_waitlist where table_id = p_table_id;
    update public.notification_events set status = 'skipped', error = 'Table was cancelled.'
    where table_id = p_table_id and status in ('queued', 'processing');
    return;
  end if;

  update public.table_members set status = 'left'
  where table_id = p_table_id and profile_id = v_user_id
    and status in ('pending_intro', 'pending_confirm', 'confirmed');
  get diagnostics v_released_count = row_count;
  delete from public.table_waitlist where table_id = p_table_id and profile_id = v_user_id;
  if v_released_count = 0 then return; end if;

  select tw.profile_id into v_promoted_id
  from public.table_waitlist tw
  join public.profiles p on p.id = tw.profile_id and p.moderation_status in ('active', 'limited')
  where tw.table_id = p_table_id
    and not exists (
      select 1 from public.table_members active_member
      where active_member.table_id = tw.table_id and active_member.profile_id = tw.profile_id
        and active_member.status in ('pending_intro', 'pending_confirm', 'confirmed')
    )
  order by tw.created_at asc for update of tw skip locked limit 1;

  if v_promoted_id is not null then
    delete from public.table_waitlist where table_id = p_table_id and profile_id = v_promoted_id;
    insert into public.table_members (table_id, profile_id, status, intro_due_at, confirm_due_at)
    values (p_table_id, v_promoted_id, 'pending_intro', now() + interval '30 minutes', now() + interval '30 minutes')
    on conflict (table_id, profile_id) do update
    set status = 'pending_intro', intro_due_at = excluded.intro_due_at, confirm_due_at = excluded.confirm_due_at;
    perform public.queue_notification_event(
      v_promoted_id, p_table_id, 'waitlist_promoted', 'A seat opened',
      'You were promoted from the waitlist. Answer the intro to keep your seat.',
      jsonb_build_object('tableId', p_table_id::text, 'type', 'waitlist_promoted'),
      now(), 'waitlist_promoted:' || p_table_id::text || ':' || v_promoted_id::text
    );
  end if;
  perform public.refresh_table_status(p_table_id);
end;
$$;

create or replace function public.list_my_active_tables()
returns table (id uuid, activity text, title text, starts_at timestamptz, area_label text, status text, member_status text, latest_message_body text, latest_message_created_at timestamptz, intro_due_at timestamptz, confirm_due_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if public.current_profile_moderation_status() in ('suspended', 'deleted')
     or public.current_profile_moderation_status() is null then return; end if;
  if public.current_profile_moderation_status() = 'active' then
    perform public.release_expired_table_seats(null);
  end if;

  return query
  select st.id, st.activity, st.title, st.starts_at, st.area_label, st.status, tm.status,
         latest.body, latest.created_at, tm.intro_due_at, tm.confirm_due_at
  from public.table_members tm
  join public.social_tables st on st.id = tm.table_id
    and st.content_removed_at is null and st.status in ('forming', 'confirmed', 'happening')
  join public.profiles creator on creator.id = st.created_by and creator.moderation_status in ('active', 'limited')
  left join lateral (
    select m.body, m.created_at from public.table_messages m
    join public.profiles sender on sender.id = m.sender_id and sender.moderation_status in ('active', 'limited')
    where m.table_id = st.id and m.content_removed_at is null
    order by m.created_at desc limit 1
  ) latest on true
  where tm.profile_id = auth.uid() and tm.status in ('pending_intro', 'pending_confirm', 'confirmed')
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
  if public.current_profile_moderation_status() in ('suspended', 'deleted')
     or public.current_profile_moderation_status() is null then return; end if;
  if not public.is_current_table_member(p_table_id) then raise exception 'Join this table to see chat'; end if;

  return query
  select m.id, m.table_id, m.sender_id, p.display_name, p.avatar_path,
         m.body, m.created_at, m.updated_at
  from public.table_messages m
  join public.social_tables st on st.id = m.table_id
    and st.content_removed_at is null and st.status in ('forming', 'confirmed', 'happening')
  join public.profiles p on p.id = m.sender_id and p.moderation_status in ('active', 'limited')
  where m.table_id = p_table_id and m.content_removed_at is null
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
  v_table_title text;
  v_recipient record;
begin
  perform public.require_active_profile();
  perform public.ensure_terms_accepted();

  select st.title into v_table_title
  from public.social_tables st
  join public.profiles creator on creator.id = st.created_by and creator.moderation_status in ('active', 'limited')
  where st.id = p_table_id and st.content_removed_at is null
    and st.status in ('forming', 'confirmed', 'happening')
    and not public.is_blocked_between(auth.uid(), st.created_by);
  if v_table_title is null then raise exception 'Table not found'; end if;
  if not public.is_current_table_member(p_table_id) then raise exception 'Join this table to chat'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 1 or char_length(btrim(coalesce(p_body, ''))) > 1000 then
    raise exception 'Message must be 1-1000 characters';
  end if;
  perform public.reject_objectionable_text(p_body);

  perform set_config('app.tably_rpc', 'on', true);
  insert into public.table_messages (table_id, sender_id, body)
  values (p_table_id, auth.uid(), btrim(p_body)) returning table_messages.id into v_message_id;

  for v_recipient in
    select tm.profile_id
    from public.table_members tm
    join public.profiles recipient on recipient.id = tm.profile_id
      and recipient.moderation_status in ('active', 'limited')
    where tm.table_id = p_table_id and tm.profile_id <> auth.uid()
      and tm.status in ('pending_intro', 'pending_confirm', 'confirmed')
      and not public.is_blocked_between(auth.uid(), tm.profile_id)
  loop
    -- M4.1 intentionally uses the existing 8-argument queue owner.  The
    -- message-aware 9-argument identity path belongs to M4.2.
    perform public.queue_notification_event(
      v_recipient.profile_id, p_table_id, 'table_message',
      coalesce(v_table_title, 'New table message'), left(btrim(p_body), 160),
      jsonb_build_object('tableId', p_table_id::text, 'type', 'table_message'),
      now(), 'table_message:' || v_message_id::text || ':' || v_recipient.profile_id::text
    );
  end loop;

  return query
  select m.id, m.table_id, m.sender_id, p.display_name, p.avatar_path,
         m.body, m.created_at, m.updated_at
  from public.table_messages m join public.profiles p on p.id = m.sender_id
  where m.id = v_message_id;
end;
$$;

-- Explicit function ACLs.  SECURITY DEFINER does not imply client access.
revoke all on function public.current_profile_moderation_status() from public, anon, authenticated, service_role;
revoke all on function public.require_active_profile() from public, anon, authenticated, service_role;
revoke all on function public.admin_has_role(text) from public, anon, authenticated, service_role;
revoke all on function public.refresh_table_status(uuid) from public, anon, authenticated, service_role;
revoke all on function public.release_expired_table_seats(uuid) from public, anon, authenticated, service_role;
revoke all on function public.queue_notification_event(uuid, uuid, text, text, text, jsonb, timestamptz, text) from public, anon, authenticated, service_role;

grant execute on function public.refresh_table_status(uuid) to service_role;
grant execute on function public.release_expired_table_seats(uuid) to service_role;

revoke all on function public.create_social_table(text, text, text, text, text, timestamptz, double precision, double precision, integer, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.list_social_tables(double precision, double precision, double precision, double precision) from public, anon, authenticated, service_role;
revoke all on function public.get_social_table_detail(uuid) from public, anon, authenticated, service_role;
revoke all on function public.list_table_members(uuid) from public, anon, authenticated, service_role;
revoke all on function public.join_social_table(uuid) from public, anon, authenticated, service_role;
revoke all on function public.answer_table_intro(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.confirm_table_attendance(uuid) from public, anon, authenticated, service_role;
revoke all on function public.leave_social_table(uuid) from public, anon, authenticated, service_role;
revoke all on function public.list_my_active_tables() from public, anon, authenticated, service_role;
revoke all on function public.list_table_messages(uuid) from public, anon, authenticated, service_role;
revoke all on function public.send_table_message(uuid, text) from public, anon, authenticated, service_role;

revoke all on function public.submit_report(text, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.block_user(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.unblock_user(uuid) from public, anon, authenticated, service_role;
revoke all on function public.list_blocked_users() from public, anon, authenticated, service_role;
revoke all on function public.accept_current_terms() from public, anon, authenticated, service_role;
revoke all on function public.upsert_push_token(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.delete_push_token(text) from public, anon, authenticated, service_role;
revoke all on function public.get_notification_preferences() from public, anon, authenticated, service_role;
revoke all on function public.update_notification_preferences(boolean, boolean, boolean, boolean, boolean, boolean) from public, anon, authenticated, service_role;
revoke all on function public.create_profile_location(text, double precision, double precision, boolean) from public, anon, authenticated, service_role;
revoke all on function public.update_profile_location(uuid, text, double precision, double precision) from public, anon, authenticated, service_role;
revoke all on function public.delete_profile_location(uuid) from public, anon, authenticated, service_role;
revoke all on function public.list_own_profile_locations() from public, anon, authenticated, service_role;
revoke all on function public.update_own_location(double precision, double precision) from public, anon, authenticated, service_role;
revoke all on function public.delete_own_location() from public, anon, authenticated, service_role;
revoke all on function public.list_own_dives() from public, anon, authenticated, service_role;
revoke all on function public.get_own_dive() from public, anon, authenticated, service_role;
revoke all on function public.upsert_own_dive(double precision, double precision, timestamptz, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.upsert_own_dive_from_location(uuid, timestamptz, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.delete_own_dive(uuid) from public, anon, authenticated, service_role;
revoke all on function public.dives_in_view(double precision, double precision, double precision, double precision) from public, anon, authenticated, service_role;
revoke all on function public.users_in_view(double precision, double precision, double precision, double precision) from public, anon, authenticated, service_role;
revoke all on function public.share_profile_location_on_map(uuid) from public, anon, authenticated, service_role;
revoke all on function public.unshare_profile_location_from_map() from public, anon, authenticated, service_role;
revoke all on function public.update_own_avatar_path(text) from public, anon, authenticated, service_role;
revoke all on function public.clear_own_avatar_path() from public, anon, authenticated, service_role;
revoke all on function public.upsert_conversation(uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_conversations_with_latest_message() from public, anon, authenticated, service_role;
revoke all on function public.get_messages_by_conversation_id(uuid, timestamptz, integer) from public, anon, authenticated, service_role;
revoke all on function public.send_message(uuid, text) from public, anon, authenticated, service_role;

revoke all on function public.reject_objectionable_profile_text() from public, anon, authenticated, service_role;
revoke all on function public.can_current_user_read_conversation(uuid) from public, anon, authenticated, service_role;
revoke all on function public.is_conversation_participant(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.is_current_user_conversation_participant(uuid) from public, anon, authenticated, service_role;
revoke all on function public.validate_profile_location_input(text, double precision, double precision) from public, anon, authenticated, service_role;
revoke all on function public.mirror_public_profile_location(uuid, geography) from public, anon, authenticated, service_role;

grant execute on function public.submit_report(text, uuid, text, text) to authenticated, service_role;
grant execute on function public.block_user(uuid, text) to authenticated, service_role;
grant execute on function public.unblock_user(uuid) to authenticated, service_role;
grant execute on function public.list_blocked_users() to authenticated, service_role;
grant execute on function public.accept_current_terms() to authenticated, service_role;
grant execute on function public.upsert_push_token(text, text, text) to authenticated, service_role;
grant execute on function public.delete_push_token(text) to authenticated, service_role;
grant execute on function public.get_notification_preferences() to authenticated, service_role;
grant execute on function public.update_notification_preferences(boolean, boolean, boolean, boolean, boolean, boolean) to authenticated, service_role;
grant execute on function public.create_profile_location(text, double precision, double precision, boolean) to authenticated, service_role;
grant execute on function public.update_profile_location(uuid, text, double precision, double precision) to authenticated, service_role;
grant execute on function public.delete_profile_location(uuid) to authenticated, service_role;
grant execute on function public.list_own_profile_locations() to authenticated, service_role;
grant execute on function public.update_own_location(double precision, double precision) to authenticated, service_role;
grant execute on function public.delete_own_location() to authenticated, service_role;
grant execute on function public.list_own_dives() to authenticated, service_role;
grant execute on function public.get_own_dive() to authenticated, service_role;
grant execute on function public.upsert_own_dive(double precision, double precision, timestamptz, text, text, uuid) to authenticated, service_role;
grant execute on function public.upsert_own_dive_from_location(uuid, timestamptz, text, text, uuid) to authenticated, service_role;
grant execute on function public.delete_own_dive(uuid) to authenticated, service_role;
grant execute on function public.dives_in_view(double precision, double precision, double precision, double precision) to authenticated, service_role;
grant execute on function public.users_in_view(double precision, double precision, double precision, double precision) to authenticated, service_role;
grant execute on function public.share_profile_location_on_map(uuid) to authenticated, service_role;
grant execute on function public.unshare_profile_location_from_map() to authenticated, service_role;
grant execute on function public.update_own_avatar_path(text) to authenticated, service_role;
grant execute on function public.clear_own_avatar_path() to authenticated, service_role;
grant execute on function public.upsert_conversation(uuid) to authenticated, service_role;
grant execute on function public.get_conversations_with_latest_message() to authenticated, service_role;
grant execute on function public.get_messages_by_conversation_id(uuid, timestamptz, integer) to authenticated, service_role;
grant execute on function public.send_message(uuid, text) to authenticated, service_role;

grant execute on function public.create_social_table(text, text, text, text, text, timestamptz, double precision, double precision, integer, integer, text) to authenticated, service_role;
grant execute on function public.list_social_tables(double precision, double precision, double precision, double precision) to authenticated, service_role;
grant execute on function public.get_social_table_detail(uuid) to authenticated, service_role;
grant execute on function public.list_table_members(uuid) to authenticated, service_role;
grant execute on function public.join_social_table(uuid) to authenticated, service_role;
grant execute on function public.answer_table_intro(uuid, text) to authenticated, service_role;
grant execute on function public.confirm_table_attendance(uuid) to authenticated, service_role;
grant execute on function public.leave_social_table(uuid) to authenticated, service_role;
grant execute on function public.list_my_active_tables() to authenticated, service_role;
grant execute on function public.list_table_messages(uuid) to authenticated, service_role;
grant execute on function public.send_table_message(uuid, text) to authenticated, service_role;

-- Existing internal helpers and worker RPCs must not inherit default EXECUTE.
revoke all on function public.ensure_terms_accepted() from public, anon, authenticated, service_role;
revoke all on function public.contains_objectionable_content(text) from public, anon, authenticated, service_role;
revoke all on function public.reject_objectionable_text(text) from public, anon, authenticated, service_role;
revoke all on function public.is_blocked_between(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.is_current_table_member(uuid) from public, anon, authenticated, service_role;
revoke all on function public.ensure_notification_preferences(uuid) from public, anon, authenticated, service_role;
revoke all on function public.protect_tably_server_fields() from public, anon, authenticated, service_role;
revoke all on function public.protect_profile_server_fields() from public, anon, authenticated, service_role;
revoke all on function public.protect_profile_location_writes() from public, anon, authenticated, service_role;
revoke all on function public.protect_chat_server_fields() from public, anon, authenticated, service_role;
revoke all on function public.protect_dive_server_fields() from public, anon, authenticated, service_role;
revoke all on function public.set_updated_at() from public, anon, authenticated, service_role;
revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;
revoke all on function public.claim_notification_events(integer) from public, anon, authenticated, service_role;
revoke all on function public.mark_notification_events(uuid[], text, text) from public, anon, authenticated, service_role;
grant execute on function public.claim_notification_events(integer) to service_role;
grant execute on function public.mark_notification_events(uuid[], text, text) to service_role;
