-- M4.2 final content action and notification scrub owner.
create or replace function public.moderation_action_content(
  p_report_id uuid,
  p_reason text,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_now timestamptz := now();
  v_report public.moderation_reports;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_target_exists boolean := false;
  v_scrubbed_queued integer := 0;
  v_scrubbed_processing integer := 0;
  v_sanitized_sent integer := 0;
  v_legacy_unscrubbable integer := 0;
  v_before jsonb;
  v_after jsonb;
begin
  perform public.moderation_assert_staff('reviewer');
  if p_report_id is null then raise exception 'Report id is required'; end if;
  if char_length(v_reason) not between 1 and 500 then raise exception 'Reason must be 1-500 characters'; end if;
  if p_expected_updated_at is null then raise exception 'Expected report timestamp is required'; end if;

  select * into v_report from public.moderation_reports where id = p_report_id for update;
  if not found then raise exception 'Report not found'; end if;
  if v_report.updated_at <> p_expected_updated_at then raise exception 'Report was changed — refresh before acting'; end if;
  if v_report.status not in ('open', 'reviewing') then raise exception 'Report is already closed'; end if;
  if v_report.target_type not in ('table', 'table_message') then raise exception 'Content action unavailable for this target'; end if;
  v_before := jsonb_build_object('status', v_report.status, 'resolution', v_report.resolution, 'claimed_by', v_report.claimed_by);

  perform set_config('app.tably_rpc', 'on', true);
  perform set_config('app.tably_moderation_content_removal', 'on', true);

  if v_report.target_type = 'table' then
    select exists(select 1 from public.social_tables where id=v_report.target_id and content_removed_at is null) into v_target_exists;
    if v_target_exists then
      update public.social_tables set content_removed_at=v_now where id=v_report.target_id;
    end if;
    select count(*) filter (where status='queued'), count(*) filter (where status='processing'), count(*) filter (where status='sent'), count(*) filter (where type='table_message' and table_message_id is null)
      into v_scrubbed_queued, v_scrubbed_processing, v_sanitized_sent, v_legacy_unscrubbable
      from public.notification_events where table_id=v_report.target_id;
    update public.notification_events
       set status = case when status in ('queued','processing') then 'skipped' else status end,
           error = case when status in ('queued','processing') then 'Content removed by moderation.' else error end,
           processing_started_at = case when status in ('queued','processing') then null else processing_started_at end,
           title = 'Notification unavailable', body = 'This notification was removed.', data = jsonb_build_object('type','content_removed')
     where table_id=v_report.target_id;
  else
    select exists(select 1 from public.table_messages where id=v_report.target_id and content_removed_at is null) into v_target_exists;
    if v_target_exists then update public.table_messages set content_removed_at=v_now where id=v_report.target_id; end if;
    select count(*) filter (where status='queued'), count(*) filter (where status='processing'), count(*) filter (where status='sent')
      into v_scrubbed_queued, v_scrubbed_processing, v_sanitized_sent
      from public.notification_events where table_message_id=v_report.target_id;
    select count(*) into v_legacy_unscrubbable
      from public.notification_events where table_id=(select table_id from public.table_messages where id=v_report.target_id) and type='table_message' and table_message_id is null;
    update public.notification_events
       set status = case when status in ('queued','processing') then 'skipped' else status end,
           error = case when status in ('queued','processing') then 'Content removed by moderation.' else error end,
           processing_started_at = case when status in ('queued','processing') then null else processing_started_at end,
           title = 'Notification unavailable', body = 'This notification was removed.', data = jsonb_build_object('type','content_removed')
     where table_message_id=v_report.target_id;
  end if;

  update public.moderation_reports
     set status='actioned', resolution='content_removed', resolved_by=v_user, resolved_at=v_now, claimed_by=null
   where id=p_report_id and updated_at=p_expected_updated_at and status in ('open','reviewing');
  if not found then raise exception 'Report was changed — refresh before acting'; end if;

  v_after := jsonb_build_object('status','actioned','resolution','content_removed','resolved_by',v_user,'resolved_at',v_now,'target_exists',v_target_exists,'scrubbed_queued_count',v_scrubbed_queued,'scrubbed_processing_count',v_scrubbed_processing,'sanitized_sent_count',v_sanitized_sent,'legacy_unscrubbable_count',v_legacy_unscrubbable);
  insert into public.moderation_audit_log(report_id,actor_id,actor_label,action,reason,before_state,after_state)
  values(p_report_id,v_user,coalesce(public.moderation_actor_label(v_user),'Deleted staff'),'action_content',v_reason,public.moderation_sanitize_snapshot(v_before),public.moderation_sanitize_snapshot(v_after));
  return jsonb_build_object('id',p_report_id,'status','actioned','resolution','content_removed','target_exists',v_target_exists,'scrubbed_queued_count',v_scrubbed_queued,'scrubbed_processing_count',v_scrubbed_processing,'sanitized_sent_count',v_sanitized_sent,'legacy_unscrubbable_count',v_legacy_unscrubbable);
end;
$$;

revoke all on function public.moderation_action_content(uuid,text,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.moderation_action_content(uuid,text,timestamptz) to authenticated, service_role;
