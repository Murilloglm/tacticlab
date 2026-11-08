// Formas derivadas da definição, usadas pelo 2D e pelo 3D para os dois mostrarem o mesmo desenho.
import { metersToMapUnits, type MapFrame, type MapPoint } from '../coordinates';
import { wallEndpoints } from '../strategy/factory';
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

/** Pontos de um círculo em coordenadas de mapa. */
export function circlePoints(center: MapPoint, radiusM: number, frame: MapFrame, sides = 48): MapPoint[] {
  const radius = metersToMapUnits(radiusM, frame);
  return Array.from({ length: sides + 1 }, (_, i) => {
    const angle = (i / sides) * Math.PI * 2;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
}
