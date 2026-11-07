// Comportamento das habilidades na timeline: função pura de (instância, definição, tempo).
import { headingBetween, pointAlongPolyline, smoothPolyline, type MapPoint } from '../coordinates';
import type { Utility } from '../strategy/schema';
import { utilityDefinition } from './definitions';

export interface UtilityState {
  started: boolean;
  active: boolean;
  /** Avanço [0, 1] do percurso. */
  progress: number;
  /** Tempo desde o início. Zero antes de começar. */
  elapsedMs: number;
}

export function utilityStateAt(utility: Utility, tMs: number): UtilityState {
  if (tMs < utility.timeMs) return { started: false, active: false, progress: 0, elapsedMs: 0 };
  const { durationMs, travelMs } = utilityDefinition(utility).timing;
  const elapsedMs = tMs - utility.timeMs;
  const active = durationMs === null || elapsedMs <= Math.max(durationMs, travelMs);
  const progress = travelMs <= 0 ? 1 : Math.min(1, elapsedMs / travelMs);
  return { started: true, active, progress, elapsedMs };
}

export function utilityPathPoints(utility: Utility): MapPoint[] | null {
  if (utility.shape.type !== 'path') return null;
  return utility.shape.curved ? smoothPolyline(utility.shape.points) : utility.shape.points;
}

/** Ponto onde a utilidade está em um percurso (projétil, drone, dash). */
export function utilityPathPoint(utility: Utility, progress: number): MapPoint | null {
  const points = utilityPathPoints(utility);
  return points ? pointAlongPolyline(points, progress) : null;
}

/** Direção do movimento no ponto indicado do percurso. */
export function utilityPathHeading(utility: Utility, progress: number): number {
  const points = utilityPathPoints(utility);
  if (!points || points.length < 2) return 0;
  const step = 0.02;
  const a = pointAlongPolyline(points, Math.max(0, progress - step));
  const b = pointAlongPolyline(points, Math.min(1, progress + step));
  return headingBetween(a, b);
}

/** Fim do percurso: o tempo em que a habilidade fica visível não estende a timeline sozinho. */
export function utilityTravelEndMs(utility: Utility): number {
  return utility.timeMs + (utility.shape.type === 'path' ? utilityDefinition(utility).timing.travelMs : 0);
}

/** Fim da faixa na timeline. Nulo: vai até o fim da estratégia. */
export function utilityBarEndMs(utility: Utility): number | null {
  const { durationMs, travelMs } = utilityDefinition(utility).timing;
  return durationMs === null ? null : utility.timeMs + Math.max(durationMs, travelMs);
}
