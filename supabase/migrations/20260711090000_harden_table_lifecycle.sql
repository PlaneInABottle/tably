alter table public.notification_events
add column if not exists processing_started_at timestamptz;

alter table public.notification_events
drop constraint if exists notification_events_status_check;

alter table public.notification_events
add constraint notification_events_status_check
check (status in ('queued', 'processing', 'sent', 'failed', 'skipped'));

create or replace function public.claim_notification_events(p_limit integer default 50)
returns table (
  id uuid,
  recipient_id uuid,
  table_id uuid,
  type text,
  title text,
  body text,
  data jsonb
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with candidates as (
    select ne.id
    from public.notification_events ne
    where (
      ne.status = 'queued'
      and ne.scheduled_for <= now()
    ) or (
      ne.status = 'processing'
      and ne.processing_started_at < now() - interval '5 minutes'
    )
    order by ne.scheduled_for asc
    for update skip locked
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ), claimed as (
    update public.notification_events ne
    set status = 'processing',
        processing_started_at = now(),
        error = null
    from candidates c
    where ne.id = c.id
    returning ne.id, ne.recipient_id, ne.table_id, ne.type, ne.title, ne.body, ne.data
  )
  select c.id, c.recipient_id, c.table_id, c.type, c.title, c.body, c.data
  from claimed c;
$$;

revoke all on function public.claim_notification_events(integer) from public;
grant execute on function public.claim_notification_events(integer) to service_role;

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
         count(distinct tm_confirmed.profile_id)::integer,
         count(distinct tm_active.profile_id)::integer,
         count(distinct tw.profile_id)::integer,
         p.id, p.display_name, p.avatar_path,
         own.status,
         exists(
           select 1
           from public.table_waitlist own_wait
           where own_wait.table_id = st.id and own_wait.profile_id = auth.uid()
         ),
         own.intro_due_at,
         own.confirm_due_at
  from public.social_tables st
  join public.profiles p on p.id = st.created_by
  left join public.table_members own
    on own.table_id = st.id and own.profile_id = auth.uid()
  left join public.table_members tm_confirmed
    on tm_confirmed.table_id = st.id and tm_confirmed.status = 'confirmed'
  left join public.table_members tm_active
    on tm_active.table_id = st.id
   and tm_active.status in ('pending_intro', 'pending_confirm', 'confirmed')
  left join public.table_waitlist tw on tw.table_id = st.id
  where st.starts_at >= now() - interval '1 hour'
    and st.starts_at < date_trunc('day', now()) + interval '2 days'
    and st.status in ('forming', 'confirmed', 'happening')
    and extensions.ST_Y(st.location::geometry) between p_min_lat and p_max_lat
    and extensions.ST_X(st.location::geometry) between p_min_lng and p_max_lng
    and not public.is_blocked_between(auth.uid(), st.created_by)
  group by st.id, p.id, own.status, own.intro_due_at, own.confirm_due_at
  order by st.starts_at asc;
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
  v_creator_id uuid;
  v_promoted_id uuid;
  v_released_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select st.created_by
  into v_creator_id
  from public.social_tables st
  where st.id = p_table_id and st.status in ('forming', 'confirmed')
  for update;

  if v_creator_id is null then raise exception 'Table not found'; end if;
  perform set_config('app.tably_rpc', 'on', true);

  if v_creator_id = v_user_id then
    update public.social_tables
    set status = 'cancelled'
    where id = p_table_id;

    update public.table_members
    set status = 'left'
    where table_id = p_table_id
      and status in ('pending_intro', 'pending_confirm', 'confirmed');

    delete from public.table_waitlist where table_id = p_table_id;

    update public.notification_events
    set status = 'skipped', error = 'Table was cancelled.'
    where table_id = p_table_id and status in ('queued', 'processing');
    return;
  end if;

  update public.table_members
  set status = 'left'
  where table_id = p_table_id
    and profile_id = v_user_id
    and status in ('pending_intro', 'pending_confirm', 'confirmed');
  get diagnostics v_released_count = row_count;

  delete from public.table_waitlist
  where table_id = p_table_id and profile_id = v_user_id;

  if v_released_count = 0 then
    return;
  end if;

  select tw.profile_id
  into v_promoted_id
  from public.table_waitlist tw
  where tw.table_id = p_table_id
    and not exists (
      select 1
      from public.table_members active_member
      where active_member.table_id = tw.table_id
        and active_member.profile_id = tw.profile_id
        and active_member.status in ('pending_intro', 'pending_confirm', 'confirmed')
    )
  order by tw.created_at asc
  for update skip locked
  limit 1;

  if v_promoted_id is not null then
    delete from public.table_waitlist
    where table_id = p_table_id and profile_id = v_promoted_id;

    insert into public.table_members (table_id, profile_id, status, intro_due_at, confirm_due_at)
    values (
      p_table_id,
      v_promoted_id,
      'pending_intro',
      now() + interval '30 minutes',
      now() + interval '30 minutes'
    )
    on conflict (table_id, profile_id) do update
    set status = 'pending_intro',
        intro_due_at = excluded.intro_due_at,
        confirm_due_at = excluded.confirm_due_at;

    perform public.queue_notification_event(
      v_promoted_id,
      p_table_id,
      'waitlist_promoted',
      'A seat opened',
      'You were promoted from the waitlist. Answer the intro to keep your seat.',
      jsonb_build_object('tableId', p_table_id::text, 'type', 'waitlist_promoted'),
      now(),
      'waitlist_promoted:' || p_table_id::text || ':' || v_promoted_id::text
    );
  end if;

  perform public.refresh_table_status(p_table_id);
end;
$$;

revoke all on function public.leave_social_table(uuid) from public;
grant execute on function public.leave_social_table(uuid) to authenticated;

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
  v_released_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform set_config('app.tably_rpc', 'on', true);

  for v_table_id in
    select st.id
    from public.social_tables st
    where (p_table_id is null or st.id = p_table_id)
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
      get diagnostics v_released_count = row_count;

      if v_released_count = 0 then
        continue;
      end if;

      v_promoted := null;
      select tw.profile_id
      into v_promoted
      from public.table_waitlist tw
      where tw.table_id = v_table_id
        and not exists (
          select 1
          from public.table_members active_member
          where active_member.table_id = tw.table_id
            and active_member.profile_id = tw.profile_id
            and active_member.status in ('pending_intro', 'pending_confirm', 'confirmed')
        )
      order by tw.created_at asc
      for update skip locked
      limit 1;

      if v_promoted is not null then
        delete from public.table_waitlist
        where table_id = v_table_id and profile_id = v_promoted;

        insert into public.table_members (table_id, profile_id, status, intro_due_at, confirm_due_at)
        values (
          v_table_id,
          v_promoted,
          'pending_intro',
          now() + interval '30 minutes',
          now() + interval '30 minutes'
        )
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

  select st.max_seats, st.created_by
  into v_max_seats, v_creator
  from public.social_tables st
  where st.id = p_table_id
    and st.starts_at > now()
    and st.status in ('forming', 'confirmed')
  for update;

  if v_max_seats is null then raise exception 'Table not found'; end if;
  if public.is_blocked_between(v_user_id, v_creator) then raise exception 'Table not found'; end if;

  perform set_config('app.tably_rpc', 'on', true);

  if exists (
    select 1
    from public.table_members tm
    where tm.table_id = p_table_id
      and tm.profile_id = v_user_id
      and tm.status in ('pending_intro', 'pending_confirm', 'confirmed')
  ) then
    delete from public.table_waitlist
    where table_id = p_table_id and profile_id = v_user_id;

    return query
    select tm.status, false
    from public.table_members tm
    where tm.table_id = p_table_id and tm.profile_id = v_user_id;
    return;
  end if;

  select count(*)
  into v_active_count
  from public.table_members tm
  where tm.table_id = p_table_id
    and tm.status in ('pending_intro', 'pending_confirm', 'confirmed');

  if v_active_count >= v_max_seats then
    insert into public.table_waitlist (table_id, profile_id)
    values (p_table_id, v_user_id)
    on conflict do nothing;
    return query select 'waitlisted'::text, true;
    return;
  end if;

  delete from public.table_waitlist
  where table_id = p_table_id and profile_id = v_user_id;

  insert into public.table_members (table_id, profile_id, status, intro_due_at, confirm_due_at)
  values (
    p_table_id,
    v_user_id,
    'pending_intro',
    now() + interval '30 minutes',
    now() + interval '30 minutes'
  )
  on conflict (table_id, profile_id) do update
  set status = 'pending_intro',
      intro_due_at = excluded.intro_due_at,
      confirm_due_at = excluded.confirm_due_at;

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

create or replace function public.list_table_members(p_table_id uuid)
returns table (
  profile_id uuid,
  display_name text,
  summary text,
  avatar_path text,
  status text,
  intro_answer text,
  confirmed_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_can_view_intro boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform public.release_expired_table_seats(p_table_id);
  v_can_view_intro := public.is_current_table_member(p_table_id);

  return query
  select p.id,
         p.display_name,
         p.summary,
         p.avatar_path,
         tm.status,
         case when v_can_view_intro then tm.intro_answer else ''::text end,
         tm.confirmed_at
  from public.table_members tm
  join public.profiles p on p.id = tm.profile_id
  where tm.table_id = p_table_id
    and tm.status in ('pending_intro', 'pending_confirm', 'confirmed')
    and not public.is_blocked_between(auth.uid(), p.id)
  order by case tm.status when 'confirmed' then 1 when 'pending_confirm' then 2 else 3 end,
           tm.joined_at asc;
end;
$$;
