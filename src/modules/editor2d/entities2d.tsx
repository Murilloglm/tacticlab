// Representação 2D de cada objeto. `hit` é lido pelo Board2D para descobrir o que está sob o ponteiro.
import { Arrow, Circle, Group, Image as KImage, Line, Text, Wedge } from 'react-konva';
import { BOARD_SIZE, metersToMapUnits, type MapFrame, type MapPoint } from '../coordinates';
import type { AgentInfo } from '../catalog/types';
import type { Draft } from '../editor/editorStore';
import { initials, TEAM_COLOR } from '../editor/sceneStyle';
import { wallFromGesture, wallEndpoints } from '../strategy/factory';
import type { AgentToken, Drawing } from '../strategy/schema';
import { compileRoute, type AgentPose } from '../timeline/simulate';
import { useImage } from '../../ui/useImage';

const px = (p: MapPoint) => ({ x: p.x * BOARD_SIZE, y: p.y * BOARD_SIZE });
const flat = (points: MapPoint[]) => points.flatMap((p) => [p.x * BOARD_SIZE, p.y * BOARD_SIZE]);
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

export function Handle({ point, hit, ui, color = '#ffffff' }: { point: MapPoint; hit: string; ui: number; color?: string }) {
  const { x, y } = px(point);
  return <Circle x={x} y={y} radius={5.5 * ui} fill={color} stroke="#0c0d10" strokeWidth={1.5 * ui} hit={hit} hitStrokeWidth={14 * ui} />;
}

interface AgentProps {
  agent: AgentToken;
  pose: AgentPose;
  info: AgentInfo | undefined;
  selected: boolean;
  ui: number;
}

export function AgentToken2D({ agent, pose, info, selected, ui }: AgentProps) {
  const { image } = useImage(info?.displayIcon);
  const { x, y } = px(pose.point);
  const color = TEAM_COLOR[agent.team];
  const r = 15 * ui;
  const reach = r * 2.5;
  const hit = `agents:${agent.id}`;
  const handleX = x + Math.cos(pose.facing) * reach;
  const handleY = y + Math.sin(pose.facing) * reach;

  return (
    <Group>
      <Wedge x={x} y={y} radius={reach} angle={62} rotation={toDegrees(pose.facing) - 31} fill={color} opacity={0.28} listening={false} />
      <Group x={x} y={y} hit={hit}>
        {selected && <Circle radius={r + 5 * ui} stroke="#ffffff" strokeWidth={2 * ui} listening={false} />}
        <Circle radius={r} fill="#14161a" stroke={color} strokeWidth={3 * ui} />
        {image ? (
          <Group
            listening={false}
            clipFunc={(ctx) => {
              ctx.arc(0, 0, r - 1.5 * ui, 0, Math.PI * 2);
            }}
          >
            <KImage image={image} x={-r} y={-r} width={r * 2} height={r * 2} />
          </Group>
        ) : (
          <Text
            text={initials(info?.displayName ?? '?')}
            fill="#ffffff"
            fontSize={r}
            fontStyle="bold"
            width={r * 2}
            height={r * 2}
            x={-r}
            y={-r}
            align="center"
            verticalAlign="middle"
            listening={false}
          />
        )}
      </Group>
      <Text
        x={x - 60 * ui}
        y={y + r + 3 * ui}
        width={120 * ui}
        align="center"
        text={info?.displayName ?? 'Agente'}
        fill="#f2f3f5"
        fontSize={10.5 * ui}
        fontFamily="Saira, sans-serif"
        shadowColor="#000"
        shadowBlur={3 * ui}
        shadowOpacity={1}
        listening={false}
      />
      {selected && (
        <>
          <Line points={[x, y, handleX, handleY]} stroke="#ffffff" strokeWidth={1 * ui} opacity={0.6} listening={false} />
          <Circle x={handleX} y={handleY} radius={6 * ui} fill="#ffffff" stroke="#0c0d10" strokeWidth={1.5 * ui} hit={`rotate:agents:${agent.id}`} hitStrokeWidth={14 * ui} />
        </>
      )}
    </Group>
  );
}

export function Route2D({ agent, frame, selected, ui }: { agent: AgentToken; frame: MapFrame; selected: boolean; ui: number }) {
  if (!agent.route || agent.route.waypoints.length === 0) return null;
  const color = TEAM_COLOR[agent.team];
  const points = [agent.position, ...agent.route.waypoints.map((w) => w.point)];
  const compiled = compileRoute(agent, frame);
  return (
    <Group opacity={selected ? 1 : 0.55}>
      <Arrow
        points={flat(points)}
        stroke={color}
        fill={color}
        strokeWidth={2.5 * ui}
        dash={[8 * ui, 6 * ui]}
        pointerLength={9 * ui}
        pointerWidth={8 * ui}
        listening={false}
      />
      {agent.route.waypoints.map((w) => {
        const { x, y } = px(w.point);
        const isKey = w.arriveAtMs !== null;
        return (
          <Group key={w.id} x={x} y={y}>
            {isKey ? (
              <Line
                points={[0, -7 * ui, 7 * ui, 0, 0, 7 * ui, -7 * ui, 0]}
                closed
                fill={color}
                stroke="#ffffff"
                strokeWidth={1.5 * ui}
                hit={selected ? `waypoint:${agent.id}:${w.id}` : undefined}
              />
            ) : (
              <Circle radius={5 * ui} fill={color} stroke="#0c0d10" strokeWidth={1.5 * ui} hit={selected ? `waypoint:${agent.id}:${w.id}` : undefined} hitStrokeWidth={14 * ui} />
            )}
            {selected && w.pauseMs > 0 && (
              <Text text={`${(w.pauseMs / 1000).toFixed(1)} s`} x={9 * ui} y={-6 * ui} fontSize={10 * ui} fill="#ffffff" listening={false} />
            )}
            {selected && compiled.arrivals[w.id] !== undefined && (
              <Text text={`${(compiled.arrivals[w.id]! / 1000).toFixed(1)}s`} x={-30 * ui} y={9 * ui} width={60 * ui} align="center" fontSize={9.5 * ui} fill="#a0a7b2" listening={false} />
            )}
          </Group>
        );
      })}
    </Group>
  );
}

export function Drawing2D({ drawing, frame, selected, ui }: { drawing: Drawing; frame: MapFrame; selected: boolean; ui: number }) {
  const hit = `drawings:${drawing.id}`;
  switch (drawing.type) {
    case 'line': {
      const Shape = drawing.arrow ? Arrow : Line;
      return (
        <Group>
          <Shape
            points={flat(drawing.points)}
            stroke={drawing.color}
            fill={drawing.color}
            strokeWidth={drawing.width * ui}
            pointerLength={12 * ui}
            pointerWidth={11 * ui}
            dash={drawing.dashed ? [10 * ui, 7 * ui] : undefined}
            lineCap="round"
            lineJoin="round"
            shadowColor={selected ? '#ffffff' : undefined}
            shadowBlur={selected ? 8 : 0}
            hit={hit}
            hitStrokeWidth={16 * ui}
          />
          {selected && drawing.points.length <= 24 && drawing.points.map((p, i) => <Handle key={i} point={p} hit={`vertex:drawings:${drawing.id}:${i}`} ui={ui} />)}
        </Group>
      );
    }
    case 'marker': {
      const { x, y } = px(drawing.point);
      return (
        <Group x={x} y={y} hit={hit}>
          <Line
            points={[0, 0, -9 * ui, -15 * ui, -9 * ui, -26 * ui, 9 * ui, -26 * ui, 9 * ui, -15 * ui]}
            closed
            fill={drawing.color}
            stroke={selected ? '#ffffff' : '#0c0d10'}
            strokeWidth={1.5 * ui}
          />
          {drawing.label && (
            <Text y={3 * ui} x={-70 * ui} width={140 * ui} align="center" text={drawing.label} fontSize={12 * ui} fill="#ffffff" fontFamily="Saira, sans-serif" shadowColor="#000" shadowBlur={3} shadowOpacity={1} />
          )}
        </Group>
      );
    }
    case 'text': {
      const { x, y } = px(drawing.point);
      return (
        <Text
          x={x}
          y={y}
          text={drawing.text}
          fill={drawing.color}
          fontSize={drawing.size * ui}
          fontFamily="Saira, sans-serif"
          fontStyle="600"
          shadowColor={selected ? '#ef3b48' : '#000'}
          shadowBlur={selected ? 8 : 4}
          shadowOpacity={1}
          hit={hit}
        />
      );
    }
    case 'area': {
      const { x, y } = px(drawing.center);
      const r = metersToMapUnits(drawing.radiusM, frame) * BOARD_SIZE;
      return (
        <Group>
          <Circle x={x} y={y} radius={r} fill={drawing.color} opacity={0.2} stroke={selected ? '#ffffff' : drawing.color} strokeWidth={2 * ui} hit={hit} />
          {selected && <Handle point={{ x: drawing.center.x + r / BOARD_SIZE, y: drawing.center.y }} hit={`radius:drawings:${drawing.id}`} ui={ui} />}
        </Group>
      );
    }
  }
}

export function Draft2D({ draft, tool, color, frame, ui }: { draft: Draft; tool: string; color: string; frame: MapFrame; ui: number }) {
  const start = draft.points[0];
  if (!start) return null;
  const cursor = draft.cursor ?? start;

  if (draft.kind === 'utility' && draft.shape === 'circle') {
    // Mostra o raio real do preset no ponto onde a habilidade vai ficar.
    const { x, y } = px(cursor);
    const radius = metersToMapUnits(draft.previewM ?? 1, frame) * BOARD_SIZE;
    return <Circle x={x} y={y} radius={radius} stroke={color} strokeWidth={2 * ui} dash={[6 * ui, 4 * ui]} fill={color} opacity={0.5} listening={false} />;
  }
  if (draft.kind === 'area') {
    const edge = draft.points[1] ?? start;
    const radius = Math.hypot(edge.x - start.x, edge.y - start.y) * BOARD_SIZE;
    const { x, y } = px(start);
    return <Circle x={x} y={y} radius={Math.max(radius, 6 * ui)} stroke={color} strokeWidth={2 * ui} dash={[6 * ui, 4 * ui]} fill={color} opacity={0.5} listening={false} />;
  }
  if (draft.kind === 'utility' && draft.shape === 'path') {
    return <Arrow points={flat([...draft.points, cursor])} stroke="#ffffff" fill="#ffffff" strokeWidth={2 * ui} dash={[6 * ui, 4 * ui]} pointerLength={8 * ui} pointerWidth={8 * ui} listening={false} />;
  }
  if (draft.kind === 'utility' && draft.shape === 'wall' && draft.previewM) {
    const lengthM = draft.previewM ?? 1;
    const wall = wallFromGesture(start, cursor, lengthM, frame, draft.previewBackM ?? 0);
    return <Line points={flat(wallEndpoints(wall.center, wall.facing, lengthM, frame))} stroke="#ffffff" strokeWidth={3 * ui} dash={[6 * ui, 4 * ui]} listening={false} />;
  }
  if (draft.kind === 'utility') {
    return <Line points={flat([start, cursor])} stroke="#ffffff" strokeWidth={3 * ui} dash={[6 * ui, 4 * ui]} listening={false} />;
  }
  const Shape = tool === 'arrow' ? Arrow : Line;
  return <Shape points={flat(draft.points)} stroke={color} fill={color} strokeWidth={3 * ui} pointerLength={12 * ui} pointerWidth={11 * ui} lineCap="round" lineJoin="round" listening={false} />;
}
