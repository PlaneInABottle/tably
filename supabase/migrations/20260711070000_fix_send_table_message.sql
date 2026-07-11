create or replace function public.send_table_message(p_table_id uuid, p_body text)
returns table (
  id uuid,
  table_id uuid,
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
  v_message_id uuid;
  v_table_title text;
  v_recipient record;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_current_table_member(p_table_id) then raise exception 'Join this table to chat'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 1 or char_length(btrim(coalesce(p_body, ''))) > 1000 then raise exception 'Message must be 1-1000 characters'; end if;

  perform set_config('app.tably_rpc', 'on', true);
  insert into public.table_messages (table_id, sender_id, body)
  values (p_table_id, auth.uid(), btrim(p_body))
  returning table_messages.id into v_message_id;

  select st.title
  into v_table_title
  from public.social_tables st
  where st.id = p_table_id;

  for v_recipient in
    select tm.profile_id
    from public.table_members tm
    where tm.table_id = p_table_id
      and tm.profile_id <> auth.uid()
      and tm.status in ('pending_intro', 'pending_confirm', 'confirmed')
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

revoke all on function public.send_table_message(uuid, text) from public;
grant execute on function public.send_table_message(uuid, text) to authenticated;
