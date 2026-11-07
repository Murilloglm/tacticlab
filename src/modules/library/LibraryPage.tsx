import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { isPlaceableSlot } from '../abilities/taxonomy';
import { findAgent, findMap, useCatalog } from '../catalog/catalogStore';
import type { MapPoint } from '../coordinates';
import { Icon } from '../../ui/Icon';
import { Button, IconButton, Modal, Spinner } from '../../ui/kit';
import { toast } from '../../ui/toastStore';
import {
  deleteLineupLocal,
  fileToDataUrl,
  LINEUP_STATUS_LABEL,
  listLineups,
  MAX_LINEUP_IMAGES,
  saveLineup,
  type Lineup,
  type LineupStatus,
} from './lineupRepo';

type PointKey = 'start' | 'aim' | 'impact';

const POINTS: Array<{ key: PointKey; label: string; color: string }> = [
  { key: 'start', label: 'Posição inicial', color: '#2fc4d6' },
  { key: 'aim', label: 'Local de mira', color: '#f6e27a' },
  { key: 'impact', label: 'Local de impacto', color: '#ef3b48' },
];

function LineupMap({ mapUrl, points, active, onPick }: { mapUrl: string | undefined; points: Partial<Record<PointKey, MapPoint>>; active?: PointKey; onPick?: (point: MapPoint) => void }) {
  const line = POINTS.map((item) => points[item.key]).filter((p): p is MapPoint => Boolean(p));
  return (
    <div
      className={`relative aspect-square w-full bg-ink ${onPick ? 'cursor-crosshair' : ''}`}
      data-testid={onPick ? 'lineup-map-picker' : undefined}
      onClick={(event) => {
        if (!onPick) return;
        const rect = event.currentTarget.getBoundingClientRect();
        onPick({ x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height });
      }}
    >
      {mapUrl && <img src={mapUrl} alt="" crossOrigin="anonymous" className="absolute inset-0 h-full w-full" draggable={false} />}
      <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full">
        {line.length >= 2 && <polyline points={line.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')} fill="none" stroke="#ffffff" strokeWidth="0.4" strokeDasharray="1.2 0.8" />}
        {POINTS.map((item) => {
          const p = points[item.key];
          return p ? <circle key={item.key} cx={p.x * 100} cy={p.y * 100} r={active === item.key ? 1.8 : 1.3} fill={item.color} stroke="#0c0d10" strokeWidth="0.3" /> : null;
        })}
      </svg>
    </div>
  );
}

function LineupForm({ initial, onClose, onSaved }: { initial: Lineup | null; onClose: () => void; onSaved: () => void }) {
  const catalog = useCatalog((s) => s.catalog);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [mapId, setMapId] = useState(initial?.mapId ?? catalog?.maps[0]?.uuid ?? '');
  const [agentUuid, setAgentUuid] = useState(initial?.agentUuid ?? catalog?.agents[0]?.uuid ?? '');
  const [slot, setSlot] = useState(initial?.abilitySlot ?? '');
  const [points, setPoints] = useState<Partial<Record<PointKey, MapPoint>>>(initial ? { start: initial.start, aim: initial.aim, impact: initial.impact } : {});
  const [active, setActive] = useState<PointKey>('start');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [gameVersion, setGameVersion] = useState(initial?.gameVersion ?? catalog?.gameVersion ?? '');
  const [status, setStatus] = useState<LineupStatus>(initial?.status ?? 'unverified');
  const [images, setImages] = useState<string[]>(initial?.images ?? []);

  const agent = findAgent(catalog, agentUuid);
  const abilities = agent?.abilities.filter((a) => isPlaceableSlot(a.slot)) ?? [];
  const effectiveSlot = abilities.some((a) => a.slot === slot) ? slot : (abilities[0]?.slot ?? '');
  const map = findMap(catalog, mapId);
  const complete = Boolean(points.start && points.aim && points.impact);

  const pick = (point: MapPoint) => {
    const next = { ...points, [active]: point };
    setPoints(next);
    const missing = POINTS.find((item) => !next[item.key]);
    if (missing) setActive(missing.key);
  };

  const addImages = async (files: FileList | null) => {
    if (!files) return;
    const room = MAX_LINEUP_IMAGES - images.length;
    // O campo é limpo logo após o evento, então a lista precisa ser copiada agora.
    const selected = Array.from(files);
    if (selected.length > room) toast.info(`Cada lineup aceita até ${MAX_LINEUP_IMAGES} imagens.`);
    const added: string[] = [];
    for (const file of selected.slice(0, Math.max(0, room))) {
      try {
        added.push(await fileToDataUrl(file));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Imagem inválida.');
      }
    }
    setImages((current) => [...current, ...added]);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!complete || !effectiveSlot) return;
    try {
      await saveLineup({
        id: initial?.id,
        createdAt: initial?.createdAt,
        title: title.trim(),
        mapId,
        agentUuid,
        abilitySlot: effectiveSlot,
        start: points.start!,
        aim: points.aim!,
        impact: points.impact!,
        images,
        notes,
        gameVersion: gameVersion.trim(),
        status,
      });
      onSaved();
    } catch (error) {
      toast.error(`Não foi possível salvar: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
    }
  };

  return (
    <Modal title={initial ? 'Editar lineup' : 'Nova lineup'} onClose={onClose} wide>
      <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => void submit(event)}>
        <div className="flex flex-col gap-3">
          <label>
            <span className="field-label">Título</span>
            <input className="field" required maxLength={120} value={title} data-testid="lineup-title" onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            <span className="field-label">Mapa</span>
            <select
              className="field"
              value={mapId}
              data-testid="lineup-map"
              onChange={(e) => {
                setMapId(e.target.value);
                setPoints({});
                setActive('start');
              }}
            >
              {catalog?.maps.map((item) => (
                <option key={item.uuid} value={item.uuid}>
                  {item.displayName}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="field-label">Agente</span>
              <select className="field" value={agentUuid} data-testid="lineup-agent" onChange={(e) => setAgentUuid(e.target.value)}>
                {catalog?.agents.map((item) => (
                  <option key={item.uuid} value={item.uuid}>
                    {item.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">Habilidade</span>
              <select className="field" value={effectiveSlot} data-testid="lineup-ability" onChange={(e) => setSlot(e.target.value)}>
                {abilities.map((ability) => (
                  <option key={ability.slot} value={ability.slot}>
                    {ability.displayName}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            <span className="field-label">Versão do jogo em que foi testada</span>
            <input className="field" maxLength={60} value={gameVersion} data-testid="lineup-version" onChange={(e) => setGameVersion(e.target.value)} />
          </label>
          <label>
            <span className="field-label">Situação</span>
            <select className="field" value={status} data-testid="lineup-status" onChange={(e) => setStatus(e.target.value as LineupStatus)}>
              <option value="unverified">{LINEUP_STATUS_LABEL.unverified}</option>
              <option value="self-tested">{LINEUP_STATUS_LABEL['self-tested']}</option>
            </select>
          </label>
          <label>
            <span className="field-label">Observações</span>
            <textarea className="field" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div>
            <span className="field-label">
              Imagens ({images.length}/{MAX_LINEUP_IMAGES})
            </span>
            <label className={`cut inline-flex cursor-pointer items-center gap-1.5 bg-steel px-3 py-1.5 text-sm font-medium hover:bg-iron ${images.length >= MAX_LINEUP_IMAGES ? 'pointer-events-none opacity-40' : ''}`}>
              <Icon name="image" size={16} />
              Adicionar imagens
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                data-testid="lineup-images"
                disabled={images.length >= MAX_LINEUP_IMAGES}
                onChange={(e) => {
                  void addImages(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
            {images.length > 0 && (
              <ul className="mt-2 grid grid-cols-4 gap-1">
                {images.map((src, index) => (
                  <li key={index} className="relative">
                    <img src={src} alt={`Imagem ${index + 1}`} className="aspect-square w-full object-cover" />
                    <IconButton icon="close" label={`Remover imagem ${index + 1}`} size={14} className="absolute right-0 top-0 h-6 w-6 bg-black/70" onClick={() => setImages(images.filter((_, i) => i !== index))} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Ponto a marcar">
            {POINTS.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={active === item.key}
                data-testid={`lineup-point-${item.key}`}
                onClick={() => setActive(item.key)}
                className={`flex items-center gap-1 px-2 py-1 text-sm ${active === item.key ? 'bg-bone text-ink' : 'bg-steel text-ash'}`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label}
                {points[item.key] ? ' ✓' : ''}
              </button>
            ))}
          </div>
          <LineupMap mapUrl={map?.displayIcon} points={points} active={active} onPick={pick} />
          <p className="text-sm text-ash">{complete ? 'Clique para reposicionar o ponto escolhido.' : 'Clique no mapa para marcar os três pontos.'}</p>
          <Button variant="primary" type="submit" disabled={!complete || !title.trim() || !effectiveSlot} data-testid="lineup-save">
            Salvar lineup
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function LineupCard({ lineup, onEdit, onDelete }: { lineup: Lineup; onEdit: () => void; onDelete: () => void }) {
  const catalog = useCatalog((s) => s.catalog);
  const map = findMap(catalog, lineup.mapId);
  const agent = findAgent(catalog, lineup.agentUuid);
  const ability = agent?.abilities.find((a) => a.slot === lineup.abilitySlot);
  return (
    <li className="flex flex-col border border-steel bg-carbon" data-testid="lineup-card">
      <LineupMap mapUrl={map?.displayIcon} points={lineup} />
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="display text-xl">{lineup.title}</h3>
        <p className="text-sm text-ash">
          {map?.displayName ?? 'Mapa desconhecido'}, {agent?.displayName ?? 'Agente'}, {ability?.displayName ?? lineup.abilitySlot}
        </p>
        <p className="text-sm">
          <span className={lineup.status === 'self-tested' ? 'text-defense' : 'text-ash'} data-testid="lineup-status-label">
            {LINEUP_STATUS_LABEL[lineup.status]}
          </span>
          {lineup.gameVersion && <span className="text-ash">, versão {lineup.gameVersion}</span>}
        </p>
        {lineup.notes && <p className="mt-1 text-sm">{lineup.notes}</p>}
        {lineup.images.length > 0 && (
          <div className="mt-2 grid grid-cols-4 gap-1">
            {lineup.images.map((src, index) => (
              <a key={index} href={src} target="_blank" rel="noreferrer">
                <img src={src} alt={`Imagem ${index + 1} de ${lineup.title}`} className="aspect-square w-full object-cover" />
              </a>
            ))}
          </div>
        )}
        <div className="mt-auto flex justify-end pt-2">
          <IconButton icon="pencil" label={`Editar ${lineup.title}`} data-testid="lineup-edit" onClick={onEdit} />
          <IconButton icon="trash" label={`Excluir ${lineup.title}`} data-testid="lineup-delete" onClick={onDelete} />
        </div>
      </div>
    </li>
  );
}

export function LibraryPage() {
  const catalog = useCatalog((s) => s.catalog);
  const [lineups, setLineups] = useState<Lineup[] | null>(null);
  const [editing, setEditing] = useState<Lineup | 'new' | null>(null);
  const [removing, setRemoving] = useState<Lineup | null>(null);
  const [mapFilter, setMapFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<LineupStatus | ''>('');

  const refresh = useCallback(async () => setLineups(await listLineups()), []);

  useEffect(() => {
    refresh().catch((error: unknown) => {
      toast.error(`Não foi possível ler as lineups: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
      setLineups([]);
    });
  }, [refresh]);

  const visible = useMemo(
    () =>
      (lineups ?? []).filter(
        (item) => (!mapFilter || item.mapId === mapFilter) && (!agentFilter || item.agentUuid === agentFilter) && (!statusFilter || item.status === statusFilter),
      ),
    [lineups, mapFilter, agentFilter, statusFilter],
  );

  if (lineups === null) return <Spinner label="Carregando lineups…" />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="display text-4xl">Lineups</h1>
          <p className="mt-1 max-w-2xl text-ash">Registre as suas lineups. O TacticLab não valida nenhuma lineup: a situação indica apenas o que você mesmo informou.</p>
        </div>
        <Button variant="primary" icon="plus" data-testid="new-lineup" onClick={() => setEditing('new')}>
          Nova lineup
        </Button>
      </div>

      {lineups.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <select className="field" aria-label="Filtrar por mapa" data-testid="lineup-filter-map" value={mapFilter} onChange={(e) => setMapFilter(e.target.value)}>
            <option value="">Todos os mapas</option>
            {catalog?.maps.map((map) => (
              <option key={map.uuid} value={map.uuid}>
                {map.displayName}
              </option>
            ))}
          </select>
          <select className="field" aria-label="Filtrar por agente" value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
            <option value="">Todos os agentes</option>
            {catalog?.agents.map((agent) => (
              <option key={agent.uuid} value={agent.uuid}>
                {agent.displayName}
              </option>
            ))}
          </select>
          <select className="field" aria-label="Filtrar por situação" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as LineupStatus | '')}>
            <option value="">Todas as situações</option>
            <option value="unverified">{LINEUP_STATUS_LABEL.unverified}</option>
            <option value="self-tested">{LINEUP_STATUS_LABEL['self-tested']}</option>
          </select>
        </div>
      )}

      {lineups.length === 0 && <p className="mt-8 text-ash" data-testid="lineups-empty">Você ainda não registrou nenhuma lineup. Crie a primeira para consultar depois.</p>}
      {lineups.length > 0 && visible.length === 0 && <p className="mt-8 text-ash">Nenhuma lineup com esses filtros.</p>}

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((lineup) => (
          <LineupCard key={lineup.id} lineup={lineup} onEdit={() => setEditing(lineup)} onDelete={() => setRemoving(lineup)} />
        ))}
      </ul>

      {editing && (
        <LineupForm
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void refresh();
            toast.success('Lineup salva.');
          }}
        />
      )}
      {removing && (
        <Modal title="Excluir lineup" onClose={() => setRemoving(null)}>
          <p className="mb-4 text-ash">"{removing.title}" será apagada deste navegador. Isso não pode ser desfeito.</p>
          <div className="flex justify-end gap-2">
            <Button variant="quiet" onClick={() => setRemoving(null)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              data-testid="lineup-confirm-delete"
              onClick={() => {
                void deleteLineupLocal(removing.id).then(() => {
                  setRemoving(null);
                  void refresh();
                });
              }}
            >
              Excluir
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
