import { useEffect, useRef, useState } from 'react';
import { presetSummary, utilityDefinition } from '../abilities/definitions';
import { CATEGORY_LABEL } from '../abilities/taxonomy';
import { utilityTravelMs } from '../abilities/timeline';
import { findAgent, findMap, useCatalog } from '../catalog/catalogStore';
import { useRoom } from '../multiplayer/roomStore';
import { HistoryDialog } from '../persistence/HistoryDialog';
import { docActions, useDoc } from '../strategy/docStore';
import { createWaypoint, faceAgentAt, removeWaypoint, updateWaypoint } from '../strategy/factory';
import type { AgentToken, Drawing, Utility } from '../strategy/schema';
import { usePlayback } from '../timeline/playbackStore';
import { agentPoseAt, compileRoute, formatTime } from '../timeline/simulate';
import { Button } from '../../ui/kit';
import { setEditor, useEditor } from './editorStore';
import { saveVersion } from './TopBar';
import { deleteSelection, duplicateSelection, setTool } from './interaction';

interface NumberFieldProps {
  label: string;
  value: number;
  step?: number;
  min?: number;
  unit?: string;
  testId?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

function NumberField({ label, value, step = 0.1, min = 0, unit, testId, disabled, onChange }: NumberFieldProps) {
  return (
    <label className="block">
      <span className="field-label">
        {label}
        {unit ? ` (${unit})` : ''}
      </span>
      <input
        type="number"
        className="field tnum"
        step={step}
        min={min}
        disabled={disabled}
        data-testid={testId}
        value={Number.isFinite(value) ? Number(value.toFixed(2)) : 0}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next) && next >= min) onChange(next);
        }}
        onBlur={() => docActions.endGesture()}
      />
    </label>
  );
}

const toDegrees = (radians: number) => ((radians * 180) / Math.PI + 360) % 360;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

function AgentEditor({ agent, readOnly }: { agent: AgentToken; readOnly: boolean }) {
  const catalog = useCatalog((s) => s.catalog);
  const frame = useEditor((s) => s.frame);
  const tool = useEditor((s) => s.tool);
  const timeMs = usePlayback((s) => s.timeMs);
  const info = findAgent(catalog, agent.agentUuid);
  const pose = agentPoseAt(agent, timeMs, frame);
  const compiled = agent.route ? compileRoute(agent, frame) : null;
  const key = `agent:${agent.id}`;
  const set = (next: AgentToken) => docActions.change([{ c: 'agents', id: agent.id, after: next }], { coalesce: key });

  return (
    <div className="flex flex-col gap-3" data-testid="agent-editor">
      <div className="flex items-center gap-2">
        {info?.displayIcon && <img src={info.displayIcon} alt="" crossOrigin="anonymous" className="h-10 w-10" />}
        <div>
          <h3 className="display text-xl">{info?.displayName ?? 'Agente'}</h3>
          <p className="text-sm text-ash">
            {agent.team === 'attack' ? 'Atacante' : 'Defensor'}
            {info?.role ? `, ${info.role}` : ''}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <span className="text-ash">Posição em {formatTime(timeMs)}</span>
        <span className="tnum text-right" data-testid="agent-position">
          {pose.point.x.toFixed(3)}, {pose.point.y.toFixed(3)}
        </span>
      </div>

      <NumberField label="Direção" unit="graus" step={5} value={toDegrees(pose.facing)} testId="agent-facing" disabled={readOnly || pose.moving} onChange={(deg) => set(faceAgentAt(agent, toRadians(deg), timeMs, frame))} />
      {pose.moving && <p className="text-xs text-ash" data-testid="facing-moving-note">Em movimento, o agente olha na direção do trajeto. Ajuste a direção parado ou em um ponto da rota.</p>}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" disabled={readOnly} onClick={() => setEditor({ panelTab: 'abilities' })}>
          Habilidades
        </Button>
        <Button
          variant={tool === 'route' ? 'primary' : 'ghost'}
          disabled={readOnly}
          data-testid="start-route"
          onClick={() => setTool(tool === 'route' ? 'select' : 'route')}
        >
          {tool === 'route' ? 'Concluir rota' : agent.route ? 'Continuar rota' : 'Criar rota'}
        </Button>
      </div>

      {agent.route && compiled && (
        <section className="flex flex-col gap-2 border-t border-steel pt-3" aria-label="Rota">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Rota</h4>
            <span className="tnum text-sm text-ash">
              {formatTime(compiled.startMs)} a {formatTime(compiled.endMs)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Início" unit="s" value={agent.route.startMs / 1000} testId="route-start" disabled={readOnly} onChange={(s) => set({ ...agent, route: { ...agent.route!, startMs: s * 1000 } })} />
            <NumberField label="Velocidade" unit="m/s" min={0.1} testId="route-speed" disabled={readOnly} value={agent.route.speedMps} onChange={(v) => { if (v > 0) set({ ...agent, route: { ...agent.route!, speedMps: v } }); }} />
          </div>
          <p className="text-xs text-ash">A velocidade inicial é um ponto de partida para planejar, não um valor do jogo.</p>
          <ol className="flex flex-col gap-2">
            {agent.route.waypoints.map((waypoint, index) => (
              <li key={waypoint.id} className="border border-steel p-2" data-testid={`waypoint-${index}`}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Ponto {index + 1}
                    {waypoint.arriveAtMs !== null ? ', keyframe' : ''}
                  </span>
                  <span className="tnum text-xs text-ash">chega em {formatTime(compiled.arrivals[waypoint.id] ?? 0)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="Pausa" unit="s" value={waypoint.pauseMs / 1000} testId={`waypoint-${index}-pause`} disabled={readOnly} onChange={(s) => set(updateWaypoint(agent, waypoint.id, { pauseMs: s * 1000 }))} />
                  <NumberField label="Velocidade" unit="m/s" min={0.1} disabled={readOnly || waypoint.arriveAtMs !== null} value={waypoint.speedMps ?? agent.route!.speedMps} onChange={(v) => { if (v > 0) set(updateWaypoint(agent, waypoint.id, { speedMps: v })); }} />
                  <label className="col-span-2 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      disabled={readOnly}
                      checked={waypoint.facing !== null}
                      onChange={(event) => set(updateWaypoint(agent, waypoint.id, { facing: event.target.checked ? pose.facing : null }))}
                    />
                    Virar ao chegar
                  </label>
                  {waypoint.facing !== null && (
                    <div className="col-span-2">
                      <NumberField label="Direção ao chegar" unit="graus" step={5} disabled={readOnly} value={toDegrees(waypoint.facing)} onChange={(deg) => set(updateWaypoint(agent, waypoint.id, { facing: toRadians(deg) }))} />
                    </div>
                  )}
                </div>
                <Button variant="danger" className="mt-1 px-1 py-0.5 text-sm" disabled={readOnly} onClick={() => docActions.change([{ c: 'agents', id: agent.id, after: removeWaypoint(agent, waypoint.id) }])}>
                  Remover ponto
                </Button>
              </li>
            ))}
          </ol>
          <Button variant="quiet" disabled={readOnly} onClick={() => docActions.change([{ c: 'agents', id: agent.id, after: { ...agent, route: null } }])}>
            Apagar a rota
          </Button>
        </section>
      )}
    </div>
  );
}

function UtilityEditor({ utility, readOnly }: { utility: Utility; readOnly: boolean }) {
  const catalog = useCatalog((s) => s.catalog);
  const agents = useDoc((s) => s.doc?.agents);
  const agent = findAgent(catalog, utility.agentUuid);
  const ability = agent?.abilities.find((a) => a.slot === utility.abilitySlot);
  const set = (next: Utility) => docActions.change([{ c: 'utilities', id: utility.id, after: next }], { coalesce: `utility:${utility.id}` });
  const shape = utility.shape;
  const owner = utility.ownerTokenId ? agents?.[utility.ownerTokenId] : undefined;
  const definition = utilityDefinition(utility);
  const frame = useEditor((s) => s.frame);

  const applyToRoute = () => {
    if (!owner || shape.type !== 'path') return;
    const route = owner.route ?? { startMs: 0, speedMps: 5, waypoints: [] };
    const span = utilityTravelMs(utility, frame);
    const steps = shape.points.slice(1);
    const waypoints = steps.map((point, i) =>
      createWaypoint(point, { arriveAtMs: utility.timeMs + (span * (i + 1)) / steps.length }),
    );
    docActions.change([{ c: 'agents', id: owner.id, after: { ...owner, route: { ...route, waypoints: [...route.waypoints, ...waypoints] } } }]);
  };

  return (
    <div className="flex flex-col gap-3" data-testid="utility-editor">
      <div className="flex items-center gap-2">
        {ability?.displayIcon && <img src={ability.displayIcon} alt="" crossOrigin="anonymous" className="h-9 w-9 bg-ink p-1" />}
        <div>
          <h3 className="display text-xl">{ability?.displayName ?? 'Habilidade'}</h3>
          <p className="text-sm text-ash">
            {agent?.displayName ?? 'Agente'}, {CATEGORY_LABEL[definition.category].toLowerCase()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Ativa em" unit="s" testId="utility-time" disabled={readOnly} value={utility.timeMs / 1000} onChange={(s) => set({ ...utility, timeMs: s * 1000 })} />
        {shape.type === 'wall' && (
          <NumberField label="Direção" unit="graus" step={5} testId="utility-facing" disabled={readOnly} value={toDegrees(shape.facing)} onChange={(deg) => set({ ...utility, shape: { ...shape, facing: toRadians(deg) } })} />
        )}
        {shape.type === 'marker' && (
          <NumberField label="Direção" unit="graus" step={5} testId="utility-facing" disabled={readOnly} value={toDegrees(shape.facing ?? 0)} onChange={(deg) => set({ ...utility, shape: { ...shape, facing: toRadians(deg) } })} />
        )}
        {shape.type === 'path' && (
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" disabled={readOnly} data-testid="utility-curved" checked={shape.curved} onChange={(event) => set({ ...utility, shape: { ...shape, curved: event.target.checked } })} />
            Linha curva
          </label>
        )}
      </div>

      <label>
        <span className="field-label">Nota</span>
        <textarea className="field" rows={2} maxLength={280} disabled={readOnly} value={utility.note} onChange={(event) => set({ ...utility, note: event.target.value })} onBlur={() => docActions.endGesture()} />
      </label>

      {shape.type === 'path' && (definition.category === 'dash' || definition.category === 'teleport') && (
        <Button variant="ghost" disabled={readOnly || !owner} data-testid="apply-to-route" onClick={applyToRoute} title={owner ? undefined : 'Esta habilidade não está ligada a um agente no mapa.'}>
          Levar o agente por esta trajetória
        </Button>
      )}

      <p className="border-l-2 border-signal pl-2 text-xs text-ash" data-testid="visual-values-note">
        <span data-testid="utility-preset">Preset fixo: {presetSummary(definition)}.</span> Você ajusta posição, direção, trajetória e instante. Tamanho e duração são aproximações do TacticLab, não dados oficiais do jogo.
      </p>
    </div>
  );
}

function DrawingEditor({ drawing, readOnly }: { drawing: Drawing; readOnly: boolean }) {
  const focusTextId = useEditor((s) => s.focusTextId);
  const textInput = useRef<HTMLTextAreaElement>(null);
  const set = (next: Drawing) => docActions.change([{ c: 'drawings', id: drawing.id, after: next }], { coalesce: `drawing:${drawing.id}` });

  useEffect(() => {
    if (drawing.type === 'text' && focusTextId === drawing.id) {
      textInput.current?.focus();
      textInput.current?.select();
      setEditor({ focusTextId: null });
    }
  }, [drawing.id, drawing.type, focusTextId]);

  const titles = { line: 'Linha', marker: 'Marcação', text: 'Texto', area: 'Área' };

  return (
    <div className="flex flex-col gap-3" data-testid="drawing-editor">
      <h3 className="display text-xl">{drawing.type === 'line' && drawing.arrow ? 'Seta' : titles[drawing.type]}</h3>
      <label>
        <span className="field-label">Cor</span>
        <input type="color" className="h-9 w-full bg-ink" disabled={readOnly} value={drawing.color} onChange={(event) => set({ ...drawing, color: event.target.value })} />
      </label>
      {drawing.type === 'line' && (
        <>
          <NumberField label="Espessura" min={1} step={0.5} disabled={readOnly} value={drawing.width} onChange={(v) => { if (v >= 1) set({ ...drawing, width: v }); }} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={readOnly} checked={drawing.arrow} onChange={(event) => set({ ...drawing, arrow: event.target.checked })} />
            Ponta de seta
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={readOnly} checked={drawing.dashed} onChange={(event) => set({ ...drawing, dashed: event.target.checked })} />
            Tracejada
          </label>
        </>
      )}
      {drawing.type === 'marker' && (
        <label>
          <span className="field-label">Rótulo</span>
          <input className="field" maxLength={60} disabled={readOnly} data-testid="marker-label" value={drawing.label} onChange={(event) => set({ ...drawing, label: event.target.value })} />
        </label>
      )}
      {drawing.type === 'text' && (
        <>
          <label>
            <span className="field-label">Texto</span>
            <textarea ref={textInput} className="field" rows={3} maxLength={280} disabled={readOnly} data-testid="text-content" value={drawing.text} onChange={(event) => set({ ...drawing, text: event.target.value })} onBlur={() => docActions.endGesture()} />
          </label>
          <NumberField label="Tamanho" min={8} step={1} disabled={readOnly} value={drawing.size} onChange={(v) => { if (v >= 8) set({ ...drawing, size: v }); }} />
        </>
      )}
      {drawing.type === 'area' && (
        <NumberField label="Raio" unit="m" min={0.5} disabled={readOnly} value={drawing.radiusM} onChange={(v) => { if (v >= 0.5) set({ ...drawing, radiusM: v }); }} />
      )}
    </div>
  );
}

function StrategySettings() {
  const doc = useDoc((s) => s.doc);
  const readOnly = useDoc((s) => s.readOnly);
  const inRoom = useRoom((s) => s.active);
  const catalog = useCatalog((s) => s.catalog);
  const [history, setHistory] = useState(false);
  if (!doc) return null;
  return (
    <div className="flex flex-col gap-3" data-testid="strategy-settings">
      <p className="text-sm text-ash">Selecione um agente, habilidade ou desenho no mapa para editar.</p>
      <section className="flex flex-col gap-3 border-t border-steel pt-3" aria-label="Estratégia">
        <h3 className="display text-xl">{findMap(catalog, doc.mapId)?.displayName ?? 'Estratégia'}</h3>
        <label>
          <span className="field-label">Nome da estratégia</span>
          <input
            className="field"
            maxLength={120}
            disabled={readOnly}
            data-testid="settings-name"
            value={doc.name}
            onChange={(event) => {
              if (event.target.value.trim()) docActions.change([{ c: 'meta', key: 'name', after: event.target.value }], { coalesce: 'rename' });
            }}
            onBlur={() => docActions.endGesture()}
          />
        </label>
        <div className="grid grid-cols-2 gap-1" role="group" aria-label="Lado">
          {(['attack', 'defense'] as const).map((side) => (
            <button
              key={side}
              type="button"
              disabled={readOnly}
              aria-pressed={doc.side === side}
              data-testid={`settings-side-${side}`}
              onClick={() => docActions.change([{ c: 'meta', key: 'side', after: side }])}
              className={`cut px-2 py-1.5 text-sm font-medium ${doc.side === side ? (side === 'attack' ? 'bg-attack text-white' : 'bg-defense text-ink') : 'bg-steel text-ash'}`}
            >
              {side === 'attack' ? 'Ataque' : 'Defesa'}
            </button>
          ))}
        </div>
        {!inRoom && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" icon="save" data-testid="settings-save-version" onClick={saveVersion}>
              Salvar versão
            </Button>
            <Button variant="ghost" icon="history" data-testid="settings-history" onClick={() => setHistory(true)}>
              Histórico
            </Button>
          </div>
        )}
      </section>
      {history && <HistoryDialog onClose={() => setHistory(false)} />}
    </div>
  );
}

export function ObjectPanel() {
  const selection = useEditor((s) => s.selection);
  const doc = useDoc((s) => s.doc);
  const readOnly = useDoc((s) => s.readOnly);

  if (!doc) return null;
  if (selection.length === 0) return <StrategySettings />;

  const actions = (
    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-steel pt-3">
      <Button variant="ghost" icon="copy" disabled={readOnly} data-testid="object-duplicate" onClick={duplicateSelection}>
        Duplicar
      </Button>
      <Button variant="danger" icon="trash" disabled={readOnly} data-testid="object-delete" onClick={deleteSelection}>
        Excluir
      </Button>
    </div>
  );

  if (selection.length > 1) {
    return (
      <div>
        <p>{selection.length} objetos selecionados.</p>
        {actions}
      </div>
    );
  }

  const ref = selection[0]!;
  const entity = (doc[ref.c] as Record<string, unknown>)[ref.id];
  if (!entity) return <p className="text-sm text-ash">O objeto selecionado não existe mais.</p>;

  return (
    <div>
      {ref.c === 'agents' && <AgentEditor agent={entity as AgentToken} readOnly={readOnly} />}
      {ref.c === 'utilities' && <UtilityEditor utility={entity as Utility} readOnly={readOnly} />}
      {ref.c === 'drawings' && <DrawingEditor drawing={entity as Drawing} readOnly={readOnly} />}
      {actions}
    </div>
  );
}
