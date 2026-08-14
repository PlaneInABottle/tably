\set ON_ERROR_STOP on

-- Disposable staff fixture. The local harness authenticates these ids through
-- request.jwt.claim.sub; no production credentials are stored here.
insert into public.admin_roles (user_id, role)
values ('00000000-0000-4000-8000-000000000901', 'admin')
on conflict (user_id) do update set role = excluded.role;

insert into public.admin_roles (user_id, role)
values ('00000000-0000-4000-8000-000000000902', 'reviewer')
on conflict (user_id) do update set role = excluded.role;

insert into public.admin_roles (user_id, role)
values ('00000000-0000-4000-8000-000000000905', 'admin')
on conflict (user_id) do update set role = excluded.role;

insert into public.admin_roles (user_id, role)
values ('00000000-0000-4000-8000-000000000906', 'reviewer')
on conflict (user_id) do update set role = excluded.role;
