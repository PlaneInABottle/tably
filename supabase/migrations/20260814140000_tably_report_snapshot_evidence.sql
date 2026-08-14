-- M4.2 report-time evidence snapshots. New reports never reconstruct live content.
create or replace function public.submit_report(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_details text default ''
)
returns table (id uuid, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reporter uuid := auth.uid();
  v_target_type text := btrim(coalesce(p_target_type, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_details text := btrim(coalesce(p_details, ''));
  v_reported uuid;
  v_snapshot jsonb := '{}'::jsonb;
begin
  if v_reporter is null then raise exception 'Authentication required'; end if;
  if v_target_type not in ('profile','table','table_message','message','conversation') then raise exception 'Report target is invalid'; end if;
  if v_reason not in ('Harassment or abuse','Hate or discrimination','Sexual content','Spam or scam','Unsafe meetup behavior','Other') then raise exception 'Report reason is invalid'; end if;
  if char_length(v_details) > 1000 then raise exception 'Report details must be 1000 characters or fewer'; end if;

  if v_target_type = 'profile' then
    select p.id, jsonb_build_object('display_name',p.display_name,'moderation_status',p.moderation_status,'created_at',p.created_at)
      into v_reported, v_snapshot from public.profiles p where p.id=p_target_id;
  elsif v_target_type = 'table' then
    select st.created_by, jsonb_build_object('title',st.title,'starts_at',st.starts_at,'status',st.status,'creator_display_name',p.display_name)
      into v_reported, v_snapshot from public.social_tables st join public.profiles p on p.id=st.created_by where st.id=p_target_id;
  elsif v_target_type = 'table_message' then
    select tm.sender_id, jsonb_build_object('body',tm.body,'sender_display_name',p.display_name,'created_at',tm.created_at)
      into v_reported, v_snapshot from public.table_messages tm join public.profiles p on p.id=tm.sender_id where tm.id=p_target_id;
  elsif v_target_type = 'message' then
    select m.sender_id, jsonb_build_object('sender_display_name',p.display_name,'created_at',m.created_at)
      into v_reported, v_snapshot from public.messages m join public.profiles p on p.id=m.sender_id where m.id=p_target_id;
  else
    select cp.profile_id, jsonb_build_object('target_type','conversation')
      into v_reported, v_snapshot from public.conversation_participants cp where cp.conversation_id=p_target_id and cp.profile_id<>v_reporter limit 1;
  end if;
  if v_reported is null then raise exception 'Report target was not found'; end if;

  return query
  insert into public.moderation_reports(reporter_id,reported_user_id,target_type,target_id,reason,details,snapshot)
  values(v_reporter,v_reported,v_target_type,p_target_id,v_reason,v_details,coalesce(v_snapshot,'{}'::jsonb))
  returning moderation_reports.id, moderation_reports.status, moderation_reports.created_at;
end;
$$;

revoke all on function public.submit_report(text,uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.submit_report(text,uuid,text,text) to authenticated, service_role;
