-- M4.2 role-gated reads, claim/dismiss, and profile status actions.

create or replace function public.moderation_assert_staff(p_required_role text default 'reviewer')
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.admin_has_role(p_required_role) then raise exception 'Insufficient privileges'; end if;
end;
$$;
revoke all on function public.moderation_assert_staff(text) from public, anon, authenticated, service_role;

create or replace function public.moderation_encode_offset(p_offset integer)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select replace(replace(rtrim(encode(convert_to(p_offset::text, 'utf8'), 'base64'), '='), '+', '-'), '/', '_');
$$;
revoke all on function public.moderation_encode_offset(integer) from public, anon, authenticated, service_role;

create or replace function public.moderation_decode_offset(p_token text)
returns integer
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_value text;
  v_padding integer;
begin
  if p_token is null or p_token = '' or p_token !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'Page token is invalid';
  end if;
  v_padding := (4 - length(p_token) % 4) % 4;
  v_value := convert_from(decode(replace(replace(p_token, '-', '+'), '_', '/') || repeat('=', v_padding), 'base64'), 'utf8');
  if v_value !~ '^(0|[1-9][0-9]*)$' or v_value::bigint > 2147483647 then
    raise exception 'Page token is invalid';
  end if;
  return v_value::integer;
exception when others then
  raise exception 'Page token is invalid';
end;
$$;
revoke all on function public.moderation_decode_offset(text) from public, anon, authenticated, service_role;

create or replace function public.moderation_sanitize_snapshot(p_snapshot jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_item record;
begin
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    return '{}'::jsonb;
  end if;

  for v_item in select key, value from jsonb_each(p_snapshot) loop
    if v_item.key in ('email', 'body', 'requested_at') then
      continue;
    end if;
    if jsonb_typeof(v_item.value) = 'object' then
      if v_item.key = 'account_deletion' then
        v_result := v_result || jsonb_build_object(
          v_item.key,
          jsonb_build_object('requested_at', v_item.value->'requested_at')
        );
      else
        v_result := v_result || jsonb_build_object(v_item.key, public.moderation_sanitize_snapshot(v_item.value));
      end if;
    elsif jsonb_typeof(v_item.value) = 'array' then
      v_result := v_result || jsonb_build_object(v_item.key, '[]'::jsonb);
    else
      v_result := v_result || jsonb_build_object(v_item.key, v_item.value);
    end if;
  end loop;
  return v_result;
end;
$$;
revoke all on function public.moderation_sanitize_snapshot(jsonb) from public, anon, authenticated, service_role;

create or replace function public.moderation_snapshot_shape_valid(p_target_type text, p_snapshot jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_required text[];
  v_allowed text[];
begin
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then return false; end if;
  if p_target_type = 'account_deletion' then
    return (select count(*) from jsonb_object_keys(p_snapshot)) = 1
      and p_snapshot ? 'account_deletion'
      and jsonb_typeof(p_snapshot->'account_deletion') = 'object'
      and (select count(*) from jsonb_object_keys(p_snapshot->'account_deletion')) = 1
      and p_snapshot->'account_deletion' ? 'requested_at'
      and jsonb_typeof(p_snapshot->'account_deletion'->'requested_at') = 'string';
  end if;
  if p_target_type = 'profile' then
    v_required := array['display_name', 'moderation_status', 'created_at'];
  elsif p_target_type = 'table' then
    v_required := array['title', 'starts_at', 'status', 'creator_display_name'];
  elsif p_target_type = 'table_message' then
    v_required := array['body', 'sender_display_name', 'created_at'];
  else
    return false;
  end if;
  select coalesce(array_agg(key order by key), '{}') into v_allowed from jsonb_object_keys(p_snapshot) as keys(key);
  return v_allowed = (select array_agg(key order by key) from unnest(v_required) as required(key))
    and p_snapshot ?& v_required
    and not exists (
      select 1
      from unnest(v_required) as required_key(key)
      where jsonb_typeof(p_snapshot -> required_key.key) <> 'string'
    );
end;
$$;
revoke all on function public.moderation_snapshot_shape_valid(text, jsonb) from public, anon, authenticated, service_role;

create or replace function public.moderation_actor_label(p_actor_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(nullif(p.display_name, ''), 'Deleted staff')
  from public.profiles p
  where p.id = p_actor_id;
$$;
revoke all on function public.moderation_actor_label(uuid) from public, anon, authenticated, service_role;

create or replace function public.admin_queue_list(
  p_status text default 'all',
  p_target_type text default 'all',
  p_assignee text default 'all',
  p_page_size integer default 50,
  p_page_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offset integer := 0;
  v_total bigint;
  v_rows jsonb;
  v_summary jsonb;
begin
  perform public.moderation_assert_staff('reviewer');
  if p_status not in ('all', 'open', 'reviewing', 'actioned', 'dismissed') then raise exception 'Status filter is invalid'; end if;
  if p_target_type not in ('all', 'profile', 'table', 'table_message', 'message', 'conversation') then raise exception 'Target filter is invalid'; end if;
  if p_assignee not in ('all', 'me', 'unassigned') then raise exception 'Assignee filter is invalid'; end if;
  if p_page_size < 1 or p_page_size > 50 then raise exception 'Page size must be between 1 and 50'; end if;
  if p_page_token is not null then v_offset := public.moderation_decode_offset(p_page_token); end if;

  select count(*) into v_total
  from public.moderation_reports mr
  where (p_status = 'all' or mr.status = p_status)
    and (p_target_type = 'all' or mr.target_type = p_target_type)
    and (p_assignee = 'all' or (p_assignee = 'me' and mr.claimed_by = auth.uid()) or (p_assignee = 'unassigned' and mr.claimed_by is null));

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id, 'target_type', q.target_type, 'target_id', q.target_id,
    'status', q.status, 'reason', q.reason, 'created_at', q.created_at,
    'updated_at', q.updated_at, 'claimed_by', q.claimed_by,
    'claimed_at', q.claimed_at, 'sla_due_at', q.sla_due_at
  ) order by q.created_at desc, q.id desc), '[]'::jsonb)
  into v_rows
  from (
    select mr.*
    from public.moderation_reports mr
    where (p_status = 'all' or mr.status = p_status)
      and (p_target_type = 'all' or mr.target_type = p_target_type)
      and (p_assignee = 'all' or (p_assignee = 'me' and mr.claimed_by = auth.uid()) or (p_assignee = 'unassigned' and mr.claimed_by is null))
    order by mr.created_at desc, mr.id desc
    offset v_offset limit p_page_size
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object('status', s.status, 'count', s.count) order by s.status), '[]'::jsonb)
  into v_summary
  from (select status, count(*) from public.moderation_reports group by status) s;

  return jsonb_build_object(
    'rows', v_rows,
    'total', v_total,
    'summary', jsonb_build_object('status_counts', v_summary),
    'hasMore', v_offset + jsonb_array_length(v_rows) < v_total,
    'nextToken', case when v_offset + jsonb_array_length(v_rows) < v_total then public.moderation_encode_offset(v_offset + jsonb_array_length(v_rows)) else null end
  );
end;
$$;

create or replace function public.admin_report_detail(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_report public.moderation_reports;
  v_original_snapshot jsonb;
  v_snapshot jsonb;
  v_evidence jsonb := '[]'::jsonb;
  v_audit jsonb;
  v_reporter jsonb;
  v_reported jsonb;
begin
  perform public.moderation_assert_staff('reviewer');
  select * into v_report from public.moderation_reports where id = p_report_id;
  if not found then raise exception 'Report not found'; end if;

  v_original_snapshot := v_report.snapshot;
  v_snapshot := public.moderation_sanitize_snapshot(v_original_snapshot);
  if v_report.target_type in ('profile', 'table', 'table_message')
     and public.moderation_snapshot_shape_valid(v_report.target_type, v_original_snapshot)
     and v_report.target_type = 'profile' then
    v_evidence := jsonb_build_array(jsonb_build_object('kind', 'profile', 'data', v_snapshot));
  elsif v_report.target_type = 'table'
    and public.moderation_snapshot_shape_valid(v_report.target_type, v_original_snapshot) then
    v_evidence := jsonb_build_array(jsonb_build_object('kind', 'table', 'data', v_snapshot));
  elsif v_report.target_type = 'table_message'
    and public.moderation_snapshot_shape_valid(v_report.target_type, v_original_snapshot) then
    v_evidence := jsonb_build_array(jsonb_build_object('kind', 'table_message', 'redacted', true, 'data', jsonb_build_object(
      'sender_display_name', v_snapshot->'sender_display_name', 'created_at', v_snapshot->'created_at'
    )));
  elsif v_report.reason in ('account_deletion', 'account deletion')
    and public.moderation_snapshot_shape_valid('account_deletion', v_original_snapshot) then
    v_evidence := jsonb_build_array(jsonb_build_object('kind', 'account_deletion', 'data', v_snapshot->'account_deletion'));
  else
    v_evidence := jsonb_build_array(jsonb_build_object('kind', 'legacy_unavailable', 'data', '{}'::jsonb));
  end if;

  select jsonb_build_object('display_name', p.display_name, 'moderation_status', p.moderation_status, 'created_at', p.created_at, 'updated_at', p.updated_at)
  into v_reporter from public.profiles p where p.id = v_report.reporter_id;
  select jsonb_build_object('display_name', p.display_name, 'moderation_status', p.moderation_status, 'created_at', p.created_at, 'updated_at', p.updated_at)
  into v_reported from public.profiles p where p.id = v_report.reported_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'report_id', a.report_id, 'actor_id', a.actor_id,
    'actor_label', coalesce(nullif(a.actor_label, ''), 'Deleted staff'), 'action', a.action,
    'reason', a.reason, 'before_state', public.moderation_sanitize_snapshot(a.before_state),
    'after_state', public.moderation_sanitize_snapshot(a.after_state), 'created_at', a.created_at
  ) order by a.created_at desc, a.id desc), '[]'::jsonb)
  into v_audit from public.moderation_audit_log a where a.report_id = p_report_id;

  return jsonb_build_object(
    'report', jsonb_build_object(
      'id', v_report.id, 'reporter_id', v_report.reporter_id, 'reported_user_id', v_report.reported_user_id,
      'target_type', v_report.target_type, 'target_id', v_report.target_id, 'reason', v_report.reason,
      'details', v_report.details, 'snapshot', v_snapshot, 'status', v_report.status,
      'created_at', v_report.created_at, 'updated_at', v_report.updated_at,
      'claimed_by', v_report.claimed_by, 'claimed_at', v_report.claimed_at, 'sla_due_at', v_report.sla_due_at,
      'resolution', v_report.resolution, 'resolved_by', v_report.resolved_by, 'resolved_at', v_report.resolved_at
    ),
    'reporter', v_reporter,
    'reported_user', v_reported,
    'evidence', v_evidence,
    'audit', v_audit
  );
end;
$$;

create or replace function public.admin_audit_list(
  p_action text default 'all',
  p_actor_id uuid default null,
  p_page_size integer default 100,
  p_page_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offset integer := 0;
  v_total bigint;
  v_rows jsonb;
begin
  perform public.moderation_assert_staff('reviewer');
  if p_action not in ('all', 'claim', 'dismiss', 'action_content', 'limit_user', 'suspend_user', 'restore_user') then raise exception 'Action filter is invalid'; end if;
  if p_page_size < 1 or p_page_size > 100 then raise exception 'Page size must be between 1 and 100'; end if;
  if p_page_token is not null then v_offset := public.moderation_decode_offset(p_page_token); end if;
  select count(*) into v_total from public.moderation_audit_log a where (p_action = 'all' or a.action = p_action) and (p_actor_id is null or a.actor_id = p_actor_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id, 'report_id', q.report_id, 'actor_id', q.actor_id,
    'actor_label', coalesce(nullif(q.actor_label, ''), 'Deleted staff'), 'action', q.action,
    'reason', q.reason, 'before_state', public.moderation_sanitize_snapshot(q.before_state),
    'after_state', public.moderation_sanitize_snapshot(q.after_state), 'target_user_id', q.target_user_id,
    'created_at', q.created_at
  ) order by q.created_at desc, q.id desc), '[]'::jsonb)
  into v_rows
  from (select a.* from public.moderation_audit_log a where (p_action = 'all' or a.action = p_action) and (p_actor_id is null or a.actor_id = p_actor_id) order by a.created_at desc, a.id desc offset v_offset limit p_page_size) q;
  return jsonb_build_object('rows', v_rows, 'total', v_total, 'hasMore', v_offset + jsonb_array_length(v_rows) < v_total, 'nextToken', case when v_offset + jsonb_array_length(v_rows) < v_total then public.moderation_encode_offset(v_offset + jsonb_array_length(v_rows)) else null end);
end;
$$;

create or replace function public.moderation_claim(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_now timestamptz := now();
  v_report public.moderation_reports;
  v_before jsonb;
begin
  perform public.moderation_assert_staff('reviewer');
  select * into v_report from public.moderation_reports where id = p_report_id for update;
  if not found then raise exception 'Report not found'; end if;
  if v_report.status <> 'open' or v_report.claimed_by is not null then raise exception 'Report is already claimed or is not open'; end if;
  v_before := jsonb_build_object('status', v_report.status, 'claimed_by', v_report.claimed_by, 'claimed_at', v_report.claimed_at, 'sla_due_at', v_report.sla_due_at);
  update public.moderation_reports set status = 'reviewing', claimed_by = v_user, claimed_at = v_now, sla_due_at = v_now + interval '24 hours' where id = p_report_id;
  insert into public.moderation_audit_log(report_id, actor_id, actor_label, action, before_state, after_state)
  values (p_report_id, v_user, coalesce(public.moderation_actor_label(v_user), 'Deleted staff'), 'claim', v_before, jsonb_build_object('status','reviewing','claimed_by',v_user,'claimed_at',v_now,'sla_due_at',v_now + interval '24 hours'));
  return jsonb_build_object('id', p_report_id, 'status', 'reviewing', 'claimed_by', v_user, 'claimed_at', v_now, 'sla_due_at', v_now + interval '24 hours');
end;
$$;

create or replace function public.moderation_dismiss(p_report_id uuid, p_reason text, p_expected_updated_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid(); v_now timestamptz := now(); v_report public.moderation_reports; v_before jsonb;
begin
  perform public.moderation_assert_staff('reviewer');
  if p_report_id is null then raise exception 'Report id is required'; end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 1 and 500 then raise exception 'Reason must be 1-500 characters'; end if;
  if p_expected_updated_at is null then raise exception 'Expected report timestamp is required'; end if;
  select * into v_report from public.moderation_reports where id = p_report_id for update;
  if not found then raise exception 'Report not found'; end if;
  if v_report.updated_at <> p_expected_updated_at then raise exception 'Report was changed — refresh before acting'; end if;
  if v_report.status not in ('open','reviewing') then raise exception 'Report is already closed'; end if;
  v_before := jsonb_build_object('status',v_report.status,'resolution',v_report.resolution,'claimed_by',v_report.claimed_by);
  update public.moderation_reports set status='dismissed', resolution='dismissed', resolved_by=v_user, resolved_at=v_now, claimed_by=null where id=p_report_id;
  insert into public.moderation_audit_log(report_id,actor_id,actor_label,action,reason,before_state,after_state)
  values(p_report_id,v_user,coalesce(public.moderation_actor_label(v_user),'Deleted staff'),'dismiss',btrim(p_reason),v_before,jsonb_build_object('status','dismissed','resolution','dismissed','resolved_by',v_user,'resolved_at',v_now));
  return jsonb_build_object('id',p_report_id,'status','dismissed','resolution','dismissed','resolved_by',v_user,'resolved_at',v_now);
end;
$$;

create or replace function public.admin_set_moderation_status(p_user_id uuid, p_status text, p_reason text, p_expected_updated_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid(); v_role text; v_current text; v_updated timestamptz; v_action text; v_message text; v_before jsonb; v_now timestamptz := now();
begin
  if v_user is null then return jsonb_build_object('ok',false,'code','unauthorized','message','Authentication required','moderation_status',null,'updated_at',null); end if;
  if public.admin_has_role('admin') then v_role := 'admin'; elsif public.admin_has_role('reviewer') then v_role := 'reviewer'; else return jsonb_build_object('ok',false,'code','forbidden','message','Insufficient privileges','moderation_status',null,'updated_at',null); end if;
  if p_user_id is null then return jsonb_build_object('ok',false,'code','invalid_input','message','Profile id is required','moderation_status',null,'updated_at',null); end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 1 and 500 then return jsonb_build_object('ok',false,'code','invalid_input','message','Reason must be 1-500 characters','moderation_status',null,'updated_at',null); end if;
  if p_expected_updated_at is null then return jsonb_build_object('ok',false,'code','invalid_input','message','Expected profile timestamp is required','moderation_status',null,'updated_at',null); end if;
  if p_status not in ('active','limited','suspended') then return jsonb_build_object('ok',false,'code','invalid_input','message','Invalid moderation status','moderation_status',null,'updated_at',null); end if;
  if p_status='active' and v_role <> 'admin' then return jsonb_build_object('ok',false,'code','forbidden','message','Insufficient privileges','moderation_status',null,'updated_at',null); end if;
   select moderation_status, updated_at into v_current, v_updated from public.profiles where id=p_user_id for update;
  if v_current is null or v_current='deleted' then return jsonb_build_object('ok',false,'code','not_found','message','Profile not found','moderation_status',null,'updated_at',null); end if;
  if v_updated <> p_expected_updated_at then return jsonb_build_object('ok',false,'code','conflict','message','Profile was changed — refresh before acting','moderation_status',v_current,'updated_at',v_updated); end if;
  if v_current=p_status then
    if p_status='active' then v_action:='restore_user'; v_message:='Profile is already active';
    elsif p_status='limited' then v_action:='limit_user'; v_message:='Profile is already limited';
    else v_action:='suspend_user'; v_message:='Profile is already suspended'; end if;
     return jsonb_build_object(
       'ok', false,
       'code', case p_status when 'active' then 'already_active' when 'limited' then 'already_limited' else 'already_suspended' end,
       'message', v_message,
       'moderation_status', v_current,
       'updated_at', v_updated
     );
  end if;
  if p_status='limited' and v_current <> 'active' then return jsonb_build_object('ok',false,'code','invalid_transition','message','Invalid moderation status transition','moderation_status',v_current,'updated_at',v_updated); end if;
  if p_status='suspended' and v_current not in ('active','limited') then return jsonb_build_object('ok',false,'code','invalid_transition','message','Invalid moderation status transition','moderation_status',v_current,'updated_at',v_updated); end if;
  v_action := case p_status when 'limited' then 'limit_user' when 'suspended' then 'suspend_user' else 'restore_user' end;
  v_message := case p_status when 'limited' then 'Profile limited' when 'suspended' then 'Profile suspended' else 'Profile restored' end;
  v_before := jsonb_build_object('moderation_status',v_current,'updated_at',v_updated);
  update public.profiles set moderation_status=p_status where id=p_user_id returning updated_at into v_updated;
  insert into public.moderation_audit_log(actor_id,actor_label,action,reason,before_state,after_state,target_user_id) values(v_user,coalesce(public.moderation_actor_label(v_user),'Deleted staff'),v_action,btrim(p_reason),v_before,jsonb_build_object('moderation_status',p_status,'updated_at',v_updated),p_user_id);
  return jsonb_build_object('ok',true,'code','updated','message',v_message,'moderation_status',p_status,'updated_at',v_updated);
end;
$$;

-- Exact app-facing privilege boundary.
revoke all on function public.admin_queue_list(text,text,text,integer,text) from public, anon, authenticated, service_role;
grant execute on function public.admin_queue_list(text,text,text,integer,text) to authenticated, service_role;
revoke all on function public.admin_report_detail(uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_report_detail(uuid) to authenticated, service_role;
revoke all on function public.admin_audit_list(text,uuid,integer,text) from public, anon, authenticated, service_role;
grant execute on function public.admin_audit_list(text,uuid,integer,text) to authenticated, service_role;
revoke all on function public.moderation_claim(uuid) from public, anon, authenticated, service_role;
grant execute on function public.moderation_claim(uuid) to authenticated, service_role;
revoke all on function public.moderation_dismiss(uuid,text,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.moderation_dismiss(uuid,text,timestamptz) to authenticated, service_role;
revoke all on function public.admin_set_moderation_status(uuid,text,text,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.admin_set_moderation_status(uuid,text,text,timestamptz) to authenticated, service_role;
