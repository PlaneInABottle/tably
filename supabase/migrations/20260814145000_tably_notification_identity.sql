-- M4.2 notification identity and final queue ownership.
alter table public.notification_events
  add column if not exists table_message_id uuid references public.table_messages(id) on delete cascade;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='notification_events_table_message_type_check') then
    alter table public.notification_events add constraint notification_events_table_message_type_check
      check (table_message_id is null or type = 'table_message');
  end if;
end;
$$;

create index if not exists notification_events_table_message_status_idx
  on public.notification_events(table_message_id, status) where table_message_id is not null;

alter table public.notification_events drop constraint if exists notification_events_status_check;
alter table public.notification_events add constraint notification_events_status_check
  check (status in ('queued','processing','sent','failed','skipped'));

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
begin
  if p_type = 'table_message' then raise exception 'Table-message notifications require a message identity'; end if;
  insert into public.notification_events(recipient_id,table_id,type,title,body,data,scheduled_for,dedupe_key,table_message_id)
  values(p_recipient_id,p_table_id,p_type,p_title,p_body,coalesce(p_data,'{}'::jsonb),p_scheduled_for,p_dedupe_key,null)
  on conflict (dedupe_key) do nothing;
end;
$$;

create or replace function public.queue_notification_event(
  p_recipient_id uuid,
  p_table_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb,
  p_scheduled_for timestamptz,
  p_dedupe_key text,
  p_table_message_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_data jsonb := coalesce(p_data,'{}'::jsonb);
begin
  if p_type = 'table_message' and p_table_message_id is null then raise exception 'Table-message notifications require a message identity'; end if;
  if p_type <> 'table_message' and p_table_message_id is not null then raise exception 'Only table-message notifications accept a message identity'; end if;
  if p_type = 'table_message' then
    v_data := v_data || jsonb_build_object('tableId',p_table_id::text,'tableMessageId',p_table_message_id::text,'type','table_message');
  end if;
  insert into public.notification_events(recipient_id,table_id,table_message_id,type,title,body,data,scheduled_for,dedupe_key)
  values(p_recipient_id,p_table_id,p_table_message_id,p_type,p_title,p_body,v_data,p_scheduled_for,p_dedupe_key)
  on conflict (dedupe_key) do nothing;
end;
$$;

revoke all on function public.queue_notification_event(uuid,uuid,text,text,text,jsonb,timestamptz,text) from public, anon, authenticated, service_role;
revoke all on function public.queue_notification_event(uuid,uuid,text,text,text,jsonb,timestamptz,text,uuid) from public, anon, authenticated, service_role;

drop function if exists public.claim_notification_events(integer);
create function public.claim_notification_events(p_limit integer default 50)
returns table(id uuid, recipient_id uuid, table_id uuid, table_message_id uuid, type text, title text, body text, data jsonb)
language sql
security definer
set search_path = public, pg_temp
as $$
  with candidates as (
    select ne.id from public.notification_events ne
    where (ne.status='queued' and ne.scheduled_for <= now())
       or (ne.status='processing' and ne.processing_started_at < now() - interval '5 minutes')
    order by ne.scheduled_for asc, ne.id asc for update skip locked
    limit least(greatest(coalesce(p_limit,50),1),100)
  ), claimed as (
    update public.notification_events ne
    set status='processing', processing_started_at=now(), error=null
    from candidates c where ne.id=c.id
    returning ne.id,ne.recipient_id,ne.table_id,ne.table_message_id,ne.type,ne.title,ne.body,ne.data
  ) select id,recipient_id,table_id,table_message_id,type,title,body,data from claimed;
$$;
revoke all on function public.claim_notification_events(integer) from public, anon, authenticated, service_role;
grant execute on function public.claim_notification_events(integer) to service_role;

create or replace function public.mark_notification_events(p_event_ids uuid[], p_status text, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_status not in ('sent','failed','skipped') then raise exception 'Invalid notification status'; end if;
  if coalesce(array_length(p_event_ids,1),0)=0 then return; end if;
  if exists(select 1 from unnest(p_event_ids) x(id) left join public.notification_events ne on ne.id=x.id where ne.id is null or ne.status <> 'processing') then raise exception 'Notification event is not processing'; end if;
  update public.notification_events
  set status=p_status,
      error=case when p_status='skipped' then coalesce(nullif(btrim(p_error),''),'Content removed by moderation.') else nullif(btrim(coalesce(p_error,'')),'') end,
      processing_started_at=null,
      sent_at=case when p_status='sent' then coalesce(sent_at,now()) else sent_at end,
      title=case when p_status='skipped' and p_error='Content removed by moderation.' then 'Notification unavailable' else title end,
      body=case when p_status='skipped' and p_error='Content removed by moderation.' then 'This notification was removed.' else body end,
      data=case when p_status='skipped' and p_error='Content removed by moderation.' then jsonb_build_object('type','content_removed') else data end
  where id=any(p_event_ids) and status='processing';
end;
$$;
revoke all on function public.mark_notification_events(uuid[],text,text) from public, anon, authenticated, service_role;
grant execute on function public.mark_notification_events(uuid[],text,text) to service_role;

create or replace function public.send_table_message(p_table_id uuid, p_body text)
returns table(id uuid, table_id uuid, sender_id uuid, sender_display_name text, sender_avatar_path text, body text, created_at timestamptz, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_message_id uuid; v_table_title text; v_recipient record;
begin
  perform public.require_active_profile(); perform public.ensure_terms_accepted();
  select st.title into v_table_title from public.social_tables st join public.profiles creator on creator.id=st.created_by and creator.moderation_status in ('active','limited') where st.id=p_table_id and st.content_removed_at is null and st.status in ('forming','confirmed','happening') and not public.is_blocked_between(auth.uid(),st.created_by);
  if v_table_title is null then raise exception 'Table not found'; end if;
  if not public.is_current_table_member(p_table_id) then raise exception 'Join this table to chat'; end if;
  if char_length(btrim(coalesce(p_body,''))) < 1 or char_length(btrim(coalesce(p_body,''))) > 1000 then raise exception 'Message must be 1-1000 characters'; end if;
  perform public.reject_objectionable_text(p_body); perform set_config('app.tably_rpc','on',true);
  insert into public.table_messages(table_id,sender_id,body) values(p_table_id,auth.uid(),btrim(p_body)) returning table_messages.id into v_message_id;
  for v_recipient in select tm.profile_id from public.table_members tm join public.profiles recipient on recipient.id=tm.profile_id and recipient.moderation_status in ('active','limited') where tm.table_id=p_table_id and tm.profile_id<>auth.uid() and tm.status in ('pending_intro','pending_confirm','confirmed') and not public.is_blocked_between(auth.uid(),tm.profile_id) loop
    perform public.queue_notification_event(v_recipient.profile_id,p_table_id,'table_message',coalesce(v_table_title,'New table message'),left(btrim(p_body),160),jsonb_build_object('tableId',p_table_id::text,'tableMessageId',v_message_id::text,'type','table_message'),now(),'table_message:'||v_message_id::text||':'||v_recipient.profile_id::text,v_message_id);
  end loop;
  return query select m.id,m.table_id,m.sender_id,p.display_name,p.avatar_path,m.body,m.created_at,m.updated_at from public.table_messages m join public.profiles p on p.id=m.sender_id where m.id=v_message_id;
end;
$$;
revoke all on function public.send_table_message(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.send_table_message(uuid,text) to authenticated, service_role;
