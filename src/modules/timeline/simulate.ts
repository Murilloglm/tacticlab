// Simulação determinística: o estado em qualquer instante é função pura de (documento, tempo).
// Não há integração passo a passo, então avançar, retroceder ou pular dá sempre o mesmo resultado.
import {
  distanceMeters,
  headingBetween,
  lerpAngle,
  lerpPoint,
  pointAlongPolyline,
  smoothPolyline,
  type MapFrame,
  type MapPoint,
} from '../coordinates';
import type { AgentToken, StrategyDoc, Utility } from '../strategy/schema';

const TURN_MS = 180;

export interface RouteSegment {
  kind: 'move' | 'hold';
  t0: number;
  t1: number;
  from: MapPoint;
  to: MapPoint;
  waypointId: string;
  /** Direção durante o trecho (movimento) ou assumida na chegada (pausa). */
  heading: number;
}

export interface CompiledRoute {
  segments: RouteSegment[];
  startMs: number;
  endMs: number;
  /** Chaves de direção ordenadas no tempo, interpoladas pelo menor arco. */
  facingKeys: Array<{ t: number; facing: number }>;
  /** Instante de chegada em cada waypoint. */
  arrivals: Record<string, number>;
}

export interface AgentPose {
  point: MapPoint;
  facing: number;
  moving: boolean;
}

export interface UtilityState {
  started: boolean;
  active: boolean;
  /** Avanço [0, 1] do percurso. */
  progress: number;
}

const routeCache = new WeakMap<AgentToken, { worldMeters: number; compiled: CompiledRoute }>();

export function compileRoute(agent: AgentToken, frame: MapFrame): CompiledRoute {
  const cached = routeCache.get(agent);
  if (cached && cached.worldMeters === frame.worldMeters) return cached.compiled;

  const segments: RouteSegment[] = [];
  const facingKeys: CompiledRoute['facingKeys'] = [{ t: 0, facing: agent.facing }];
  const arrivals: Record<string, number> = {};
  const route = agent.route;
  let t = route?.startMs ?? 0;
  const startMs = t;
  let position = agent.position;
  let facing = agent.facing;

  const pushFacing = (time: number, value: number) => {
    const last = facingKeys[facingKeys.length - 1]!;
    if (time < last.t) return;
    if (time === last.t) last.facing = value;
    else facingKeys.push({ t: time, facing: value });
  };

  for (const waypoint of route?.waypoints ?? []) {
    const speed = waypoint.speedMps ?? route!.speedMps;
    const meters = distanceMeters(position, waypoint.point, frame);
    const byLock = waypoint.arriveAtMs === null ? null : Math.max(0, waypoint.arriveAtMs - t);
    const duration = byLock ?? (meters / speed) * 1000;
    const heading = meters > 1e-6 ? headingBetween(position, waypoint.point) : facing;

    if (duration > 0 || meters > 0) {
      segments.push({ kind: 'move', t0: t, t1: t + duration, from: position, to: waypoint.point, waypointId: waypoint.id, heading });
      pushFacing(t, facing);
      pushFacing(t + Math.min(TURN_MS, duration), heading);
      pushFacing(t + duration, heading);
      facing = heading;
    }
    t += duration;
    arrivals[waypoint.id] = t;
    position = waypoint.point;

    const target = waypoint.facing ?? facing;
    if (waypoint.pauseMs > 0) {
      segments.push({ kind: 'hold', t0: t, t1: t + waypoint.pauseMs, from: position, to: position, waypointId: waypoint.id, heading: target });
    }
    if (waypoint.facing !== null) {
      pushFacing(t, facing);
      pushFacing(t + Math.max(TURN_MS, Math.min(waypoint.pauseMs, TURN_MS)), target);
      facing = target;
    }
    t += waypoint.pauseMs;
  }

  const compiled: CompiledRoute = { segments, startMs, endMs: t, facingKeys, arrivals };
  routeCache.set(agent, { worldMeters: frame.worldMeters, compiled });
  return compiled;
}

function facingAt(compiled: CompiledRoute, t: number): number {
  const keys = compiled.facingKeys;
  let previous = keys[0]!;
  for (let i = 1; i < keys.length; i++) {
    const key = keys[i]!;
    if (t <= key.t) {
      const span = key.t - previous.t;
      return span <= 0 ? key.facing : lerpAngle(previous.facing, key.facing, (t - previous.t) / span);
    }
    previous = key;
  }
  return previous.facing;
}

export function agentPoseAt(agent: AgentToken, tMs: number, frame: MapFrame): AgentPose {
  if (!agent.route || agent.route.waypoints.length === 0) {
    return { point: agent.position, facing: agent.facing, moving: false };
  }
  const compiled = compileRoute(agent, frame);
  const facing = facingAt(compiled, tMs);
  if (compiled.segments.length === 0 || tMs < compiled.segments[0]!.t0) {
    return { point: agent.position, facing, moving: false };
  }
  for (const segment of compiled.segments) {
    if (tMs > segment.t1) continue;
    if (segment.kind === 'hold') return { point: segment.to, facing, moving: false };
    const span = segment.t1 - segment.t0;
    const ratio = span <= 0 ? 1 : (tMs - segment.t0) / span;
    return { point: lerpPoint(segment.from, segment.to, ratio), facing, moving: span > 0 };
  }
  return { point: compiled.segments[compiled.segments.length - 1]!.to, facing, moving: false };
}

export function utilityStateAt(utility: Utility, tMs: number): UtilityState {
  const started = tMs >= utility.timeMs;
  if (!started) return { started: false, active: false, progress: 0 };
  const elapsed = tMs - utility.timeMs;
  const active = utility.durationMs === null || elapsed <= utility.durationMs;
  const progress = utility.travelMs <= 0 ? 1 : Math.min(1, elapsed / utility.travelMs);
  return { started, active, progress };
}

export interface SimulationState {
  timeMs: number;
  agents: Record<string, AgentPose>;
  utilities: Record<string, UtilityState>;
}

export function simulate(doc: StrategyDoc, tMs: number, frame: MapFrame): SimulationState {
  const agents: Record<string, AgentPose> = {};
  for (const agent of Object.values(doc.agents)) agents[agent.id] = agentPoseAt(agent, tMs, frame);
  const utilities: Record<string, UtilityState> = {};
  for (const utility of Object.values(doc.utilities)) utilities[utility.id] = utilityStateAt(utility, tMs);
  return { timeMs: tMs, agents, utilities };
}

/** Ponto onde a utilidade está em um percurso (projétil, drone, dash). */
export function utilityPathPoint(utility: Utility, progress: number): MapPoint | null {
  if (utility.shape.type !== 'path') return null;
  const points = utility.shape.curved ? smoothPolyline(utility.shape.points) : utility.shape.points;
  return pointAlongPolyline(points, progress);
}

/** Último instante com algo acontecendo; serve para sugerir a duração da timeline. */
export function contentEndMs(doc: StrategyDoc, frame: MapFrame): number {
  let end = 0;
  for (const agent of Object.values(doc.agents)) {
    if (agent.route?.waypoints.length) end = Math.max(end, compileRoute(agent, frame).endMs);
  }
  for (const utility of Object.values(doc.utilities)) {
    end = Math.max(end, utility.timeMs + Math.max(utility.durationMs ?? 0, utility.travelMs));
  }
  for (const note of Object.values(doc.notes)) end = Math.max(end, note.timeMs);
  return end;
}

export function formatTime(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  const tenths = Math.floor((safe % 1000) / 100);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
}
