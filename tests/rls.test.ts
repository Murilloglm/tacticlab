// Executa a migração real em um Postgres (PGlite) e verifica as regras de acesso como cada usuário.
// O ambiente do Supabase (auth, realtime e papéis) é simulado para que as políticas rodem de verdade.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const ALICE = '11111111-1111-4111-8111-111111111111'; // administradora
const BOB = '22222222-2222-4222-8222-222222222222'; // editor
const CARL = '33333333-3333-4333-8333-333333333333'; // espectador
const EVE = '44444444-4444-4444-8444-444444444444'; // fora da sala

let db: PGlite;

async function as<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false);`);
  await db.exec(user ? 'set role authenticated' : 'set role anon');
  try {
    const result = await db.query<T>(sql, params);
    return result.rows;
  } finally {
    await db.exec('reset role');
  }
}

/** Testa uma mensagem do Realtime como se o usuário publicasse naquele canal. */
async function canPublish(user: string, topic: string, extension = 'broadcast'): Promise<boolean> {
  await db.exec(`select set_config('realtime.topic', '${topic}', false);`);
  try {
    await as(user, 'insert into realtime.messages (topic, extension) values ($1, $2)', [topic, extension]);
    return true;
  } catch {
    return false;
  }
}

async function canReceive(user: string, topic: string): Promise<boolean> {
  await db.exec(`select set_config('realtime.topic', '${topic}', false);`);
  await db.exec(`reset role; insert into realtime.messages (topic, extension) values ('${topic}', 'broadcast')`);
  const rows = await as(user, 'select 1 from realtime.messages where topic = $1', [topic]);
  return rows.length > 0;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant select on auth.users to anon, authenticated;

    create schema realtime;
    create table realtime.messages (id bigserial primary key, topic text not null, extension text not null);
    alter table realtime.messages enable row level security;
    create function realtime.topic() returns text language sql stable as
      $$ select current_setting('realtime.topic', true) $$;
    grant usage on schema realtime to authenticated;
    grant select, insert on realtime.messages to authenticated;
    grant usage on sequence realtime.messages_id_seq to authenticated;
    grant execute on function realtime.topic() to authenticated;

    grant usage on schema public to anon, authenticated;
    insert into auth.users values
      ('${ALICE}'), ('${BOB}'), ('${CARL}'), ('${EVE}');
  `);
  await db.exec(readFileSync(join(process.cwd(), 'supabase', 'migrations', '0001_tacticlab.sql'), 'utf8'));
}, 60000);

afterAll(async () => {
  await db?.close();
});

describe('dados pessoais', () => {
  const insert = `insert into public.strategies (owner, id, name, map_id, side, doc) values ($1, $2, 'n', 'm', 'attack', '{}')`;

  it('cada usuário vê apenas as próprias estratégias', async () => {
    await as(ALICE, insert, [ALICE, 's-alice']);
    await as(BOB, insert, [BOB, 's-bob']);
    const rows = await as<{ id: string }>(ALICE, 'select id from public.strategies');
    expect(rows.map((r) => r.id)).toEqual(['s-alice']);
  });

  it('ninguém grava em nome de outro', async () => {
    await expect(as(EVE, insert, [ALICE, 's-falsa'])).rejects.toThrow(/row-level security/);
  });

  it('não dá para alterar nem apagar o que é de outro', async () => {
    await as(EVE, `update public.strategies set name = 'hack' where id = 's-alice'`);
    await as(EVE, `delete from public.strategies where id = 's-alice'`);
    const rows = await as<{ name: string }>(ALICE, `select name from public.strategies where id = 's-alice'`);
    expect(rows[0]!.name).toBe('n');
  });

  it('o dono altera e apaga o que é dele', async () => {
    await as(BOB, `update public.strategies set name = 'novo' where id = 's-bob'`);
    expect((await as<{ name: string }>(BOB, `select name from public.strategies where id = 's-bob'`))[0]!.name).toBe('novo');
    await as(BOB, `delete from public.strategies where id = 's-bob'`);
    expect(await as(BOB, 'select id from public.strategies')).toHaveLength(0);
  });

  it('visitante sem login não acessa nada', async () => {
    await expect(as(null, 'select * from public.strategies')).rejects.toThrow(/permission denied/);
    await expect(as(null, 'select * from public.rooms')).rejects.toThrow(/permission denied/);
  });

  it('lineups seguem a mesma regra', async () => {
    await as(ALICE, `insert into public.lineups (owner, id, map_id, doc) values ($1, 'l1', 'm', '{}')`, [ALICE]);
    expect(await as(EVE, 'select id from public.lineups')).toHaveLength(0);
    expect(await as(ALICE, 'select id from public.lineups')).toHaveLength(1);
  });
});

describe('salas', () => {
  let roomId = '';
  let invite = '';

  beforeAll(async () => {
    const [row] = await as<{ data: { room_id: string; invite_code: string } }>(
      ALICE,
      `select public.create_room('Sala', '{"a":1}'::jsonb, 'Alice') as data`,
    );
    roomId = row!.data.room_id;
    invite = row!.data.invite_code;
    await as(BOB, `select public.join_room($1, 'Bob')`, [invite]);
    await as(CARL, `select public.join_room($1, 'Carl')`, [invite]);
    await as(ALICE, `select public.set_member_role($1, $2, 'viewer')`, [roomId, CARL]);
  });

  const topic = (kind: string) => `room:${roomId}:${kind}`;

  it('o convite é longo e imprevisível', () => {
    expect(invite).toMatch(/^[0-9a-f]{32}$/);
  });

  it('quem criou é administrador; quem entra por convite é editor', async () => {
    const rows = await as<{ user_id: string; role: string }>(ALICE, 'select user_id, role from public.room_members where room_id = $1', [roomId]);
    const roles = Object.fromEntries(rows.map((r) => [r.user_id, r.role]));
    expect(roles[ALICE]).toBe('admin');
    expect(roles[BOB]).toBe('editor');
    expect(roles[CARL]).toBe('viewer');
  });

  it('quem não está na sala não enxerga sala nem membros', async () => {
    expect(await as(EVE, 'select id from public.rooms where id = $1', [roomId])).toHaveLength(0);
    expect(await as(EVE, 'select user_id from public.room_members where room_id = $1', [roomId])).toHaveLength(0);
  });

  it('o código do convite não permite listar salas', async () => {
    expect(await as(EVE, 'select invite_code from public.rooms')).toHaveLength(0);
  });

  it('convite inválido é recusado', async () => {
    await expect(as(EVE, `select public.join_room('nao-existe', 'Eve')`)).rejects.toThrow(/invalid_invite/);
  });

  it('entrar de novo não promove ninguém', async () => {
    await as(CARL, `select public.join_room($1, 'Carl')`, [invite]);
    const [row] = await as<{ role: string }>(ALICE, 'select role from public.room_members where room_id = $1 and user_id = $2', [roomId, CARL]);
    expect(row!.role).toBe('viewer');
  });

  it('ninguém se promove nem entra escrevendo direto na tabela', async () => {
    await expect(as(CARL, `update public.room_members set role = 'admin' where user_id = '${CARL}'`)).rejects.toThrow(/permission denied/);
    await expect(as(EVE, `insert into public.room_members (room_id, user_id, role) values ('${roomId}', '${EVE}', 'admin')`)).rejects.toThrow(/permission denied/);
  });

  it('o documento só muda pela função, nunca por update direto', async () => {
    await expect(as(BOB, `update public.rooms set document = '{}' where id = '${roomId}'`)).rejects.toThrow(/permission denied/);
  });

  it('só administrador muda papéis', async () => {
    await expect(as(BOB, `select public.set_member_role($1, $2, 'admin')`, [roomId, BOB])).rejects.toThrow(/not_admin/);
    await expect(as(CARL, `select public.set_member_role($1, $2, 'admin')`, [roomId, CARL])).rejects.toThrow(/not_admin/);
    await expect(as(EVE, `select public.set_member_role($1, $2, 'admin')`, [roomId, EVE])).rejects.toThrow(/not_admin/);
  });

  it('papel inválido é recusado', async () => {
    await expect(as(ALICE, `select public.set_member_role($1, $2, 'dono')`, [roomId, BOB])).rejects.toThrow(/invalid_role/);
  });

  it('a sala nunca fica sem administrador', async () => {
    await expect(as(ALICE, `select public.set_member_role($1, $2, 'editor')`, [roomId, ALICE])).rejects.toThrow(/last_admin/);
  });

  it('editores salvam o snapshot; espectadores e estranhos não', async () => {
    const [saved] = await as<{ v: number }>(BOB, `select public.save_room_snapshot($1, '{"b":2}'::jsonb, '{}'::jsonb) as v`, [roomId]);
    expect(Number(saved!.v)).toBeGreaterThan(0);
    await expect(as(CARL, `select public.save_room_snapshot($1, '{}'::jsonb, '{}'::jsonb)`, [roomId])).rejects.toThrow(/not_editor/);
    await expect(as(EVE, `select public.save_room_snapshot($1, '{}'::jsonb, '{}'::jsonb)`, [roomId])).rejects.toThrow(/not_editor/);
    const [row] = await as<{ document: { b?: number } }>(ALICE, 'select document from public.rooms where id = $1', [roomId]);
    expect(row!.document.b).toBe(2);
  });

  it('Realtime: canal de alterações aceita só editores e administradores', async () => {
    expect(await canPublish(ALICE, topic('ops'))).toBe(true);
    expect(await canPublish(BOB, topic('ops'))).toBe(true);
    expect(await canPublish(CARL, topic('ops'))).toBe(false);
    expect(await canPublish(EVE, topic('ops'))).toBe(false);
  });

  it('Realtime: canal de presença aceita qualquer membro, e só membros', async () => {
    expect(await canPublish(CARL, topic('live'))).toBe(true);
    expect(await canPublish(CARL, topic('live'), 'presence')).toBe(true);
    expect(await canPublish(EVE, topic('live'))).toBe(false);
  });

  it('Realtime: só membros recebem as mensagens da sala', async () => {
    expect(await canReceive(CARL, topic('ops'))).toBe(true);
    expect(await canReceive(EVE, topic('ops'))).toBe(false);
  });

  it('Realtime: tópicos malformados não dão acesso nem causam erro', async () => {
    expect(await canPublish(ALICE, 'room:nao-e-uuid:ops')).toBe(false);
    expect(await canPublish(ALICE, `outra:${roomId}:ops`)).toBe(false);
    expect(await canPublish(ALICE, `room:${roomId}:outro`)).toBe(false);
  });

  it('trocar o convite invalida o antigo, e só administrador troca', async () => {
    await expect(as(BOB, `select public.rotate_invite($1)`, [roomId])).rejects.toThrow(/not_admin/);
    const [row] = await as<{ code: string }>(ALICE, `select public.rotate_invite($1) as code`, [roomId]);
    expect(row!.code).not.toBe(invite);
    await expect(as(EVE, `select public.join_room($1, 'Eve')`, [invite])).rejects.toThrow(/invalid_invite/);
    invite = row!.code;
  });

  it('um membro pode sair; só o administrador remove outros', async () => {
    await as(EVE, `select public.join_room($1, 'Eve')`, [invite]);
    await as(BOB, `delete from public.room_members where room_id = $1 and user_id = $2`, [roomId, EVE]);
    expect(await as(ALICE, 'select 1 from public.room_members where room_id = $1 and user_id = $2', [roomId, EVE])).toHaveLength(1);
    await as(EVE, `delete from public.room_members where room_id = $1 and user_id = $2`, [roomId, EVE]);
    expect(await as(ALICE, 'select 1 from public.room_members where room_id = $1 and user_id = $2', [roomId, EVE])).toHaveLength(0);
  });

  it('visitante sem login não chama as funções', async () => {
    await expect(as(null, `select public.create_room('x', '{}'::jsonb, 'x')`)).rejects.toThrow(/permission denied/);
    await expect(as(null, `select public.join_room('x', 'x')`)).rejects.toThrow(/permission denied/);
  });

  it('só administrador encerra a sala', async () => {
    await as(BOB, 'delete from public.rooms where id = $1', [roomId]);
    expect(await as(ALICE, 'select 1 from public.rooms where id = $1', [roomId])).toHaveLength(1);
    await as(ALICE, 'delete from public.rooms where id = $1', [roomId]);
    expect(await as(ALICE, 'select 1 from public.rooms where id = $1', [roomId])).toHaveLength(0);
  });

  it('documento grande demais é recusado', async () => {
    const big = JSON.stringify({ x: 'a'.repeat(2100000) });
    await expect(as(ALICE, `select public.create_room('Grande', $1::jsonb, 'A')`, [big])).rejects.toThrow(/check/i);
  });
});
