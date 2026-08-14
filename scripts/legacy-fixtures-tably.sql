\set ON_ERROR_STOP on

-- Disposable pre-M4 data only.  This file intentionally uses no seed file and
-- is applied after exactly the first 17 migrations in the portable harness.
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, confirmation_token, recovery_token, email_change, email_change_token_new, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'legacy.creator@example.invalid', crypt('Password123!', gen_salt('bf')), '', '', '', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Legacy Creator"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000902', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'legacy.member@example.invalid', crypt('Password123!', gen_salt('bf')), '', '', '', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Legacy Member"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000903', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'legacy.deleted@example.invalid', crypt('Password123!', gen_salt('bf')), '', '', '', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Legacy Deleted"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000904', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'legacy.nonstaff@example.invalid', crypt('Password123!', gen_salt('bf')), '', '', '', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Legacy Nonstaff"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000905', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'legacy.deleted.admin@example.invalid', crypt('Password123!', gen_salt('bf')), '', '', '', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Deleted Admin"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000906', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'legacy.deleted.reviewer@example.invalid', crypt('Password123!', gen_salt('bf')), '', '', '', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Deleted Reviewer"}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, email, display_name, summary, is_first_login, moderation_status, terms_accepted_at, terms_version)
values
  ('00000000-0000-4000-8000-000000000905', 'legacy.deleted.admin@example.invalid', 'Deleted Admin', 'fixture admin', false, 'active', now(), '2026-06-ugc-v1'),
  ('00000000-0000-4000-8000-000000000906', 'legacy.deleted.reviewer@example.invalid', 'Deleted Reviewer', 'fixture reviewer', false, 'active', now(), '2026-06-ugc-v1')
on conflict (id) do nothing;

update public.profiles
set display_name = case id
      when '00000000-0000-4000-8000-000000000905'::uuid then 'Deleted Admin'
      when '00000000-0000-4000-8000-000000000906'::uuid then 'Deleted Reviewer'
    end,
    summary = case id
      when '00000000-0000-4000-8000-000000000905'::uuid then 'fixture admin'
      when '00000000-0000-4000-8000-000000000906'::uuid then 'fixture reviewer'
    end,
    is_first_login = false,
    moderation_status = 'active',
    terms_accepted_at = coalesce(terms_accepted_at, now()),
    terms_version = coalesce(terms_version, '2026-06-ugc-v1')
where id in ('00000000-0000-4000-8000-000000000905','00000000-0000-4000-8000-000000000906');

update public.profiles
set terms_accepted_at = now(), terms_version = '2026-06-ugc-v1'
where id in ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902', '00000000-0000-4000-8000-000000000903', '00000000-0000-4000-8000-000000000904', '00000000-0000-4000-8000-000000000905', '00000000-0000-4000-8000-000000000906');

select set_config('app.tably_rpc', 'on', false);
insert into public.social_tables (id, created_by, activity, title, note, vibe, area_label, starts_at, min_seats, max_seats, intro_prompt, location)
values ('00000000-0000-4000-8000-000000000911', '00000000-0000-4000-8000-000000000901', 'coffee', 'Legacy table', 'pre-M4 table', 'casual', 'Kadikoy', now() + interval '4 hours', 2, 4, 'What brings you here?', extensions.ST_SetSRID(extensions.ST_MakePoint(29.025, 40.99), 4326)::geography)
on conflict (id) do nothing;
insert into public.table_members (table_id, profile_id, status, intro_due_at, confirm_due_at, confirmed_at)
values ('00000000-0000-4000-8000-000000000911', '00000000-0000-4000-8000-000000000901', 'confirmed', now(), now(), now()),
       ('00000000-0000-4000-8000-000000000911', '00000000-0000-4000-8000-000000000902', 'confirmed', now(), now(), now())
on conflict (table_id, profile_id) do nothing;
insert into public.table_messages (id, table_id, sender_id, body)
values ('00000000-0000-4000-8000-000000000912', '00000000-0000-4000-8000-000000000911', '00000000-0000-4000-8000-000000000902', 'legacy table message')
on conflict (id) do nothing;

insert into public.moderation_reports (id, reporter_id, reported_user_id, target_type, target_id, reason, details, snapshot)
values
  ('00000000-0000-4000-8000-000000000921', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902', 'profile', '00000000-0000-4000-8000-000000000902', 'account deletion', 'legacy deletion report', '{"email":"legacy-deletion@example.invalid","display_name":"Legacy Member"}'::jsonb),
  ('00000000-0000-4000-8000-000000000922', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902', 'profile', '00000000-0000-4000-8000-000000000902', 'empty snapshot', '', '{}'::jsonb),
  ('00000000-0000-4000-8000-000000000923', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902', 'profile', '00000000-0000-4000-8000-000000000902', 'scalar snapshot', '', '"legacy-scalar"'::jsonb),
  ('00000000-0000-4000-8000-000000000924', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902', 'profile', '00000000-0000-4000-8000-000000000902', 'array snapshot', '', '["legacy-array"]'::jsonb),
  ('00000000-0000-4000-8000-000000000925', null, '00000000-0000-4000-8000-000000000903', 'dive', '00000000-0000-4000-8000-000000000931', 'legacy dive reason', '', '{}'::jsonb),
  ('00000000-0000-4000-8000-000000000926', '00000000-0000-4000-8000-000000000903', null, 'message', '00000000-0000-4000-8000-000000000932', 'legacy message reason', '', '{}'::jsonb),
  ('00000000-0000-4000-8000-000000000927', '00000000-0000-4000-8000-000000000903', null, 'conversation', '00000000-0000-4000-8000-000000000933', 'legacy conversation reason', '', '{}'::jsonb),
  ('00000000-0000-4000-8000-000000000928', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902', 'table', '00000000-0000-4000-8000-000000000911', 'duplicate legacy reason', '', '{}'::jsonb),
  ('00000000-0000-4000-8000-000000000929', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902', 'table_message', '00000000-0000-4000-8000-000000000912', 'unknown legacy reason', '', '{}'::jsonb);

insert into public.notification_events (id, recipient_id, table_id, type, title, body, data, scheduled_for, status, dedupe_key)
values ('00000000-0000-4000-8000-000000000941', '00000000-0000-4000-8000-000000000902', '00000000-0000-4000-8000-000000000911', 'table_message', 'Legacy message', 'Legacy notification', '{"tableId":"00000000-0000-4000-8000-000000000911","type":"table_message"}'::jsonb, now(), 'queued', 'legacy-table-message-event');

delete from auth.users where id = '00000000-0000-4000-8000-000000000903';

commit;
