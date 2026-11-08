// Comportamento das habilidades na timeline: função pura de (instância, definição, tempo, mapa).
import { headingBetween, pointAlongPolyline, polylineLength, smoothPolyline, type MapFrame, type MapPoint } from '../coordinates';
import type { Utility } from '../strategy/schema';
import { utilityDefinition } from './definitions';

export interface UtilityState {
  started: boolean;
  active: boolean;
  /** Avanço [0, 1] do percurso. */
  progress: number;
  /** Tempo desde o início. Zero antes de começar. */
  elapsedMs: number;
  /** Tempo de percurso desta instância, que depende do comprimento da trajetória. */
  travelMs: number;
}

export function utilityPathPoints(utility: Utility): MapPoint[] | null {
  if (utility.shape.type !== 'path') return null;
  return utility.shape.curved ? smoothPolyline(utility.shape.points) : utility.shape.points;
}

/**
 * Tempo de percurso. Com velocidade calibrada, é o comprimento da trajetória dividido por ela, até o
 * teto da habilidade. Sem velocidade, é o percurso fixo do preset.
 */
export function utilityTravelMs(utility: Utility, frame: MapFrame): number {
  if (utility.shape.type !== 'path') return 0;
  const { trajectory, timing } = utilityDefinition(utility);
  if (!trajectory.speedMps) return timing.travelMs;
  const meters = polylineLength(utilityPathPoints(utility) ?? []) * frame.worldMeters;
  const travel = (meters / trajectory.speedMps) * 1000;
  return Math.round(trajectory.maxTravelMs === null ? travel : Math.min(travel, trajectory.maxTravelMs));
}

/** Tempo visível. Nulo: até o fim da estratégia. */
export function utilityVisibleMs(utility: Utility, frame: MapFrame): number | null {
  const { timing } = utilityDefinition(utility);
  const travel = utilityTravelMs(utility, frame);
  if (timing.afterArrivalMs !== null) return travel + timing.afterArrivalMs;
  return timing.durationMs === null ? null : Math.max(timing.durationMs, travel);
}

export function utilityStateAt(utility: Utility, tMs: number, frame: MapFrame): UtilityState {
  const travelMs = utilityTravelMs(utility, frame);
  if (tMs < utility.timeMs) return { started: false, active: false, progress: 0, elapsedMs: 0, travelMs };
  const elapsedMs = tMs - utility.timeMs;
  const visible = utilityVisibleMs(utility, frame);
  const active = visible === null || elapsedMs <= visible;
  const progress = travelMs <= 0 ? 1 : Math.min(1, elapsedMs / travelMs);
  return { started: true, active, progress, elapsedMs, travelMs };
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
export function utilityTravelEndMs(utility: Utility, frame: MapFrame): number {
  return utility.timeMs + utilityTravelMs(utility, frame);
}

/** Fim da faixa na timeline. Nulo: vai até o fim da estratégia. */
export function utilityBarEndMs(utility: Utility, frame: MapFrame): number | null {
  const visible = utilityVisibleMs(utility, frame);
  return visible === null ? null : utility.timeMs + visible;
}

/** Tempo de cada pulso já disparado (sonar), em ms depois da chegada. */
export function pulsePhase(elapsedAfterArrivalMs: number, pulses: { count: number; intervalMs: number }, durationMs = 600): number | null {
  if (elapsedAfterArrivalMs < 0) return null;
  const index = Math.floor(elapsedAfterArrivalMs / pulses.intervalMs);
  if (index >= pulses.count) return null;
  const within = elapsedAfterArrivalMs - index * pulses.intervalMs;
  return within <= durationMs ? within / durationMs : null;
}
