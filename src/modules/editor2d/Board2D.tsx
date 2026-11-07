import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Group, Image as KImage, Layer, Line, Stage, Text } from 'react-konva';
import type Konva from 'konva';
import { BOARD_SIZE, boardToMap, type MapPoint } from '../coordinates';
import { findAgent, findMap, useCatalog } from '../catalog/catalogStore';
import { editorStore, useEditor } from '../editor/editorStore';
import { registerCapture } from '../editor/exportRegistry';
import { interaction, type Hit } from '../editor/interaction';
import { utilityOpacity } from '../editor/sceneStyle';
import { useRoom } from '../multiplayer/roomStore';
import { useDoc } from '../strategy/docStore';
import type { CollectionName } from '../strategy/schema';
import { usePlayback } from '../timeline/playbackStore';
import { simulate } from '../timeline/simulate';
import { useImage } from '../../ui/useImage';
import { AgentToken2D, Draft2D, Drawing2D, Route2D, Utility2D } from './entities2d';

interface View {
  scale: number;
  x: number;
  y: number;
}

function parseHit(value: string): Hit | null {
  const [kind, a, b, c] = value.split(':');
  switch (kind) {
    case 'agents':
    case 'utilities':
    case 'drawings':
      return a ? { kind: 'entity', ref: { c: kind, id: a } } : null;
    case 'vertex':
      return a && b ? { kind: 'vertex', ref: { c: a as CollectionName, id: b }, index: Number(c) } : null;
    case 'radius':
      return a && b ? { kind: 'radius', ref: { c: a as CollectionName, id: b } } : null;
    case 'rotate':
      return a && b ? { kind: 'rotate', ref: { c: a as CollectionName, id: b } } : null;
    case 'waypoint':
      return a && b ? { kind: 'waypoint', agentId: a, waypointId: b } : null;
    default:
      return null;
  }
}

function hitFromNode(node: Konva.Node | null): Hit | null {
  let current: Konva.Node | null = node;
  while (current) {
    const value = current.getAttr('hit') as string | undefined;
    if (value) return parseHit(value);
    current = current.getParent();
  }
  return null;
}

function fitView(width: number, height: number): View {
  const scale = Math.min(width, height) / BOARD_SIZE;
  return { scale, x: (width - BOARD_SIZE * scale) / 2, y: (height - BOARD_SIZE * scale) / 2 };
}

const MIN_SCALE_FACTOR = 0.6;
const MAX_SCALE = 12;

function useBoardPointer(
  container: RefObject<HTMLDivElement | null>,
  stage: RefObject<Konva.Stage | null>,
  view: View,
  setView: (updater: (v: View) => View) => void,
  fit: View,
) {
  const viewRef = useRef(view);
  viewRef.current = view;
  const fitRef = useRef(fit);
  fitRef.current = fit;

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let pan: { x: number; y: number; vx: number; vy: number } | null = null;
    let pinch: { distance: number; scale: number; cx: number; cy: number; vx: number; vy: number } | null = null;
    let primaryActive = false;

    const local = (event: PointerEvent | WheelEvent) => {
      const rect = el.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const toMap = (p: { x: number; y: number }): MapPoint => {
      const v = viewRef.current;
      return boardToMap({ x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale });
    };
    const zoomAt = (focus: { x: number; y: number }, nextScale: number, base: View) => {
      const min = fitRef.current.scale * MIN_SCALE_FACTOR;
      const scale = Math.max(min, Math.min(MAX_SCALE, nextScale));
      const boardX = (focus.x - base.x) / base.scale;
      const boardY = (focus.y - base.y) / base.scale;
      return { scale, x: focus.x - boardX * scale, y: focus.y - boardY * scale };
    };

    const onDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button === 2) return;
      el.setPointerCapture(event.pointerId);
      const p = local(event);
      pointers.set(event.pointerId, p);

      if (pointers.size === 2) {
        // Segundo dedo: cancela o gesto do primeiro e passa a dar zoom.
        interaction.up(null);
        primaryActive = false;
        pan = null;
        const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
        const v = viewRef.current;
        pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: v.scale, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, vx: v.x, vy: v.y };
        return;
      }

      const startPan = () => {
        const v = viewRef.current;
        pan = { x: p.x, y: p.y, vx: v.x, vy: v.y };
      };
      if (event.button === 1) {
        startPan();
        return;
      }
      const shape = stage.current?.getIntersection(p) ?? null;
      const consumed = interaction.down(toMap(p), hitFromNode(shape), { shift: event.shiftKey });
      primaryActive = true;
      if (!consumed) startPan();
    };

    const onMove = (event: PointerEvent) => {
      const p = local(event);
      if (pointers.has(event.pointerId)) pointers.set(event.pointerId, p);

      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        const base = { scale: pinch.scale, x: pinch.vx + (cx - pinch.cx), y: pinch.vy + (cy - pinch.cy) };
        setView(() => zoomAt({ x: cx, y: cy }, pinch!.scale * (distance / (pinch!.distance || 1)), base));
        return;
      }
      if (pan) {
        const start = pan;
        setView((v) => ({ ...v, x: start.vx + (p.x - start.x), y: start.vy + (p.y - start.y) }));
        return;
      }
      interaction.move(toMap(p));
      if (event.pointerType === 'mouse' && !primaryActive) {
        const tool = editorStore.getState().tool;
        const over = tool === 'select' ? hitFromNode(stage.current?.getIntersection(p) ?? null) : null;
        el.style.cursor = tool === 'select' ? (over ? 'grab' : 'default') : tool === 'pan' ? 'grab' : 'crosshair';
      }
    };

    const onUp = (event: PointerEvent) => {
      const p = local(event);
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pan && pointers.size === 0) {
        // Um arrasto de câmera também encerra o gesto "vazio"; clique sem mover limpa a seleção.
        const moved = Math.hypot(p.x - pan.x, p.y - pan.y) > 4;
        pan = null;
        interaction.up(moved ? null : toMap(p));
        primaryActive = false;
        return;
      }
      if (primaryActive && pointers.size === 0) {
        interaction.up(toMap(p));
        primaryActive = false;
      }
    };

    const onCancel = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      pan = null;
      pinch = null;
      if (primaryActive) interaction.up(null);
      primaryActive = false;
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const p = local(event);
      const factor = Math.exp(-event.deltaY * 0.0015);
      setView((v) => zoomAt(p, v.scale * factor, v));
    };

    const onDouble = () => interaction.finish();

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('dblclick', onDouble);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('dblclick', onDouble);
    };
  }, [container, stage, setView]);
}

/** Desenho vetorial usado se a imagem do minimapa não carregar. */
function VectorFallback() {
  const map = useEditor((s) => s.map);
  if (!map) return null;
  return (
    <Group listening={false}>
      {map.geometry.walls.flatMap((polygon, i) =>
        polygon.map((ring, j) => (
          <Line key={`${i}-${j}`} points={ring.map((v) => v * BOARD_SIZE)} closed stroke="#6c727c" strokeWidth={1} />
        )),
      )}
    </Group>
  );
}

function MapLabels({ ui }: { ui: number }) {
  const map = useEditor((s) => s.map);
  const show = useEditor((s) => s.showCallouts);
  if (!map) return null;
  return (
    <Group listening={false}>
      {show &&
        map.geometry.callouts
          .filter((c) => !c.site)
          .map((c, i) => (
            <Text
              key={i}
              x={c.x * BOARD_SIZE - 60 * ui}
              y={c.y * BOARD_SIZE - 5 * ui}
              width={120 * ui}
              align="center"
              text={c.name}
              fontSize={10 * ui}
              fontFamily="Saira, sans-serif"
              fill="#ffffff"
              opacity={0.86}
              shadowColor="#000"
              shadowBlur={2}
              shadowOpacity={1}
            />
          ))}
      {map.geometry.sites.map((site) => (
        <Text
          key={site.label}
          x={site.center.x * BOARD_SIZE - 40}
          y={site.center.y * BOARD_SIZE - 22}
          width={80}
          align="center"
          text={site.label}
          fontSize={44}
          fontStyle="800"
          fontFamily="Saira, sans-serif"
          fill="#ffffff"
          opacity={0.32}
        />
      ))}
    </Group>
  );
}

function RemoteCursors({ ui }: { ui: number }) {
  const peers = useRoom((s) => s.peers);
  const selfId = useRoom((s) => s.clientId);
  return (
    <Group listening={false}>
      {peers
        .filter((peer) => peer.clientId !== selfId && peer.cursor)
        .map((peer) => (
          <Group key={peer.clientId} x={peer.cursor!.x * BOARD_SIZE} y={peer.cursor!.y * BOARD_SIZE}>
            <Line points={[0, 0, 12 * ui, 5 * ui, 5 * ui, 12 * ui]} closed fill={peer.color} stroke="#0c0d10" strokeWidth={1 * ui} />
            <Text x={13 * ui} y={9 * ui} text={peer.name} fill={peer.color} fontSize={11 * ui} fontFamily="Saira, sans-serif" shadowColor="#000" shadowBlur={3} shadowOpacity={1} />
          </Group>
        ))}
    </Group>
  );
}

export default function Board2D() {
  const container = useRef<HTMLDivElement>(null);
  const stage = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const fit = useMemo(() => fitView(Math.max(size.width, 1), Math.max(size.height, 1)), [size]);
  const [view, setViewState] = useState<View>(fit);
  const touched = useRef(false);

  const setView = useCallback((updater: (v: View) => View) => {
    touched.current = true;
    setViewState(updater);
  }, []);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!touched.current) setViewState(fit);
  }, [fit]);

  useBoardPointer(container, stage, view, setView, fit);

  useEffect(
    () =>
      registerCapture(() => {
        const current = stage.current;
        if (!current) throw new Error('A prancha ainda não está pronta.');
        const previous = { scaleX: current.scaleX(), x: current.x(), y: current.y() };
        const sizePx = Math.min(current.width(), current.height());
        const scale = sizePx / BOARD_SIZE;
        current.scale({ x: scale, y: scale });
        current.position({ x: (current.width() - sizePx) / 2, y: (current.height() - sizePx) / 2 });
        current.batchDraw();
        try {
          return current.toDataURL({
            x: (current.width() - sizePx) / 2,
            y: (current.height() - sizePx) / 2,
            width: sizePx,
            height: sizePx,
            pixelRatio: Math.max(2, 1400 / sizePx),
          });
        } finally {
          current.scale({ x: previous.scaleX, y: previous.scaleX });
          current.position({ x: previous.x, y: previous.y });
          current.batchDraw();
        }
      }),
    [],
  );

  const doc = useDoc((s) => s.doc);
  const catalog = useCatalog((s) => s.catalog);
  const timeMs = usePlayback((s) => s.timeMs);
  const playing = usePlayback((s) => s.playing);
  const frame = useEditor((s) => s.frame);
  const selection = useEditor((s) => s.selection);
  const draft = useEditor((s) => s.draft);
  const tool = useEditor((s) => s.tool);
  const drawColor = useEditor((s) => s.drawColor);

  const mapInfo = doc ? findMap(catalog, doc.mapId) : undefined;
  const { image: mapImage, status: imageStatus } = useImage(mapInfo?.displayIcon);

  const simulation = useMemo(() => (doc ? simulate(doc, timeMs, frame) : null), [doc, timeMs, frame]);
  const isSelected = (c: CollectionName, id: string) => selection.some((s) => s.c === c && s.id === id);

  // Os objetos crescem menos que o zoom para continuarem legíveis de perto e de longe.
  const ui = Math.pow(fit.scale / view.scale, 0.72) * (1 / fit.scale) * 0.82;

  if (!doc || !simulation) return null;

  const abilityIcon = (agentUuid: string, slot: string) =>
    findAgent(catalog, agentUuid)?.abilities.find((a) => a.slot === slot)?.displayIcon;

  return (
    <div ref={container} data-testid="board-2d" data-scale={view.scale.toFixed(4)} data-x={view.x.toFixed(1)} className="touch-none-all absolute inset-0 overflow-hidden bg-ink">
      {size.width > 0 && (
        <Stage
          ref={stage}
          width={size.width}
          height={size.height}
          scaleX={view.scale}
          scaleY={view.scale}
          x={view.x}
          y={view.y}
        >
          <Layer listening={false}>
            {mapImage ? <KImage image={mapImage} width={BOARD_SIZE} height={BOARD_SIZE} /> : <VectorFallback />}
            <MapLabels ui={ui} />
          </Layer>
          <Layer>
            {Object.values(doc.drawings).map((drawing) => (
              <Drawing2D key={drawing.id} drawing={drawing} frame={frame} selected={isSelected('drawings', drawing.id)} ui={ui} />
            ))}
            {Object.values(doc.utilities).map((utility) => (
              <Utility2D
                key={utility.id}
                utility={utility}
                state={simulation.utilities[utility.id]}
                opacity={utilityOpacity(simulation.utilities[utility.id], playing)}
                frame={frame}
                iconUrl={abilityIcon(utility.agentUuid, utility.abilitySlot)}
                selected={isSelected('utilities', utility.id)}
                ui={ui}
              />
            ))}
            {Object.values(doc.agents).map((agent) => (
              <Route2D key={agent.id} agent={agent} frame={frame} selected={isSelected('agents', agent.id)} ui={ui} />
            ))}
            {Object.values(doc.agents).map((agent) => {
              const pose = simulation.agents[agent.id];
              if (!pose) return null;
              return (
                <AgentToken2D
                  key={agent.id}
                  agent={agent}
                  pose={pose}
                  info={findAgent(catalog, agent.agentUuid)}
                  selected={isSelected('agents', agent.id)}
                  ui={ui}
                />
              );
            })}
          </Layer>
          <Layer listening={false}>
            {draft && <Draft2D draft={draft} tool={tool} color={drawColor} ui={ui} />}
            <RemoteCursors ui={ui} />
            {imageStatus === 'error' && (
              <Text x={20} y={20} text="O minimapa não carregou. Mostrando apenas o contorno." fill="#ef3b48" fontSize={18} />
            )}
          </Layer>
        </Stage>
      )}
      <span className="sr-only" data-testid="agents-count">
        {Object.keys(doc.agents).length}
      </span>
    </div>
  );
}
