// Formas derivadas da definição, usadas pelo 2D e pelo 3D para os dois mostrarem o mesmo desenho.
import { distanceMeters, metersToMapUnits, type MapFrame, type MapPoint } from '../coordinates';
import { wallEndpoints } from '../strategy/factory';
import type { Utility } from '../strategy/schema';
import { linkEndpoints, nearestWallAnchor, pointAhead, throughWall, type FloorMask, type WallCrossing } from './anchoring';
import type { AbilityDefinition } from './definitions';

const shift = (p: MapPoint, dx: number, dy: number): MapPoint => ({ x: p.x + dx, y: p.y + dy });

/**
 * Segmentos de parede. A maioria é um segmento só. A Neon tem duas paredes paralelas e o Deadlock
 * tem duas cruzadas, com o comprimento da calibração.
 */
export function abilityWallLines(center: MapPoint, facing: number, definition: AbilityDefinition, frame: MapFrame): Array<[MapPoint, MapPoint]> {
  const { lengthM } = definition.size;
  const base = wallEndpoints(center, facing, lengthM, frame);
  const { render } = definition;
  if (render.kind === 'wall-energy' && render.parallelGapM) {
    const half = metersToMapUnits(render.parallelGapM / 2, frame);
    const nx = -Math.sin(facing) * half;
    const ny = Math.cos(facing) * half;
    return [
      [shift(base[0], nx, ny), shift(base[1], nx, ny)],
      [shift(base[0], -nx, -ny), shift(base[1], -nx, -ny)],
    ];
  }
  if (render.kind === 'wall-energy' && render.crossed) return [base, wallEndpoints(center, facing + Math.PI / 2, lengthM, frame)];
  return [base];
}

/** Cantos de uma faixa retangular no chão, a partir de `start`, na direção indicada. */
export function stripCorners(start: MapPoint, angle: number, lengthM: number, widthM: number, frame: MapFrame): MapPoint[] {
  const end = pointAhead(start, angle, lengthM, frame);
  const half = metersToMapUnits(widthM / 2, frame);
  const nx = -Math.sin(angle) * half;
  const ny = Math.cos(angle) * half;
  return [shift(start, nx, ny), shift(end, nx, ny), shift(end, -nx, -ny), shift(start, -nx, -ny)];
}

export interface DirectionalStrip {
  origin: MapPoint;
  angle: number;
  /** Onde a faixa começa: a habilidade nasce a alguns metros do agente. */
  start: MapPoint;
  lengthM: number;
  widthM: number;
  corners: MapPoint[];
}

/**
 * Faixa direcional (Fault Line, Rolling Thunder, Hunter's Fury, Nightfall): sai do primeiro ponto
 * na direção do último. Com mira, o alvo define o comprimento, entre o mínimo e o máximo do wiki.
 */
export function directionalStrip(utility: Utility, definition: AbilityDefinition, frame: MapFrame): DirectionalStrip | null {
  const render = definition.render;
  if (render.kind !== 'directional-area') return null;
  let origin: MapPoint;
  let target: MapPoint;
  if (utility.shape.type === 'path') {
    origin = utility.shape.points[0]!;
    target = utility.shape.points[utility.shape.points.length - 1]!;
  } else if (utility.shape.type === 'marker') {
    origin = utility.shape.point;
    target = pointAhead(origin, utility.shape.facing ?? 0, render.startM + render.lengthM, frame);
  } else {
    return null;
  }
  const angle = Math.atan2(target.y - origin.y, target.x - origin.x);
  const distance = distanceMeters(origin, target, frame);
  const lengthM = render.aimed ? Math.min(render.lengthM, Math.max(render.minLengthM ?? 0, distance - render.startM)) : render.lengthM;
  const start = pointAhead(origin, angle, render.startM, frame);
  return { origin, angle, start, lengthM, widthM: render.widthM, corners: stripCorners(start, angle, lengthM, render.widthM, frame) };
}

export interface WallBurstShape {
  /** Ponto na parede e direção em que a carga atravessa. */
  anchor: MapPoint;
  angle: number;
  /** Travessia calculada pela parede do mapa; nula se não há parede à frente ou ela é grossa demais. */
  crossing: WallCrossing | null;
  /** Onde o efeito começa, do outro lado da parede. */
  exit: MapPoint;
  /** Área afetada: cilindro da explosão no chão ou ponto do clarão. */
  area: MapPoint[];
  flashPoint: MapPoint | null;
}

/**
 * Carga do Breach: presa na parede, atravessa e o efeito sai do outro lado. Estratégias antigas, em
 * que a habilidade era um círculo no chão, caem na parede mais próxima em vez de virar uma bola solta.
 */
export function wallBurstShape(utility: Utility, definition: AbilityDefinition, mask: FloorMask | null, frame: MapFrame): WallBurstShape | null {
  const render = definition.render;
  if (render.kind !== 'wall-burst') return null;
  let anchor: MapPoint;
  let angle: number;
  if (utility.shape.type === 'marker') {
    anchor = utility.shape.point;
    angle = utility.shape.facing ?? 0;
  } else if (utility.shape.type === 'circle') {
    const wall = mask ? nearestWallAnchor(utility.shape.center, mask, frame, 6) : null;
    anchor = wall?.point ?? utility.shape.center;
    angle = wall ? wall.normal + Math.PI : 0;
  } else {
    return null;
  }
  const crossing = mask ? throughWall(anchor, angle, mask, frame, render.maxDepthM) : null;
  const exit = crossing?.exit ?? pointAhead(anchor, angle, 0.6, frame);
  if (render.effect === 'blast') {
    return { anchor, angle, crossing, exit, area: stripCorners(exit, angle, render.lengthM, render.radiusM * 2, frame), flashPoint: null };
  }
  return { anchor, angle, crossing, exit, area: [], flashPoint: pointAhead(exit, angle, render.lengthM, frame) };
}

/** Pontas do fio, calculadas pelas paredes do mapa. Sem mapa, usa o comprimento máximo. */
export function linkWireEnds(utility: Utility, definition: AbilityDefinition, mask: FloorMask | null, frame: MapFrame): { ends: [MapPoint, MapPoint]; anchored: boolean } | null {
  if (utility.shape.type !== 'wall' || definition.render.kind !== 'link-wire') return null;
  const { center, facing } = utility.shape;
  const maxLengthM = definition.render.maxLengthM;
  if (!mask) return { ends: wallEndpoints(center, facing, maxLengthM, frame), anchored: false };
  return linkEndpoints(center, facing, mask, frame, maxLengthM);
}

/** Pontos de um círculo em coordenadas de mapa. */
export function circlePoints(center: MapPoint, radiusM: number, frame: MapFrame, sides = 48): MapPoint[] {
  const radius = metersToMapUnits(radiusM, frame);
  return Array.from({ length: sides + 1 }, (_, i) => {
    const angle = (i / sides) * Math.PI * 2;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
}
