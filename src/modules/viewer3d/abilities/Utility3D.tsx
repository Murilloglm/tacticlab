// Render 3D de uma instância de habilidade. A calibração escolhe o renderizador e dá tamanho, cor e
// trajetória; a instância dá posição, direção e caminho; a timeline dá o estado naquele instante.
import { useEffect, useMemo } from 'react';
import { Line } from '@react-three/drei';
import { DoubleSide } from 'three';
import { resolveRender, utilityColor, utilityDefinition, type AbilityDefinition, type AbilityModelId, type AbilityRender } from '../../abilities/definitions';
import { abilityWallLines, circlePoints } from '../../abilities/shapes';
import { pulsePhase, utilityPathHeading, utilityPathPoint, utilityPathPoints, type UtilityState } from '../../abilities/timeline';
import { headingToWorld, mapToWorld, metersToMapUnits, polylineLength, type MapPoint } from '../../coordinates';
import { findAgent, useCatalog } from '../../catalog/catalogStore';
import { utilityOpacity } from '../../editor/sceneStyle';
import type { Hit } from '../../editor/interaction';
import { wallEndpoints } from '../../strategy/factory';
import type { Utility } from '../../strategy/schema';
import { useImage } from '../../../ui/useImage';
import { Billboard } from '../Billboard';
import { tokenTexture } from '../labels';
import { arcedPolyline, buildGroundDisc, buildGroundSector, buildRibbon, polylineOverTerrain } from '../mapMeshes';
import { Handle3D, makeDown, noRaycast, SCREEN_SCALE, useDisposed, useGround, useScaledGroup } from '../sceneHelpers';
import { abilityModelGeometry, areaRimGeometry, segmentedWallGeometry, unitVolumeGeometry, volumeTransform } from './abilityMeshes';

interface RenderProps {
  utility: Utility;
  definition: AbilityDefinition;
  state: UtilityState | undefined;
  opacity: number;
  selected: boolean;
  playing: boolean;
  color: string;
}

const hitFor = (utility: Utility): Hit => ({ kind: 'entity', ref: { c: 'utilities', id: utility.id } });

/** Identificação da habilidade na cena. Os testes e a acessibilidade leem isto. */
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

/**
 * Abertura do volume na reprodução: cresce em 600 ms depois de ativado. Parado, fica sempre no tamanho
 * real. Antes, uma smoke posicionada no instante atual aparecia com 35% do tamanho até avançar o tempo.
 */
export function deployScale(state: UtilityState | undefined, playing: boolean): number {
  if (!playing || !state?.started) return 1;
  const t = Math.min(1, state.elapsedMs / 600);
  return 0.35 + 0.65 * (1 - (1 - t) * (1 - t));
}

/** Contorno no piso, para áreas e alcances serem lidos de lado e de cima. */
function GroundCircle({ center, radiusM, color, opacity, dashed = false, lift = 0.16 }: { center: MapPoint; radiusM: number; color: string; opacity: number; dashed?: boolean; lift?: number }) {
  const { frame, heights } = useGround();
  const line = useMemo(() => polylineOverTerrain(circlePoints(center, radiusM, frame, 64), frame, heights, lift, 2.5), [center, radiusM, frame, heights, lift]);
  return <Line points={line} color={color} lineWidth={2} dashed={dashed} dashSize={1} gapSize={0.7} transparent opacity={opacity} raycast={noRaycast} />;
}

function SmokeVolume({ utility, definition, state, opacity, selected, playing, color }: RenderProps) {
  const { frame, heights } = useGround();
  const volume = definition.render.kind === 'smoke-volume' ? definition.render.volume : 'sphere';
  const radiusM = definition.size.radiusM * definition.scale3d;
  const heightM = definition.size.heightM * definition.scale3d;
  const center = utility.shape.type === 'circle' ? utility.shape.center : null;
  const disc = useDisposed(useMemo(() => buildGroundDisc(center ?? { x: 0.5, y: 0.5 }, radiusM, frame, heights, 0.1), [center, radiusM, frame, heights]));
  if (!center) return null;
  const ground = heights?.heightAt(center) ?? 0;
  const scale = deployScale(state, playing);
  const { lift, scale: size } = volumeTransform(volume, radiusM, heightM);
  const geometry = unitVolumeGeometry(volume);
  const base = mapToWorld(center, frame, ground);
  return (
    <group userData={tag(utility, definition.render, { radiusM, heightM, volume, deploy: Number(scale.toFixed(2)) })}>
      <group position={[base[0], ground + lift * scale, base[2]]} scale={[scale, scale, scale]}>
        <mesh geometry={geometry} scale={size} name="smoke-volume" onPointerDown={makeDown(hitFor(utility))} renderOrder={4}>
          <meshLambertMaterial color={selected ? '#ffffff' : color} transparent opacity={opacity * 0.5} depthWrite={false} side={DoubleSide} flatShading />
        </mesh>
        {/* Núcleo mais denso: dá volume ao centro, como uma nuvem, sem textura. */}
        <mesh geometry={geometry} scale={[size[0] * 0.72, size[1] * 0.72, size[2] * 0.72]} raycast={noRaycast} renderOrder={3}>
          <meshLambertMaterial color={color} transparent opacity={opacity * 0.38} depthWrite={false} flatShading />
        </mesh>
      </group>
      <mesh geometry={disc} raycast={noRaycast}>
        <meshBasicMaterial color={color} transparent opacity={opacity * 0.22} depthWrite={false} side={DoubleSide} />
      </mesh>
      <GroundCircle center={center} radiusM={radiusM} color={color} opacity={opacity * 0.8} />
      <AbilityIcon utility={utility} point={center} lift={heightM + 0.6} opacity={opacity} selected={selected} color={color} />
    </group>
  );
}

function GroundArea({ utility, definition, opacity, selected, color }: RenderProps) {
  const { frame, heights } = useGround();
  const radiusM = definition.size.radiusM * definition.scale3d;
  const center = utility.shape.type === 'circle' ? utility.shape.center : null;
  const disc = useDisposed(useMemo(() => buildGroundDisc(center ?? { x: 0.5, y: 0.5 }, radiusM, frame, heights, 0.12), [center, radiusM, frame, heights]));
  if (!center) return null;
  const ground = heights?.heightAt(center) ?? 0;
  return (
    <group userData={tag(utility, definition.render, { radiusM })}>
      <mesh geometry={disc} name="ground-area" onPointerDown={makeDown(hitFor(utility))}>
        <meshBasicMaterial color={color} transparent opacity={opacity * 0.36} depthWrite={false} side={DoubleSide} />
      </mesh>
      {/* Borda baixa: marca o limite sem parecer uma parede. */}
      <mesh geometry={areaRimGeometry()} position={mapToWorld(center, frame, ground)} scale={[radiusM, 1, radiusM]} raycast={noRaycast}>
        <meshBasicMaterial color={selected ? '#ffffff' : color} transparent opacity={opacity * 0.45} depthWrite={false} side={DoubleSide} />
      </mesh>
      <GroundCircle center={center} radiusM={radiusM} color={selected ? '#ffffff' : color} opacity={opacity} />
      <GroundCircle center={center} radiusM={radiusM * 0.55} color={color} opacity={opacity * 0.5} dashed />
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
  if (utility.shape.type !== 'wall') return null;
  const geometry = segmentedWallGeometry(lengthM, heightM, thicknessM, segments, color);
  const { center, facing } = utility.shape;
  const ground = heights?.heightAt(center) ?? 0;
  const ends = wallEndpoints(center, facing, lengthM, frame);
  return (
    <group userData={tag(utility, definition.render, { lengthM, heightM, thicknessM, segments })}>
      <mesh geometry={geometry} position={mapToWorld(center, frame, ground - 0.1)} rotation={[0, -facing, 0]} name="wall-solid" onPointerDown={makeDown(hitFor(utility))}>
        <meshLambertMaterial vertexColors flatShading transparent={opacity < 1} opacity={opacity} emissive={selected ? '#ffffff' : '#000000'} emissiveIntensity={selected ? 0.3 : 0} />
      </mesh>
      <AbilityIcon utility={utility} point={center} lift={heightM + 0.6} opacity={opacity} selected={selected} color={color} />
      {selected && <WallHandle utility={utility} end={ends[1]} />}
    </group>
  );
}

/** Subdivide a parede para a faixa acompanhar o relevo. */
function subdivide(a: MapPoint, b: MapPoint, lengthM: number): MapPoint[] {
  const steps = Math.max(1, Math.min(64, Math.round(lengthM / 2)));
  return Array.from({ length: steps + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }));
}

function EnergyWall({ utility, definition, opacity, selected, color }: RenderProps) {
  const { frame, heights } = useGround();
  const { lengthM, heightM } = definition.size;
  const shape = utility.shape.type === 'wall' ? utility.shape : null;
  const lines = useMemo(() => abilityWallLines(shape?.center ?? { x: 0.5, y: 0.5 }, shape?.facing ?? 0, definition, frame), [shape, definition, frame]);
  const ribbons = useMemo(() => lines.map(([a, b]) => buildRibbon(subdivide(a, b, lengthM), heightM, frame, heights)), [lines, lengthM, heightM, frame, heights]);
  const bases = useMemo(() => lines.map((line) => polylineOverTerrain(line, frame, heights, 0.05)), [lines, frame, heights]);
  useEffect(() => () => ribbons.forEach((ribbon) => ribbon.dispose()), [ribbons]);
  if (!shape) return null;
  const end = wallEndpoints(shape.center, shape.facing, lengthM, frame)[1];
  return (
    <group userData={tag(utility, definition.render, { lengthM, heightM, walls: lines.length })}>
      {ribbons.map((ribbon, i) => (
        <mesh key={i} geometry={ribbon} name="wall-energy" onPointerDown={makeDown(hitFor(utility))}>
          <meshBasicMaterial color={selected ? '#ffffff' : color} transparent opacity={opacity * 0.5} side={DoubleSide} depthWrite={false} />
        </mesh>
      ))}
      {bases.map((base, i) => (
        <Line key={i} points={base} color={color} lineWidth={2} transparent opacity={opacity} raycast={noRaycast} />
      ))}
      <AbilityIcon utility={utility} point={shape.center} lift={heightM + 0.6} opacity={opacity} selected={selected} color={color} />
      {selected && <WallHandle utility={utility} end={end} />}
    </group>
  );
}

function ModelMesh({ model, color, selected, opacity, utility, name, scale }: { model: AbilityModelId; color: string; selected: boolean; opacity: number; utility: Utility; name: string; scale: number }) {
  return (
    <mesh geometry={abilityModelGeometry(model, color)} name={name} scale={[scale, scale, scale]} onPointerDown={makeDown(hitFor(utility))}>
      <meshLambertMaterial vertexColors flatShading transparent={opacity < 1} opacity={opacity} emissive={selected ? '#ffffff' : '#000000'} emissiveIntensity={selected ? 0.35 : 0} />
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

/** Alcance de criatura no ponto onde ela está: círculo, ou cone à frente quando há ângulo. */
function SenseArea({ point, heading, sense, color, opacity }: { point: MapPoint; heading: number; sense: { radiusM: number; degrees?: number }; color: string; opacity: number }) {
  const { frame, heights } = useGround();
  const half = ((sense.degrees ?? 360) * Math.PI) / 360;
  const geometry = useDisposed(
    useMemo(() => buildGroundSector(point, sense.radiusM, sense.degrees ? heading - half : 0, sense.degrees ? heading + half : Math.PI * 2, frame, heights, 0.14), [point, heading, half, sense, frame, heights]),
  );
  return (
    <mesh geometry={geometry} raycast={noRaycast} name="ability-sense">
      <meshBasicMaterial color={color} transparent opacity={opacity * 0.14} depthWrite={false} side={DoubleSide} />
    </mesh>
  );
}

function PathModel({ utility, definition, state, opacity, selected, color }: RenderProps) {
  const { frame, heights } = useGround();
  const scaled = useScaledGroup();
  const position = pathPosition(utility, state);
  const { render } = definition;
  if (!position || (render.kind !== 'projectile' && render.kind !== 'creature')) return null;
  const projectile = render.kind === 'projectile';
  const arcM = projectile ? definition.trajectory.arcM : 0;
  const lift = projectile ? definition.offset.liftM : 0.05;
  const ground = heights?.heightAt(position.point) ?? 0;
  const t = position.progress;
  const height = ground + lift + arcM * 4 * t * (1 - t);
  const facing = utilityPathHeading(utility, t);
  // Inclinação ao longo do arco: a seta sobe no começo e desce cravada no fim.
  const lengthM = polylineLength(utilityPathPoints(utility) ?? []) * frame.worldMeters;
  const pitch = projectile && arcM > 0 && lengthM > 0 ? Math.atan2(arcM * 4 * (1 - 2 * t), lengthM) : 0;
  const landed = Boolean(state?.started) && t >= 1;
  const afterArrival = state ? state.elapsedMs - state.travelMs : -1;
  const pulse = projectile && render.pulses && landed ? pulsePhase(afterArrival, render.pulses) : null;
  return (
    <group userData={tag(utility, render, { progress: Number(t.toFixed(3)), mapX: Number(position.point.x.toFixed(4)), mapY: Number(position.point.y.toFixed(4)), landed, pulse: pulse === null ? null : Number(pulse.toFixed(2)) })}>
      <PathLine utility={utility} arcM={arcM} lift={lift} progress={t} opacity={opacity} selected={selected} color={color} />
      <group position={mapToWorld(position.point, frame, height)} rotation={[0, -facing, pitch]}>
        <group ref={scaled}>
          <ModelMesh model={render.model} color={color} selected={selected} opacity={opacity} utility={utility} scale={definition.scale3d} name={projectile ? 'ability-projectile' : 'ability-creature'} />
        </group>
      </group>
      {render.kind === 'creature' && render.sense && state?.started && <SenseArea point={position.point} heading={facing} sense={render.sense} color={color} opacity={opacity} />}
      {projectile && landed && render.revealRadiusM && <GroundCircle center={position.point} radiusM={render.revealRadiusM} color={color} opacity={opacity * 0.45} dashed />}
      {projectile && pulse !== null && render.revealRadiusM && <GroundCircle center={position.point} radiusM={Math.max(0.5, render.revealRadiusM * pulse)} color={color} opacity={opacity * (1 - pulse)} lift={0.3} />}
      {projectile && landed && render.impactRadiusM && <GroundCircle center={position.point} radiusM={render.impactRadiusM} color={color} opacity={opacity} />}
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

/** Cone de visão no chão: faixa de alcance principal e uma faixa externa mais fraca. */
function ViewCone({ point, facing, cone, color, opacity }: { point: MapPoint; facing: number; cone: { degrees: number; rangeM: number; outerRangeM?: number }; color: string; opacity: number }) {
  const { frame, heights } = useGround();
  const half = (cone.degrees * Math.PI) / 360;
  const inner = useDisposed(useMemo(() => buildGroundSector(point, cone.rangeM, facing - half, facing + half, frame, heights, 0.14), [point, facing, half, cone.rangeM, frame, heights]));
  const outer = useDisposed(
    useMemo(
      () => buildGroundSector(point, cone.outerRangeM ?? cone.rangeM, facing - half, facing + half, frame, heights, 0.13, cone.rangeM),
      [point, facing, half, cone.rangeM, cone.outerRangeM, frame, heights],
    ),
  );
  return (
    <>
      <mesh geometry={inner} raycast={noRaycast} name="ability-cone">
        <meshBasicMaterial color={color} transparent opacity={opacity * 0.2} depthWrite={false} side={DoubleSide} />
      </mesh>
      {cone.outerRangeM && (
        <mesh geometry={outer} raycast={noRaycast}>
          <meshBasicMaterial color={color} transparent opacity={opacity * 0.08} depthWrite={false} side={DoubleSide} />
        </mesh>
      )}
    </>
  );
}

function Device({ utility, definition, opacity, selected, color }: RenderProps) {
  const { frame, heights } = useGround();
  const scaled = useScaledGroup();
  if (utility.shape.type !== 'marker' || definition.render.kind !== 'device') return null;
  const { render } = definition;
  const { point, facing } = utility.shape;
  const heading = facing ?? 0;
  const ground = heights?.heightAt(point) ?? 0;
  const base = mapToWorld(point, frame, ground);
  const dir = headingToWorld(heading);
  return (
    <group userData={tag(utility, render, { facing, coneDegrees: render.cone?.degrees ?? null, detectRadiusM: render.detectRadiusM ?? null })}>
      <group position={base} rotation={[0, -heading, 0]}>
        <group ref={scaled}>
          <ModelMesh model={render.model} color={color} selected={selected} opacity={opacity} utility={utility} scale={definition.scale3d} name="ability-device" />
        </group>
      </group>
      {render.cone && <ViewCone point={point} facing={heading} cone={render.cone} color={color} opacity={opacity} />}
      {render.detectRadiusM && <GroundCircle center={point} radiusM={render.detectRadiusM} color={color} opacity={opacity * 0.7} dashed />}
      {!render.cone && facing !== null && (
        <Line points={[[base[0], ground + 0.25, base[2]], [base[0] + dir[0] * DEVICE_REACH_M, ground + 0.25, base[2] + dir[2] * DEVICE_REACH_M]]} color={color} lineWidth={3} transparent opacity={opacity} raycast={noRaycast} />
      )}
      <AbilityIcon utility={utility} point={point} lift={2.4} opacity={opacity} selected={selected} color={color} />
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
  const render = resolveRender(base, utility.shape.type);
  const definition = render === base.render ? base : { ...base, render };
  const Renderer = RENDERERS[definition.render.kind];
  return <Renderer utility={utility} definition={definition} state={state} opacity={opacity} selected={selected} playing={playing} color={utilityColor(utility)} />;
}
