// Liga a interface ao motor da sala: identidade, criação, entrada e operações no backend.
import { setCursorListener } from '../editor/interaction';
import { kvGet, kvSet } from '../persistence/idb';
import { getSupabase, isSupabaseConfigured } from '../services/supabase';
import { docActions, docStore } from '../strategy/docStore';
import { newId } from '../strategy/factory';
import { parseStrategy, type StrategyDoc } from '../strategy/schema';
import { stampsSchema, type Stamp } from './protocol';
import { initialRoomState, roomStore, type RoomRole } from './roomStore';
import { RoomSession, type RoomIdentity } from './RoomSession';
import { SupabaseTransport } from './SupabaseTransport';
import { LocalTransport } from './transport';

const COLORS = ['#ef3b48', '#2fc4d6', '#f6e27a', '#6fe0c0', '#c792ff', '#ff9f5a', '#8fb7ff', '#ff8fc4'];
const LOCAL_PREFIX = 'local-';
const LOCAL_SYNC_TIMEOUT_MS = 2500;

let session: RoomSession | null = null;
/** Documento de quem acabou de criar a sala, à espera da página da sala abrir. */
let pendingCreation: { code: string; doc: StrategyDoc; remote: { roomId: string } | null } | null = null;

export const getSession = (): RoomSession | null => session;

export const isLocalCode = (code: string): boolean => code.startsWith(LOCAL_PREFIX);

export async function getDisplayName(): Promise<string> {
  return (await kvGet<string>('profile:name').catch(() => undefined)) ?? '';
}

export const setDisplayName = (name: string): Promise<void> => kvSet('profile:name', name);

const colorFor = (id: string): string => {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length]!;
};

async function localUserId(): Promise<string> {
  // Em salas locais cada aba é um participante; o id vive só na sessão da aba.
  const key = 'tacticlab-local-user';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = newId();
    sessionStorage.setItem(key, id);
  }
  return id;
}

function buildIdentity(userId: string, name: string): RoomIdentity {
  return { clientId: newId(), userId, name: name.trim() || 'Convidado', color: colorFor(userId) };
}

async function requireSupabaseUser() {
  const supabase = getSupabase();
  if (!supabase) throw new Error('As salas online não estão configuradas neste site.');
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) return { supabase, user: data.session.user };
  const anonymous = await supabase.auth.signInAnonymously();
  if (anonymous.error || !anonymous.data.user) {
    throw new Error(`Faça login em Conta para entrar em salas. (${anonymous.error?.message ?? 'entrada anônima indisponível'})`);
  }
  return { supabase, user: anonymous.data.user };
}

export interface CreatedRoom {
  code: string;
}

/** Cria a sala com uma cópia da estratégia aberta. */
export async function createRoom(doc: StrategyDoc, displayName: string): Promise<CreatedRoom> {
  await setDisplayName(displayName).catch(() => undefined);
  if (!isSupabaseConfigured) {
    const code = `${LOCAL_PREFIX}${newId().replace(/-/g, '').slice(0, 16)}`;
    pendingCreation = { code, doc, remote: null };
    return { code };
  }
  const { supabase } = await requireSupabaseUser();
  const { data, error } = await supabase.rpc('create_room', {
    p_name: doc.name,
    p_document: doc,
    p_display_name: displayName.trim() || 'Convidado',
  });
  if (error) throw new Error(`Não foi possível criar a sala: ${error.message}`);
  const created = data as { room_id: string; invite_code: string };
  pendingCreation = { code: created.invite_code, doc, remote: { roomId: created.room_id } };
  return { code: created.invite_code };
}

async function startLocal(code: string, displayName: string): Promise<void> {
  const identity = buildIdentity(await localUserId(), displayName);
  const creation = pendingCreation?.code === code ? pendingCreation : null;
  pendingCreation = null;
  const transport = new LocalTransport(code);
  const next = new RoomSession({
    transport,
    identity,
    role: creation ? 'admin' : 'editor',
    roomId: code,
    inviteCode: code,
    flushMs: 30,
  });
  session = next;
  if (creation) {
    docActions.load(creation.doc);
    next.stampInitialDocument(creation.doc);
    await next.start(next.getStamps());
    return;
  }
  await next.start();
  // Quem entra recebe o documento da aba que criou a sala.
  const synced = await next.waitForSync(LOCAL_SYNC_TIMEOUT_MS);
  if (!synced) {
    next.stop();
    session = null;
    roomStore.setState(initialRoomState());
    throw new Error('Sala local não encontrada. A aba que criou a sala precisa continuar aberta neste navegador.');
  }
}

function parseSnapshot(document: unknown, stamps: unknown): { doc: StrategyDoc; stamps: Record<string, Stamp> } {
  const parsed = parseStrategy(document);
  if (!parsed.ok) throw new Error(`O documento da sala é inválido. ${parsed.error}`);
  const parsedStamps = stampsSchema.safeParse(stamps ?? {});
  return { doc: parsed.doc, stamps: parsedStamps.success ? parsedStamps.data : {} };
}

async function startSupabase(code: string, displayName: string): Promise<void> {
  const { supabase, user } = await requireSupabaseUser();
  const creation = pendingCreation?.code === code ? pendingCreation : null;
  pendingCreation = null;

  const { data, error } = await supabase.rpc('join_room', { p_code: code, p_display_name: displayName.trim() || 'Convidado' });
  if (error) throw new Error(error.message.includes('invalid_invite') ? 'Este convite não existe ou foi trocado.' : `Não foi possível entrar na sala: ${error.message}`);
  const joined = data as { room_id: string; role: RoomRole; document: unknown; stamps: unknown };
  const snapshot = parseSnapshot(joined.document, joined.stamps);

  const members = await supabase.from('room_members').select('user_id, role').eq('room_id', joined.room_id);
  const knownRoles: Record<string, RoomRole> = {};
  for (const row of (members.data ?? []) as Array<{ user_id: string; role: RoomRole }>) knownRoles[row.user_id] = row.role;

  const next = new RoomSession({
    transport: new SupabaseTransport(supabase, joined.room_id),
    identity: buildIdentity(user.id, displayName),
    role: joined.role,
    roomId: joined.room_id,
    inviteCode: code,
    knownRoles,
    persist: async (doc, stamps) => {
      const { error: saveError } = await supabase.rpc('save_room_snapshot', { p_room: joined.room_id, p_document: doc, p_stamps: stamps });
      if (saveError) throw saveError;
    },
    loadLatest: async () => {
      const latest = await supabase.from('rooms').select('document, stamps').eq('id', joined.room_id).single();
      if (latest.error) throw latest.error;
      return parseSnapshot(latest.data.document, latest.data.stamps);
    },
    commitRole: async (userId, role) => {
      const { error: roleError } = await supabase.rpc('set_member_role', { p_room: joined.room_id, p_user: userId, p_role: role });
      if (roleError) throw new Error(roleError.message.includes('last_admin') ? 'A sala precisa de pelo menos um administrador.' : roleError.message);
    },
  });
  session = next;
  docActions.load(creation?.doc ?? snapshot.doc, { readOnly: joined.role === 'viewer' });
  await next.start(snapshot.stamps);
}

export async function enterRoom(code: string, displayName: string): Promise<void> {
  leaveRoom();
  if (isLocalCode(code)) await startLocal(code, displayName);
  else await startSupabase(code, displayName);
  setCursorListener((point) => session?.publishCursor(point.x, point.y));
}

export function leaveRoom(): void {
  setCursorListener(null);
  session?.stop();
  session = null;
  roomStore.setState(initialRoomState());
}

export async function changeRole(userId: string, role: RoomRole): Promise<void> {
  await session?.setRole(userId, role);
}

export const buildInviteUrl = (code: string): string => `${location.origin}${location.pathname}#/sala/${encodeURIComponent(code)}`;

/** Salva o estado atual da sala como estratégia pessoal, com novo id. */
export function roomDocCopy(): StrategyDoc | null {
  const doc = docStore.getState().doc;
  if (!doc) return null;
  const now = Date.now();
  return { ...doc, id: newId(), name: `${doc.name} (da sala)`, folderId: null, createdAt: now, updatedAt: now };
}

