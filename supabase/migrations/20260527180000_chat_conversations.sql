create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  participant_low uuid not null references public.profiles(id) on delete cascade,
  participant_high uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (participant_low < participant_high),
  unique (participant_low, participant_high)
);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversation_participants_profile_id_idx
on public.conversation_participants (profile_id);

create index messages_conversation_created_at_idx
on public.messages (conversation_id, created_at desc);

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

revoke all on table public.conversations from anon;
revoke all on table public.conversations from authenticated;
revoke all on table public.conversation_participants from anon;
revoke all on table public.conversation_participants from authenticated;
revoke all on table public.messages from anon;
revoke all on table public.messages from authenticated;

create or replace function public.protect_chat_server_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('app.chat_rpc', true), '') <> 'on' then
    raise exception 'chat tables require Phase 4 chat RPCs';
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.is_current_user_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.profile_id = auth.uid()
  );
$$;

grant select on table public.messages to authenticated;

create policy messages_select_participants
on public.messages for select
to authenticated
using (public.is_current_user_conversation_participant(messages.conversation_id));

create trigger trg_10_protect_conversations_server_fields
before insert or update or delete on public.conversations
for each row
execute function public.protect_chat_server_fields();

create trigger trg_10_protect_conversation_participants_server_fields
before insert or update or delete on public.conversation_participants
for each row
execute function public.protect_chat_server_fields();

create trigger trg_10_protect_messages_server_fields
before insert or update or delete on public.messages
for each row
execute function public.protect_chat_server_fields();

create trigger trg_20_set_conversations_updated_at
before update on public.conversations
for each row
execute function public.set_updated_at();

create trigger trg_20_set_messages_updated_at
before update on public.messages
for each row
execute function public.set_updated_at();

create or replace function public.is_conversation_participant(p_conversation_id uuid, p_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.profile_id = p_profile_id
  );
$$;

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

  if not exists (select 1 from public.profiles p where p.id = p_other_user_id) then
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
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_conversation_participant(p_conversation_id, v_user_id) then
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
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_conversation_participant(p_conversation_id, v_user_id) then
    raise exception 'Conversation not found';
  end if;

  if char_length(v_body) < 1 or char_length(v_body) > 1000 then
    raise exception 'Message must be 1-1000 characters';
  end if;

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

revoke all on function public.is_current_user_conversation_participant(uuid) from public;
revoke all on function public.is_conversation_participant(uuid, uuid) from public;
revoke all on function public.upsert_conversation(uuid) from public;
revoke all on function public.get_conversations_with_latest_message() from public;
revoke all on function public.get_messages_by_conversation_id(uuid, timestamptz, int) from public;
revoke all on function public.send_message(uuid, text) from public;

grant execute on function public.upsert_conversation(uuid) to authenticated;
grant execute on function public.get_conversations_with_latest_message() to authenticated;
grant execute on function public.get_messages_by_conversation_id(uuid, timestamptz, int) to authenticated;
grant execute on function public.send_message(uuid, text) to authenticated;

alter publication supabase_realtime add table public.messages;
