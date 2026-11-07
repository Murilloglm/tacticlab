import { useState } from 'react';
import { findMap, useCatalog } from '../catalog/catalogStore';
import { docActions, docStore, useDoc } from '../strategy/docStore';
import { HistoryDialog } from '../persistence/HistoryDialog';
import { ShareDialog } from '../persistence/ShareDialog';
import { saveNow, useSaveStatus } from '../persistence/useAutosave';
import { useRoom } from '../multiplayer/roomStore';
import { RoomDialog } from '../multiplayer/RoomDialog';
import { navigate } from '../../app/router';
import { Logo } from '../../app/Shell';
import { Button, IconButton, TeamBadge } from '../../ui/kit';
import { toast } from '../../ui/toastStore';
import { setEditor, useEditor, type ViewMode } from './editorStore';

/** O interruptor principal do produto: troca a visão sem tocar nos dados. */
function ModeSwitch() {
  const viewMode = useEditor((s) => s.viewMode);
  const options: Array<{ mode: ViewMode; label: string }> = [
    { mode: '2d', label: 'MODO 2D' },
    { mode: '3d', label: 'MODO 3D' },
  ];
  return (
    <div className="relative grid shrink-0 grid-cols-2 bg-ink p-0.5" role="group" aria-label="Modo de visualização" data-testid="mode-switch">
      <span
        aria-hidden="true"
        className="cut absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] bg-signal transition-transform duration-200 ease-out"
        style={{ transform: viewMode === '3d' ? 'translateX(100%)' : 'none' }}
      />
      {options.map(({ mode, label }) => (
        <button
          key={mode}
          type="button"
          aria-pressed={viewMode === mode}
          data-testid={`mode-${mode}`}
          onClick={() => setEditor({ viewMode: mode })}
          aria-label={label}
          className={`display relative z-10 whitespace-nowrap px-2.5 py-1 text-sm transition-colors sm:px-4 sm:text-base ${viewMode === mode ? 'text-white' : 'text-ash hover:text-bone'}`}
        >
          <span className="hidden min-[520px]:inline">MODO </span>
          {label.replace('MODO ', '')}
        </button>
      ))}
    </div>
  );
}

function SaveIndicator() {
  const status = useSaveStatus();
  const inRoom = useRoom((s) => s.active);
  if (inRoom) return null;
  const text = status === 'saving' ? 'Salvando…' : status === 'error' ? 'Erro ao salvar' : status === 'dirty' ? 'Alterado' : 'Salvo no navegador';
  return (
    <span className={`hidden text-sm xl:inline ${status === 'error' ? 'text-signal' : 'text-ash'}`} data-testid="save-status" data-status={status}>
      {text}
    </span>
  );
}

function RoomButton({ onOpen }: { onOpen: () => void }) {
  const active = useRoom((s) => s.active);
  const count = useRoom((s) => s.peers.length);
  const connection = useRoom((s) => s.connection);
  return (
    <Button variant={active ? 'primary' : 'ghost'} icon="users" className="px-2 sm:px-3" onClick={onOpen} data-testid="room-button" title={active ? `Sala: ${connection}` : 'Planejar com amigos'}>
      <span className="hidden lg:inline">{active ? `${count} na sala` : 'Sala'}</span>
    </Button>
  );
}

/** Registra uma versão no histórico. Usado pela barra superior e pelo painel da estratégia. */
export function saveVersion(): void {
  void saveNow('Salva manualmente').then(
    () => toast.success('Versão salva no histórico.'),
    (error: unknown) => toast.error(`Não foi possível salvar: ${error instanceof Error ? error.message : 'erro desconhecido'}`),
  );
}

export function TopBar() {
  const name = useDoc((s) => s.doc?.name ?? '');
  const side = useDoc((s) => s.doc?.side ?? 'attack');
  const mapId = useDoc((s) => s.doc?.mapId);
  const readOnly = useDoc((s) => s.readOnly);
  const canUndo = useDoc((s) => s.past.length > 0);
  const canRedo = useDoc((s) => s.future.length > 0);
  const panelOpen = useEditor((s) => s.panelOpen);
  const timelineOpen = useEditor((s) => s.timelineOpen);
  const catalog = useCatalog((s) => s.catalog);
  const inRoom = useRoom((s) => s.active);
  const [dialog, setDialog] = useState<'share' | 'history' | 'room' | null>(null);

  const mapName = mapId ? (findMap(catalog, mapId)?.displayName ?? 'Mapa') : '';

  const toggleSide = () => {
    const current = docStore.getState().doc;
    if (current) docActions.change([{ c: 'meta', key: 'side', after: current.side === 'attack' ? 'defense' : 'attack' }]);
  };

  return (
    <header className="flex items-center gap-1 border-b border-steel bg-carbon px-2 py-1.5 sm:gap-2" data-testid="top-bar">
      <Logo onClick={() => navigate('/estrategias')} />
      <div className="hidden min-w-0 flex-1 items-center gap-2 md:flex">
        <input
          aria-label="Nome da estratégia"
          data-testid="strategy-name"
          value={name}
          maxLength={120}
          disabled={readOnly}
          onChange={(event) => {
            if (event.target.value.trim()) docActions.change([{ c: 'meta', key: 'name', after: event.target.value }], { coalesce: 'rename' });
          }}
          onBlur={() => docActions.endGesture()}
          className="w-full min-w-0 max-w-60 truncate border border-transparent bg-transparent px-1 font-medium hover:border-steel focus:border-bone focus:outline-none"
        />
        <span className="hidden shrink-0 text-sm text-ash lg:inline">{mapName}</span>
        <button type="button" className="shrink-0" title="Alternar entre ataque e defesa" disabled={readOnly} onClick={toggleSide} data-testid="strategy-side">
          <TeamBadge team={side} />
        </button>
      </div>

      <ModeSwitch />

      <div className="ml-auto flex shrink-0 items-center justify-end gap-0.5 sm:gap-1 md:ml-0 md:flex-1 md:shrink" data-testid="top-actions">
        <SaveIndicator />
        <IconButton icon="undo" label="Desfazer (Ctrl+Z)" disabled={!canUndo || readOnly} onClick={() => docActions.undo()} data-testid="undo" />
        <IconButton icon="redo" label="Refazer (Ctrl+Y)" disabled={!canRedo || readOnly} onClick={() => docActions.redo()} data-testid="redo" />
        {!inRoom && (
          <span className="hidden sm:contents">
            <IconButton icon="save" label="Salvar versão no histórico" data-testid="save-version" onClick={saveVersion} />
            <IconButton icon="history" label="Histórico de alterações" data-testid="open-history" onClick={() => setDialog('history')} />
          </span>
        )}
        <IconButton icon="share" label="Exportar e compartilhar" data-testid="open-share" onClick={() => setDialog('share')} />
        <RoomButton onOpen={() => setDialog('room')} />
        <IconButton icon="timeline" label={timelineOpen ? 'Ocultar timeline' : 'Mostrar timeline'} active={timelineOpen} quietActive data-testid="toggle-timeline" onClick={() => setEditor({ timelineOpen: !timelineOpen })} />
        <IconButton icon="panel" label={panelOpen ? 'Recolher painel' : 'Abrir painel'} active={panelOpen} quietActive data-testid="toggle-panel" onClick={() => setEditor({ panelOpen: !panelOpen })} />
      </div>

      {dialog === 'share' && <ShareDialog onClose={() => setDialog(null)} />}
      {dialog === 'history' && <HistoryDialog onClose={() => setDialog(null)} />}
      {dialog === 'room' && <RoomDialog onClose={() => setDialog(null)} />}
    </header>
  );
}
