// Render 3D de uma instância de habilidade. A definição canônica escolhe o renderizador e dá o
// tamanho; a instância dá posição, direção e trajetória; a timeline dá o estado naquele instante.
import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { DoubleSide } from 'three';
import { resolveRender, utilityColor, utilityDefinition, type AbilityDefinition, type AbilityModelId, type AbilityRender } from '../../abilities/definitions';
import { utilityPathHeading, utilityPathPoint, utilityPathPoints, type UtilityState } from '../../abilities/timeline';
import { headingToWorld, mapToWorld, metersToMapUnits, type MapPoint } from '../../coordinates';
import { findAgent, useCatalog } from '../../catalog/catalogStore';
import { utilityOpacity } from '../../editor/sceneStyle';
import type { Hit } from '../../editor/interaction';
import { wallEndpoints } from '../../strategy/factory';
import type { Utility } from '../../strategy/schema';
import { useImage } from '../../../ui/useImage';
import { Billboard } from '../Billboard';
import { tokenTexture } from '../labels';
import { arcedPolyline, buildGroundDisc, buildRibbon, polylineOverTerrain } from '../mapMeshes';
import { Handle3D, makeDown, noRaycast, SCREEN_SCALE, useDisposed, useGround, useScaledGroup } from '../sceneHelpers';
import { abilityModelGeometry, areaRimGeometry, segmentedWallGeometry, smokeVolumeGeometry } from './abilityMeshes';

interface RenderProps {
  utility: Utility;
  definition: AbilityDefinition;
  state: UtilityState | undefined;
  opacity: number;
  selected: boolean;
  color: string;
}

const hitFor = (utility: Utility): Hit => ({ kind: 'entity', ref: { c: 'utilities', id: utility.id } });

/** Identificação do agente e da habilidade na cena. Os testes e a acessibilidade leem isto. */
const tag = (utility: Utility, render: AbilityRender, extra: Record<string, unknown> = {}) => ({
  tactical: {
    type: 'ability',
    id: utility.id,
    slot: utility.abilitySlot,
    agentUuid: utility.agentUuid,
    render: render.kind,
    model: 'model' in render ? render.model : null,
    ...extra,
  },
});

/** Ícone pequeno sobre o objeto: identifica a habilidade, mas não é a representação dela. */
function AbilityIcon({ utility, point, lift, opacity, selected, color }: { utility: Utility; point: MapPoint; lift: number; opacity: number; selected: boolean; color: string }) {
  const catalog = useCatalog((s) => s.catalog);
  const iconUrl = findAgent(catalog, utility.agentUuid)?.abilities.find((a) => a.slot === utility.abilitySlot)?.displayIcon;
  const { image } = useImage(iconUrl);
  const texture = useDisposed(useMemo(() => tokenTexture({ image, ring: color, fallback: '•', selected }), [image, color, selected]));
  return <Billboard point={point} lift={lift} size={0.9} growFrom={SCREEN_SCALE} opacity={opacity} texture={texture} onPointerDown={makeDown(hitFor(utility))} renderOrder={15} />;
}

/** Abre em 600 ms depois de ativada. Antes de começar fica cheia, para planejar com o tamanho real. */
function deployScale(state: UtilityState | undefined): number {
  if (!state?.started) return 1;
  const t = Math.min(1, state.elapsedMs / 600);
  return 0.35 + 0.65 * (1 - (1 - t) * (1 - t));
}

function SmokeVolume({ utility, definition, state, opacity, selected, color }: RenderProps) {
  const { frame, heights } = useGround();
  const { radiusM, heightM } = definition.size;
  const geometry = useDisposed(useMemo(() => smokeVolumeGeometry(radiusM, heightM), [radiusM, heightM]));
  const center = utility.shape.type === 'circle' ? utility.shape.center : null;
  const disc = useDisposed(useMemo(() => buildGroundDisc(center ?? { x: 0.5, y: 0.5 }, radiusM, frame, heights, 0.1), [center, radiusM, frame, heights]));
  if (!center) return null;
  const ground = heights?.heightAt(center) ?? 0;
  const scale = deployScale(state);
  return (
    <group userData={tag(utility, definition.render, { radiusM, heightM })}>
      <group position={mapToWorld(center, frame, ground)} scale={[scale, scale, scale]}>
        <mesh geometry={geometry} name="smoke-volume" onPointerDown={makeDown(hitFor(utility))}>
          <meshLambertMaterial color={selected ? '#ffffff' : color} transparent opacity={opacity * 0.62} depthWrite={false} side={DoubleSide} flatShading />
        </mesh>
      </group>
      <mesh geometry={disc} raycast={noRaycast}>
        <meshBasicMaterial color={color} transparent opacity={opacity * 0.3} depthWrite={false} side={DoubleSide} />
      </mesh>
      <AbilityIcon utility={utility} point={center} lift={heightM + 0.6} opacity={opacity} selected={selected} color={color} />
    </group>
  );
}

function GroundArea({ utility, definition, opacity, selected, color }: RenderProps) {
  const { frame, heights } = useGround();
  const { radiusM } = definition.size;
  const center = utility.shape.type === 'circle' ? utility.shape.center : null;
  const disc = useDisposed(useMemo(() => buildGroundDisc(center ?? { x: 0.5, y: 0.5 }, radiusM, frame, heights, 0.12), [center, radiusM, frame, heights]));
  const rim = useDisposed(useMemo(() => areaRimGeometry(radiusM, 0.7), [radiusM]));
  if (!center) return null;
  const ground = heights?.heightAt(center) ?? 0;
  return (
    <group userData={tag(utility, definition.render, { radiusM })}>
      <mesh geometry={disc} name="ground-area" onPointerDown={makeDown(hitFor(utility))}>
        <meshBasicMaterial color={color} transparent opacity={opacity * 0.42} depthWrite={false} side={DoubleSide} />
      </mesh>
      <mesh geometry={rim} position={mapToWorld(center, frame, ground)} raycast={noRaycast}>
        <meshBasicMaterial color={selected ? '#ffffff' : color} transparent opacity={opacity * 0.5} depthWrite={false} side={DoubleSide} />
      </mesh>
      <AbilityIcon utility={utility} point={center} lift={1.3} opacity={opacity} selected={selected} color={color} />
    </group>
  );
}

function WallHandle({ utility, end }: { utility: Utility; end: MapPoint }) {
  return <Handle3D point={end} hit={{ kind: 'rotate', ref: { c: 'utilities', id: utility.id } }} />;
}

function SolidWall({ utility, definition, opacity, selected, color }: RenderProps) {
  const { frame, heights } = useGround();
  const { lengthM, heightM, thicknessM } = definition.size;
  const segments = definition.render.kind === 'wall-solid' ? definition.render.segments : 1;
  const geometry = useDisposed(useMemo(() => segmentedWallGeometry(lengthM, heightM, thicknessM, segments, color), [lengthM, heightM, thicknessM, segments, color]));
  if (utility.shape.type !== 'wall') return null;
  const { center, facing } = utility.shape;
  const ground = heights?.heightAt(center) ?? 0;
  const ends = wallEndpoints(center, facing, lengthM, frame);
  return (
    <group userData={tag(utility, definition.render, { lengthM, heightM, thicknessM, segments })}>
      <mesh geometry={geometry} position={mapToWorld(center, frame, ground - 0.1)} rotation={[0, -facing, 0]} name="wall-solid" onPointerDown={makeDown(hitFor(utility))}>
        <meshLambertMaterial vertexColors transparent={opacity < 1} opacity={opacity} emissive={selected ? '#ffffff' : '#000000'} emissiveIntensity={selected ? 0.3 : 0} />
      </mesh>
      <AbilityIcon utility={utility} point={center} lift={heightM + 0.6} opacity={opacity} selected={selected} color={color} />
      {selected && <WallHandle utility={utility} end={ends[1]} />}
    </group>
  );
}

/** Subdivide a parede para a faixa acompanhar o relevo. */
function subdivide(a: MapPoint, b: MapPoint, lengthM: number): MapPoint[] {
  const steps = Math.max(1, Math.min(48, Math.round(lengthM / 2)));
  return Array.from({ length: steps + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }));
}

function EnergyWall({ utility, definition, opacity, selected, color }: RenderProps) {
  const { frame, heights } = useGround();
  const { lengthM, heightM } = definition.size;
  const shape = utility.shape.type === 'wall' ? utility.shape : null;
  const ends = useMemo(() => wallEndpoints(shape?.center ?? { x: 0.5, y: 0.5 }, shape?.facing ?? 0, lengthM, frame), [shape, lengthM, frame]);
  const ribbon = useDisposed(useMemo(() => buildRibbon(subdivide(ends[0], ends[1], lengthM), heightM, frame, heights), [ends, lengthM, heightM, frame, heights]));
  const base = useMemo(() => polylineOverTerrain(ends, frame, heights, 0.05), [ends, frame, heights]);
  if (!shape) return null;
  return (
    <group userData={tag(utility, definition.render, { lengthM, heightM })}>
      <mesh geometry={ribbon} name="wall-energy" onPointerDown={makeDown(hitFor(utility))}>
        <meshBasicMaterial color={selected ? '#ffffff' : color} transparent opacity={opacity * 0.5} side={DoubleSide} depthWrite={false} />
      </mesh>
      <Line points={base} color={color} lineWidth={2} transparent opacity={opacity} raycast={noRaycast} />
      <AbilityIcon utility={utility} point={shape.center} lift={heightM + 0.6} opacity={opacity} selected={selected} color={color} />
      {selected && <WallHandle utility={utility} end={ends[1]} />}
    </group>
  );
}

function ModelMesh({ model, color, selected, opacity, utility, name }: { model: AbilityModelId; color: string; selected: boolean; opacity: number; utility: Utility; name: string }) {
  return (
    <mesh geometry={abilityModelGeometry(model, color)} name={name} onPointerDown={makeDown(hitFor(utility))}>
      <meshLambertMaterial vertexColors transparent={opacity < 1} opacity={opacity} emissive={selected ? '#ffffff' : '#000000'} emissiveIntensity={selected ? 0.35 : 0} />
    </mesh>
  );
}

/** Onde o objeto está no percurso: na saída antes de começar e no destino depois de chegar. */
function pathPosition(utility: Utility, state: UtilityState | undefined): { point: MapPoint; progress: number } | null {
  if (utility.shape.type !== 'path') return null;
  const progress = state?.started ? state.progress : 0;
  const point = utilityPathPoint(utility, progress);
  return point ? { point, progress } : null;
}

/** Percurso, com o trecho já feito em destaque. Serve para projéteis, criaturas e rastros. */
function PathLine({ utility, arcM, lift, progress, opacity, selected, color }: { utility: Utility; arcM: number; lift: number; progress: number; opacity: number; selected: boolean; color: string }) {
  const { frame, heights } = useGround();
  const line = useMemo(() => arcedPolyline(utilityPathPoints(utility) ?? [], frame, heights, lift, arcM), [utility, frame, heights, lift, arcM]);
  const done = useMemo(() => line.slice(0, Math.max(2, Math.ceil(line.length * progress))), [line, progress]);
  if (line.length < 2) return null;
  return (
    <>
      <Line points={line} color={selected ? '#ffffff' : color} lineWidth={2} dashed dashSize={0.9} gapSize={0.6} transparent opacity={opacity * 0.7} raycast={noRaycast} />
      {progress > 0 && <Line points={done} color={color} lineWidth={4} transparent opacity={opacity} raycast={noRaycast} />}
    </>
  );
}

function PathHandles({ utility }: { utility: Utility }) {
  if (utility.shape.type !== 'path') return null;
  return (
    <>
      {utility.shape.points.map((p, i) => (
        <Handle3D key={i} point={p} hit={{ kind: 'vertex', ref: { c: 'utilities', id: utility.id }, index: i }} />
      ))}
    </>
  );
}

function PathModel({ utility, definition, state, opacity, selected, color }: RenderProps) {
  const { frame, heights } = useGround();
  const scaled = useScaledGroup();
  const position = pathPosition(utility, state);
  if (!position || (definition.render.kind !== 'projectile' && definition.render.kind !== 'creature')) return null;
  const { render } = definition;
  const arcM = render.kind === 'projectile' ? render.arcM : 0;
  const lift = render.kind === 'projectile' ? 1 : 0.05;
  const ground = heights?.heightAt(position.point) ?? 0;
  const height = ground + lift + arcM * 4 * position.progress * (1 - position.progress);
  const facing = utilityPathHeading(utility, position.progress);
  return (
    <group userData={tag(utility, render, { progress: Number(position.progress.toFixed(3)), mapX: Number(position.point.x.toFixed(4)), mapY: Number(position.point.y.toFixed(4)) })}>
      <PathLine utility={utility} arcM={arcM} lift={lift} progress={position.progress} opacity={opacity} selected={selected} color={color} />
      <group position={mapToWorld(position.point, frame, height)} rotation={[0, -facing, 0]}>
        <group ref={scaled}>
          <ModelMesh model={render.model} color={color} selected={selected} opacity={opacity} utility={utility} name={render.kind === 'creature' ? 'ability-creature' : 'ability-projectile'} />
        </group>
      </group>
      <AbilityIcon utility={utility} point={position.point} lift={height - ground + 2.2} opacity={opacity} selected={selected} color={color} />
      {selected && <PathHandles utility={utility} />}
    </group>
  );
}

/** Dash, teleporte e efeitos que correm pelo chão: rastro e destino. */
function Trail({ utility, definition, state, opacity, selected, color }: RenderProps) {
  const { frame, heights } = useGround();
  const position = pathPosition(utility, state);
  const end = utility.shape.type === 'path' ? utility.shape.points[utility.shape.points.length - 1]! : null;
  const disc = useDisposed(useMemo(() => buildGroundDisc(end ?? { x: 0.5, y: 0.5 }, 1.2, frame, heights, 0.1), [end, frame, heights]));
  if (!position) return null;
  return (
    <group userData={tag(utility, definition.render, { progress: Number(position.progress.toFixed(3)) })}>
      <PathLine utility={utility} arcM={0} lift={0.3} progress={position.progress} opacity={opacity} selected={selected} color={color} />
      <mesh geometry={disc} name="ability-trail" onPointerDown={makeDown(hitFor(utility))}>
        <meshBasicMaterial color={color} transparent opacity={opacity * 0.6} depthWrite={false} side={DoubleSide} />
      </mesh>
      <AbilityIcon utility={utility} point={position.point} lift={1.8} opacity={opacity} selected={selected} color={color} />
      {selected && <PathHandles utility={utility} />}
    </group>
  );
}

const DEVICE_REACH_M = 7;

function Device({ utility, definition, opacity, selected, color }: RenderProps) {
  const { frame, heights } = useGround();
  const scaled = useScaledGroup();
  if (utility.shape.type !== 'marker' || definition.render.kind !== 'device') return null;
  const { point, facing } = utility.shape;
  const ground = heights?.heightAt(point) ?? 0;
  const base = mapToWorld(point, frame, ground);
  const dir = headingToWorld(facing ?? 0);
  return (
    <group userData={tag(utility, definition.render, { facing })}>
      <group position={base} rotation={[0, -(facing ?? 0), 0]}>
        <group ref={scaled}>
          <ModelMesh model={definition.render.model} color={color} selected={selected} opacity={opacity} utility={utility} name="ability-device" />
        </group>
      </group>
      {facing !== null && (
        <Line points={[[base[0], ground + 0.25, base[2]], [base[0] + dir[0] * DEVICE_REACH_M, ground + 0.25, base[2] + dir[2] * DEVICE_REACH_M]]} color={color} lineWidth={3} transparent opacity={opacity} raycast={noRaycast} />
      )}
      <AbilityIcon utility={utility} point={point} lift={2.8} opacity={opacity} selected={selected} color={color} />
      {selected && (
        <Handle3D
          point={{ x: point.x + metersToMapUnits(dir[0] * DEVICE_REACH_M, frame), y: point.y + metersToMapUnits(dir[2] * DEVICE_REACH_M, frame) }}
          hit={{ kind: 'rotate', ref: { c: 'utilities', id: utility.id } }}
        />
      )}
    </group>
  );
}

const RENDERERS: Record<AbilityRender['kind'], (props: RenderProps) => React.JSX.Element | null> = {
  'smoke-volume': SmokeVolume,
  'ground-area': GroundArea,
  'wall-solid': SolidWall,
  'wall-energy': EnergyWall,
  projectile: PathModel,
  creature: PathModel,
  trail: Trail,
  device: Device,
};

export function Utility3D({ utility, state, playing, selected }: { utility: Utility; state: UtilityState | undefined; playing: boolean; selected: boolean }) {
  const opacity = utilityOpacity(state, playing);
  if (opacity <= 0) return null;
  const base = utilityDefinition(utility);
  const definition = { ...base, render: resolveRender(base, utility.shape.type) };
  const Renderer = RENDERERS[definition.render.kind];
  return <Renderer utility={utility} definition={definition} state={state} opacity={opacity} selected={selected} color={utilityColor(utility)} />;
}
