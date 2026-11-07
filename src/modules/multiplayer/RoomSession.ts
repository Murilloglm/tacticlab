// Motor da sala: carimba alterações locais, aplica as remotas sem conflito, guarda o que foi
// feito offline e recupera o estado ao reconectar.
import { docActions, docStore, subscribeChanges, type Change, type ChangeInput } from '../strategy/docStore';
import { parseStrategy, type StrategyDoc } from '../strategy/schema';
import { roomStore, type Peer, type RoomRole } from './roomStore';
import {
  changeKey,
  documentKeys,
  isNewer,
  mergeRemoteState,
  opToChange,
  readKey,
  ZERO_STAMP,
  type RoomMessage,
  type Stamp,
  type WireOp,
} from './protocol';
import type { PresenceInfo, RoomTransport, TransportStatus } from './transport';

export interface RoomIdentity {
  clientId: string;
  userId: string;
  name: string;
  color: string;
}

export interface RoomSessionOptions {
  transport: RoomTransport;
  identity: RoomIdentity;
  role: RoomRole;
  roomId: string;
  inviteCode: string;
  /** Mapa usuário → papel conhecido no início (vem do banco). */
  knownRoles?: Record<string, RoomRole>;
  /** Grava o snapshot no backend. Ausente em salas locais. */
  persist?: (doc: StrategyDoc, stamps: Record<string, Stamp>) => Promise<void>;
  /** Lê o snapshot mais recente do backend ao reconectar. */
  loadLatest?: () => Promise<{ doc: StrategyDoc; stamps: Record<string, Stamp> } | null>;
  /** Altera o papel no backend antes de avisar a sala. */
  commitRole?: (userId: string, role: RoomRole) => Promise<void>;
  flushMs?: number;
  persistMs?: number;
}

const canEdit = (role: RoomRole | null | undefined) => role === 'admin' || role === 'editor';

export class RoomSession {
  private clock = 0;
  private stamps: Record<string, Stamp> = {};
  /** Última versão de cada chave ainda não enviada. Sobrevive à queda de conexão. */
  private outbox = new Map<string, WireOp>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private cursorTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingCursor: { x: number; y: number } | null = null;
  private online = false;
  private wasOnline = false;
  private peers: PresenceInfo[] = [];
  private cursors = new Map<string, { x: number; y: number }>();
  private roles: Record<string, RoomRole>;
  private role: RoomRole;
  private unsubscribe: (() => void) | null = null;
  private synced: (() => void) | null = null;
  private closed = false;

  constructor(private readonly options: RoomSessionOptions) {
    this.role = options.role;
    this.roles = { ...options.knownRoles, [options.identity.userId]: options.role };
  }

  private get flushMs() {
    return this.options.flushMs ?? 40;
  }
  private get persistMs() {
    return this.options.persistMs ?? 1500;
  }

  private presence(): PresenceInfo {
    return { ...this.options.identity, role: this.role };
  }

  private publishState(extra: Partial<Parameters<typeof roomStore.setState>[0]> = {}) {
    const peers: Peer[] = this.peers.map((peer) => ({
      ...peer,
      role: this.roles[peer.userId] ?? peer.role,
      cursor: this.cursors.get(peer.clientId) ?? null,
    }));
    roomStore.setState({ peers, role: this.role, pendingOps: this.outbox.size, ...extra });
  }

  async start(initialStamps: Record<string, Stamp> = {}): Promise<void> {
    const { transport, identity, roomId, inviteCode } = this.options;
    this.stamps = { ...initialStamps };
    for (const stamp of Object.values(initialStamps)) this.clock = Math.max(this.clock, stamp.l);

    roomStore.setState({
      active: true,
      roomId,
      inviteCode,
      clientId: identity.clientId,
      role: this.role,
      connection: 'connecting',
      transportKind: transport.kind,
      peers: [],
      pendingOps: 0,
    });
    docActions.setReadOnly(!canEdit(this.role));

    transport.onMessage((message) => this.handleMessage(message));
    transport.onPresence((peers) => {
      this.peers = peers;
      const alive = new Set(peers.map((peer) => peer.clientId));
      for (const id of this.cursors.keys()) if (!alive.has(id)) this.cursors.delete(id);
      this.publishState();
    });
    transport.onStatus((status) => this.handleStatus(status));

    this.unsubscribe = subscribeChanges((changes, origin) => {
      if (origin !== 'remote') this.queueLocal(changes);
    });

    await transport.connect(this.presence());
  }

  /** Espera o primeiro estado de outro participante, ou desiste depois de `timeoutMs`. */
  waitForSync(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.synced = null;
        resolve(false);
      }, timeoutMs);
      this.synced = () => {
        clearTimeout(timer);
        this.synced = null;
        resolve(true);
      };
      this.requestSync();
    });
  }

  stop(): void {
    this.closed = true;
    this.unsubscribe?.();
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.cursorTimer) clearTimeout(this.cursorTimer);
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      void this.persistNow();
    }
    this.options.transport.close();
    docActions.setReadOnly(false);
  }

  getStamps(): Record<string, Stamp> {
    return this.stamps;
  }

  private handleStatus(status: TransportStatus) {
    const previouslyOnline = this.online;
    this.online = status === 'online';
    roomStore.setState({
      connection: status === 'online' ? 'online' : this.wasOnline ? 'reconnecting' : status === 'connecting' ? 'connecting' : 'offline',
    });
    if (status === 'online') {
      const reconnecting = this.wasOnline && !previouslyOnline;
      this.wasOnline = true;
      if (reconnecting) void this.recover();
      else this.scheduleFlush();
    }
  }

  /** Volta da queda: busca o que os outros fizeram e só então reenvia o que ficou pendente. */
  private async recover() {
    const { loadLatest } = this.options;
    if (loadLatest) {
      try {
        const latest = await loadLatest();
        if (latest && !this.closed) this.mergeState(latest.doc, latest.stamps);
      } catch (error) {
        console.warn('Falha ao recuperar o snapshot da sala:', error);
      }
    }
    if (this.closed) return;
    this.requestSync();
    this.scheduleFlush();
  }

  private requestSync() {
    this.options.transport.send({ t: 'sync-request', from: this.options.identity.clientId });
  }

  private nextStamp(): Stamp {
    this.clock += 1;
    return { l: this.clock, c: this.options.identity.clientId };
  }

  private queueLocal(changes: Change[]) {
    if (!canEdit(this.role)) return;
    for (const change of changes) {
      // Pastas são organização pessoal e não trafegam.
      if (change.c === 'meta' && change.key === 'folderId') continue;
      const key = changeKey(change);
      const stamp = this.nextStamp();
      this.stamps[key] = stamp;
      this.outbox.set(key, { k: key, v: change.after, s: stamp });
    }
    this.publishState();
    this.scheduleFlush();
    this.schedulePersist();
  }

  private scheduleFlush() {
    if (this.flushTimer || this.closed) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, this.flushMs);
  }

  private flush() {
    if (!this.online || this.outbox.size === 0) return;
    const ops = [...this.outbox.values()];
    this.outbox.clear();
    for (let i = 0; i < ops.length; i += 200) {
      this.options.transport.send({ t: 'ops', from: this.options.identity.clientId, ops: ops.slice(i, i + 200) });
    }
    this.publishState();
  }

  private senderRole(clientId: string): RoomRole | null {
    const peer = this.peers.find((item) => item.clientId === clientId);
    if (!peer) return null;
    return this.roles[peer.userId] ?? peer.role;
  }

  private handleMessage(message: RoomMessage) {
    const self = this.options.identity.clientId;
    if (message.from === self) return;
    switch (message.t) {
      case 'ops': {
        // Espectadores são recusados também aqui, além das regras do servidor.
        if (this.senderRole(message.from) === 'viewer') return;
        this.applyOps(message.ops as WireOp[]);
        break;
      }
      case 'sync-request':
        if (this.isDesignatedResponder(message.from)) this.sendState(message.from);
        break;
      case 'sync-state': {
        if (message.to && message.to !== self) return;
        const parsed = parseStrategy(message.doc);
        if (!parsed.ok) return;
        this.mergeState(parsed.doc, message.stamps);
        this.synced?.();
        break;
      }
      case 'cursor':
        this.cursors.set(message.from, { x: message.x, y: message.y });
        this.publishState();
        break;
      case 'roles':
        if (this.senderRole(message.from) === 'admin') this.applyRoles(message.roles);
        break;
    }
  }

  private isDesignatedResponder(requester: string): boolean {
    const self = this.options.identity.clientId;
    if (!canEdit(this.role)) return false;
    const candidates = this.peers
      .filter((peer) => peer.clientId !== requester && canEdit(this.roles[peer.userId] ?? peer.role))
      .map((peer) => peer.clientId);
    if (!candidates.includes(self)) candidates.push(self);
    return candidates.sort()[0] === self;
  }

  private sendState(to: string) {
    const doc = docStore.getState().doc;
    if (!doc) return;
    this.options.transport.send({ t: 'sync-state', from: this.options.identity.clientId, to, doc, stamps: this.stamps });
  }

  applyOps(ops: WireOp[]) {
    const inputs: ChangeInput[] = [];
    for (const op of ops) {
      this.clock = Math.max(this.clock, op.s.l);
      const current = this.stamps[op.k] ?? ZERO_STAMP;
      if (!isNewer(op.s, current)) continue;
      const change = opToChange(op);
      if (!change) continue;
      this.stamps[op.k] = op.s;
      // Escrita remota mais nova supera o que ainda estava pendente para esta chave.
      this.outbox.delete(op.k);
      inputs.push(change);
    }
    if (inputs.length) {
      docActions.applyRemote(inputs);
      this.schedulePersist();
    }
    this.publishState();
  }

  private mergeState(remote: StrategyDoc, remoteStamps: Record<string, Stamp>) {
    const local = docStore.getState().doc;
    if (!local) {
      docActions.load(remote, { readOnly: !canEdit(this.role) });
      this.stamps = { ...remoteStamps };
      for (const stamp of Object.values(remoteStamps)) this.clock = Math.max(this.clock, stamp.l);
      return;
    }
    for (const stamp of Object.values(remoteStamps)) this.clock = Math.max(this.clock, stamp.l);
    const { changes, stamps } = mergeRemoteState(local, this.stamps, remote, remoteStamps);
    this.stamps = stamps;
    for (const key of Object.keys(remoteStamps)) {
      const pending = this.outbox.get(key);
      if (pending && isNewer(remoteStamps[key]!, pending.s)) this.outbox.delete(key);
    }
    if (changes.length) docActions.applyRemote(changes);
    this.publishState();
  }

  private applyRoles(roles: Record<string, RoomRole>) {
    this.roles = { ...this.roles, ...roles };
    const mine = this.roles[this.options.identity.userId];
    if (mine && mine !== this.role) {
      this.role = mine;
      docActions.setReadOnly(!canEdit(mine));
      if (!canEdit(mine)) this.outbox.clear();
      this.options.transport.updatePresence(this.presence());
    }
    this.publishState();
  }

  /** Só o administrador muda papéis. O backend valida de novo quando existe. */
  async setRole(userId: string, role: RoomRole): Promise<void> {
    if (this.role !== 'admin') throw new Error('Apenas administradores alteram papéis.');
    await this.options.commitRole?.(userId, role);
    const update = { [userId]: role };
    this.applyRoles(update);
    this.options.transport.send({ t: 'roles', from: this.options.identity.clientId, roles: update });
  }

  /** Envia a posição do ponteiro em no máximo 15 mensagens por segundo. */
  publishCursor(x: number, y: number) {
    this.pendingCursor = { x, y };
    if (this.cursorTimer || !this.online) return;
    this.cursorTimer = setTimeout(() => {
      this.cursorTimer = null;
      if (this.pendingCursor && this.online) {
        this.options.transport.send({ t: 'cursor', from: this.options.identity.clientId, ...this.pendingCursor });
      }
    }, 66);
  }

  private schedulePersist() {
    if (!this.options.persist || this.persistTimer || !canEdit(this.role)) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persistNow();
    }, this.persistMs);
  }

  private async persistNow() {
    const doc = docStore.getState().doc;
    if (!doc || !this.options.persist) return;
    try {
      await this.options.persist(doc, this.stamps);
    } catch (error) {
      console.warn('Falha ao salvar o snapshot da sala:', error);
    }
  }

  /** Carimba o documento inicial, para que quem criou a sala tenha prioridade sobre versões vazias. */
  stampInitialDocument(doc: StrategyDoc) {
    for (const key of documentKeys(doc)) {
      if (readKey(doc, key) !== null && !this.stamps[key]) this.stamps[key] = this.nextStamp();
    }
  }
}
