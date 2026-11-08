// Rotas, desenhos e pré-visualizações no 3D, a partir das mesmas coordenadas de mapa do 2D.
import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { DoubleSide } from 'three';
import { metersToMapUnits, type MapPoint } from '../coordinates';
import type { Draft } from '../editor/editorStore';
import type { Hit } from '../editor/interaction';
import { TEAM_COLOR } from '../editor/sceneStyle';
import { wallEndpoints, wallFromGesture } from '../strategy/factory';
import type { AgentToken, Drawing } from '../strategy/schema';
import { Billboard } from './Billboard';
import { labelTexture } from './labels';
import { buildGroundDisc, polylineOverTerrain } from './mapMeshes';
import { Handle3D, makeDown, SCREEN_SCALE, useDisposed, useGround } from './sceneHelpers';

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

const CIRCLE_PREVIEW_SIDES = 28;

export function Draft3D({ draft, color }: { draft: Draft; color: string }) {
  const { frame, heights } = useGround();
  const cursor = draft.cursor ?? draft.points[0];
  const points = useMemo(() => {
    if (draft.kind === 'utility' && draft.shape === 'circle' && cursor) {
      // Mostra o raio real do preset no ponto onde a habilidade vai ficar.
      const radius = metersToMapUnits(draft.previewM ?? 1, frame);
      return Array.from({ length: CIRCLE_PREVIEW_SIDES + 1 }, (_, i) => {
        const angle = (i / CIRCLE_PREVIEW_SIDES) * Math.PI * 2;
        return { x: cursor.x + Math.cos(angle) * radius, y: cursor.y + Math.sin(angle) * radius };
      });
    }
    if (draft.kind === 'utility' && draft.shape === 'wall' && cursor) {
      const lengthM = draft.previewM ?? 1;
      const wall = wallFromGesture(draft.points[0]!, cursor, lengthM, frame, draft.previewBackM ?? 0);
      return wallEndpoints(wall.center, wall.facing, lengthM, frame);
    }
    if (draft.kind === 'utility' && draft.shape !== 'path') return cursor ? [draft.points[0]!, cursor] : draft.points;
    if (draft.kind === 'utility' && cursor) return [...draft.points, cursor];
    return draft.points;
  }, [draft, cursor, frame]);
  const line = useMemo(() => (points.length >= 2 ? polylineOverTerrain(points, frame, heights, 0.35) : []), [points, frame, heights]);
  return line.length >= 2 ? <Line points={line} color={color} lineWidth={3} dashed dashSize={1} gapSize={0.6} raycast={() => null} /> : null;
}
