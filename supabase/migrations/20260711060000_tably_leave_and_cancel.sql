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
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select created_by into v_creator_id
  from public.social_tables
  where id = p_table_id and status in ('forming', 'confirmed')
  for update;

  if v_creator_id is null then
    raise exception 'Table not found';
  end if;

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
    where table_id = p_table_id and status = 'queued';
    return;
  end if;

  update public.table_members
  set status = 'left'
  where table_id = p_table_id
    and profile_id = v_user_id
    and status in ('pending_intro', 'pending_confirm', 'confirmed');

  delete from public.table_waitlist
  where table_id = p_table_id and profile_id = v_user_id;

  select profile_id into v_promoted_id
  from public.table_waitlist
  where table_id = p_table_id
  order by created_at
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
