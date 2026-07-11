create or replace function public.submit_report(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_details text default ''
)
returns table (id uuid, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reporter_id uuid := auth.uid();
  v_target_type text := btrim(coalesce(p_target_type, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_details text := btrim(coalesce(p_details, ''));
  v_reported_user_id uuid;
  v_report public.moderation_reports;
begin
  if v_reporter_id is null then raise exception 'Authentication required'; end if;
  if v_target_type not in ('profile', 'table', 'table_message', 'message', 'conversation') then raise exception 'Report target is invalid'; end if;
  if v_reason not in ('Harassment or abuse', 'Hate or discrimination', 'Sexual content', 'Spam or scam', 'Unsafe meetup behavior', 'Other') then raise exception 'Report reason is invalid'; end if;
  if char_length(v_details) > 1000 then raise exception 'Report details must be 1000 characters or fewer'; end if;

  if v_target_type = 'profile' then
    select p.id into v_reported_user_id from public.profiles p where p.id = p_target_id;
  elsif v_target_type = 'table' then
    select st.created_by into v_reported_user_id from public.social_tables st where st.id = p_target_id;
  elsif v_target_type = 'table_message' then
    select tm.sender_id into v_reported_user_id from public.table_messages tm where tm.id = p_target_id;
  elsif v_target_type = 'message' then
    select m.sender_id into v_reported_user_id from public.messages m where m.id = p_target_id;
  elsif v_target_type = 'conversation' then
    select cp.profile_id
    into v_reported_user_id
    from public.conversation_participants cp
    where cp.conversation_id = p_target_id and cp.profile_id <> v_reporter_id
    limit 1;
  end if;

  if v_reported_user_id is null then raise exception 'Report target was not found'; end if;

  insert into public.moderation_reports (
    reporter_id,
    reported_user_id,
    target_type,
    target_id,
    reason,
    details
  )
  values (
    v_reporter_id,
    v_reported_user_id,
    v_target_type,
    p_target_id,
    v_reason,
    v_details
  )
  returning * into v_report;

  return query select v_report.id, v_report.status, v_report.created_at;
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

  return query
  insert into public.push_tokens (profile_id, token, platform, device_id)
  values (v_profile_id, btrim(p_token), v_platform, nullif(btrim(coalesce(p_device_id, '')), ''))
  on conflict on constraint push_tokens_token_key do update
  set profile_id = excluded.profile_id,
      platform = excluded.platform,
      device_id = excluded.device_id,
      updated_at = now()
  returning push_tokens.token;

  perform public.ensure_notification_preferences(v_profile_id);
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

  update public.notification_preferences as np
  set seat_held_intro = coalesce(p_seat_held_intro, np.seat_held_intro),
      seat_confirm_due = coalesce(p_seat_confirm_due, np.seat_confirm_due),
      table_confirmed = coalesce(p_table_confirmed, np.table_confirmed),
      waitlist_promoted = coalesce(p_waitlist_promoted, np.waitlist_promoted),
      table_message = coalesce(p_table_message, np.table_message),
      table_starting_soon = coalesce(p_table_starting_soon, np.table_starting_soon)
  where np.profile_id = auth.uid();

  return query select * from public.get_notification_preferences();
end;
$$;

revoke all on function public.submit_report(text, uuid, text, text) from public;
revoke all on function public.upsert_push_token(text, text, text) from public;
revoke all on function public.update_notification_preferences(boolean, boolean, boolean, boolean, boolean, boolean) from public;
grant execute on function public.submit_report(text, uuid, text, text) to authenticated;
grant execute on function public.upsert_push_token(text, text, text) to authenticated;
grant execute on function public.update_notification_preferences(boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
