// Representação 3D dos mesmos objetos do modo 2D, a partir das mesmas coordenadas de mapa.
import { useEffect, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { DoubleSide, type CanvasTexture } from 'three';
import { headingToWorld, mapToWorld, metersToMapUnits, smoothPolyline, type MapPoint } from '../coordinates';
import { findAgent, useCatalog } from '../catalog/catalogStore';
import { editorStore, useEditor, type Draft } from '../editor/editorStore';
import { interaction, type Hit } from '../editor/interaction';
import { categoryColor, initials, TEAM_COLOR, utilityOpacity } from '../editor/sceneStyle';
import { ignoreSceneEvent, syncOrbitEnabled } from '../ghostcam/CameraRig';
import type { AgentToken, Drawing, Utility } from '../strategy/schema';
import { utilityPathPoint, type AgentPose, type UtilityState } from '../timeline/simulate';
import { useImage } from '../../ui/useImage';
import { Billboard } from './Billboard';
import { dotTexture, labelTexture, tokenTexture } from './labels';
import { buildGroundDisc, buildRibbon, polylineOverTerrain } from './mapMeshes';

/** Distância em que o sprite começa a crescer para manter o tamanho aparente na tela. */
const SCREEN_SCALE = 40;

function useGround() {
  const map = useEditor((s) => s.map);
  const frame = useEditor((s) => s.frame);
  return { heights: map?.heights ?? null, frame };
}

/** Dispara o controlador único com o objeto atingido, travando a órbita durante o arrasto. */
function makeDown(hit: Hit) {
  return (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 || ignoreSceneEvent(event.nativeEvent.pointerType)) return;
    event.stopPropagation();
    const { frame } = editorStore.getState();
    const point = { x: event.point.x / frame.worldMeters + 0.5, y: event.point.z / frame.worldMeters + 0.5 };
    interaction.down(point, hit, { shift: event.shiftKey });
    syncOrbitEnabled();
  };
}

function useDisposed<T extends { dispose: () => void }>(value: T): T {
  useEffect(() => () => value.dispose(), [value]);
  return value;
}

function Handle3D({ point, hit, color = '#ffffff' }: { point: MapPoint; hit: Hit; color?: string }) {
  return <Billboard point={point} lift={0.6} size={0.85} growFrom={SCREEN_SCALE} texture={dotTexture(color)} onPointerDown={makeDown(hit)} renderOrder={30} />;
}

export function AgentSprite({ agent, pose, selected }: { agent: AgentToken; pose: AgentPose; selected: boolean }) {
  const catalog = useCatalog((s) => s.catalog);
  const info = findAgent(catalog, agent.agentUuid);
  const { image } = useImage(info?.displayIcon);
  const { frame, heights } = useGround();
  const color = TEAM_COLOR[agent.team];

  const texture = useDisposed(
    useMemo<CanvasTexture>(
      () => tokenTexture({ image, ring: color, fallback: initials(info?.displayName ?? '?'), selected }),
      [image, color, info?.displayName, selected],
    ),
  );

  const ground = heights?.heightAt(pose.point) ?? 0;
  const base = mapToWorld(pose.point, frame, ground + 0.1);
  const [fx, , fz] = headingToWorld(pose.facing);
  const tip: [number, number, number] = [base[0] + fx * 3, base[1], base[2] + fz * 3];

  const hit: Hit = { kind: 'entity', ref: { c: 'agents', id: agent.id } };
  const rotateTip = { x: pose.point.x + metersToMapUnits(fx * 3.4, frame), y: pose.point.y + metersToMapUnits(fz * 3.4, frame) };

  return (
    <group>
      {/* Haste liga o retrato ao ponto exato do piso. */}
      <Line points={[base, [base[0], ground + 2.4, base[2]]]} color={color} lineWidth={2} raycast={() => null} />
      <Line points={[base, tip]} color={color} lineWidth={3} raycast={() => null} />
      <Billboard point={pose.point} lift={2.6} size={2.2} growFrom={SCREEN_SCALE} texture={texture} onPointerDown={makeDown(hit)} renderOrder={20} />
      <Billboard
        point={pose.point}
        lift={2.6}
        size={0.72}
        growFrom={SCREEN_SCALE}
        anchorY={2.45}
        texture={labelTexture(info?.displayName ?? 'Agente', { color: '#ffffff', weight: 600 })}
        renderOrder={21}
      />
      {selected && <Handle3D point={rotateTip} hit={{ kind: 'rotate', ref: { c: 'agents', id: agent.id } }} />}
    </group>
  );
}

export function Route3D({ agent, selected }: { agent: AgentToken; selected: boolean }) {
  const { frame, heights } = useGround();
  const route = agent.route;
  const line = useMemo(() => {
    if (!route?.waypoints.length) return null;
    const points = [agent.position, ...route.waypoints.map((w) => w.point)];
    return polylineOverTerrain(points, frame, heights, 0.3);
  }, [agent.position, route, frame, heights]);
  if (!line || !route) return null;
  const color = TEAM_COLOR[agent.team];
  return (
    <group>
      <Line points={line} color={color} lineWidth={selected ? 3 : 2} dashed dashSize={1.2} gapSize={0.8} transparent opacity={selected ? 1 : 0.6} raycast={() => null} />
      {route.waypoints.map((w) =>
        selected ? (
          <Handle3D key={w.id} point={w.point} hit={{ kind: 'waypoint', agentId: agent.id, waypointId: w.id }} color={w.arriveAtMs !== null ? '#ffffff' : color} />
        ) : null,
      )}
    </group>
  );
}

function AbilitySprite({ utility, point, lift, opacity, selected }: { utility: Utility; point: MapPoint; lift: number; opacity: number; selected: boolean }) {
  const catalog = useCatalog((s) => s.catalog);
  const iconUrl = findAgent(catalog, utility.agentUuid)?.abilities.find((a) => a.slot === utility.abilitySlot)?.displayIcon;
  const { image } = useImage(iconUrl);
  const color = categoryColor(utility.category);
  const texture = useDisposed(
    useMemo(() => tokenTexture({ image, ring: color, fallback: '•', selected }), [image, color, selected]),
  );
  return (
    <Billboard
      point={point}
      lift={lift}
      size={1.5}
      growFrom={SCREEN_SCALE}
      opacity={opacity}
      texture={texture}
      onPointerDown={makeDown({ kind: 'entity', ref: { c: 'utilities', id: utility.id } })}
      renderOrder={15}
    />
  );
}

function CircleUtility({ utility, opacity, selected }: { utility: Utility; opacity: number; selected: boolean }) {
  const { frame, heights } = useGround();
  const shape = utility.shape;
  const center = shape.type === 'circle' ? shape.center : null;
  const radius = shape.type === 'circle' ? shape.radiusM : 1;
  const color = categoryColor(utility.category);
  const disc = useDisposed(
    useMemo(() => buildGroundDisc(center ?? { x: 0, y: 0 }, radius, frame, heights, 0.14), [center, radius, frame, heights]),
  );
  if (!center) return null;
  const hit: Hit = { kind: 'entity', ref: { c: 'utilities', id: utility.id } };
  const ground = heights?.heightAt(center) ?? 0;
  const isSmoke = utility.category === 'smoke';
  return (
    <group>
      <mesh geometry={disc} onPointerDown={makeDown(hit)}>
        <meshBasicMaterial color={color} transparent opacity={opacity * (isSmoke ? 0.3 : 0.48)} depthWrite={false} side={DoubleSide} />
      </mesh>
      {isSmoke && (
        <mesh position={mapToWorld(center, frame, ground + radius * 0.55)} scale={[1, 0.82, 1]} raycast={() => null}>
          <sphereGeometry args={[radius, 22, 16]} />
          <meshLambertMaterial color={color} transparent opacity={opacity * 0.42} depthWrite={false} />
        </mesh>
      )}
      <AbilitySprite utility={utility} point={center} lift={isSmoke ? radius * 1.1 : 1.6} opacity={opacity} selected={selected} />
      {selected && (
        <Handle3D point={{ x: center.x + metersToMapUnits(radius, frame), y: center.y }} hit={{ kind: 'radius', ref: { c: 'utilities', id: utility.id } }} />
      )}
    </group>
  );
}

function WallUtility({ utility, opacity, selected }: { utility: Utility; opacity: number; selected: boolean }) {
  const { frame, heights } = useGround();
  const points = utility.shape.type === 'wall' ? utility.shape.points : null;
  const ribbon = useDisposed(useMemo(() => buildRibbon(points ?? [], 3.8, frame, heights), [points, frame, heights]));
  if (!points) return null;
  const color = categoryColor(utility.category);
  const middle = points[Math.floor(points.length / 2)]!;
  return (
    <group>
      <mesh geometry={ribbon} onPointerDown={makeDown({ kind: 'entity', ref: { c: 'utilities', id: utility.id } })}>
        <meshBasicMaterial color={selected ? '#ffffff' : color} transparent opacity={opacity * 0.5} side={DoubleSide} depthWrite={false} />
      </mesh>
      <AbilitySprite utility={utility} point={middle} lift={4.8} opacity={opacity} selected={selected} />
      {selected && points.map((p, i) => <Handle3D key={i} point={p} hit={{ kind: 'vertex', ref: { c: 'utilities', id: utility.id }, index: i }} />)}
    </group>
  );
}

function PathUtility({ utility, state, opacity, selected }: { utility: Utility; state: UtilityState | undefined; opacity: number; selected: boolean }) {
  const { frame, heights } = useGround();
  const shape = utility.shape;
  const control = shape.type === 'path' ? shape.points : null;
  const curved = shape.type === 'path' && shape.curved;
  const line = useMemo(() => {
    if (!control) return [];
    return polylineOverTerrain(curved ? smoothPolyline(control) : control, frame, heights, 0.6);
  }, [control, curved, frame, heights]);
  if (!control) return null;
  const color = categoryColor(utility.category);
  const moving = state?.started && state.progress < 1 ? utilityPathPoint(utility, state.progress) : null;
  const end = control[control.length - 1]!;
  const spritePoint = moving ?? (state?.progress === 1 ? end : control[0]!);
  return (
    <group>
      <Line points={line} color={selected ? '#ffffff' : color} lineWidth={3} transparent opacity={opacity} raycast={() => null} />
      <AbilitySprite utility={utility} point={spritePoint} lift={1.8} opacity={opacity} selected={selected} />
      {selected && control.map((p, i) => <Handle3D key={i} point={p} hit={{ kind: 'vertex', ref: { c: 'utilities', id: utility.id }, index: i }} />)}
    </group>
  );
}

function MarkerUtility({ utility, opacity, selected }: { utility: Utility; opacity: number; selected: boolean }) {
  const { frame, heights } = useGround();
  if (utility.shape.type !== 'marker') return null;
  const { point, facing } = utility.shape;
  const color = categoryColor(utility.category);
  const ground = heights?.heightAt(point) ?? 0;
  const base = mapToWorld(point, frame, ground + 0.15);
  const dir = facing === null ? null : headingToWorld(facing);
  return (
    <group>
      <Line points={[base, [base[0], ground + 1.4, base[2]]]} color={color} lineWidth={2} transparent opacity={opacity} raycast={() => null} />
      {dir && <Line points={[base, [base[0] + dir[0] * 5, base[1], base[2] + dir[2] * 5]]} color={color} lineWidth={3} transparent opacity={opacity} raycast={() => null} />}
      <AbilitySprite utility={utility} point={point} lift={1.9} opacity={opacity} selected={selected} />
      {selected && (
        <Handle3D
          point={{
            x: point.x + metersToMapUnits(dir ? dir[0] * 5 : 5, frame),
            y: point.y + metersToMapUnits(dir ? dir[2] * 5 : 0, frame),
          }}
          hit={{ kind: 'rotate', ref: { c: 'utilities', id: utility.id } }}
        />
      )}
    </group>
  );
}

export function Utility3D({ utility, state, playing, selected }: { utility: Utility; state: UtilityState | undefined; playing: boolean; selected: boolean }) {
  const opacity = utilityOpacity(state, playing);
  if (opacity <= 0) return null;
  switch (utility.shape.type) {
    case 'circle':
      return <CircleUtility utility={utility} opacity={opacity} selected={selected} />;
    case 'wall':
      return <WallUtility utility={utility} opacity={opacity} selected={selected} />;
    case 'path':
      return <PathUtility utility={utility} state={state} opacity={opacity} selected={selected} />;
    case 'marker':
      return <MarkerUtility utility={utility} opacity={opacity} selected={selected} />;
  }
}

function AreaDrawing({ drawing, selected }: { drawing: Extract<Drawing, { type: 'area' }>; selected: boolean }) {
  const { frame, heights } = useGround();
  const disc = useDisposed(
    useMemo(() => buildGroundDisc(drawing.center, drawing.radiusM, frame, heights, 0.1), [drawing.center, drawing.radiusM, frame, heights]),
  );
  return (
    <group>
      <mesh geometry={disc} onPointerDown={makeDown({ kind: 'entity', ref: { c: 'drawings', id: drawing.id } })}>
        <meshBasicMaterial color={drawing.color} transparent opacity={0.34} depthWrite={false} side={DoubleSide} />
      </mesh>
      {selected && (
        <Handle3D point={{ x: drawing.center.x + metersToMapUnits(drawing.radiusM, frame), y: drawing.center.y }} hit={{ kind: 'radius', ref: { c: 'drawings', id: drawing.id } }} />
      )}
    </group>
  );
}

function LineDrawing({ drawing, selected }: { drawing: Extract<Drawing, { type: 'line' }>; selected: boolean }) {
  const { frame, heights } = useGround();
  const line = useMemo(() => polylineOverTerrain(drawing.points, frame, heights, 0.28), [drawing.points, frame, heights]);
  const arrowHead = useMemo(() => {
    if (!drawing.arrow || drawing.points.length < 2) return null;
    const tip = drawing.points[drawing.points.length - 1]!;
    const before = drawing.points[drawing.points.length - 2]!;
    const angle = Math.atan2(tip.y - before.y, tip.x - before.x);
    const size = metersToMapUnits(1.6, frame);
    const side = (delta: number): MapPoint => ({ x: tip.x + Math.cos(angle + Math.PI + delta) * size, y: tip.y + Math.sin(angle + Math.PI + delta) * size });
    return polylineOverTerrain([side(0.5), tip, side(-0.5)], frame, heights, 0.28);
  }, [drawing.arrow, drawing.points, frame, heights]);
  const pick = line.length > 0 ? drawing.points[Math.floor(drawing.points.length / 2)]! : null;
  return (
    <group>
      <Line points={line} color={selected ? '#ffffff' : drawing.color} lineWidth={drawing.width} dashed={drawing.dashed} dashSize={1.2} gapSize={0.8} raycast={() => null} />
      {arrowHead && <Line points={arrowHead} color={selected ? '#ffffff' : drawing.color} lineWidth={drawing.width} raycast={() => null} />}
      {/* Linhas finas são difíceis de clicar; um alvo no meio permite selecionar. */}
      {pick && <Handle3D point={pick} hit={{ kind: 'entity', ref: { c: 'drawings', id: drawing.id } }} color={drawing.color} />}
      {selected && drawing.points.length <= 24 && drawing.points.map((p, i) => <Handle3D key={i} point={p} hit={{ kind: 'vertex', ref: { c: 'drawings', id: drawing.id }, index: i }} />)}
    </group>
  );
}

export function Drawing3D({ drawing, selected }: { drawing: Drawing; selected: boolean }) {
  const hit: Hit = { kind: 'entity', ref: { c: 'drawings', id: drawing.id } };
  switch (drawing.type) {
    case 'line':
      return <LineDrawing drawing={drawing} selected={selected} />;
    case 'area':
      return <AreaDrawing drawing={drawing} selected={selected} />;
    case 'marker':
      return (
        <Billboard
          point={drawing.point}
          lift={2}
          size={1.5}
          growFrom={SCREEN_SCALE}
          onPointerDown={makeDown(hit)}
          texture={labelTexture(drawing.label || '●', { color: selected ? '#ffffff' : drawing.color, weight: 700 })}
        />
      );
    case 'text':
      return (
        <Billboard
          point={drawing.point}
          lift={2.4}
          size={drawing.size / 11}
          growFrom={SCREEN_SCALE}
          onPointerDown={makeDown(hit)}
          texture={labelTexture(drawing.text || ' ', { color: selected ? '#ffffff' : drawing.color, weight: 700 })}
        />
      );
  }
}

export function Draft3D({ draft, color }: { draft: Draft; color: string }) {
  const { frame, heights } = useGround();
  const cursor = draft.cursor ?? draft.points[0];
  const points = useMemo(() => {
    if (draft.kind === 'utility' && draft.shape !== 'path') return cursor ? [draft.points[0]!, cursor] : draft.points;
    if (draft.kind === 'utility' && cursor) return [...draft.points, cursor];
    return draft.points;
  }, [draft, cursor]);
  const line = useMemo(() => (points.length >= 2 ? polylineOverTerrain(points, frame, heights, 0.35) : []), [points, frame, heights]);
  return line.length >= 2 ? <Line points={line} color={color} lineWidth={3} dashed dashSize={1} gapSize={0.6} raycast={() => null} /> : null;
}

