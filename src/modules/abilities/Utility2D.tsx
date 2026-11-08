// Render 2D de uma instância de habilidade, com tamanho, cor, alcance e ancoragem vindos da calibração.
import { Arrow, Circle, Group, Image as KImage, Line, Star, Wedge } from 'react-konva';
import { BOARD_SIZE, metersToMapUnits, type MapFrame, type MapPoint } from '../coordinates';
import { useEditor } from '../editor/editorStore';
import { Handle } from '../editor2d/entities2d';
import { wallEndpoints } from '../strategy/factory';
import type { Utility } from '../strategy/schema';
import { useImage } from '../../ui/useImage';
import { pointAhead } from './anchoring';
import { resolveRender, utilityColor, utilityDefinition, type AbilityDefinition } from './definitions';
import { abilityWallLines, directionalStrip, linkWireEnds, stripCorners, wallBurstShape } from './shapes';
import { utilityPathPoint, utilityPathPoints, type UtilityState } from './timeline';

const px = (p: MapPoint) => ({ x: p.x * BOARD_SIZE, y: p.y * BOARD_SIZE });
const flat = (points: MapPoint[]) => points.flatMap((p) => [p.x * BOARD_SIZE, p.y * BOARD_SIZE]);
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

function AbilityGlyph({ url, point, ui, color, hit }: { url: string | null | undefined; point: MapPoint; ui: number; color: string; hit?: string }) {
  const { image } = useImage(url);
  const { x, y } = px(point);
  const r = 10 * ui;
  return (
    <Group x={x} y={y} hit={hit}>
      <Circle radius={r} fill="#14161a" stroke={color} strokeWidth={1.5 * ui} />
      {image && <KImage image={image} x={-r * 0.72} y={-r * 0.72} width={r * 1.44} height={r * 1.44} listening={false} />}
    </Group>
  );
}

interface UtilityProps {
  utility: Utility;
  state: UtilityState | undefined;
  opacity: number;
  frame: MapFrame;
  iconUrl: string | null | undefined;
  selected: boolean;
  ui: number;
}

function WallBurst2D({ utility, definition, frame, color, iconUrl, selected, ui, hit }: { utility: Utility; definition: AbilityDefinition; frame: MapFrame; color: string; iconUrl: string | null | undefined; selected: boolean; ui: number; hit: string }) {
  const mask = useEditor((s) => s.map?.heights ?? null);
  const burst = wallBurstShape(utility, definition, mask, frame);
  if (!burst || definition.render.kind !== 'wall-burst') return null;
  const handle = pointAhead(burst.anchor, burst.angle, 4, frame);
  const flash = burst.flashPoint ? px(burst.flashPoint) : null;
  return (
    <>
      {burst.area.length > 0 && <Line points={flat(burst.area)} closed fill={color} opacity={0.3} stroke={color} strokeWidth={1.5 * ui} hit={hit} />}
      <Arrow points={flat([burst.anchor, burst.exit])} stroke={selected ? '#ffffff' : color} fill={selected ? '#ffffff' : color} strokeWidth={2.5 * ui} dash={[5 * ui, 3 * ui]} pointerLength={7 * ui} pointerWidth={7 * ui} listening={false} />
      {flash && <Star x={flash.x} y={flash.y} numPoints={8} innerRadius={4 * ui} outerRadius={10 * ui} fill={color} stroke="#14161a" strokeWidth={1 * ui} hit={hit} />}
      <AbilityGlyph url={iconUrl} point={burst.anchor} ui={ui * 0.9} color={selected ? '#ffffff' : color} hit={hit} />
      {selected && <Handle point={handle} hit={`rotate:utilities:${utility.id}`} ui={ui} />}
    </>
  );
}

export function Utility2D({ utility, state, opacity, frame, iconUrl, selected, ui }: UtilityProps) {
  const mask = useEditor((s) => s.map?.heights ?? null);
  if (opacity <= 0) return null;
  const base = utilityDefinition(utility);
  const render = resolveRender(base, utility.shape.type);
  const definition = render === base.render ? base : { ...base, render };
  const color = utilityColor(utility);
  const hit = `utilities:${utility.id}`;
  const shape = utility.shape;
  const meters = (value: number) => metersToMapUnits(value * definition.scale2d, frame) * BOARD_SIZE;

  // Habilidades de parede nunca aparecem como círculo solto no chão, nem as salvas antes da ancoragem.
  if (base.render.kind === 'wall-burst' && (shape.type === 'marker' || shape.type === 'circle')) {
    return (
      <Group opacity={opacity}>
        <WallBurst2D utility={utility} definition={base} frame={frame} color={color} iconUrl={iconUrl} selected={selected} ui={ui} hit={hit} />
      </Group>
    );
  }

  switch (shape.type) {
    case 'circle': {
      const { x, y } = px(shape.center);
      return (
        <Group opacity={opacity}>
          <Circle
            x={x}
            y={y}
            radius={meters(definition.size.radiusM)}
            fill={color}
            opacity={render.kind === 'smoke-volume' ? 0.42 : 0.26}
            stroke={selected ? '#ffffff' : color}
            strokeWidth={(selected ? 2 : 1.5) * ui}
            hit={hit}
          />
          <AbilityGlyph url={iconUrl} point={shape.center} ui={ui} color={color} hit={hit} />
        </Group>
      );
    }
    case 'wall': {
      if (render.kind === 'link-wire') {
        const link = linkWireEnds(utility, definition, mask, frame);
        if (!link) return null;
        const [a, b] = link.ends;
        const pa = px(a);
        const pb = px(b);
        return (
          <Group opacity={opacity}>
            <Line points={flat(link.ends)} stroke={selected ? '#ffffff' : color} strokeWidth={2.5 * ui} dash={link.anchored ? undefined : [6 * ui, 4 * ui]} hit={hit} hitStrokeWidth={16 * ui} />
            <Circle x={pa.x} y={pa.y} radius={4 * ui} fill={color} stroke="#14161a" strokeWidth={1 * ui} listening={false} />
            <Circle x={pb.x} y={pb.y} radius={4 * ui} fill={color} stroke="#14161a" strokeWidth={1 * ui} listening={false} />
            <AbilityGlyph url={iconUrl} point={{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }} ui={ui * 0.85} color={color} hit={hit} />
            {selected && <Handle point={b} hit={`rotate:utilities:${utility.id}`} ui={ui} />}
          </Group>
        );
      }
      const width = Math.max(3 * ui, meters(definition.size.thicknessM));
      const lines = abilityWallLines(shape.center, shape.facing, definition, frame);
      const end = wallEndpoints(shape.center, shape.facing, definition.size.lengthM, frame)[1];
      return (
        <Group opacity={opacity}>
          {lines.map((line, i) => (
            <Line key={i} points={flat(line)} stroke={selected ? '#ffffff' : color} strokeWidth={width + (selected ? 2 * ui : 0)} lineCap="round" hit={hit} hitStrokeWidth={Math.max(16 * ui, width)} />
          ))}
          <AbilityGlyph url={iconUrl} point={shape.center} ui={ui * 0.85} color={color} hit={hit} />
          {selected && <Handle point={end} hit={`rotate:utilities:${utility.id}`} ui={ui} />}
        </Group>
      );
    }
    case 'path': {
      if (render.kind === 'directional-area') {
        const strip = directionalStrip(utility, definition, frame);
        if (!strip) return null;
        return (
          <Group opacity={opacity}>
            <Line points={flat(strip.corners)} closed fill={color} opacity={0.3} stroke={selected ? '#ffffff' : color} strokeWidth={1.5 * ui} hit={hit} />
            <Arrow points={flat([strip.origin, strip.start])} stroke={color} fill={color} strokeWidth={2 * ui} dash={[6 * ui, 4 * ui]} pointerLength={7 * ui} pointerWidth={7 * ui} listening={false} />
            <AbilityGlyph url={iconUrl} point={strip.start} ui={ui} color={color} hit={hit} />
            {selected && shape.points.map((p, i) => <Handle key={i} point={p} hit={`vertex:utilities:${utility.id}:${i}`} ui={ui} />)}
          </Group>
        );
      }
      const points = utilityPathPoints(utility) ?? shape.points;
      const moving = state?.started && state.progress < 1 ? utilityPathPoint(utility, state.progress) : null;
      const end = shape.points[shape.points.length - 1]!;
      const landed = Boolean(state?.started) && state!.progress >= 1;
      const { x: ex, y: ey } = px(end);
      return (
        <Group opacity={opacity}>
          <Arrow
            points={flat(points)}
            stroke={selected ? '#ffffff' : color}
            fill={selected ? '#ffffff' : color}
            strokeWidth={2.5 * ui}
            pointerLength={10 * ui}
            pointerWidth={9 * ui}
            hit={hit}
            hitStrokeWidth={16 * ui}
          />
          {landed && render.kind === 'projectile' && render.revealRadiusM && (
            <Circle x={ex} y={ey} radius={meters(render.revealRadiusM)} stroke={color} strokeWidth={1.5 * ui} dash={[8 * ui, 6 * ui]} opacity={0.6} listening={false} />
          )}
          {landed && render.kind === 'projectile' && render.impactRadiusM && (
            <Circle x={ex} y={ey} radius={meters(render.impactRadiusM)} fill={color} opacity={0.25} listening={false} />
          )}
          <AbilityGlyph url={iconUrl} point={moving ?? (state?.progress === 1 ? end : shape.points[0]!)} ui={ui} color={color} hit={hit} />
          {selected && shape.points.map((p, i) => <Handle key={i} point={p} hit={`vertex:utilities:${utility.id}:${i}`} ui={ui} />)}
        </Group>
      );
    }
    case 'marker': {
      const { x, y } = px(shape.point);
      const reach = 34 * ui;
      const heading = shape.facing ?? 0;
      const tipX = x + Math.cos(heading) * reach;
      const tipY = y + Math.sin(heading) * reach;
      const cone = render.kind === 'device' ? render.cone : undefined;
      const detect = render.kind === 'device' ? render.detectRadiusM : undefined;
      const area = render.kind === 'device' && render.area ? stripCorners(shape.point, heading, render.area.lengthM, render.area.widthM, frame) : null;
      const mounted = definition.anchor === 'surface';
      return (
        <Group opacity={opacity}>
          {cone && (
            <>
              {cone.outerRangeM && <Wedge x={x} y={y} radius={meters(cone.outerRangeM)} angle={cone.degrees} rotation={toDegrees(heading) - cone.degrees / 2} fill={color} opacity={0.08} listening={false} />}
              <Wedge x={x} y={y} radius={meters(cone.rangeM)} angle={cone.degrees} rotation={toDegrees(heading) - cone.degrees / 2} fill={color} opacity={0.2} listening={false} />
            </>
          )}
          {detect && <Circle x={x} y={y} radius={meters(detect)} stroke={color} strokeWidth={1.5 * ui} dash={[6 * ui, 5 * ui]} opacity={0.8} listening={false} />}
          {area && <Line points={flat(area)} closed fill={color} opacity={0.25} stroke={color} strokeWidth={1.5 * ui} listening={false} />}
          {!cone && !area && shape.facing !== null && (
            <Arrow points={[x, y, tipX, tipY]} stroke={color} fill={color} strokeWidth={2 * ui} pointerLength={7 * ui} pointerWidth={7 * ui} listening={false} />
          )}
          {/* Preso na parede: um traço marca a face em que está. */}
          {mounted && (
            <Line
              points={[x - Math.sin(heading) * 9 * ui, y + Math.cos(heading) * 9 * ui, x + Math.sin(heading) * 9 * ui, y - Math.cos(heading) * 9 * ui]}
              stroke={color}
              strokeWidth={3 * ui}
              listening={false}
            />
          )}
          <AbilityGlyph url={iconUrl} point={shape.point} ui={ui * 1.15 * definition.scale2d} color={selected ? '#ffffff' : color} hit={hit} />
          {selected && <Handle point={{ x: tipX / BOARD_SIZE, y: tipY / BOARD_SIZE }} hit={`rotate:utilities:${utility.id}`} ui={ui} />}
        </Group>
      );
    }
  }
}

