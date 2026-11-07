import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { docActions, docStore } from '@/modules/strategy/docStore';
import {
  isNewer,
  mergeRemoteState,
  opToChange,
  roomMessageSchema,
  type RoomMessage,
  type Stamp,
} from '@/modules/multiplayer/protocol';
import { RoomSession } from '@/modules/multiplayer/RoomSession';
import { roomStore, type RoomRole } from '@/modules/multiplayer/roomStore';
import type { PresenceInfo, RoomTransport, TransportStatus } from '@/modules/multiplayer/transport';
import { combineStatus, roomTopics } from '@/modules/multiplayer/SupabaseTransport';
import { agent, emptyDoc } from './helpers';

class FakeTransport implements RoomTransport {
  readonly kind = 'local' as const;
  sent: RoomMessage[] = [];
  peers: PresenceInfo[] = [];
  private message: (m: RoomMessage) => void = () => undefined;
  private presence: (p: PresenceInfo[]) => void = () => undefined;
  private status: (s: TransportStatus) => void = () => undefined;
  onMessage(l: (m: RoomMessage) => void) {
    this.message = l;
  }
  onPresence(l: (p: PresenceInfo[]) => void) {
    this.presence = l;
  }
  onStatus(l: (s: TransportStatus) => void) {
    this.status = l;
  }
  async connect(p: PresenceInfo) {
    this.peers = [p];
    this.presence(this.peers);
    this.status('online');
  }
  close() {}
  send(m: RoomMessage) {
    this.sent.push(m);
  }
  updatePresence() {}
  receive(m: RoomMessage) {
    this.message(m);
  }
  setStatus(s: TransportStatus) {
    this.status(s);
  }
  addPeer(p: Partial<PresenceInfo> & { clientId: string }) {
    this.peers = [...this.peers, { userId: `u-${p.clientId}`, name: p.clientId, color: '#fff', role: 'editor', ...p }];
    this.presence(this.peers);
  }
  opsSent(): Extract<RoomMessage, { t: 'ops' }>['ops'] {
    return this.sent.flatMap((m) => (m.t === 'ops' ? m.ops : []));
  }
}

const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

function makeSession(role: RoomRole = 'editor', extra: Partial<ConstructorParameters<typeof RoomSession>[0]> = {}) {
  const transport = new FakeTransport();
  const session = new RoomSession({
    transport,
    identity: { clientId: 'client-b', userId: 'user-b', name: 'B', color: '#fff' },
    role,
    roomId: 'room',
    inviteCode: 'code',
    flushMs: 0,
    ...extra,
  });
  return { transport, session };
}

const stamp = (l: number, c = 'z'): Stamp => ({ l, c });

describe('protocolo da sala', () => {
  it('ordena carimbos pelo relógio e desempata pelo cliente', () => {
    expect(isNewer(stamp(2, 'a'), stamp(1, 'z'))).toBe(true);
    expect(isNewer(stamp(1, 'b'), stamp(1, 'a'))).toBe(true);
    expect(isNewer(stamp(1, 'a'), stamp(1, 'a'))).toBe(false);
  });

  it('aceita operação válida e recusa conteúdo inválido', () => {
    const good = agent({ id: 'a1' });
    expect(opToChange({ k: 'agents:a1', v: good, s: stamp(1) })).toMatchObject({ c: 'agents', id: 'a1' });
    expect(opToChange({ k: 'agents:a1', v: { nonsense: true }, s: stamp(1) })).toBeNull();
    expect(opToChange({ k: 'hacks:a1', v: good, s: stamp(1) })).toBeNull();
    expect(opToChange({ k: 'agents:outro', v: good, s: stamp(1) })).toBeNull();
    expect(opToChange({ k: 'semseparador', v: good, s: stamp(1) })).toBeNull();
  });

  it('não permite trocar mapa, id ou pasta por operações de metadados', () => {
    expect(opToChange({ k: 'meta:name', v: 'Novo', s: stamp(1) })).toMatchObject({ key: 'name' });
    expect(opToChange({ k: 'meta:mapId', v: 'x', s: stamp(1) })).toBeNull();
    expect(opToChange({ k: 'meta:id', v: 'x', s: stamp(1) })).toBeNull();
    expect(opToChange({ k: 'meta:folderId', v: 'x', s: stamp(1) })).toBeNull();
    expect(opToChange({ k: 'meta:durationMs', v: -5, s: stamp(1) })).toBeNull();
  });

  it('valida o envelope das mensagens', () => {
    expect(roomMessageSchema.safeParse({ t: 'cursor', from: 'a', x: 0.5, y: 0.5 }).success).toBe(true);
    expect(roomMessageSchema.safeParse({ t: 'cursor', from: 'a', x: 'x', y: 0.5 }).success).toBe(false);
    expect(roomMessageSchema.safeParse({ t: 'roles', from: 'a', roles: { u: 'dono' } }).success).toBe(false);
    expect(roomMessageSchema.safeParse({ t: 'desconhecida', from: 'a' }).success).toBe(false);
  });

  it('a fusão mantém o que é mais novo de cada lado e respeita exclusões', () => {
    const local = emptyDoc({
      agents: { mine: agent({ id: 'mine', position: { x: 0.9, y: 0 } }), both: agent({ id: 'both', position: { x: 0.1, y: 0 } }) },
    });
    const remote = emptyDoc({
      agents: { theirs: agent({ id: 'theirs' }), both: agent({ id: 'both', position: { x: 0.2, y: 0 } }), mine: agent({ id: 'mine', position: { x: 0.5, y: 0 } }) },
    });
    const { changes } = mergeRemoteState(
      local,
      { 'agents:mine': stamp(10), 'agents:both': stamp(1) },
      remote,
      { 'agents:mine': stamp(5), 'agents:both': stamp(3), 'agents:theirs': stamp(4) },
    );
    const byId = Object.fromEntries(changes.map((c) => [c.c === 'meta' ? c.key : c.id, c]));
    expect(byId.mine).toBeUndefined();
    expect(byId.both).toMatchObject({ after: { position: { x: 0.2 } } });
    expect(byId.theirs).toBeDefined();
  });

  it('uma exclusão com carimbo mais novo remove o objeto; uma mais antiga não', () => {
    const local = emptyDoc({ agents: { a: agent({ id: 'a' }) } });
    const remote = emptyDoc();
    const newer = mergeRemoteState(local, { 'agents:a': stamp(1) }, remote, { 'agents:a': stamp(2) });
    expect(newer.changes).toEqual([{ c: 'agents', id: 'a', after: null }]);
    const older = mergeRemoteState(local, { 'agents:a': stamp(5) }, remote, { 'agents:a': stamp(2) });
    expect(older.changes).toEqual([]);
  });

  it('nomes dos canais e estado combinado do Realtime', () => {
    expect(roomTopics('abc')).toEqual({ ops: 'room:abc:ops', live: 'room:abc:live' });
    expect(combineStatus('SUBSCRIBED', 'SUBSCRIBED')).toBe('online');
    expect(combineStatus('SUBSCRIBED', 'CONNECTING')).toBe('connecting');
    expect(combineStatus('CHANNEL_ERROR', 'SUBSCRIBED')).toBe('offline');
    expect(combineStatus('SUBSCRIBED', 'TIMED_OUT')).toBe('offline');
  });
});

describe('motor da sala', () => {
  let active: RoomSession | null = null;

  beforeEach(() => docActions.load(emptyDoc()));
  afterEach(() => {
    active?.stop();
    active = null;
  });

  const start = async (role: RoomRole = 'editor', extra = {}) => {
    const built = makeSession(role, extra);
    active = built.session;
    await built.session.start();
    return built;
  };

  it('envia alterações locais carimbadas', async () => {
    const { transport } = await start();
    docActions.change([{ c: 'agents', id: 'a1', after: agent() }]);
    await tick();
    const ops = transport.opsSent();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ k: 'agents:a1', s: { c: 'client-b' } });
  });

  it('um arrasto rápido envia só a última posição de cada objeto', async () => {
    const { transport } = await start();
    for (let i = 0; i < 10; i++) {
      docActions.change([{ c: 'agents', id: 'a1', after: agent({ position: { x: i / 10, y: 0 } }) }], { coalesce: 'drag' });
    }
    await tick();
    const ops = transport.opsSent();
    expect(ops).toHaveLength(1);
    expect((ops[0]!.v as { position: { x: number } }).position.x).toBe(0.9);
  });

  it('aplica alterações remotas sem as reenviar nem sujar o desfazer', async () => {
    const { transport } = await start();
    transport.addPeer({ clientId: 'client-a' });
    transport.receive({ t: 'ops', from: 'client-a', ops: [{ k: 'agents:a1', v: agent(), s: stamp(5, 'client-a') }] });
    await tick();
    expect(docStore.getState().doc!.agents.a1).toBeDefined();
    expect(transport.opsSent()).toHaveLength(0);
    expect(docStore.getState().past).toHaveLength(0);
  });

  it('duas escritas na mesma chave convergem: vence o maior carimbo, em qualquer ordem', async () => {
    const { transport } = await start();
    transport.addPeer({ clientId: 'client-a' });
    const older = { k: 'agents:a1', v: agent({ position: { x: 0.1, y: 0 } }), s: stamp(3, 'client-a') };
    const newer = { k: 'agents:a1', v: agent({ position: { x: 0.2, y: 0 } }), s: stamp(4, 'client-a') };
    transport.receive({ t: 'ops', from: 'client-a', ops: [newer] });
    transport.receive({ t: 'ops', from: 'client-a', ops: [older] });
    expect(docStore.getState().doc!.agents.a1!.position.x).toBe(0.2);
  });

  it('o relógio local avança para superar o que recebeu', async () => {
    const { transport } = await start();
    transport.addPeer({ clientId: 'client-a' });
    transport.receive({ t: 'ops', from: 'client-a', ops: [{ k: 'agents:a1', v: agent(), s: stamp(50, 'client-a') }] });
    docActions.change([{ c: 'agents', id: 'a1', after: agent({ position: { x: 1, y: 1 } }) }]);
    await tick();
    expect(transport.opsSent()[0]!.s.l).toBeGreaterThan(50);
  });

  it('ignora dados inválidos de outro participante', async () => {
    const { transport } = await start();
    transport.addPeer({ clientId: 'client-a' });
    transport.receive({ t: 'ops', from: 'client-a', ops: [{ k: 'agents:x', v: { hacked: true }, s: stamp(9, 'client-a') }] });
    expect(docStore.getState().doc!.agents.x).toBeUndefined();
  });

  it('recusa operações de um espectador', async () => {
    const { transport } = await start();
    transport.addPeer({ clientId: 'client-v', role: 'viewer' });
    transport.receive({ t: 'ops', from: 'client-v', ops: [{ k: 'agents:a1', v: agent(), s: stamp(9, 'client-v') }] });
    expect(docStore.getState().doc!.agents.a1).toBeUndefined();
  });

  it('espectador não edita nem envia nada', async () => {
    const { transport } = await start('viewer');
    expect(docStore.getState().readOnly).toBe(true);
    expect(docActions.change([{ c: 'agents', id: 'a1', after: agent() }])).toBe(false);
    await tick();
    expect(transport.opsSent()).toHaveLength(0);
  });

  it('só um administrador pode mudar papéis; o aviso de outro é ignorado', async () => {
    const { transport } = await start('editor');
    transport.addPeer({ clientId: 'client-x', role: 'editor' });
    transport.receive({ t: 'roles', from: 'client-x', roles: { 'user-b': 'viewer' } });
    expect(docStore.getState().readOnly).toBe(false);

    transport.addPeer({ clientId: 'client-admin', role: 'admin' });
    transport.receive({ t: 'roles', from: 'client-admin', roles: { 'user-b': 'viewer' } });
    expect(docStore.getState().readOnly).toBe(true);
    expect(roomStore.getState().role).toBe('viewer');
  });

  it('editor não consegue chamar a troca de papel', async () => {
    const { session } = await start('editor');
    await expect(session.setRole('user-x', 'admin')).rejects.toThrow('administradores');
  });

  it('administrador grava o papel no backend antes de avisar a sala', async () => {
    const calls: string[] = [];
    const { transport, session } = await start('admin', {
      commitRole: async (userId: string, role: RoomRole) => {
        calls.push(`${userId}:${role}`);
      },
    });
    await session.setRole('user-x', 'viewer');
    expect(calls).toEqual(['user-x:viewer']);
    expect(transport.sent.some((m) => m.t === 'roles')).toBe(true);
  });

  it('se o backend recusa a troca de papel, a sala não é avisada', async () => {
    const { transport, session } = await start('admin', {
      commitRole: async () => {
        throw new Error('last_admin');
      },
    });
    await expect(session.setRole('user-x', 'viewer')).rejects.toThrow('last_admin');
    expect(transport.sent.some((m) => m.t === 'roles')).toBe(false);
  });

  it('sem conexão guarda as alterações e envia ao reconectar', async () => {
    const { transport } = await start();
    transport.setStatus('offline');
    expect(roomStore.getState().connection).toBe('reconnecting');
    docActions.change([{ c: 'agents', id: 'a1', after: agent() }]);
    docActions.change([{ c: 'agents', id: 'a2', after: agent({ id: 'a2' }) }]);
    await tick();
    expect(transport.opsSent()).toHaveLength(0);
    expect(roomStore.getState().pendingOps).toBe(2);

    transport.setStatus('online');
    await tick(20);
    expect(transport.opsSent().map((op) => op.k).sort()).toEqual(['agents:a1', 'agents:a2']);
    expect(roomStore.getState().pendingOps).toBe(0);
    expect(transport.sent.some((m) => m.t === 'sync-request')).toBe(true);
  });

  it('ao reconectar, funde o snapshot do servidor com o que foi feito offline', async () => {
    const remoteDoc = emptyDoc({ agents: { theirs: agent({ id: 'theirs' }) } });
    const { transport } = await start('editor', {
      loadLatest: async () => ({ doc: remoteDoc, stamps: { 'agents:theirs': stamp(3, 'client-a') } }),
    });
    transport.setStatus('offline');
    docActions.change([{ c: 'agents', id: 'mine', after: agent({ id: 'mine' }) }]);
    transport.setStatus('online');
    await tick(20);
    const agents = docStore.getState().doc!.agents;
    expect(agents.theirs).toBeDefined();
    expect(agents.mine).toBeDefined();
    expect(transport.opsSent().map((op) => op.k)).toEqual(['agents:mine']);
  });

  it('falha ao ler o snapshot não impede de reenviar o que está pendente', async () => {
    const { transport } = await start('editor', {
      loadLatest: async () => {
        throw new Error('rede');
      },
    });
    transport.setStatus('offline');
    docActions.change([{ c: 'agents', id: 'mine', after: agent({ id: 'mine' }) }]);
    transport.setStatus('online');
    await tick(20);
    expect(transport.opsSent().map((op) => op.k)).toEqual(['agents:mine']);
  });

  it('uma escrita remota mais nova cancela a pendência local da mesma chave', async () => {
    const { transport } = await start();
    transport.addPeer({ clientId: 'client-a' });
    transport.setStatus('offline');
    docActions.change([{ c: 'agents', id: 'a1', after: agent({ position: { x: 0.1, y: 0 } }) }]);
    transport.receive({ t: 'ops', from: 'client-a', ops: [{ k: 'agents:a1', v: agent({ position: { x: 0.7, y: 0 } }), s: stamp(99, 'client-a') }] });
    transport.setStatus('online');
    await tick(20);
    expect(transport.opsSent()).toHaveLength(0);
    expect(docStore.getState().doc!.agents.a1!.position.x).toBe(0.7);
  });

  it('entre editores, só o de menor id responde a um pedido de estado', async () => {
    const { transport } = await start();
    transport.addPeer({ clientId: 'client-a' });
    transport.receive({ t: 'sync-request', from: 'client-new' });
    expect(transport.sent.filter((m) => m.t === 'sync-state')).toHaveLength(0);

    const other = await (async () => {
      active?.stop();
      docActions.load(emptyDoc());
      return start();
    })();
    other.transport.addPeer({ clientId: 'client-z' });
    other.transport.receive({ t: 'sync-request', from: 'client-new' });
    expect(other.transport.sent.filter((m) => m.t === 'sync-state')).toHaveLength(1);
  });

  it('espectador nunca responde com estado, porque não pode publicar nesse canal', async () => {
    const { transport } = await start('viewer');
    transport.receive({ t: 'sync-request', from: 'client-new' });
    expect(transport.sent.filter((m) => m.t === 'sync-state')).toHaveLength(0);
  });

  it('salva o snapshot no backend depois de alterações', async () => {
    const saved: number[] = [];
    await start('editor', {
      persistMs: 1,
      persist: async (doc: { agents: object }) => {
        saved.push(Object.keys(doc.agents).length);
      },
    });
    docActions.change([{ c: 'agents', id: 'a1', after: agent() }]);
    await tick(20);
    expect(saved).toEqual([1]);
  });

  it('publica cursores e remove os de quem saiu', async () => {
    const { transport, session } = await start();
    transport.addPeer({ clientId: 'client-a' });
    transport.receive({ t: 'cursor', from: 'client-a', x: 0.3, y: 0.4 });
    expect(roomStore.getState().peers.find((p) => p.clientId === 'client-a')?.cursor).toEqual({ x: 0.3, y: 0.4 });

    session.publishCursor(0.5, 0.6);
    await tick(90);
    expect(transport.sent.some((m) => m.t === 'cursor' && m.x === 0.5)).toBe(true);

    transport.peers = transport.peers.filter((p) => p.clientId !== 'client-a');
    transport.addPeer({ clientId: 'client-c' });
    expect(roomStore.getState().peers.find((p) => p.clientId === 'client-a')).toBeUndefined();
  });

  it('não reage às próprias mensagens', async () => {
    const { transport } = await start();
    transport.receive({ t: 'ops', from: 'client-b', ops: [{ k: 'agents:a1', v: agent(), s: stamp(9, 'client-b') }] });
    expect(docStore.getState().doc!.agents.a1).toBeUndefined();
  });

  it('dois participantes convergem depois de editar ao mesmo tempo', async () => {
    const a = { transport: new FakeTransport(), doc: emptyDoc({ id: 'a' }) };
    const b = { transport: new FakeTransport(), doc: emptyDoc({ id: 'b' }) };

    docActions.load(a.doc);
    const sessionA = new RoomSession({ transport: a.transport, identity: { clientId: 'a', userId: 'ua', name: 'A', color: '#fff' }, role: 'editor', roomId: 'r', inviteCode: 'c', flushMs: 0 });
    await sessionA.start();
    docActions.change([{ c: 'agents', id: 'x', after: agent({ id: 'x', position: { x: 0.1, y: 0.1 } }) }]);
    await tick();
    const opsFromA = a.transport.opsSent();
    sessionA.stop();
    const docA = docStore.getState().doc!;

    docActions.load(b.doc);
    const sessionB = new RoomSession({ transport: b.transport, identity: { clientId: 'b', userId: 'ub', name: 'B', color: '#fff' }, role: 'editor', roomId: 'r', inviteCode: 'c', flushMs: 0 });
    await sessionB.start();
    docActions.change([{ c: 'agents', id: 'x', after: agent({ id: 'x', position: { x: 0.9, y: 0.9 } }) }]);
    await tick();
    const opsFromB = b.transport.opsSent();
    b.transport.addPeer({ clientId: 'a' });
    b.transport.receive({ t: 'ops', from: 'a', ops: opsFromA });
    const finalAtB = docStore.getState().doc!.agents.x!.position.x;
    sessionB.stop();

    docActions.load(docA);
    const sessionA2 = new RoomSession({ transport: a.transport, identity: { clientId: 'a', userId: 'ua', name: 'A', color: '#fff' }, role: 'editor', roomId: 'r', inviteCode: 'c', flushMs: 0 });
    await sessionA2.start({ 'agents:x': opsFromA[0]!.s });
    a.transport.addPeer({ clientId: 'b' });
    a.transport.receive({ t: 'ops', from: 'b', ops: opsFromB });
    const finalAtA = docStore.getState().doc!.agents.x!.position.x;
    sessionA2.stop();

    expect(finalAtA).toBe(finalAtB);
  });
});
