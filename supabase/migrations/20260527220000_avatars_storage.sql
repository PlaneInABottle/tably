insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_owner_select
on storage.objects for select
to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_owner_insert
on storage.objects for insert
to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_owner_update
on storage.objects for update
to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_owner_delete
on storage.objects for delete
to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_referenced_authenticated_select
on storage.objects for select
to authenticated
using (
  bucket_id = 'avatars'
  and exists (
    select 1
    from public.profiles p
    where p.avatar_path = storage.objects.name
  )
);

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

  if new.avatar_path is distinct from old.avatar_path
    and coalesce(current_setting('app.avatar_rpc', true), '') <> 'on' then
    raise exception 'profiles.avatar_path requires Phase 5 avatar RPC';
  end if;

  if (new.location is distinct from old.location or new.show_location is distinct from old.show_location)
    and coalesce(current_setting('app.location_rpc', true), '') <> 'on' then
    raise exception 'profiles.location requires Phase 2 location RPCs';
  end if;

  return new;
end;
$$;

create or replace function public.update_own_avatar_path(p_path text)
returns table (avatar_path text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_path is null or btrim(p_path) = '' then
    raise exception 'Avatar path is required';
  end if;

  if p_path not like v_user_id::text || '/%' then
    raise exception 'Avatar path must be in your own folder';
  end if;

  if p_path !~* ('^' || v_user_id::text || '/avatar\.(jpe?g|png|webp)$') then
    raise exception 'Avatar path must match pattern: <user_id>/avatar.<ext>';
  end if;

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'avatars'
      and o.name = p_path
  ) then
    raise exception 'Avatar object not found in storage';
  end if;

  perform set_config('app.avatar_rpc', 'on', true);

  update public.profiles
  set avatar_path = p_path
  where id = v_user_id;

  return query
  select p.avatar_path, p.updated_at
  from public.profiles p
  where p.id = v_user_id;
end;
$$;

create or replace function public.clear_own_avatar_path()
returns table (avatar_path text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform set_config('app.avatar_rpc', 'on', true);

  update public.profiles
  set avatar_path = null
  where id = v_user_id;

  return query
  select p.avatar_path, p.updated_at
  from public.profiles p
  where p.id = v_user_id;
end;
$$;

revoke all on function public.update_own_avatar_path(text) from public;
revoke all on function public.clear_own_avatar_path() from public;

grant execute on function public.update_own_avatar_path(text) to authenticated;
grant execute on function public.clear_own_avatar_path() to authenticated;
