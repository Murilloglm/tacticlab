// Transporte da sala. O motor só conhece esta interface, o que permite testá-lo sem rede.
import type { RoomRole } from './roomStore';
import { roomMessageSchema, type RoomMessage } from './protocol';

export type TransportStatus = 'connecting' | 'online' | 'offline';

export interface PresenceInfo {
  clientId: string;
  userId: string;
  name: string;
  color: string;
  role: RoomRole;
}

export interface RoomTransport {
  readonly kind: 'supabase' | 'local';
  connect(presence: PresenceInfo): Promise<void>;
  close(): void;
  send(message: RoomMessage): void;
  updatePresence(presence: PresenceInfo): void;
  onMessage(listener: (message: RoomMessage) => void): void;
  onPresence(listener: (peers: PresenceInfo[]) => void): void;
  onStatus(listener: (status: TransportStatus) => void): void;
}

const HEARTBEAT_MS = 2000;
const PEER_TIMEOUT_MS = 6000;

type LocalEnvelope =
  | { type: 'message'; message: RoomMessage }
  | { type: 'presence'; presence: PresenceInfo }
  | { type: 'leave'; clientId: string };

/**
 * Sala entre abas do mesmo navegador, via BroadcastChannel.
 * Permite experimentar a colaboração sem backend; nunca sai deste computador.
 */
export class LocalTransport implements RoomTransport {
  readonly kind = 'local' as const;
  private channel: BroadcastChannel | null = null;
  private presence: PresenceInfo | null = null;
  private peers = new Map<string, { info: PresenceInfo; seen: number }>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private messageListener: (message: RoomMessage) => void = () => undefined;
  private presenceListener: (peers: PresenceInfo[]) => void = () => undefined;
  private statusListener: (status: TransportStatus) => void = () => undefined;

  constructor(private readonly roomId: string) {}

  onMessage(listener: (message: RoomMessage) => void) {
    this.messageListener = listener;
  }
  onPresence(listener: (peers: PresenceInfo[]) => void) {
    this.presenceListener = listener;
  }
  onStatus(listener: (status: TransportStatus) => void) {
    this.statusListener = listener;
  }

  private emitPeers() {
    const self = this.presence ? [this.presence] : [];
    this.presenceListener([...self, ...[...this.peers.values()].map((peer) => peer.info)]);
  }

  private post(envelope: LocalEnvelope) {
    this.channel?.postMessage(envelope);
  }

  async connect(presence: PresenceInfo): Promise<void> {
    this.presence = presence;
    this.channel = new BroadcastChannel(`tacticlab-room-${this.roomId}`);
    this.channel.onmessage = (event: MessageEvent<LocalEnvelope>) => {
      const data = event.data;
      if (data.type === 'message') {
        const parsed = roomMessageSchema.safeParse(data.message);
        if (parsed.success) this.messageListener(parsed.data);
      } else if (data.type === 'presence') {
        const isNew = !this.peers.has(data.presence.clientId);
        this.peers.set(data.presence.clientId, { info: data.presence, seen: Date.now() });
        this.emitPeers();
        if (isNew && this.presence) this.post({ type: 'presence', presence: this.presence });
      } else if (data.type === 'leave') {
        this.peers.delete(data.clientId);
        this.emitPeers();
      }
    };
    this.timer = setInterval(() => {
      if (this.presence) this.post({ type: 'presence', presence: this.presence });
      const cutoff = Date.now() - PEER_TIMEOUT_MS;
      let changed = false;
      for (const [id, peer] of this.peers) {
        if (peer.seen < cutoff) {
          this.peers.delete(id);
          changed = true;
        }
      }
      if (changed) this.emitPeers();
    }, HEARTBEAT_MS);
    this.post({ type: 'presence', presence });
    this.emitPeers();
    this.statusListener('online');
  }

  send(message: RoomMessage) {
    this.post({ type: 'message', message });
  }

  updatePresence(presence: PresenceInfo) {
    this.presence = presence;
    this.post({ type: 'presence', presence });
    this.emitPeers();
  }

  close() {
    if (this.timer) clearInterval(this.timer);
    if (this.presence) this.post({ type: 'leave', clientId: this.presence.clientId });
    this.channel?.close();
    this.channel = null;
    this.statusListener('offline');
  }
}
