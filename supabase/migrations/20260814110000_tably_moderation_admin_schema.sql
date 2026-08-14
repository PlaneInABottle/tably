-- M4.2 moderation report concurrency, final disposition, audit, and visibility state.
alter table public.moderation_reports
  add column if not exists claimed_by uuid references public.profiles(id) on delete set null,
  add column if not exists claimed_at timestamptz,
  add column if not exists sla_due_at timestamptz,
  add column if not exists resolution text,
  add column if not exists resolved_by uuid references public.profiles(id) on delete set null,
   add column if not exists resolved_at timestamptz;

alter table public.moderation_reports
  drop constraint if exists moderation_reports_target_type_check;
alter table public.moderation_reports
  add constraint moderation_reports_target_type_check
  check (target_type in ('profile', 'dive', 'table', 'table_message', 'message', 'conversation'));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'moderation_reports_resolution_check') then
    alter table public.moderation_reports
      add constraint moderation_reports_resolution_check
      check (resolution is null or resolution in ('dismissed', 'content_removed'));
  end if;
end;
$$;

create or replace function public.trg_admin_reports_clear_claim()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.claimed_by is null and old.claimed_by is not null then
    new.claimed_at := null;
    new.sla_due_at := null;
    if new.status = 'reviewing' and new.resolution is null then
      new.status := 'open';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_30_admin_reports_clear_claim on public.moderation_reports;
create trigger trg_30_admin_reports_clear_claim
before update on public.moderation_reports
for each row execute function public.trg_admin_reports_clear_claim();
revoke all on function public.trg_admin_reports_clear_claim() from public, anon, authenticated, service_role;

create table public.moderation_audit_log (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.moderation_reports(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_label text not null default '',
  action text not null check (action in ('claim', 'dismiss', 'action_content', 'limit_user', 'suspend_user', 'restore_user')),
  reason text check (reason is null or char_length(btrim(reason)) between 1 and 500),
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  target_user_id uuid,
  created_at timestamptz not null default now()
);

create index moderation_audit_log_report_created_idx
  on public.moderation_audit_log (report_id, created_at desc);
create index moderation_audit_log_action_created_idx
  on public.moderation_audit_log (action, created_at desc);

alter table public.moderation_audit_log enable row level security;
revoke all on table public.moderation_audit_log from public, anon, authenticated;
revoke truncate on table public.moderation_audit_log from public, anon, authenticated;

create or replace function public.trg_admin_audit_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'moderation_audit_log is append-only';
end;
$$;

drop trigger if exists trg_31_admin_audit_append_only on public.moderation_audit_log;
create trigger trg_31_admin_audit_append_only
before update or delete on public.moderation_audit_log
for each row execute function public.trg_admin_audit_append_only();
revoke all on function public.trg_admin_audit_append_only() from public, anon, authenticated, service_role;

alter table public.dives add column if not exists content_removed_at timestamptz;
alter table public.messages add column if not exists content_removed_at timestamptz;
alter table public.conversations add column if not exists content_removed_at timestamptz;

create index if not exists dives_visible_idx on public.dives (created_at desc) where content_removed_at is null;
create index if not exists messages_visible_idx on public.messages (conversation_id, created_at) where content_removed_at is null;
create index if not exists conversations_visible_idx on public.conversations (updated_at desc) where content_removed_at is null;

revoke truncate on table public.moderation_reports from public, anon, authenticated;
