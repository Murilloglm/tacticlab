// Ancoragem das habilidades na geometria do mapa: parede mais próxima, travessia da parede e fio entre
// duas paredes. Usa a máscara de piso do mapa (parede = célula sem piso). Funções puras e testáveis.
import { metersToMapUnits, type MapFrame, type MapPoint } from '../coordinates';

export interface FloorMask {
  size: number;
  isFloorCell(gx: number, gy: number): boolean;
}

export interface WallAnchor {
  /** Ponto na face da parede, do lado do piso. */
  point: MapPoint;
  /** Direção (em radianos) que sai da parede para o piso. */
  normal: number;
  /** Distância do clique até a parede, em metros. */
  distanceM: number;
}

export interface WallCrossing {
  entry: MapPoint;
  exit: MapPoint;
  depthM: number;
}

const STEP_M = 0.2;
const DIRECTIONS = 48;

const isFloor = (mask: FloorMask, p: MapPoint) => mask.isFloorCell(Math.floor(p.x * mask.size), Math.floor(p.y * mask.size));
const move = (p: MapPoint, angle: number, meters: number, frame: MapFrame): MapPoint => ({
  x: p.x + Math.cos(angle) * metersToMapUnits(meters, frame),
  y: p.y + Math.sin(angle) * metersToMapUnits(meters, frame),
});

/**
 * Parede mais próxima de um ponto, até `maxM` metros. Se o ponto já está dentro da parede, devolve a
 * face mais próxima. Nulo quando não há parede perto: a habilidade não pode ficar solta no chão.
 */
export function nearestWallAnchor(point: MapPoint, mask: FloorMask, frame: MapFrame, maxM = 3): WallAnchor | null {
  const startsOnFloor = isFloor(mask, point);
  let best: WallAnchor | null = null;
  for (let k = 0; k < DIRECTIONS; k++) {
    const angle = (k / DIRECTIONS) * Math.PI * 2;
    for (let d = STEP_M; d <= maxM + 1e-9; d += STEP_M) {
      const sample = move(point, angle, d, frame);
      if (isFloor(mask, sample) === startsOnFloor) continue;
      // Do piso, a face fica um passo antes da parede; de dentro da parede, no primeiro ponto de piso.
      const face = startsOnFloor ? move(point, angle, d - STEP_M / 2, frame) : sample;
      const normal = startsOnFloor ? angle + Math.PI : angle;
      if (!best || d < best.distanceM) best = { point: face, normal: Math.atan2(Math.sin(normal), Math.cos(normal)), distanceM: d };
      break;
    }
  }
  return best;
}

/**
 * Travessia de parede: a partir do ponto, na direção indicada, entra na parede em até `approachM`
 * metros e sai do outro lado em até `maxDepthM`. Nulo se não houver parede à frente ou se for grossa demais.
 */
export function throughWall(from: MapPoint, angle: number, mask: FloorMask, frame: MapFrame, maxDepthM = 10, approachM = 1.5): WallCrossing | null {
  let entry: MapPoint | null = null;
  let entered = 0;
  for (let d = STEP_M; d <= approachM + maxDepthM + 1e-9; d += STEP_M) {
    const sample = move(from, angle, d, frame);
    const floor = isFloor(mask, sample);
    if (!entry) {
      if (!floor) {
        entry = sample;
        entered = d;
      } else if (d > approachM) {
        return null;
      }
      continue;
    }
    if (floor) return { entry, exit: sample, depthM: d - entered };
    if (d - entered > maxDepthM) return null;
  }
  return null;
}

/**
 * Fio entre duas paredes: anda nos dois sentidos a partir do centro até encontrar parede. Se a
 * passagem for mais larga que o fio, ele fica com o comprimento máximo, centrado.
 */
export function linkEndpoints(center: MapPoint, angle: number, mask: FloorMask, frame: MapFrame, maxLengthM: number): { ends: [MapPoint, MapPoint]; anchored: boolean } {
  const reach = (direction: number) => {
    for (let d = STEP_M; d <= maxLengthM + 1e-9; d += STEP_M) {
      if (!isFloor(mask, move(center, direction, d, frame))) return d - STEP_M / 2;
    }
    return null;
  };
  const half = maxLengthM / 2;
  // Centro dentro de uma parede: não há passagem para o fio atravessar.
  if (!isFloor(mask, center)) return { ends: [move(center, angle + Math.PI, half, frame), move(center, angle, half, frame)], anchored: false };
  const forward = reach(angle);
  const backward = reach(angle + Math.PI);
  if (forward !== null && backward !== null && forward + backward <= maxLengthM) {
    return { ends: [move(center, angle + Math.PI, backward, frame), move(center, angle, forward, frame)], anchored: true };
  }
  return { ends: [move(center, angle + Math.PI, half, frame), move(center, angle, half, frame)], anchored: false };
}

/** Ponto a `meters` metros na direção, a partir de um ponto de mapa. */
export const pointAhead = move;
