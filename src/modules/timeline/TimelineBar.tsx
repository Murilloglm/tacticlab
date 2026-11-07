import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CATEGORY_COLOR } from '../abilities/taxonomy';
import { findAgent, useCatalog } from '../catalog/catalogStore';
import { editorStore, setEditor, useEditor } from '../editor/editorStore';
import { TEAM_COLOR } from '../editor/sceneStyle';
import { docActions, docStore, useDoc } from '../strategy/docStore';
import { newId, placeAgentAt, shiftRoute, updateWaypoint } from '../strategy/factory';
import type { AgentToken, TimelineNote, Utility } from '../strategy/schema';
import { Button, IconButton } from '../../ui/kit';
import { toast } from '../../ui/toastStore';
import { effectiveDuration, PLAYBACK_RATES, playbackActions, playbackStore, usePlayback } from './playbackStore';
import { agentPoseAt, compileRoute, contentEndMs, formatTime } from './simulate';

const SNAP_MS = 100;
const snap = (ms: number) => Math.max(0, Math.round(ms / SNAP_MS) * SNAP_MS);

type Drag =
  | { type: 'playhead' }
  | { type: 'route'; agent: AgentToken; grabMs: number; startMs: number; key: string }
  | { type: 'keyframe'; agent: AgentToken; waypointId: string; key: string }
  | { type: 'utility'; utility: Utility; grabMs: number; key: string }
  | { type: 'utility-end'; utility: Utility; key: string }
  | { type: 'note'; note: TimelineNote; key: string };

function rulerStep(duration: number, width: number): number {
  const options = [500, 1000, 2000, 5000, 10000, 15000, 30000, 60000];
  const pxPerMs = width / duration;
  return options.find((step) => step * pxPerMs >= 44) ?? 60000;
}

function Transport({ duration }: { duration: number }) {
  const playing = usePlayback((s) => s.playing);
  const timeMs = usePlayback((s) => s.timeMs);
  const rate = usePlayback((s) => s.rate);
  return (
    <div className="flex items-center gap-0.5">
      <IconButton icon="restart" label="Reiniciar" data-testid="tl-restart" onClick={() => playbackActions.restart()} />
      <IconButton icon="stepBack" label="Retroceder 0,5 s" data-testid="tl-back" onClick={() => playbackActions.step(-500, duration)} />
      <IconButton icon={playing ? 'pause' : 'play'} label={playing ? 'Pausar' : 'Reproduzir'} active data-testid="tl-play" onClick={() => playbackActions.toggle(duration)} />
      <IconButton icon="stepForward" label="Avançar 0,5 s" data-testid="tl-forward" onClick={() => playbackActions.step(500, duration)} />
      <span className="tnum mx-1 whitespace-nowrap text-sm" data-testid="tl-time" data-ms={Math.round(timeMs)}>
        {formatTime(timeMs)}
        <span className="hidden text-ash sm:inline"> / {formatTime(duration)}</span>
      </span>
      <select
        aria-label="Velocidade de reprodução"
        data-testid="tl-rate"
        className="bg-carbon text-sm text-bone"
        value={rate}
        onChange={(event) => playbackActions.setRate(Number(event.target.value))}
      >
        {PLAYBACK_RATES.map((value) => (
          <option key={value} value={value}>
            {String(value).replace('.', ',')}x
          </option>
        ))}
      </select>
    </div>
  );
}

export function TimelineBar() {
  const doc = useDoc((s) => s.doc);
  const readOnly = useDoc((s) => s.readOnly);
  const frame = useEditor((s) => s.frame);
  const selection = useEditor((s) => s.selection);
  const catalog = useCatalog((s) => s.catalog);
  const timeMs = usePlayback((s) => s.timeMs);
  const track = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [trackLeft, setTrackLeft] = useState(96);
  const drag = useRef<Drag | null>(null);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
      setTrackLeft(el.offsetLeft);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const duration = doc ? effectiveDuration(doc, frame) : 1000;
  const toX = useCallback((ms: number) => (ms / duration) * width, [duration, width]);

  const msFromEvent = useCallback(
    (event: { clientX: number }) => {
      const rect = track.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return 0;
      return ((event.clientX - rect.left) / rect.width) * duration;
    },
    [duration],
  );

  const onMove = useCallback(
    (event: PointerEvent) => {
      const current = drag.current;
      if (!current) return;
      const ms = msFromEvent(event);
      const latest = docStore.getState().doc;
      if (!latest) return;
      switch (current.type) {
        case 'playhead':
          playbackActions.seek(ms, effectiveDuration(latest, editorStore.getState().frame));
          break;
        case 'route': {
          const start = snap(current.startMs + (ms - current.grabMs));
          docActions.change([{ c: 'agents', id: current.agent.id, after: shiftRoute(current.agent, start) }], { coalesce: current.key });
          break;
        }
        case 'keyframe': {
          const agent = latest.agents[current.agent.id];
          if (agent) docActions.change([{ c: 'agents', id: agent.id, after: updateWaypoint(agent, current.waypointId, { arriveAtMs: snap(ms) }) }], { coalesce: current.key });
          break;
        }
        case 'utility':
          docActions.change([{ c: 'utilities', id: current.utility.id, after: { ...current.utility, timeMs: snap(current.utility.timeMs + (ms - current.grabMs)) } }], { coalesce: current.key });
          break;
        case 'utility-end':
          docActions.change([{ c: 'utilities', id: current.utility.id, after: { ...current.utility, durationMs: Math.max(100, snap(ms - current.utility.timeMs)) } }], { coalesce: current.key });
          break;
        case 'note':
          docActions.change([{ c: 'notes', id: current.note.id, after: { ...current.note, timeMs: snap(ms) } }], { coalesce: current.key });
          break;
      }
    },
    [msFromEvent],
  );

  useEffect(() => {
    const onUp = () => {
      if (drag.current) docActions.endGesture();
      drag.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [onMove]);

  const startDrag = (event: ReactPointerEvent, next: Drag) => {
    event.stopPropagation();
    if (readOnly && next.type !== 'playhead') return;
    drag.current = next;
  };

  const rows = useMemo(() => {
    if (!doc) return [];
    const agents = Object.values(doc.agents).sort((a, b) => (a.team === b.team ? 0 : a.team === 'attack' ? -1 : 1));
    const utilities = Object.values(doc.utilities);
    const result = agents.map((agent) => ({
      key: agent.id,
      agent,
      label: findAgent(catalog, agent.agentUuid)?.displayName ?? 'Agente',
      utilities: utilities.filter((u) => u.ownerTokenId === agent.id),
    }));
    const orphans = utilities.filter((u) => !u.ownerTokenId || !doc.agents[u.ownerTokenId]);
    if (orphans.length) result.push({ key: 'orphans', agent: null as unknown as AgentToken, label: 'Sem agente', utilities: orphans });
    return result;
  }, [doc, catalog]);

  if (!doc) return null;

  const addKeyframe = () => {
    const ref = selection.find((item) => item.c === 'agents');
    const agent = ref ? doc.agents[ref.id] : undefined;
    const now = playbackStore.getState().timeMs;
    if (!agent) {
      toast.info('Selecione um agente para adicionar um keyframe.');
      return;
    }
    if (now <= 0) {
      toast.info('Mova o tempo para depois de 00:00. Em 00:00 fica a posição inicial do agente.');
      return;
    }
    const pose = agentPoseAt(agent, now, frame);
    docActions.change([{ c: 'agents', id: agent.id, after: placeAgentAt(agent, pose.point, now, frame) }]);
    toast.success('Keyframe adicionado. Arraste o agente para definir onde ele estará neste instante.');
  };

  const step = rulerStep(duration, width);
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += step) ticks.push(t);

  const selectEntity = (c: 'agents' | 'utilities', id: string) => setEditor({ selection: [{ c, id }] });

  return (
    <section data-testid="timeline" aria-label="Timeline" className="shrink-0 border-t border-steel bg-carbon">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 py-1 sm:gap-x-3 sm:px-2">
        <Transport duration={duration} />
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Button variant="ghost" icon="key" className="px-2 py-1 text-sm" disabled={readOnly} data-testid="tl-keyframe" aria-label="Adicionar keyframe" onClick={addKeyframe}>
            <span className="hidden sm:inline">Keyframe</span>
          </Button>
          <label className="flex items-center gap-1 text-sm text-ash">
            <span className="hidden sm:inline">Duração</span>
            <input
              type="number"
              className="field tnum w-16 py-0.5"
              min={1}
              max={600}
              disabled={readOnly}
              aria-label="Duração em segundos"
              data-testid="tl-duration"
              value={Math.round(doc.durationMs / 1000)}
              onChange={(event) => {
                const seconds = Number(event.target.value);
                if (seconds >= 1 && seconds <= 600) docActions.change([{ c: 'meta', key: 'durationMs', after: seconds * 1000 }], { coalesce: 'duration' });
              }}
              onBlur={() => docActions.endGesture()}
            />
            s
          </label>
          <span className="hidden sm:contents">
            <Button
              variant="quiet"
              className="px-2 py-1 text-sm"
              disabled={readOnly}
              data-testid="tl-fit"
              onClick={() => {
                const end = contentEndMs(doc, frame);
                docActions.change([{ c: 'meta', key: 'durationMs', after: Math.max(1000, Math.ceil((end + 1000) / 1000) * 1000) }]);
              }}
            >
              Ajustar ao conteúdo
            </Button>
          </span>
        </div>
      </div>

      <div
        className="touch-none-all relative select-none"
        data-testid="tl-area"
        onPointerDown={(event) => {
          if (event.clientX < (track.current?.getBoundingClientRect().left ?? 0)) return;
          drag.current = { type: 'playhead' };
          playbackActions.seek(msFromEvent(event), duration);
          playbackActions.pause();
        }}
      >
        <div className="flex">
          <div className="w-20 shrink-0 sm:w-24" />
          <div ref={track} data-testid="tl-track" className="relative mr-2 h-5 min-w-0 flex-1 cursor-col-resize overflow-hidden border-b border-steel" aria-hidden="true">
            {ticks.map((t) => (
              <span key={t} className="tnum absolute top-0 border-l border-iron pl-1 text-[11px] leading-5 text-ash" style={{ left: toX(t) }}>
                {t % 60000 === 0 ? `${t / 60000}:00` : `${Math.floor(t / 1000)}s`}
              </span>
            ))}
          </div>
        </div>

        <div className="h-14 overflow-y-auto [scrollbar-width:none] md:h-[5.25rem]" data-testid="tl-rows">
          {rows.map((row) => {
            const compiled = row.agent?.route?.waypoints.length ? compileRoute(row.agent, frame) : null;
            const color = row.agent ? TEAM_COLOR[row.agent.team] : '#a0a7b2';
            return (
              <div key={row.key} className="flex h-7 border-b border-steel/40" data-testid={`tl-row-${row.label}`}>
                <div className="flex w-20 shrink-0 items-center truncate px-2 text-xs sm:w-24" style={{ color: row.agent ? color : undefined }}>
                  {row.label}
                </div>
                <div className="relative mr-2 min-w-0 flex-1 cursor-col-resize overflow-hidden">
                  {compiled && row.agent && (
                    <>
                      <button
                        type="button"
                        aria-label={`Rota de ${row.label}: início ${formatTime(compiled.startMs)}. Arraste para sincronizar.`}
                        data-testid={`tl-route-${row.label}`}
                        data-start={compiled.startMs}
                        className="absolute bottom-0.5 h-2.5 cursor-grab"
                        style={{ left: toX(compiled.startMs), width: Math.max(4, toX(compiled.endMs - compiled.startMs)), backgroundColor: color }}
                        onPointerDown={(event) => {
                          selectEntity('agents', row.agent.id);
                          startDrag(event, { type: 'route', agent: row.agent, grabMs: msFromEvent(event), startMs: compiled.startMs, key: `tl:${newId()}` });
                        }}
                      />
                      {row.agent.route!.waypoints
                        .filter((w) => w.arriveAtMs !== null)
                        .map((w) => (
                          <button
                            key={w.id}
                            type="button"
                            aria-label={`Keyframe em ${formatTime(compiled.arrivals[w.id] ?? 0)}`}
                            data-testid="tl-keyframe-mark"
                            data-ms={compiled.arrivals[w.id] ?? 0}
                            className="absolute bottom-0 h-3.5 w-3.5 -translate-x-1/2 rotate-45 cursor-grab border border-ink bg-bone"
                            style={{ left: toX(compiled.arrivals[w.id] ?? 0) }}
                            onPointerDown={(event) => {
                              selectEntity('agents', row.agent.id);
                              startDrag(event, { type: 'keyframe', agent: row.agent, waypointId: w.id, key: `tl:${newId()}` });
                            }}
                          />
                        ))}
                    </>
                  )}
                  {row.utilities.map((utility) => {
                    const end = utility.durationMs === null ? duration : utility.timeMs + utility.durationMs;
                    const selected = selection.some((s) => s.c === 'utilities' && s.id === utility.id);
                    return (
                      <div
                        key={utility.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Habilidade em ${formatTime(utility.timeMs)}. Arraste para mudar o tempo.`}
                        data-testid="tl-utility"
                        data-ms={utility.timeMs}
                        className={`absolute top-0.5 h-3 cursor-grab ${selected ? 'ring-1 ring-bone' : ''}`}
                        style={{
                          left: toX(utility.timeMs),
                          width: Math.max(10, toX(end - utility.timeMs)),
                          backgroundColor: `${CATEGORY_COLOR[utility.category]}cc`,
                        }}
                        onPointerDown={(event) => {
                          selectEntity('utilities', utility.id);
                          startDrag(event, { type: 'utility', utility, grabMs: msFromEvent(event), key: `tl:${newId()}` });
                        }}
                      >
                        {utility.durationMs !== null && (
                          <span
                            aria-hidden="true"
                            className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-bone/70"
                            onPointerDown={(event) => startDrag(event, { type: 'utility-end', utility, key: `tl:${newId()}` })}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {Object.keys(doc.notes).length > 0 && (
            <div className="flex h-5">
              <div className="flex w-20 shrink-0 items-center px-2 text-xs text-ash sm:w-24">Notas</div>
              <div className="relative mr-2 min-w-0 flex-1 overflow-hidden">
                {Object.values(doc.notes).map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    title={note.text}
                    aria-label={`Nota em ${formatTime(note.timeMs)}: ${note.text}`}
                    data-testid="tl-note"
                    data-ms={note.timeMs}
                    className="absolute top-1 h-3 w-1.5 -translate-x-1/2 cursor-grab bg-bone"
                    style={{ left: toX(note.timeMs) }}
                    onPointerDown={(event) => startDrag(event, { type: 'note', note, key: `tl:${newId()}` })}
                  />
                ))}
              </div>
            </div>
          )}
          {rows.length === 0 && Object.keys(doc.notes).length === 0 && (
            <p className="px-2 py-1.5 text-xs text-ash">Posicione agentes e crie rotas. Depois use o Play para ver a execução.</p>
          )}
        </div>

        <div className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-signal" data-testid="tl-playhead" style={{ left: trackLeft + Math.min(width - 1, toX(timeMs)) }}>
          <span className="absolute -left-1 top-0 h-2.5 w-2.5 rotate-45 bg-signal" />
        </div>
      </div>
    </section>
  );
}
