-- M4.2 NULL-safe content-removal guard and worker source re-check.
create or replace function public.check_notification_event_sources(p_event_ids uuid[])
returns table(id uuid, deliverable boolean)
language sql
security definer
set search_path = public, pg_temp
as $$
  select ne.id,
    (ne.status='processing'
     and (ne.table_id is null or exists(select 1 from public.social_tables st where st.id=ne.table_id and st.content_removed_at is null))
     and (ne.table_message_id is null or exists(select 1 from public.table_messages tm where tm.id=ne.table_message_id and tm.table_id=ne.table_id and tm.content_removed_at is null))) as deliverable
  from public.notification_events ne
  where ne.id=any(p_event_ids);
$$;
revoke all on function public.check_notification_event_sources(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.check_notification_event_sources(uuid[]) to service_role;

create or replace function public.guard_content_removal()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_generic text;
begin
  if new.content_removed_at is distinct from old.content_removed_at then
    v_generic := case
      when tg_table_name = 'dives' then current_setting('app.dive_rpc', true)
      when tg_table_name in ('messages','conversations') then current_setting('app.chat_rpc', true)
      else current_setting('app.tably_rpc', true)
    end;
    if current_setting('app.tably_moderation_content_removal', true) <> 'on' or v_generic <> 'on' then
      raise exception 'Content removal requires moderation authorization';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_dive_content_removal on public.dives;
create trigger trg_guard_dive_content_removal before update on public.dives for each row execute function public.guard_content_removal();
drop trigger if exists trg_guard_message_content_removal on public.messages;
create trigger trg_guard_message_content_removal before update on public.messages for each row execute function public.guard_content_removal();
drop trigger if exists trg_guard_conversation_content_removal on public.conversations;
create trigger trg_guard_conversation_content_removal before update on public.conversations for each row execute function public.guard_content_removal();
drop trigger if exists trg_guard_social_table_content_removal on public.social_tables;
create trigger trg_guard_social_table_content_removal before update on public.social_tables for each row execute function public.guard_content_removal();
drop trigger if exists trg_guard_table_message_content_removal on public.table_messages;
create trigger trg_guard_table_message_content_removal before update on public.table_messages for each row execute function public.guard_content_removal();

revoke all on function public.guard_content_removal() from public, anon, authenticated, service_role;
