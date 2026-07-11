\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.create_tably_test_user(
  p_id uuid,
  p_email text,
  p_display_name text
)
returns void
language plpgsql
set search_path = public, auth, extensions, pg_temp
as $$
begin
  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    confirmation_token,
    recovery_token,
    email_change,
    email_change_token_new,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  values (
    p_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    p_email,
    crypt('Password123!', gen_salt('bf')),
    '',
    '',
    '',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', p_display_name),
    now(),
    now()
  );

  update public.profiles
  set display_name = p_display_name,
      is_first_login = false,
      terms_accepted_at = now(),
      terms_version = '2026-06-ugc-v1'
  where id = p_id;
end;
$$;

select pg_temp.create_tably_test_user('00000000-0000-4000-8000-000000000901', 'sql.creator@example.com', 'SQL Creator');
select pg_temp.create_tably_test_user('00000000-0000-4000-8000-000000000902', 'sql.member.one@example.com', 'SQL Member One');
select pg_temp.create_tably_test_user('00000000-0000-4000-8000-000000000903', 'sql.member.two@example.com', 'SQL Member Two');
select pg_temp.create_tably_test_user('00000000-0000-4000-8000-000000000904', 'sql.waitlist@example.com', 'SQL Waitlist');

create temporary table tably_test_context (table_id uuid not null);
grant select, insert on tably_test_context to authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000901', true);
set local role authenticated;
insert into tably_test_context (table_id)
select id
from public.create_social_table(
  'coffee',
  'SQL lifecycle table',
  'Lifecycle verification',
  'Chill',
  'Kadikoy',
  now() + interval '4 hours',
  29.025,
  40.99,
  3,
  3,
  'What brings you here?'
);
select *
from public.send_table_message(
  (select table_id from tably_test_context),
  'SQL persistence check'
);
reset role;

do $$
begin
  if not exists (
    select 1
    from public.table_messages
    where table_id = (select table_id from tably_test_context)
      and sender_id = '00000000-0000-4000-8000-000000000901'
      and body = 'SQL persistence check'
  ) then
    raise exception 'Expected table message to persist';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000902', true);
set local role authenticated;
select * from public.join_social_table((select table_id from tably_test_context));
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000903', true);
set local role authenticated;
select * from public.join_social_table((select table_id from tably_test_context));
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000904', true);
set local role authenticated;
select * from public.join_social_table((select table_id from tably_test_context));
reset role;

do $$
begin
  if not exists (
    select 1 from public.table_waitlist
    where table_id = (select table_id from tably_test_context)
      and profile_id = '00000000-0000-4000-8000-000000000904'
  ) then
    raise exception 'Expected fourth member to be waitlisted';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000902', true);
set local role authenticated;
select public.leave_social_table((select table_id from tably_test_context));
reset role;

do $$
begin
  if not exists (
    select 1 from public.table_members
    where table_id = (select table_id from tably_test_context)
      and profile_id = '00000000-0000-4000-8000-000000000904'
      and status = 'pending_intro'
  ) then
    raise exception 'Expected waitlisted member to be promoted';
  end if;

  if exists (
    select 1 from public.table_waitlist
    where table_id = (select table_id from tably_test_context)
  ) then
    raise exception 'Expected waitlist to be empty after promotion';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000901', true);
set local role authenticated;
select public.leave_social_table((select table_id from tably_test_context));
reset role;

do $$
begin
  if not exists (
    select 1 from public.social_tables
    where id = (select table_id from tably_test_context) and status = 'cancelled'
  ) then
    raise exception 'Expected creator leave to cancel the table';
  end if;

  if exists (
    select 1 from public.table_members
    where table_id = (select table_id from tably_test_context)
      and status in ('pending_intro', 'pending_confirm', 'confirmed')
  ) then
    raise exception 'Expected cancellation to release all active seats';
  end if;

  if exists (
    select 1 from public.notification_events
    where table_id = (select table_id from tably_test_context) and status = 'queued'
  ) then
    raise exception 'Expected cancellation to stop queued reminders';
  end if;
end;
$$;

delete from auth.users
where id = '00000000-0000-4000-8000-000000000901';

do $$
begin
  if exists (
    select 1 from public.profiles
    where id = '00000000-0000-4000-8000-000000000901'
  ) then
    raise exception 'Expected auth deletion to remove the profile';
  end if;

  if exists (
    select 1 from public.social_tables
    where id = (select table_id from tably_test_context)
  ) then
    raise exception 'Expected auth deletion to remove created tables';
  end if;
end;
$$;

rollback;

select 'tably_sql_checks_passed' as result;
