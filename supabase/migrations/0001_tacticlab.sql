-- TacticLab: contas, sincronização e salas colaborativas.
-- Toda autorização fica aqui, no banco. O site só tem a chave pública, então nenhuma regra
-- de acesso pode depender do que o navegador decide fazer.

-- ---------------------------------------------------------------------------
-- Dados pessoais: cada usuário só enxerga e altera o que é dele.
-- ---------------------------------------------------------------------------
create table public.strategies (
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  name text not null check (char_length(name) <= 120),
  map_id text not null,
  side text not null check (side in ('attack', 'defense')),
  doc jsonb not null check (octet_length(doc::text) <= 2000000),
  updated_at timestamptz not null default now(),
  primary key (owner, id)
);

create table public.lineups (
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  map_id text not null,
  doc jsonb not null check (octet_length(doc::text) <= 200000),
  updated_at timestamptz not null default now(),
  primary key (owner, id)
);

alter table public.strategies enable row level security;
alter table public.lineups enable row level security;

create policy strategies_owner on public.strategies
  for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

create policy lineups_owner on public.lineups
  for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

-- ---------------------------------------------------------------------------
-- Salas
-- ---------------------------------------------------------------------------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) <= 120),
  -- 122 bits aleatórios: o convite é o segredo que dá entrada na sala.
  invite_code text not null unique default replace(gen_random_uuid()::text, '-', ''),
  document jsonb not null check (octet_length(document::text) <= 2000000),
  stamps jsonb not null default '{}'::jsonb check (octet_length(stamps::text) <= 1000000),
  version bigint not null default 0,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'editor', 'viewer')),
  display_name text not null default 'Convidado' check (char_length(display_name) <= 40),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index room_members_user_idx on public.room_members (user_id);

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;

-- Papel do usuário atual em uma sala. security definer evita recursão nas políticas de room_members.
create function public.room_role(p_room uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.room_members where room_id = p_room and user_id = auth.uid();
$$;

create policy rooms_members_read on public.rooms
  for select to authenticated
  using (public.room_role(id) is not null);

-- Administradores podem encerrar a sala.
create policy rooms_admin_delete on public.rooms
  for delete to authenticated
  using (public.room_role(id) = 'admin');

create policy members_read on public.room_members
  for select to authenticated
  using (public.room_role(room_id) is not null);

-- Sair da sala, ou um administrador remover alguém.
create policy members_leave_or_remove on public.room_members
  for delete to authenticated
  using (user_id = auth.uid() or public.room_role(room_id) = 'admin');

-- Sem política de insert/update: entrada e mudança de papel só pelas funções abaixo.

create function public.create_room(p_name text, p_document jsonb, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  insert into public.rooms (name, document, created_by)
    values (left(p_name, 120), p_document, auth.uid())
    returning * into v_room;
  insert into public.room_members (room_id, user_id, role, display_name)
    values (v_room.id, auth.uid(), 'admin', left(coalesce(nullif(trim(p_display_name), ''), 'Convidado'), 40));
  return jsonb_build_object('room_id', v_room.id, 'invite_code', v_room.invite_code);
end;
$$;

-- Quem tem o convite entra como editor. Quem já é membro mantém o papel.
create function public.join_room(p_code text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into v_room from public.rooms where invite_code = p_code;
  if not found then
    raise exception 'invalid_invite' using errcode = 'P0002';
  end if;
  insert into public.room_members (room_id, user_id, role, display_name)
    values (v_room.id, auth.uid(), 'editor', left(coalesce(nullif(trim(p_display_name), ''), 'Convidado'), 40))
    on conflict (room_id, user_id) do update set display_name = excluded.display_name
    returning role into v_role;
  return jsonb_build_object(
    'room_id', v_room.id,
    'role', v_role,
    'name', v_room.name,
    'document', v_room.document,
    'stamps', v_room.stamps
  );
end;
$$;

create function public.set_member_role(p_room uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admins integer;
  v_current text;
begin
  if public.room_role(p_room) is distinct from 'admin' then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'editor', 'viewer') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  -- Trava a sala: dois administradores rebaixando um ao outro não podem deixá-la sem administrador.
  perform 1 from public.rooms where id = p_room for update;
  select role into v_current from public.room_members where room_id = p_room and user_id = p_user;
  if not found then
    raise exception 'not_member' using errcode = 'P0002';
  end if;
  if v_current = 'admin' and p_role <> 'admin' then
    select count(*) into v_admins from public.room_members where room_id = p_room and role = 'admin';
    if v_admins <= 1 then
      raise exception 'last_admin' using errcode = '42501';
    end if;
  end if;
  update public.room_members set role = p_role where room_id = p_room and user_id = p_user;
end;
$$;

-- Troca o convite, invalidando links já enviados. Membros atuais continuam na sala.
create function public.rotate_invite(p_room uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if public.room_role(p_room) is distinct from 'admin' then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  update public.rooms set invite_code = replace(gen_random_uuid()::text, '-', '') where id = p_room
    returning invite_code into v_code;
  return v_code;
end;
$$;

-- Snapshot para quem entra depois e para recuperação após queda.
create function public.save_room_snapshot(p_room uuid, p_document jsonb, p_stamps jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version bigint;
begin
  if public.room_role(p_room) not in ('admin', 'editor') or public.room_role(p_room) is null then
    raise exception 'not_editor' using errcode = '42501';
  end if;
  update public.rooms
    set document = p_document, stamps = p_stamps, version = version + 1, updated_at = now()
    where id = p_room
    returning version into v_version;
  return v_version;
end;
$$;

revoke all on function public.room_role(uuid) from public, anon;
revoke all on function public.create_room(text, jsonb, text) from public, anon;
revoke all on function public.join_room(text, text) from public, anon;
revoke all on function public.set_member_role(uuid, uuid, text) from public, anon;
revoke all on function public.rotate_invite(uuid) from public, anon;
revoke all on function public.save_room_snapshot(uuid, jsonb, jsonb) from public, anon;

grant execute on function public.room_role(uuid) to authenticated;
grant execute on function public.create_room(text, jsonb, text) to authenticated;
grant execute on function public.join_room(text, text) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.rotate_invite(uuid) to authenticated;
grant execute on function public.save_room_snapshot(uuid, jsonb, jsonb) to authenticated;

grant select, insert, update, delete on public.strategies, public.lineups to authenticated;
grant select, delete on public.rooms, public.room_members to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: canais privados room:<uuid>:ops e room:<uuid>:live
-- ---------------------------------------------------------------------------
create function public.room_role_from_topic(p_topic text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id text := split_part(p_topic, ':', 2);
begin
  if split_part(p_topic, ':', 1) <> 'room'
     or v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return public.room_role(v_id::uuid);
end;
$$;

revoke all on function public.room_role_from_topic(text) from public, anon;
grant execute on function public.room_role_from_topic(text) to authenticated;

-- Qualquer membro recebe tudo da própria sala.
create policy room_members_receive on realtime.messages
  for select to authenticated
  using (public.room_role_from_topic(realtime.topic()) is not null);

-- Presença e cursores: qualquer membro, só no canal live.
create policy room_members_live_send on realtime.messages
  for insert to authenticated
  with check (
    split_part(realtime.topic(), ':', 3) = 'live'
    and public.room_role_from_topic(realtime.topic()) is not null
  );

-- Alterações do documento: só editores e administradores, só no canal ops.
create policy room_editors_ops_send on realtime.messages
  for insert to authenticated
  with check (
    split_part(realtime.topic(), ':', 3) = 'ops'
    and public.room_role_from_topic(realtime.topic()) in ('admin', 'editor')
  );
