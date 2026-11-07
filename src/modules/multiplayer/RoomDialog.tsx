import { useEffect, useState } from 'react';
import { isSupabaseConfigured } from '../services/supabase';
import { saveStrategy } from '../persistence/strategyRepo';
import { docStore } from '../strategy/docStore';
import { navigate } from '../../app/router';
import { Button, Modal } from '../../ui/kit';
import { toast } from '../../ui/toastStore';
import { buildInviteUrl, changeRole, createRoom, getDisplayName, leaveRoom, roomDocCopy } from './roomService';
import { ROLE_LABEL, useRoom, type ConnectionState, type RoomRole } from './roomStore';

const CONNECTION_LABEL: Record<ConnectionState, string> = {
  idle: 'Desconectado',
  connecting: 'Conectando…',
  online: 'Conectado',
  reconnecting: 'Sem conexão. Tentando voltar; suas alterações ficam guardadas.',
  offline: 'Sem conexão',
};

function CreateRoom({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getDisplayName().then(setName);
  }, []);

  const create = async () => {
    const doc = docStore.getState().doc;
    if (!doc) return;
    setBusy(true);
    try {
      const { code } = await createRoom(doc, name);
      onClose();
      navigate(`/sala/${encodeURIComponent(code)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível criar a sala.');
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ash">Crie uma sala com esta estratégia e envie o convite. Todos editam o mesmo mapa e a mesma timeline ao vivo.</p>
      {!isSupabaseConfigured && (
        <p className="border-l-2 border-signal pl-2 text-sm" data-testid="local-room-note">
          Este site ainda não tem salas online configuradas. A sala criada aqui funciona apenas entre abas deste navegador, para experimentar a colaboração.
        </p>
      )}
      <label>
        <span className="field-label">Seu nome na sala</span>
        <input className="field" maxLength={40} value={name} data-testid="room-display-name" onChange={(event) => setName(event.target.value)} />
      </label>
      <Button variant="primary" disabled={busy} data-testid="room-create" onClick={() => void create()}>
        {isSupabaseConfigured ? 'Criar sala' : 'Criar sala local'}
      </Button>
    </div>
  );
}

function ActiveRoom({ onClose }: { onClose: () => void }) {
  const code = useRoom((s) => s.inviteCode);
  const role = useRoom((s) => s.role);
  const peers = useRoom((s) => s.peers);
  const connection = useRoom((s) => s.connection);
  const pending = useRoom((s) => s.pendingOps);
  const kind = useRoom((s) => s.transportKind);
  const selfId = useRoom((s) => s.clientId);
  const invite = code ? buildInviteUrl(code) : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite);
      toast.success('Convite copiado.');
    } catch {
      toast.error('O navegador bloqueou a cópia. Selecione o convite e copie manualmente.');
    }
  };

  const saveCopy = async () => {
    const copyDoc = roomDocCopy();
    if (!copyDoc) return;
    try {
      await saveStrategy(copyDoc);
      toast.success('Cópia salva em Estratégias.');
    } catch (error) {
      toast.error(`Não foi possível salvar: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
    }
  };

  const updateRole = async (userId: string, next: RoomRole) => {
    try {
      await changeRole(userId, next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível mudar o papel.');
    }
  };

  // Vários clientes podem ser a mesma pessoa; o papel é por usuário.
  const seen = new Set<string>();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="room-connection" data-state={connection}>
        <span className={`h-2 w-2 ${connection === 'online' ? 'bg-defense' : 'bg-signal'}`} />
        {CONNECTION_LABEL[connection]}
        {pending > 0 && <span className="text-ash">{pending} alterações aguardando envio</span>}
      </div>

      {kind === 'local' && <p className="border-l-2 border-signal pl-2 text-sm">Sala local: o convite só funciona em outras abas deste navegador.</p>}

      <div>
        <span className="field-label">Convite</span>
        <div className="flex gap-2">
          <input className="field text-sm" readOnly value={invite} aria-label="Link de convite" data-testid="room-invite" onFocus={(event) => event.target.select()} />
          <Button variant="primary" className="shrink-0" icon="link" onClick={() => void copy()}>
            Copiar
          </Button>
        </div>
      </div>

      <section aria-label="Participantes">
        <h3 className="mb-2 font-semibold">Participantes online ({peers.length})</h3>
        <ul className="flex flex-col gap-1" data-testid="room-peers">
          {peers.map((peer) => {
            const firstOfUser = !seen.has(peer.userId);
            seen.add(peer.userId);
            const isSelf = peer.clientId === selfId;
            return (
              <li key={peer.clientId} className="flex items-center gap-2 border border-steel p-1.5">
                <span className="h-3 w-3 shrink-0" style={{ backgroundColor: peer.color }} />
                <span className="min-w-0 flex-1 truncate">
                  {peer.name}
                  {isSelf ? ' (você)' : ''}
                </span>
                {role === 'admin' && !isSelf && firstOfUser ? (
                  <select
                    aria-label={`Papel de ${peer.name}`}
                    data-testid="room-role-select"
                    className="field w-36 py-0.5 text-sm"
                    value={peer.role}
                    onChange={(event) => void updateRole(peer.userId, event.target.value as RoomRole)}
                  >
                    {(Object.keys(ROLE_LABEL) as RoomRole[]).map((value) => (
                      <option key={value} value={value}>
                        {ROLE_LABEL[value]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm text-ash" data-testid="room-role-label">
                    {ROLE_LABEL[peer.role]}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex flex-wrap justify-between gap-2 border-t border-steel pt-3">
        <Button variant="ghost" icon="save" data-testid="room-save-copy" onClick={() => void saveCopy()}>
          Salvar uma cópia
        </Button>
        <Button
          variant="danger"
          data-testid="room-leave"
          onClick={() => {
            leaveRoom();
            onClose();
            navigate('/estrategias');
          }}
        >
          Sair da sala
        </Button>
      </div>
    </div>
  );
}

export function RoomDialog({ onClose }: { onClose: () => void }) {
  const active = useRoom((s) => s.active);
  return (
    <Modal title={active ? 'Sala' : 'Planejar com amigos'} onClose={onClose}>
      {active ? <ActiveRoom onClose={onClose} /> : <CreateRoom onClose={onClose} />}
    </Modal>
  );
}
