\set ON_ERROR_STOP on

-- Fixtures that can only be represented after the M4.2 schema is applied.
begin;

insert into public.moderation_audit_log (
  id, report_id, actor_id, actor_label, action, reason, before_state, after_state
)
values (
  '00000000-0000-4000-8000-000000000951',
  '00000000-0000-4000-8000-000000000921',
  null,
  'Deleted staff',
  'dismiss',
  'historical audit fixture',
  '{"snapshot":{"email":"historical@example.invalid"}}'::jsonb,
  '{"resolution":"dismissed"}'::jsonb
)
on conflict (id) do nothing;

insert into public.moderation_audit_log (id, report_id, actor_id, actor_label, action, reason, before_state, after_state)
values
  ('00000000-0000-4000-8000-000000000953', null, null, '', 'claim', 'legacy claim', '{}'::jsonb, '{"status":"reviewing"}'::jsonb),
  ('00000000-0000-4000-8000-000000000954', null, null, 'Deleted staff', 'restore_user', 'legacy restore', '{"moderation_status":"suspended"}'::jsonb, '{"moderation_status":"active"}'::jsonb)
on conflict (id) do nothing;

insert into public.notification_events (
  id, recipient_id, table_id, table_message_id, type, title, body, data,
  scheduled_for, status, dedupe_key
)
values (
  '00000000-0000-4000-8000-000000000952',
  '00000000-0000-4000-8000-000000000902',
  '00000000-0000-4000-8000-000000000911',
  '00000000-0000-4000-8000-000000000912',
  'table_message',
  'New table message',
  'New message body',
  '{"tableId":"00000000-0000-4000-8000-000000000911","tableMessageId":"00000000-0000-4000-8000-000000000912","type":"table_message"}'::jsonb,
  now(),
  'queued',
  'm4.2-identity-fixture'
)
on conflict (id) do nothing;

insert into public.moderation_reports (
  id, reporter_id, reported_user_id, target_type, target_id, reason, snapshot
)
values
  ('00000000-0000-4000-8000-000000000961', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902', 'profile', '00000000-0000-4000-8000-000000000902', 'malformed profile', '{"display_name":"partial"}'::jsonb),
  ('00000000-0000-4000-8000-000000000962', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902', 'profile', '00000000-0000-4000-8000-000000000902', 'null profile', 'null'::jsonb),
  ('00000000-0000-4000-8000-000000000963', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902', 'profile', '00000000-0000-4000-8000-000000000902', 'array profile', '["profile"]'::jsonb),
  ('00000000-0000-4000-8000-000000000964', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902', 'profile', '00000000-0000-4000-8000-000000000902', 'valid profile', '{"display_name":"Legacy Member","moderation_status":"active","created_at":"2026-08-14T00:00:00Z"}'::jsonb),
  ('00000000-0000-4000-8000-000000000965', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902', 'table', '00000000-0000-4000-8000-000000000911', 'partial table', '{"title":"partial"}'::jsonb),
  ('00000000-0000-4000-8000-000000000966', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902', 'table', '00000000-0000-4000-8000-000000000911', 'valid table', '{"title":"Legacy table","starts_at":"2026-08-14T00:00:00Z","status":"forming","creator_display_name":"Legacy Creator"}'::jsonb),
  ('00000000-0000-4000-8000-000000000967', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902', 'table_message', '00000000-0000-4000-8000-000000000912', 'partial message', '{"body":"secret"}'::jsonb),
  ('00000000-0000-4000-8000-000000000968', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902', 'table_message', '00000000-0000-4000-8000-000000000912', 'valid message', '{"body":"secret","sender_display_name":"Legacy Member","created_at":"2026-08-14T00:00:00Z"}'::jsonb),
  ('00000000-0000-4000-8000-000000000969', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902', 'message', '00000000-0000-4000-8000-000000000932', 'message evidence', '{"sender_display_name":"Legacy Member","created_at":"2026-08-14T00:00:00Z"}'::jsonb),
  ('00000000-0000-4000-8000-000000000970', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902', 'conversation', '00000000-0000-4000-8000-000000000933', 'conversation evidence', '{"target_type":"conversation"}'::jsonb),
  ('00000000-0000-4000-8000-000000000971', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902', 'profile', '00000000-0000-4000-8000-000000000902', 'account deletion', '{"account_deletion":{"requested_at":"2026-08-14T00:00:00Z"}}'::jsonb),
  ('00000000-0000-4000-8000-000000000972', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902', 'profile', '00000000-0000-4000-8000-000000000902', 'account deletion partial', '{"account_deletion":{}}'::jsonb)
on conflict (id) do nothing;

do $$
declare
  v_target text;
  v_shape text;
  v_required text[];
  v_snapshot jsonb;
  v_target_id uuid;
  v_index integer := 0;
  v_account_index integer := 0;
begin
  foreach v_target in array array['profile', 'table', 'table_message', 'message', 'conversation', 'dive'] loop
    v_required := case v_target
      when 'profile' then array['display_name', 'moderation_status', 'created_at']
      when 'table' then array['title', 'starts_at', 'status', 'creator_display_name']
      when 'table_message' then array['body', 'sender_display_name', 'created_at']
      when 'message' then array['sender_display_name', 'created_at']
      when 'conversation' then array['target_type']
      else array['title', 'created_at']
    end;
    v_target_id := case v_target
      when 'table' then '00000000-0000-4000-8000-000000000911'::uuid
      when 'table_message' then '00000000-0000-4000-8000-000000000912'::uuid
      when 'message' then '00000000-0000-4000-8000-000000000932'::uuid
      when 'conversation' then '00000000-0000-4000-8000-000000000933'::uuid
      else '00000000-0000-4000-8000-000000000931'::uuid
    end;

    foreach v_shape in array array['empty', 'null', 'scalar_string', 'scalar_number', 'scalar_bool', 'array', 'missing_required', 'partial_wrong_type'] loop
      v_index := v_index + 1;
      if v_shape = 'empty' then
        v_snapshot := '{}'::jsonb;
      elsif v_shape = 'null' then
        v_snapshot := 'null'::jsonb;
      elsif v_shape = 'scalar_string' then
        v_snapshot := to_jsonb('legacy-scalar'::text);
      elsif v_shape = 'scalar_number' then
        v_snapshot := to_jsonb(42);
      elsif v_shape = 'scalar_bool' then
        v_snapshot := to_jsonb(true);
      elsif v_shape = 'array' then
        v_snapshot := jsonb_build_array('legacy-array');
      elsif v_shape = 'missing_required' then
        select coalesce(jsonb_object_agg(key, to_jsonb('partial'::text)), '{}'::jsonb) || jsonb_build_object('unexpected', 'legacy')
          into v_snapshot
        from unnest(v_required) with ordinality as required_key(key, ordinality)
        where ordinality < cardinality(v_required);
      else
        select jsonb_object_agg(key, case when ordinality = 1 then to_jsonb(42) else to_jsonb('legacy'::text) end)
          into v_snapshot
        from unnest(v_required) with ordinality as required_key(key, ordinality);
      end if;

      insert into public.moderation_reports (id, reporter_id, reported_user_id, target_type, target_id, reason, snapshot)
      values (
        ('00000000-0000-4000-8000-' || lpad((1000 + v_index)::text, 12, '0'))::uuid,
        '00000000-0000-4000-8000-000000000901',
        '00000000-0000-4000-8000-000000000902',
        v_target,
        v_target_id,
        'legacy matrix',
        v_snapshot
      ) on conflict (id) do nothing;
    end loop;
  end loop;

  foreach v_shape in array array['empty', 'null', 'scalar_string', 'scalar_number', 'scalar_bool', 'array', 'missing_required', 'partial_wrong_type'] loop
    v_account_index := v_account_index + 1;
    v_snapshot := case v_shape
      when 'empty' then '{}'::jsonb
      when 'null' then 'null'::jsonb
      when 'scalar_string' then to_jsonb('legacy-scalar'::text)
      when 'scalar_number' then to_jsonb(42)
      when 'scalar_bool' then to_jsonb(true)
      when 'array' then jsonb_build_array('legacy-array')
      when 'missing_required' then jsonb_build_object('account_deletion', '{}'::jsonb)
      else jsonb_build_object('account_deletion', jsonb_build_object('requested_at', 42))
    end;
    insert into public.moderation_reports (id, reporter_id, reported_user_id, target_type, target_id, reason, snapshot)
    values (
      ('00000000-0000-4000-8000-' || lpad((1050 + v_account_index)::text, 12, '0'))::uuid,
      '00000000-0000-4000-8000-000000000901',
      '00000000-0000-4000-8000-000000000902',
      'profile',
      '00000000-0000-4000-8000-000000000902',
      'account deletion',
      v_snapshot
    ) on conflict (id) do nothing;
  end loop;
end;
$$;

commit;
