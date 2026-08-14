-- M4.2 exhaustive disposable assertions. The shell runner extracts exactly one
-- marked phase (or all three) and retains the assertion rows separately.

-- BEGIN_PHASE schema
\pset format unaligned
\pset tuples_only on
\set ON_ERROR_STOP on
begin;
do $$
declare v_count integer;
begin
  select count(*) into v_count from information_schema.columns where table_schema='public' and table_name='moderation_reports' and column_name in ('claimed_by','claimed_at','sla_due_at','resolution','resolved_by','resolved_at');
  if v_count <> 6 then raise exception 'M42-SCHEMA-001'; end if;
end; $$;
select 'ASSERT|M42-SCHEMA-001|PASS|report concurrency columns=6';

do $$
begin
  if to_regclass('public.admin_roles') is null or to_regclass('public.moderation_audit_log') is null then raise exception 'M42-SCHEMA-002'; end if;
  if to_regprocedure('public.admin_set_moderation_status_internal(uuid,text)') is not null then raise exception 'M42-SCHEMA-002-dead-code'; end if;
  if to_regprocedure('public.queue_notification_event(uuid,uuid,text,text,text,jsonb,timestamptz,text,uuid)') is null then raise exception 'M42-SCHEMA-002-queue'; end if;
  if to_regprocedure('public.check_notification_event_sources(uuid[])') is null then raise exception 'M42-SCHEMA-002-source'; end if;
end; $$;
select 'ASSERT|M42-SCHEMA-002|PASS|admin schema and exact signatures';

do $$
declare v_count integer;
begin
  select count(*) into v_count from pg_constraint where conname='notification_events_table_message_type_check';
  if v_count <> 1 then raise exception 'M42-SCHEMA-003-check'; end if;
  select count(*) into v_count from pg_indexes where schemaname='public' and indexname='notification_events_table_message_status_idx';
  if v_count <> 1 then raise exception 'M42-SCHEMA-003-index'; end if;
  if (select count(*) from pg_constraint where conname='notification_events_status_check') <> 1 then raise exception 'M42-SCHEMA-003-status'; end if;
end; $$;
select 'ASSERT|M42-SCHEMA-003|PASS|identity/status constraint and index';

do $$
begin
  if not exists (select 1 from pg_trigger where tgname='trg_guard_social_table_content_removal') then raise exception 'M42-SCHEMA-004-publication'; end if;
  if has_function_privilege('anon','public.trg_admin_reports_clear_claim()','EXECUTE') or has_function_privilege('authenticated','public.trg_admin_audit_append_only()','EXECUTE') then raise exception 'M42-SCHEMA-004-trigger-acl'; end if;
  if has_function_privilege('anon','public.check_notification_event_sources(uuid[])','EXECUTE') or has_function_privilege('authenticated','public.check_notification_event_sources(uuid[])','EXECUTE') then raise exception 'M42-SCHEMA-004-worker-acl'; end if;
end; $$;
select 'ASSERT|M42-SCHEMA-004|PASS|trigger posture and worker ACL';

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='social_tables') then raise exception 'M42-SCHEMA-005-social-realtime'; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='table_messages') then raise exception 'M42-SCHEMA-005-message-realtime'; end if;
end; $$;
select 'ASSERT|M42-SCHEMA-005|PASS|Realtime publication';

do $$
begin
  if public.admin_get_my_role() is not null then raise exception 'M42-SCHEMA-006-anon'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
  if public.admin_get_my_role() <> 'admin' then raise exception 'M42-SCHEMA-006-admin'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000902',true);
  if public.admin_get_my_role() <> 'reviewer' then raise exception 'M42-SCHEMA-006-reviewer'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000904',true);
  if public.admin_get_my_role() is not null then raise exception 'M42-SCHEMA-006-nonstaff'; end if;
end; $$;
select 'ASSERT|M42-SCHEMA-006|PASS|admin/reviewer/nonstaff role resolution';
rollback;
-- END_PHASE schema

-- BEGIN_PHASE reads
\pset format unaligned
\pset tuples_only on
\set ON_ERROR_STOP on
begin;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);

do $$
declare a jsonb; b jsonb; token text; rows_a integer; rows_b integer;
begin
  a := public.admin_queue_list('all','all','all',2,null);
  rows_a := jsonb_array_length(a->'rows');
  if not (a ?& array['rows','total','summary','hasMore','nextToken']) then raise exception 'M42-READ-001-keys'; end if;
  if a ? 'kpi' or position('body' in lower(a::text)) > 0 or position('email' in lower(a::text)) > 0 then raise exception 'M42-READ-001-redaction'; end if;
  if (select coalesce(sum((value->>'count')::integer),0) from jsonb_array_elements(a->'summary'->'status_counts')) <> (a->>'total')::integer then raise exception 'M42-READ-001-global-count'; end if;
  if (a->>'total')::integer <= rows_a or a->>'nextToken' is null then raise exception 'M42-READ-001-page'; end if;
  token := a->>'nextToken';
  b := public.admin_queue_list('all','all','all',2,token);
  rows_b := jsonb_array_length(b->'rows');
  if rows_a <> 2 or rows_b = 0 or b->>'nextToken' is null and (b->>'hasMore')::boolean then raise exception 'M42-READ-001-token'; end if;
end; $$;
select 'ASSERT|M42-READ-001|PASS|queue keys/pages/totals/tokens';

do $$
begin
  begin perform public.admin_queue_list('bad','all','all',2,null); raise exception 'M42-READ-002-status'; exception when others then if sqlerrm <> 'Status filter is invalid' then raise; end if; end;
  begin perform public.admin_queue_list('all','bad','all',2,null); raise exception 'M42-READ-002-target'; exception when others then if sqlerrm <> 'Target filter is invalid' then raise; end if; end;
  begin perform public.admin_queue_list('all','all','bad',2,null); raise exception 'M42-READ-002-assignee'; exception when others then if sqlerrm <> 'Assignee filter is invalid' then raise; end if; end;
  begin perform public.admin_queue_list('all','all','all',0,null); raise exception 'M42-READ-002-size'; exception when others then if sqlerrm <> 'Page size must be between 1 and 50' then raise; end if; end;
  begin perform public.admin_queue_list('all','all','all',2,'!'); raise exception 'M42-READ-002-token'; exception when others then if sqlerrm <> 'Page token is invalid' then raise; end if; end;
end; $$;
select 'ASSERT|M42-READ-002|PASS|invalid filters/page/token';

do $$
declare v_id text; a jsonb; v_checked integer := 0; v_case integer; expected text[] := array['00000000-0000-4000-8000-000000000922','00000000-0000-4000-8000-000000000923','00000000-0000-4000-8000-000000000924','00000000-0000-4000-8000-000000000925','00000000-0000-4000-8000-000000000926','00000000-0000-4000-8000-000000000927','00000000-0000-4000-8000-000000000928','00000000-0000-4000-8000-000000000929','00000000-0000-4000-8000-000000000961','00000000-0000-4000-8000-000000000962','00000000-0000-4000-8000-000000000963','00000000-0000-4000-8000-000000000965','00000000-0000-4000-8000-000000000967','00000000-0000-4000-8000-000000000969','00000000-0000-4000-8000-000000000970','00000000-0000-4000-8000-000000000972'];
begin
  foreach v_id in array expected loop
    a := public.admin_report_detail(v_id::uuid);
    v_checked := v_checked + 1;
    if (a->'evidence'->0->>'kind') <> 'legacy_unavailable' or position('email' in lower(a::text)) > 0 or position('body' in lower(a::text)) > 0 then raise exception 'M42-READ-003-legacy-%', v_id; end if;
  end loop;
  for v_case in 1..48 loop
    v_checked := v_checked + 1;
    v_id := '00000000-0000-4000-8000-' || lpad((1000 + v_case)::text, 12, '0');
    a := public.admin_report_detail(v_id::uuid);
    if (a->'evidence'->0->>'kind') <> 'legacy_unavailable' or position('email' in lower(a::text)) > 0 or position('body' in lower(a::text)) > 0 then raise exception 'M42-READ-003-generated-%', v_id; end if;
  end loop;
  for v_case in 1..8 loop
    v_checked := v_checked + 1;
    v_id := '00000000-0000-4000-8000-' || lpad((1050 + v_case)::text, 12, '0');
    a := public.admin_report_detail(v_id::uuid);
    if (a->'evidence'->0->>'kind') <> 'legacy_unavailable' or position('email' in lower(a::text)) > 0 or position('body' in lower(a::text)) > 0 then raise exception 'M42-READ-003-account-%', v_id; end if;
  end loop;
  if v_checked <> 72 then raise exception 'M42-READ-003-count'; end if;
end; $$;
select 'ASSERT|M42-READ-003|PASS|empty/null/scalar-string/scalar-number/scalar-bool/array/missing/wrong-type legacy count=72';

do $$
declare a jsonb;
begin
  a := public.admin_report_detail('00000000-0000-4000-8000-000000000964'); if (a->'evidence'->0->>'kind') <> 'profile' then raise exception 'M42-READ-004-profile'; end if;
  a := public.admin_report_detail('00000000-0000-4000-8000-000000000966'); if (a->'evidence'->0->>'kind') <> 'table' then raise exception 'M42-READ-004-table'; end if;
  a := public.admin_report_detail('00000000-0000-4000-8000-000000000968'); if (a->'evidence'->0->>'kind') <> 'table_message' or (a->'evidence'->0->>'redacted') <> 'true' or position('secret' in a::text) > 0 then raise exception 'M42-READ-004-message'; end if;
  a := public.admin_report_detail('00000000-0000-4000-8000-000000000971'); if (a->'evidence'->0->>'kind') <> 'account_deletion' or position('email' in lower(a::text)) > 0 then raise exception 'M42-READ-004-account'; end if;
end; $$;
select 'ASSERT|M42-READ-004|PASS|well-formed evidence and redaction';

do $$
declare a jsonb; b jsonb;
begin
  a := public.admin_audit_list('all',null,2,null);
  if not (a ?& array['rows','total','hasMore','nextToken']) then raise exception 'M42-READ-005-keys'; end if;
  if position('email' in lower(a::text)) > 0 or position('body' in lower(a::text)) > 0 then raise exception 'M42-READ-005-redaction'; end if;
  if (a->>'total')::integer <= jsonb_array_length(a->'rows') or a->>'nextToken' is null then raise exception 'M42-READ-005-page'; end if;
  b := public.admin_audit_list('all',null,2,a->>'nextToken');
  if jsonb_array_length(b->'rows') = 0 then raise exception 'M42-READ-005-next'; end if;
  begin perform public.admin_audit_list('bad',null,2,null); raise exception 'M42-READ-005-action'; exception when others then if sqlerrm <> 'Action filter is invalid' then raise; end if; end;
end; $$;
select 'ASSERT|M42-READ-005|PASS|audit keys/filter/redaction';
rollback;
-- END_PHASE reads

-- BEGIN_PHASE actions
\pset format unaligned
\pset tuples_only on
\set ON_ERROR_STOP on
begin;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);

do $$
declare r public.moderation_reports; a jsonb; old_ts timestamptz; new_ts timestamptz;
begin
  select * into r from public.moderation_reports where id='00000000-0000-4000-8000-000000000961'; old_ts := r.updated_at;
  a := public.moderation_claim(r.id); if a->>'status' <> 'reviewing' then raise exception 'M42-ACT-001-claim'; end if;
  begin perform public.moderation_dismiss(r.id,'stale',old_ts); raise exception 'M42-ACT-001-stale'; exception when others then if sqlerrm <> 'Report was changed — refresh before acting' then raise; end if; end;
  select updated_at into new_ts from public.moderation_reports where id=r.id;
  a := public.moderation_dismiss(r.id,'valid',new_ts); if a->>'resolution' <> 'dismissed' then raise exception 'M42-ACT-001-dismiss'; end if;
  select updated_at into new_ts from public.moderation_reports where id=r.id;
  begin perform public.moderation_dismiss(r.id,'retry',new_ts); raise exception 'M42-ACT-001-closed'; exception when others then if sqlerrm <> 'Report is already closed' then raise; end if; end;
  if (select count(*) from public.moderation_audit_log where report_id=r.id and action in ('claim','dismiss')) <> 2 then raise exception 'M42-ACT-001-audit'; end if;
end; $$;
select 'ASSERT|M42-ACT-001|PASS|claim/dismiss stale and terminal precedence/audit';

do $$
declare
  v_report_before jsonb;
  v_report_after jsonb;
  v_notifications_before jsonb;
  v_notifications_after jsonb;
  v_target_before timestamptz;
  v_target_after timestamptz;
  v_audit_before integer;
  v_audit_after integer;
  v_updated_at timestamptz;
  v_failed boolean := false;
  v_error text := null;
begin
  insert into public.moderation_reports (id, reporter_id, reported_user_id, target_type, target_id, reason, snapshot)
  values ('00000000-0000-4000-8000-000000000987','00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000902','table','00000000-0000-4000-8000-000000000911','rollback audit failure','{}'::jsonb);
  insert into public.notification_events (id, recipient_id, table_id, type, title, body, data, scheduled_for, status, error, processing_started_at, sent_at, dedupe_key)
  values
    ('00000000-0000-4000-8000-000000000988','00000000-0000-4000-8000-000000000902','00000000-0000-4000-8000-000000000911','table_confirmed','Queued before failure','Queued body','{"kind":"queued"}',now(),'queued',null,null,null,'rollback-queued'),
    ('00000000-0000-4000-8000-000000000989','00000000-0000-4000-8000-000000000902','00000000-0000-4000-8000-000000000911','table_confirmed','Processing before failure','Processing body','{"kind":"processing"}',now(),'processing',null,now(),null,'rollback-processing'),
    ('00000000-0000-4000-8000-000000000990','00000000-0000-4000-8000-000000000902','00000000-0000-4000-8000-000000000911','table_confirmed','Sent before failure','Sent body','{"kind":"sent"}',now(),'sent',null,null,now(),'rollback-sent'),
    ('00000000-0000-4000-8000-000000000991','00000000-0000-4000-8000-000000000902','00000000-0000-4000-8000-000000000911','table_confirmed','Failed before failure','Failed body','{"kind":"failed"}',now(),'failed','existing failure',null,null,'rollback-failed');

  select updated_at into v_updated_at from public.moderation_reports where id='00000000-0000-4000-8000-000000000987';
  select jsonb_build_object('status',status,'resolution',resolution,'claimed_by',claimed_by,'claimed_at',claimed_at,'resolved_by',resolved_by,'resolved_at',resolved_at)
    into v_report_before from public.moderation_reports where id='00000000-0000-4000-8000-000000000987';
  select content_removed_at into v_target_before from public.social_tables where id='00000000-0000-4000-8000-000000000911';
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'title',title,'body',body,'data',data,'error',error,'processing_started_at',processing_started_at,'sent_at',sent_at) order by id),'[]'::jsonb)
    into v_notifications_before from public.notification_events where id in ('00000000-0000-4000-8000-000000000988','00000000-0000-4000-8000-000000000989','00000000-0000-4000-8000-000000000990','00000000-0000-4000-8000-000000000991');
  select count(*) into v_audit_before from public.moderation_audit_log where report_id='00000000-0000-4000-8000-000000000987';

  create or replace function pg_temp.m42_fail_audit() returns trigger
  language plpgsql as $m42$begin raise exception 'M42 deterministic audit failure'; end;$m42$;
  create trigger m42_fail_audit before insert on public.moderation_audit_log
    for each row execute function pg_temp.m42_fail_audit();

  begin
    perform public.moderation_action_content('00000000-0000-4000-8000-000000000987','valid rollback action',v_updated_at);
  exception when others then
    v_failed := true;
    v_error := sqlerrm;
  end;
  drop trigger m42_fail_audit on public.moderation_audit_log;

  select jsonb_build_object('status',status,'resolution',resolution,'claimed_by',claimed_by,'claimed_at',claimed_at,'resolved_by',resolved_by,'resolved_at',resolved_at)
    into v_report_after from public.moderation_reports where id='00000000-0000-4000-8000-000000000987';
  select content_removed_at into v_target_after from public.social_tables where id='00000000-0000-4000-8000-000000000911';
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'title',title,'body',body,'data',data,'error',error,'processing_started_at',processing_started_at,'sent_at',sent_at) order by id),'[]'::jsonb)
    into v_notifications_after from public.notification_events where id in ('00000000-0000-4000-8000-000000000988','00000000-0000-4000-8000-000000000989','00000000-0000-4000-8000-000000000990','00000000-0000-4000-8000-000000000991');
  select count(*) into v_audit_after from public.moderation_audit_log where report_id='00000000-0000-4000-8000-000000000987';

  if not v_failed or v_error <> 'M42 deterministic audit failure' then raise exception 'M42-ACT-ROLLBACK-001-exception'; end if;
  if v_report_before <> v_report_after then raise exception 'M42-ACT-ROLLBACK-001-report'; end if;
  if v_target_before is distinct from v_target_after then raise exception 'M42-ACT-ROLLBACK-001-target'; end if;
  if v_notifications_before <> v_notifications_after then raise exception 'M42-ACT-ROLLBACK-001-notifications'; end if;
  if v_audit_before <> v_audit_after then raise exception 'M42-ACT-ROLLBACK-001-audit'; end if;
end; $$;
select 'ASSERT|M42-ACT-ROLLBACK-001|PASS|audit failure rolled back report target notifications and audit state exactly';

do $$
declare r public.moderation_reports; a jsonb;
begin
  insert into public.notification_events(id,recipient_id,table_id,type,title,body,data,scheduled_for,status,dedupe_key,sent_at) values
    ('00000000-0000-4000-8000-000000000981','00000000-0000-4000-8000-000000000902','00000000-0000-4000-8000-000000000911','table_message','Queued secret','Queued secret body','{"tableId":"x","type":"table_message"}',now(),'queued','action-queued',null),
    ('00000000-0000-4000-8000-000000000982','00000000-0000-4000-8000-000000000902','00000000-0000-4000-8000-000000000911','table_message','Processing secret','Processing secret body','{"tableId":"x","type":"table_message"}',now(),'processing','action-processing',null),
    ('00000000-0000-4000-8000-000000000983','00000000-0000-4000-8000-000000000902','00000000-0000-4000-8000-000000000911','table_message','Sent secret','Sent secret body','{"tableId":"x","type":"table_message"}',now(),'sent','action-sent',now());
  select * into r from public.moderation_reports where id='00000000-0000-4000-8000-000000000928';
  a := public.moderation_claim(r.id); select updated_at into r.updated_at from public.moderation_reports where id=r.id;
  a := public.moderation_action_content(r.id,'remove table',r.updated_at); if a->>'status' <> 'actioned' or a->>'target_exists' <> 'true' then raise exception 'M42-ACT-002-result'; end if;
  if (select count(*) from public.notification_events where id in ('00000000-0000-4000-8000-000000000981','00000000-0000-4000-8000-000000000982') and status='skipped') <> 2 then raise exception 'M42-ACT-002-skip'; end if;
  if (select count(*) from public.notification_events where id='00000000-0000-4000-8000-000000000983' and status='sent' and title='Notification unavailable' and body='This notification was removed.' and data='{"type":"content_removed"}'::jsonb and sent_at is not null) <> 1 then raise exception 'M42-ACT-002-sent'; end if;
  if (select count(*) from public.moderation_audit_log where report_id=r.id and action='action_content') <> 1 then raise exception 'M42-ACT-002-audit'; end if;
end; $$;
select 'ASSERT|M42-ACT-002|PASS|scrub/race-safe statuses/sent preservation/audit';

do $$
declare ts timestamptz; before_count integer;
begin
  insert into public.moderation_reports(id,reporter_id,reported_user_id,target_type,target_id,reason,snapshot) values ('00000000-0000-4000-8000-000000000984','00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000902','table','00000000-0000-4000-8000-000000000999','rollback target','{}'::jsonb);
  select updated_at into ts from public.moderation_reports where id='00000000-0000-4000-8000-000000000984'; before_count := (select count(*) from public.moderation_audit_log where report_id='00000000-0000-4000-8000-000000000984');
  begin perform public.moderation_action_content('00000000-0000-4000-8000-000000000984','',ts); raise exception 'M42-ACT-003-no-rollback'; exception when others then if sqlerrm <> 'Reason must be 1-500 characters' then raise; end if; end;
  if (select status from public.moderation_reports where id='00000000-0000-4000-8000-000000000984') <> 'open' or (select count(*) from public.moderation_audit_log where report_id='00000000-0000-4000-8000-000000000984') <> before_count then raise exception 'M42-ACT-003-state'; end if;
end; $$;
select 'ASSERT|M42-ACT-003|PASS|downstream validation rejected with state and audit unchanged';

do $$
begin
  perform set_config('app.tably_moderation_content_removal','off',true);
  perform set_config('app.tably_rpc','',true);
  begin update public.social_tables set content_removed_at=now() where id='00000000-0000-4000-8000-000000000911'; raise exception 'M42-ACT-004-generic'; exception when others then if sqlerrm not in ('Content removal requires moderation authorization','Tably tables require RPC access') then raise; end if; end;
  begin update public.moderation_audit_log set actor_label='mutated' where id='00000000-0000-4000-8000-000000000951'; raise exception 'M42-ACT-004-audit'; exception when others then if sqlerrm <> 'moderation_audit_log is append-only' then raise; end if; end;
end; $$;
select 'ASSERT|M42-ACT-004|PASS|NULL-safe guard and append-only audit';

do $$
declare v_deliverable boolean;
begin
  insert into public.notification_events(id,recipient_id,table_id,table_message_id,type,title,body,data,scheduled_for,status,dedupe_key)
  values ('00000000-0000-4000-8000-000000000985','00000000-0000-4000-8000-000000000902','00000000-0000-4000-8000-000000000911','00000000-0000-4000-8000-000000000912','table_message','Race','Race body','{"tableId":"x","tableMessageId":"y","type":"table_message"}',now(),'processing','race-source');
  perform set_config('app.tably_rpc','on',true);
  perform set_config('app.tably_moderation_content_removal','on',true);
  update public.social_tables set content_removed_at=now() where id='00000000-0000-4000-8000-000000000911';
  select deliverable into v_deliverable from public.check_notification_event_sources(array['00000000-0000-4000-8000-000000000985']::uuid[]);
  if coalesce(v_deliverable,true) then raise exception 'M42-ACT-005-source'; end if;
end; $$;
select 'ASSERT|M42-ACT-005|PASS|source removal recheck bounded before external POST';

do $$
begin
  insert into public.notification_events(id,recipient_id,type,title,body,data,scheduled_for,status,dedupe_key)
  values ('00000000-0000-4000-8000-000000000986','00000000-0000-4000-8000-000000000902','table_confirmed','Race','Race body','{"type":"table_confirmed"}',now(),'processing','terminal-race');
  perform public.mark_notification_events(array['00000000-0000-4000-8000-000000000986']::uuid[],'sent',null);
  begin perform public.mark_notification_events(array['00000000-0000-4000-8000-000000000986']::uuid[],'failed','late'); raise exception 'M42-ACT-006-race'; exception when others then if sqlerrm <> 'Notification event is not processing' then raise; end if; end;
  if (select status from public.notification_events where id='00000000-0000-4000-8000-000000000986') <> 'sent' then raise exception 'M42-ACT-006-state'; end if;
end; $$;
select 'ASSERT|M42-ACT-006|PASS|terminal sent irreversibility and late writer rejection';

create temp table pg_temp.m42_profile_matrix (
  case_id text primary key,
  ok boolean not null,
  code text not null,
  message text not null,
  before_status text,
  after_status text,
  audit_delta integer not null
);

create or replace function pg_temp.m42_profile_status_case(
  p_case_id text, p_caller uuid, p_target uuid, p_source_status text, p_desired text,
  p_reason text, p_expect_ok boolean, p_expect_code text, p_expect_message text,
  p_expect_status text, p_request_timestamp_mode text, p_response_timestamp_mode text
)
returns void
language plpgsql
as $m42$
declare
  v_before_status text;
  v_before_updated_at timestamptz;
  v_after_status text;
  v_after_updated_at timestamptz;
  v_expected_updated_at timestamptz;
  v_audit_before integer;
  v_audit_after integer;
  v_profile_count integer;
  v_result jsonb;
begin
  if p_source_status is not null then
    update public.profiles set moderation_status = p_source_status where id = p_target;
  end if;
  select moderation_status, updated_at into v_before_status, v_before_updated_at from public.profiles where id = p_target;
  select count(*) into v_audit_before from public.moderation_audit_log where target_user_id = p_target;
  if p_request_timestamp_mode = 'current' then v_expected_updated_at := v_before_updated_at;
  elsif p_request_timestamp_mode = 'stale' then v_expected_updated_at := v_before_updated_at - interval '1 microsecond';
  elsif p_request_timestamp_mode = 'arbitrary' then v_expected_updated_at := now();
  else v_expected_updated_at := null;
  end if;

  if p_request_timestamp_mode in ('current', 'stale') and p_target is not null then
    select count(*) into v_profile_count from public.profiles where id = p_target;
    if v_profile_count <> 1 then raise exception 'M42 profile % expected exactly one existing target row', p_case_id; end if;
  end if;

  perform set_config('request.jwt.claim.sub', p_caller::text, true);
  v_result := public.admin_set_moderation_status(p_target, p_desired, p_reason, v_expected_updated_at);
  if (v_result->>'ok')::boolean is distinct from p_expect_ok then raise exception 'M42 profile % ok', p_case_id; end if;
  if v_result->>'code' is distinct from p_expect_code then raise exception 'M42 profile % code', p_case_id; end if;
  if v_result->>'message' is distinct from p_expect_message then raise exception 'M42 profile % message', p_case_id; end if;
  if p_expect_status is null then
    if v_result->>'moderation_status' is not null then raise exception 'M42 profile % status-null', p_case_id; end if;
  elsif v_result->>'moderation_status' is distinct from p_expect_status then
    raise exception 'M42 profile % status', p_case_id;
  end if;
  if p_response_timestamp_mode = 'null' then
    if v_result->>'updated_at' is not null then raise exception 'M42 profile % timestamp-null', p_case_id; end if;
  elsif p_response_timestamp_mode = 'same' and p_target is not null then
    select moderation_status, updated_at into v_after_status, v_after_updated_at from public.profiles where id = p_target;
    if (v_result->>'updated_at')::timestamptz is distinct from v_before_updated_at then raise exception 'M42 profile % timestamp', p_case_id; end if;
  elsif p_response_timestamp_mode = 'db' and p_target is not null then
    select moderation_status, updated_at into v_after_status, v_after_updated_at from public.profiles where id = p_target;
    if (v_result->>'updated_at')::timestamptz is distinct from v_after_updated_at then raise exception 'M42 profile % timestamp', p_case_id; end if;
  end if;
  if p_target is not null and p_target <> '00000000-0000-4000-8000-000000000999'::uuid and v_after_status is null then
    select moderation_status, updated_at into v_after_status, v_after_updated_at from public.profiles where id = p_target;
  end if;
  select count(*) into v_audit_after from public.moderation_audit_log where target_user_id = p_target;
  if p_expect_ok then
    if v_after_status is distinct from p_desired or v_audit_after <> v_audit_before + 1 then raise exception 'M42 profile % success mutation', p_case_id; end if;
  else
    if p_target <> '00000000-0000-4000-8000-000000000999'::uuid and (v_after_status is distinct from v_before_status or v_after_updated_at is distinct from v_before_updated_at) then raise exception 'M42 profile % failure mutation', p_case_id; end if;
    if v_audit_after <> v_audit_before then raise exception 'M42 profile % failure audit', p_case_id; end if;
  end if;
  insert into pg_temp.m42_profile_matrix values (p_case_id, (v_result->>'ok')::boolean, v_result->>'code', v_result->>'message', v_before_status, v_after_status, v_audit_after - v_audit_before);
end;
$m42$;

select pg_temp.m42_profile_status_case('001-reviewer-limit','00000000-0000-4000-8000-000000000902','00000000-0000-4000-8000-000000000904','active','limited','reviewer limit',true,'updated','Profile limited','limited','current','db');
select pg_temp.m42_profile_status_case('002-reviewer-suspend','00000000-0000-4000-8000-000000000902','00000000-0000-4000-8000-000000000904','active','suspended','reviewer suspend',true,'updated','Profile suspended','suspended','current','db');
select pg_temp.m42_profile_status_case('003-reviewer-limited-to-suspended','00000000-0000-4000-8000-000000000902','00000000-0000-4000-8000-000000000904','limited','suspended','reviewer escalation',true,'updated','Profile suspended','suspended','current','db');
select pg_temp.m42_profile_status_case('004-reviewer-restore-forbidden','00000000-0000-4000-8000-000000000902','00000000-0000-4000-8000-000000000904','suspended','active','reviewer restore',false,'forbidden','Insufficient privileges',null,'current','null');
select pg_temp.m42_profile_status_case('005-admin-limit','00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000902','active','limited','admin limit',true,'updated','Profile limited','limited','current','db');
select pg_temp.m42_profile_status_case('006-admin-suspend','00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000902','active','suspended','admin suspend',true,'updated','Profile suspended','suspended','current','db');
select pg_temp.m42_profile_status_case('007-admin-suspended-to-active','00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000902','suspended','active','admin restore',true,'updated','Profile restored','active','current','db');
select pg_temp.m42_profile_status_case('008-admin-limited-to-active','00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000902','limited','active','admin restore limited',true,'updated','Profile restored','active','current','db');
select pg_temp.m42_profile_status_case('009-admin-already-active','00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000902','active','active','same active',false,'already_active','Profile is already active','active','current','same');
select pg_temp.m42_profile_status_case('010-admin-already-limited','00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000902','limited','limited','same limited',false,'already_limited','Profile is already limited','limited','current','same');
select pg_temp.m42_profile_status_case('011-admin-already-suspended','00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000902','suspended','suspended','same suspended',false,'already_suspended','Profile is already suspended','suspended','current','same');
select pg_temp.m42_profile_status_case('012-admin-suspended-to-limited','00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000902','suspended','limited','invalid transition',false,'invalid_transition','Invalid moderation status transition','suspended','current','same');
select pg_temp.m42_profile_status_case('013-invalid-desired-status','00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000902','active','deleted','invalid desired',false,'invalid_input','Invalid moderation status',null,'current','null');
select pg_temp.m42_profile_status_case('014-invalid-reason','00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000902','active','limited','',false,'invalid_input','Reason must be 1-500 characters',null,'current','null');
select pg_temp.m42_profile_status_case('015-null-expected-timestamp','00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000902','active','limited','null timestamp',false,'invalid_input','Expected profile timestamp is required',null,'null','null');
select pg_temp.m42_profile_status_case('016-null-profile-id','00000000-0000-4000-8000-000000000901',null,null,'limited','null profile',false,'invalid_input','Profile id is required',null,'null','null');
select pg_temp.m42_profile_status_case('017-missing-profile-limited','00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000999',null,'limited','missing limited',false,'not_found','Profile not found',null,'arbitrary','null');
select pg_temp.m42_profile_status_case('018-missing-profile-suspended','00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000999',null,'suspended','missing suspended',false,'not_found','Profile not found',null,'arbitrary','null');
select pg_temp.m42_profile_status_case('019-missing-profile-active','00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000999',null,'active','missing active',false,'not_found','Profile not found',null,'arbitrary','null');
select pg_temp.m42_profile_status_case('020-deleted-profile-limited','00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000905','deleted','limited','deleted limited',false,'not_found','Profile not found',null,'current','null');
select pg_temp.m42_profile_status_case('021-deleted-profile-suspended','00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000905','deleted','suspended','deleted suspended',false,'not_found','Profile not found',null,'current','null');
select pg_temp.m42_profile_status_case('022-deleted-profile-active','00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000905','deleted','active','deleted active',false,'not_found','Profile not found',null,'current','null');
select pg_temp.m42_profile_status_case('023-stale-timestamp','00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000902','active','limited','stale timestamp',false,'conflict','Profile was changed — refresh before acting','active','stale','same');
select pg_temp.m42_profile_status_case('024-nonstaff-forbidden','00000000-0000-4000-8000-000000000904','00000000-0000-4000-8000-000000000902','active','limited','nonstaff',false,'forbidden','Insufficient privileges',null,'current','null');

do $$
begin
  if (select count(*) from pg_temp.m42_profile_matrix) <> 24 then raise exception 'M42-ACT-STATUS-count'; end if;
end; $$;
select 'MATRIX|M42-ACT-STATUS-MATRIX|' || coalesce((select jsonb_agg(jsonb_build_object('case_id',case_id,'ok',ok,'code',code,'message',message,'before_status',before_status,'after_status',after_status,'audit_delta',audit_delta) order by case_id)::text from pg_temp.m42_profile_matrix), '[]');
select 'ASSERT|M42-ACT-STATUS-MATRIX|PASS|24 profile status cases with exact raw responses and zero-failure mutation/audit';
rollback;
-- END_PHASE actions
