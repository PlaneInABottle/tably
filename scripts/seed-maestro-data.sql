\set ON_ERROR_STOP on

create or replace function pg_temp.create_maestro_user(
  p_id uuid,
  p_email text,
  p_password text,
  p_display_name text,
  p_lng double precision default null,
  p_lat double precision default null,
  p_dive_title text default null,
  p_dive_description text default null
)
returns void
language plpgsql
set search_path = public, auth, extensions, pg_temp
as $$
begin
  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    confirmation_token,
    recovery_token,
    email_change,
    email_change_token_new,
    email_confirmed_at,
    confirmation_sent_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  values (
    p_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    p_email,
    crypt(p_password, gen_salt('bf')),
    '',
    '',
    '',
    '',
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', p_display_name),
    now(),
    now()
  )
  on conflict (id) do update
  set email = excluded.email,
      encrypted_password = excluded.encrypted_password,
      confirmation_token = '',
      recovery_token = '',
      email_change = '',
      email_change_token_new = '',
      email_confirmed_at = excluded.email_confirmed_at,
      raw_user_meta_data = excluded.raw_user_meta_data,
      updated_at = now();

  insert into auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    p_id,
    p_id,
    p_id::text,
    jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
    'email',
    now(),
    now(),
    now()
  )
  on conflict (provider, provider_id) do update
  set user_id = excluded.user_id,
      identity_data = excluded.identity_data,
      updated_at = now();

  update public.profiles
  set display_name = p_display_name,
      summary = '',
      is_first_login = false
  where id = p_id;

  if p_lng is not null and p_lat is not null then
    perform set_config('app.location_rpc', 'on', true);

    update public.profiles
    set location = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
        show_location = true
    where id = p_id;

    perform set_config('app.profile_location_rpc', 'on', true);

    insert into public.profile_locations (owner_id, label, location, is_public_map_location)
    values (
      p_id,
      'Public map location',
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      true
    )
    on conflict do nothing;
  end if;

  if p_dive_description is not null then
    perform set_config('app.dive_rpc', 'on', true);

    insert into public.dives (
      created_by,
      title,
      description,
      event_at,
      location,
      location_id,
      location_label_snapshot
    )
    values (
      p_id,
      p_dive_title,
      p_dive_description,
      now() + interval '1 day',
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      (
        select id
        from public.profile_locations
        where owner_id = p_id and is_public_map_location = true and is_active = true
        limit 1
      ),
      'Public map location'
    );
  end if;
end;
$$;

select pg_temp.create_maestro_user(
  '00000000-0000-4000-8000-000000000201',
  'phase2.search@example.com',
  :'password',
  'Maya Solana',
  28.979530,
  41.015137
);

select pg_temp.create_maestro_user(
  '00000000-0000-4000-8000-000000000202',
  'phase2.inside@example.com',
  :'password',
  'Levi Kline',
  28.980000,
  41.016000
);

select pg_temp.create_maestro_user(
  '00000000-0000-4000-8000-000000000203',
  'phase2.outside@example.com',
  :'password',
  'Sofia Marin',
  29.400000,
  41.400000
);

select pg_temp.create_maestro_user(
  '00000000-0000-4000-8000-000000000301',
  'phase3.map@example.com',
  :'password',
  'Kai Navarro',
  28.979530,
  41.015137
);

select pg_temp.create_maestro_user(
  '00000000-0000-4000-8000-000000000302',
  'phase3.dive.inside@example.com',
  :'password',
  'Riley Chen',
  28.981000,
  41.017000,
  'Bosphorus Dawn Shelf Dive',
  'Meet for a dawn shore dive in Istanbul with a realistic buddy layout.'
);

select pg_temp.create_maestro_user(
  '00000000-0000-4000-8000-000000000303',
  'phase3.dive.outside@example.com',
  :'password',
  'Jonah Ellis',
  29.400000,
  41.400000,
  'Adalar Bluewater Sweep',
  'A longer offshore training dive outside the normal viewport for filtering checks.'
);

select pg_temp.create_maestro_user(
  '00000000-0000-4000-8000-000000000401',
  'phase4.chat.user@example.com',
  :'password',
  'Ari Stone',
  28.979530,
  41.015137
);

select pg_temp.create_maestro_user(
  '00000000-0000-4000-8000-000000000402',
  'phase4.chat.event@example.com',
  :'password',
  'Lena Cruz',
  28.982000,
  41.018000,
  'Karaköy Night Current Survey',
  'Night chat validation dive with safety check-ins every 15 minutes.'
);

select pg_temp.create_maestro_user(
  '00000000-0000-4000-8000-000000000501',
  'phase5.profile@example.com',
  :'password',
  'Mina Patel'
);

select pg_temp.create_maestro_user(
  '00000000-0000-4000-8000-000000000502',
  'phase5.password@example.com',
  :'password',
  'Noah Quinn'
);

do $$
declare
  v_conversation_id uuid;
begin
  perform set_config('app.chat_rpc', 'on', true);

  insert into public.conversations (participant_low, participant_high)
  values (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000402'
  )
  on conflict (participant_low, participant_high) do update
  set updated_at = public.conversations.updated_at
  returning id into v_conversation_id;

  insert into public.conversation_participants (conversation_id, profile_id)
  values
    (v_conversation_id, '00000000-0000-4000-8000-000000000201'),
    (v_conversation_id, '00000000-0000-4000-8000-000000000402')
  on conflict do nothing;

  insert into public.messages (conversation_id, sender_id, body)
  select v_conversation_id,
         '00000000-0000-4000-8000-000000000402',
         'Seeded chat from Phase Four Event'
  where not exists (
    select 1
    from public.messages m
    where m.conversation_id = v_conversation_id
      and m.body = 'Seeded chat from Phase Four Event'
  );
end;
$$;

do $$
begin
  perform set_config('app.profile_location_rpc', 'on', true);

  insert into public.profile_locations (owner_id, label, location, is_public_map_location)
  values
    (
      '00000000-0000-4000-8000-000000000301',
      'Backup Reef',
      ST_SetSRID(ST_MakePoint(28.986000, 41.019000), 4326)::geography,
      false
    ),
    (
      '00000000-0000-4000-8000-000000000401',
      'Private Training Pool',
      ST_SetSRID(ST_MakePoint(28.983000, 41.014000), 4326)::geography,
      false
    )
  on conflict do nothing;
end;
$$;
