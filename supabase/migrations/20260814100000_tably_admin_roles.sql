-- M4.2 role data. These are database data roles, never PostgreSQL roles.
create table public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('reviewer', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.admin_roles enable row level security;
revoke all on table public.admin_roles from public, anon, authenticated;
revoke truncate on table public.admin_roles from public, anon, authenticated;

create or replace function public.admin_has_role(p_required_role text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admin_roles ar
    join public.profiles p on p.id = ar.user_id
    where ar.user_id = auth.uid()
      and p.moderation_status <> 'deleted'
      and (ar.role = p_required_role or ar.role = 'admin')
      and p_required_role in ('reviewer', 'admin')
  );
$$;

revoke all on function public.admin_has_role(text) from public, anon, authenticated, service_role;

create or replace function public.admin_get_my_role()
returns text
language sql
security definer
set search_path = public, pg_temp
as $$
  select ar.role
  from public.admin_roles ar
  join public.profiles p on p.id = ar.user_id
  where ar.user_id = auth.uid()
    and p.moderation_status <> 'deleted'
  limit 1;
$$;

revoke all on function public.admin_get_my_role() from public, anon, authenticated, service_role;
grant execute on function public.admin_get_my_role() to authenticated, service_role;
