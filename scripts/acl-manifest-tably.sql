\set ON_ERROR_STOP on

-- M4.1 is deliberately checked against the pre-admin function inventory.  M4.2
-- appends its role/admin/worker rows; this file must not name those objects.
begin;

create temporary table tably_acl_expected (
  signature text primary key,
  is_security_definer boolean not null,
  expected_search_path text not null,
  public_execute boolean not null,
  anon_execute boolean not null,
  authenticated_execute boolean not null,
  service_role_execute boolean not null
);

insert into tably_acl_expected values
  ('public.submit_report(text,uuid,text,text)', true, 'public, pg_temp', false, false, true, true),
  ('public.block_user(uuid,text)', true, 'public, pg_temp', false, false, true, true),
  ('public.unblock_user(uuid)', true, 'public, pg_temp', false, false, true, true),
  ('public.list_blocked_users()', true, 'public, pg_temp', false, false, true, true),
  ('public.accept_current_terms()', true, 'public, pg_temp', false, false, true, true),
  ('public.upsert_push_token(text,text,text)', true, 'public, pg_temp', false, false, true, true),
  ('public.delete_push_token(text)', true, 'public, pg_temp', false, false, true, true),
  ('public.get_notification_preferences()', true, 'public, pg_temp', false, false, true, true),
  ('public.update_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean)', true, 'public, pg_temp', false, false, true, true),
  ('public.create_social_table(text,text,text,text,text,timestamptz,double precision,double precision,integer,integer,text)', true, 'public, extensions, pg_temp', false, false, true, true),
  ('public.join_social_table(uuid)', true, 'public, pg_temp', false, false, true, true),
  ('public.answer_table_intro(uuid,text)', true, 'public, pg_temp', false, false, true, true),
  ('public.confirm_table_attendance(uuid)', true, 'public, pg_temp', false, false, true, true),
  ('public.leave_social_table(uuid)', true, 'public, pg_temp', false, false, true, true),
  ('public.list_social_tables(double precision,double precision,double precision,double precision)', true, 'public, extensions, pg_temp', false, false, true, true),
  ('public.get_social_table_detail(uuid)', true, 'public, extensions, pg_temp', false, false, true, true),
  ('public.list_table_members(uuid)', true, 'public, pg_temp', false, false, true, true),
  ('public.list_table_messages(uuid)', true, 'public, pg_temp', false, false, true, true),
  ('public.list_my_active_tables()', true, 'public, pg_temp', false, false, true, true),
  ('public.send_table_message(uuid,text)', true, 'public, pg_temp', false, false, true, true),
  ('public.create_profile_location(text,double precision,double precision,boolean)', true, 'public, extensions, pg_temp', false, false, true, true),
  ('public.update_profile_location(uuid,text,double precision,double precision)', true, 'public, extensions, pg_temp', false, false, true, true),
  ('public.delete_profile_location(uuid)', true, 'public, pg_temp', false, false, true, true),
  ('public.list_own_profile_locations()', true, 'public, extensions, pg_temp', false, false, true, true),
  ('public.update_own_location(double precision,double precision)', true, 'public, extensions, pg_temp', false, false, true, true),
  ('public.delete_own_location()', true, 'public, extensions, pg_temp', false, false, true, true),
  ('public.list_own_dives()', true, 'public, extensions, pg_temp', false, false, true, true),
  ('public.get_own_dive()', true, 'public, extensions, pg_temp', false, false, true, true),
  ('public.upsert_own_dive(double precision,double precision,timestamptz,text,text,uuid)', true, 'public, extensions, pg_temp', false, false, true, true),
  ('public.upsert_own_dive_from_location(uuid,timestamptz,text,text,uuid)', true, 'public, extensions, pg_temp', false, false, true, true),
  ('public.delete_own_dive(uuid)', true, 'public, pg_temp', false, false, true, true),
  ('public.dives_in_view(double precision,double precision,double precision,double precision)', true, 'public, extensions, pg_temp', false, false, true, true),
  ('public.users_in_view(double precision,double precision,double precision,double precision)', true, 'public, extensions, pg_temp', false, false, true, true),
  ('public.share_profile_location_on_map(uuid)', true, 'public, extensions, pg_temp', false, false, true, true),
  ('public.unshare_profile_location_from_map()', true, 'public, pg_temp', false, false, true, true),
  ('public.update_own_avatar_path(text)', true, 'public, storage, pg_temp', false, false, true, true),
  ('public.clear_own_avatar_path()', true, 'public, pg_temp', false, false, true, true),
  ('public.upsert_conversation(uuid)', true, 'public, pg_temp', false, false, true, true),
  ('public.get_conversations_with_latest_message()', true, 'public, pg_temp', false, false, true, true),
  ('public.get_messages_by_conversation_id(uuid,timestamptz,integer)', true, 'public, pg_temp', false, false, true, true),
  ('public.send_message(uuid,text)', true, 'public, pg_temp', false, false, true, true),
  ('public.claim_notification_events(integer)', true, 'public, pg_temp', false, false, false, true),
  ('public.mark_notification_events(uuid[],text,text)', true, 'public, pg_temp', false, false, false, true),
  ('public.refresh_table_status(uuid)', true, 'public, pg_temp', false, false, false, true),
  ('public.release_expired_table_seats(uuid)', true, 'public, pg_temp', false, false, false, true),
  ('public.ensure_terms_accepted()', true, 'public, pg_temp', false, false, false, false),
  ('public.contains_objectionable_content(text)', false, 'public, pg_temp', false, false, false, false),
  ('public.reject_objectionable_text(text)', true, 'public, pg_temp', false, false, false, false),
  ('public.reject_objectionable_profile_text()', true, 'public, pg_temp', false, false, false, false),
  ('public.is_blocked_between(uuid,uuid)', true, 'public, pg_temp', false, false, false, false),
  ('public.can_current_user_read_conversation(uuid)', true, 'public, pg_temp', false, false, false, false),
  ('public.is_conversation_participant(uuid,uuid)', true, 'public, pg_temp', false, false, false, false),
  ('public.is_current_user_conversation_participant(uuid)', true, 'public, pg_temp', false, false, false, false),
  ('public.is_current_table_member(uuid)', true, 'public, pg_temp', false, false, false, false),
  ('public.current_profile_moderation_status()', true, 'public, pg_temp', false, false, false, false),
  ('public.require_active_profile()', true, 'public, pg_temp', false, false, false, false),
  ('public.queue_notification_event(uuid,uuid,text,text,text,jsonb,timestamptz,text)', true, 'public, pg_temp', false, false, false, false),
  ('public.ensure_notification_preferences(uuid)', true, 'public, pg_temp', false, false, false, false),
  ('public.validate_profile_location_input(text,double precision,double precision)', true, 'public, extensions, pg_temp', false, false, false, false),
  ('public.mirror_public_profile_location(uuid,geography)', true, 'public, pg_temp', false, false, false, false),
  ('public.handle_new_user()', true, 'public, auth, pg_temp', false, false, false, false),
  ('public.protect_chat_server_fields()', true, 'public, pg_temp', false, false, false, false),
  ('public.protect_dive_server_fields()', true, 'public, pg_temp', false, false, false, false),
  ('public.protect_profile_location_writes()', true, 'public, pg_temp', false, false, false, false),
  ('public.protect_profile_server_fields()', true, 'public, pg_temp', false, false, false, false),
  ('public.protect_tably_server_fields()', true, 'public, pg_temp', false, false, false, false),
  ('public.set_updated_at()', true, 'public, pg_temp', false, false, false, false),
  ('public.admin_has_role(text)', true, 'public, pg_temp', false, false, false, false);

do $$
declare
  v_missing text;
  v_bad text;
begin
  select string_agg(e.signature, ', ' order by e.signature)
  into v_missing
  from tably_acl_expected e
  where to_regprocedure(e.signature) is null;
  if v_missing is not null then
    raise exception 'ACL manifest missing catalog signatures: %', v_missing;
  end if;

  select string_agg(e.signature, ', ' order by e.signature)
  into v_bad
  from tably_acl_expected e
  join pg_proc p on p.oid = to_regprocedure(e.signature)
  where p.prosecdef is distinct from e.is_security_definer
     or coalesce(array_to_string(p.proconfig, ','), '') <> 'search_path=' || e.expected_search_path
     or has_function_privilege('public', e.signature, 'EXECUTE') is distinct from e.public_execute
     or has_function_privilege('anon', e.signature, 'EXECUTE') is distinct from e.anon_execute
     or has_function_privilege('authenticated', e.signature, 'EXECUTE') is distinct from e.authenticated_execute
     or has_function_privilege('service_role', e.signature, 'EXECUTE') is distinct from e.service_role_execute;
  if v_bad is not null then
    raise exception 'ACL manifest privilege/config mismatch: %', v_bad;
  end if;

  if (select count(*) from tably_acl_expected) <> 68 then
    raise exception 'ACL manifest row count drifted';
  end if;
end;
$$;

select 'tably_acl_manifest_passed' as result;
rollback;
