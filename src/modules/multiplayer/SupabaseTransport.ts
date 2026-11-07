// Transporte via Supabase Realtime. Usa dois canais privados, autorizados por RLS:
//   room:<id>:ops   alterações do documento, em que só editores e administradores publicam
//   room:<id>:live  presença e cursores, abertos a qualquer membro da sala
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { roomMessageSchema, type RoomMessage } from './protocol';
import type { PresenceInfo, RoomTransport, TransportStatus } from './transport';

const LIVE_MESSAGES = new Set<RoomMessage['t']>(['cursor', 'sync-request']);

export const roomTopics = (roomId: string) => ({ ops: `room:${roomId}:ops`, live: `room:${roomId}:live` });

/** Fases de um canal que importam para a interface. */
export function combineStatus(ops: string, live: string): TransportStatus {
  if (ops === 'SUBSCRIBED' && live === 'SUBSCRIBED') return 'online';
  const broken = new Set(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']);
  if (broken.has(ops) || broken.has(live)) return 'offline';
  return 'connecting';
}

export class SupabaseTransport implements RoomTransport {
  readonly kind = 'supabase' as const;
  private opsChannel: RealtimeChannel | null = null;
  private liveChannel: RealtimeChannel | null = null;
  private opsStatus = 'CONNECTING';
  private liveStatus = 'CONNECTING';
  private closing = false;
  private messageListener: (message: RoomMessage) => void = () => undefined;
  private presenceListener: (peers: PresenceInfo[]) => void = () => undefined;
  private statusListener: (status: TransportStatus) => void = () => undefined;

  constructor(
    private readonly client: SupabaseClient,
    private readonly roomId: string,
  ) {}

  onMessage(listener: (message: RoomMessage) => void) {
    this.messageListener = listener;
  }
  onPresence(listener: (peers: PresenceInfo[]) => void) {
    this.presenceListener = listener;
  }
  onStatus(listener: (status: TransportStatus) => void) {
    this.statusListener = listener;
  }

  private receive = ({ payload }: { payload: unknown }) => {
    const parsed = roomMessageSchema.safeParse(payload);
    if (parsed.success) this.messageListener(parsed.data);
  };

  private emitStatus() {
    if (!this.closing) this.statusListener(combineStatus(this.opsStatus, this.liveStatus));
  }

  async connect(presence: PresenceInfo): Promise<void> {
    // Canais privados exigem o token do usuário para a RLS identificar quem está entrando.
    await this.client.realtime.setAuth();
    const topics = roomTopics(this.roomId);

    this.statusListener('connecting');
    this.opsChannel = this.client.channel(topics.ops, {
      config: { private: true, broadcast: { self: false, ack: false } },
    });
    this.liveChannel = this.client.channel(topics.live, {
      config: { private: true, broadcast: { self: false }, presence: { key: presence.clientId } },
    });

    this.opsChannel.on('broadcast', { event: 'message' }, this.receive);
    this.liveChannel.on('broadcast', { event: 'message' }, this.receive);
    this.liveChannel.on('presence', { event: 'sync' }, () => {
      const state = this.liveChannel?.presenceState<PresenceInfo>() ?? {};
      this.presenceListener(Object.values(state).flatMap((entries) => entries.map((entry) => entry as unknown as PresenceInfo)));
    });

    this.opsChannel.subscribe((status) => {
      this.opsStatus = status;
      this.emitStatus();
    });
    this.liveChannel.subscribe((status) => {
      this.liveStatus = status;
      if (status === 'SUBSCRIBED') void this.liveChannel?.track(presence);
      this.emitStatus();
    });
  }

  send(message: RoomMessage) {
    const channel = LIVE_MESSAGES.has(message.t) ? this.liveChannel : this.opsChannel;
    void channel?.send({ type: 'broadcast', event: 'message', payload: message });
  }

  updatePresence(presence: PresenceInfo) {
    void this.liveChannel?.track(presence);
  }

  close() {
    this.closing = true;
    if (this.opsChannel) void this.client.removeChannel(this.opsChannel);
    if (this.liveChannel) void this.client.removeChannel(this.liveChannel);
    this.opsChannel = null;
    this.liveChannel = null;
  }
}
