create or replace function public.protect_tably_server_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('app.tably_rpc', true), '') <> 'on'
    and not (tg_op = 'DELETE' and pg_trigger_depth() > 1)
  then
    raise exception 'Tably tables require RPC access';
  end if;

  return coalesce(new, old);
end;
$$;
