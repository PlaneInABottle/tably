create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '' check (char_length(display_name) <= 80),
  summary text not null default '' check (char_length(summary) <= 500),
  avatar_path text,
  location extensions.geography(Point, 4326),
  show_location boolean not null default false,
  is_first_login boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_email_idx on public.profiles (lower(email));

create index profiles_location_gix on public.profiles using gist (location) where location is not null;

alter table public.profiles enable row level security;

create policy profiles_select_own
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy profiles_update_own
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.protect_profile_server_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'profiles.id is read-only';
  end if;

  if new.email is distinct from old.email then
    raise exception 'profiles.email is read-only';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'profiles.created_at is read-only';
  end if;

  if new.updated_at is distinct from old.updated_at then
    raise exception 'profiles.updated_at is trigger-managed';
  end if;

  if new.avatar_path is distinct from old.avatar_path then
    raise exception 'profiles.avatar_path is reserved for Phase 5 avatar storage';
  end if;

  if new.location is distinct from old.location then
    raise exception 'profiles.location requires Phase 2 location RPCs';
  end if;

  if new.show_location is distinct from old.show_location then
    raise exception 'profiles.show_location requires Phase 2 location RPCs';
  end if;

  return new;
end;
$$;

create trigger trg_10_protect_profile_server_fields
before update on public.profiles
for each row
execute function public.protect_profile_server_fields();

create trigger trg_20_set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(coalesce(new.email, ''), '@', 1))
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();
