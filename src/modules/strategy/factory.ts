// Criação de entidades e edições puras do documento.
import { classifyAbility, defaultRadius, defaultTravelMs, VISUAL_DEFAULTS } from '../abilities/taxonomy';
import { metersToMapUnits, type MapFrame, type MapPoint } from '../coordinates';
import { compileRoute } from '../timeline/simulate';
import {
  SCHEMA_VERSION,
  type AgentToken,
  type Drawing,
  type Route,
  type StrategyDoc,
  type Team,
  type Utility,
  type UtilityShape,
  type Waypoint,
} from './schema';

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createStrategy(options: { name: string; mapId: string; side: Team; folderId?: string | null }): StrategyDoc {
  const now = Date.now();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    name: options.name,
    mapId: options.mapId,
    side: options.side,
    folderId: options.folderId ?? null,
    createdAt: now,
    updatedAt: now,
    durationMs: 30000,
    agents: {},
    utilities: {},
    drawings: {},
    notes: {},
  };
}

/** Velocidade inicial da rota: ponto de partida editável, não um dado do jogo. */
export const DEFAULT_SPEED_MPS = 5;

export function createAgentToken(agentUuid: string, team: Team, position: MapPoint): AgentToken {
  return { id: newId(), agentUuid, team, position, facing: team === 'attack' ? Math.PI : 0, route: null };
}

export function createWaypoint(point: MapPoint, overrides: Partial<Waypoint> = {}): Waypoint {
  return { id: newId(), point, pauseMs: 0, facing: null, speedMps: null, arriveAtMs: null, ...overrides };
}

export function appendWaypoint(agent: AgentToken, point: MapPoint, startMs: number): AgentToken {
  const route: Route = agent.route ?? { startMs, speedMps: DEFAULT_SPEED_MPS, waypoints: [] };
  return { ...agent, route: { ...route, waypoints: [...route.waypoints, createWaypoint(point)] } };
}

export function updateWaypoint(agent: AgentToken, waypointId: string, patch: Partial<Waypoint>): AgentToken {
  if (!agent.route) return agent;
  return {
    ...agent,
    route: {
      ...agent.route,
      waypoints: agent.route.waypoints.map((w) => (w.id === waypointId ? { ...w, ...patch } : w)),
    },
  };
}

export function removeWaypoint(agent: AgentToken, waypointId: string): AgentToken {
  if (!agent.route) return agent;
  const waypoints = agent.route.waypoints.filter((w) => w.id !== waypointId);
  return { ...agent, route: waypoints.length ? { ...agent.route, waypoints } : null };
}

/** Desloca o início da rota no tempo, levando junto os keyframes para manter a sincronia interna. */
export function shiftRoute(agent: AgentToken, startMs: number): AgentToken {
  if (!agent.route) return agent;
  const start = Math.max(0, startMs);
  const delta = start - agent.route.startMs;
  return {
    ...agent,
    route: {
      ...agent.route,
      startMs: start,
      waypoints: agent.route.waypoints.map((w) =>
        w.arriveAtMs === null ? w : { ...w, arriveAtMs: Math.max(0, w.arriveAtMs + delta) },
      ),
    },
  };
}

const KEYFRAME_TOLERANCE_MS = 60;

/**
 * Move um agente no instante atual. Em t = 0 muda a posição inicial; depois disso grava ou
 * atualiza um keyframe, para o agente chegar naquele ponto naquele instante.
 */
export function placeAgentAt(agent: AgentToken, point: MapPoint, timeMs: number, frame: MapFrame): AgentToken {
  if (timeMs <= 0) return { ...agent, position: point };
  const route: Route = agent.route ?? { startMs: 0, speedMps: DEFAULT_SPEED_MPS, waypoints: [] };
  const arrivals = agent.route ? compileRoute(agent, frame).arrivals : {};
  const existing = route.waypoints.find((w) => Math.abs((arrivals[w.id] ?? -1e9) - timeMs) <= KEYFRAME_TOLERANCE_MS);
  if (existing) return updateWaypoint(agent, existing.id, { point });
  const insertAt = route.waypoints.findIndex((w) => (arrivals[w.id] ?? Infinity) > timeMs);
  const keyframe = createWaypoint(point, { arriveAtMs: timeMs });
  const waypoints = [...route.waypoints];
  waypoints.splice(insertAt === -1 ? waypoints.length : insertAt, 0, keyframe);
  return { ...agent, route: { ...route, waypoints } };
}

/** Define a direção. Depois do início, aplica ao último ponto alcançado da rota. */
export function faceAgentAt(agent: AgentToken, facing: number, timeMs: number, frame: MapFrame): AgentToken {
  if (timeMs <= 0 || !agent.route) return { ...agent, facing };
  const arrivals = compileRoute(agent, frame).arrivals;
  const reached = [...agent.route.waypoints].reverse().find((w) => (arrivals[w.id] ?? Infinity) <= timeMs);
  return reached ? updateWaypoint(agent, reached.id, { facing }) : { ...agent, facing };
}

export function createUtility(options: {
  agentUuid: string;
  slot: string;
  ownerTokenId: string | null;
  timeMs: number;
  shape: UtilityShape;
}): Utility {
  const { category } = classifyAbility(options.agentUuid, options.slot);
  return {
    id: newId(),
    agentUuid: options.agentUuid,
    abilitySlot: options.slot,
    ownerTokenId: options.ownerTokenId,
    category,
    timeMs: Math.max(0, options.timeMs),
    durationMs: null,
    travelMs: options.shape.type === 'path' ? defaultTravelMs(category) : 0,
    note: '',
    shape: options.shape,
  };
}

/** Forma inicial quando o usuário só clica, sem arrastar. */
export function defaultShapeFor(kind: UtilityShape['type'], category: Utility['category'], point: MapPoint, frame: MapFrame): UtilityShape {
  switch (kind) {
    case 'circle':
      return { type: 'circle', center: point, radiusM: defaultRadius(category) };
    case 'wall': {
      const half = metersToMapUnits(VISUAL_DEFAULTS.wallLengthM / 2, frame);
      return {
        type: 'wall',
        points: [{ x: point.x - half, y: point.y }, { x: point.x + half, y: point.y }],
        thicknessM: VISUAL_DEFAULTS.wallThicknessM,
      };
    }
    case 'path': {
      const step = metersToMapUnits(6, frame);
      return { type: 'path', points: [point, { x: point.x + step, y: point.y }], curved: false };
    }
    case 'marker':
      return { type: 'marker', point, facing: null };
  }
}

const shiftPoint = (p: MapPoint, dx: number, dy: number): MapPoint => ({ x: p.x + dx, y: p.y + dy });

export function translateUtility(utility: Utility, dx: number, dy: number): Utility {
  const shape = utility.shape;
  switch (shape.type) {
    case 'circle':
      return { ...utility, shape: { ...shape, center: shiftPoint(shape.center, dx, dy) } };
    case 'marker':
      return { ...utility, shape: { ...shape, point: shiftPoint(shape.point, dx, dy) } };
    default:
      return { ...utility, shape: { ...shape, points: shape.points.map((p) => shiftPoint(p, dx, dy)) } };
  }
}

export function translateDrawing(drawing: Drawing, dx: number, dy: number): Drawing {
  switch (drawing.type) {
    case 'line':
      return { ...drawing, points: drawing.points.map((p) => shiftPoint(p, dx, dy)) };
    case 'area':
      return { ...drawing, center: shiftPoint(drawing.center, dx, dy) };
    default:
      return { ...drawing, point: shiftPoint(drawing.point, dx, dy) };
  }
}

export function translateAgent(agent: AgentToken, dx: number, dy: number): AgentToken {
  return {
    ...agent,
    position: shiftPoint(agent.position, dx, dy),
    route: agent.route
      ? {
          ...agent.route,
          waypoints: agent.route.waypoints.map((w) => ({ ...w, point: shiftPoint(w.point, dx, dy) })),
        }
      : null,
  };
}

export const entityAnchor = (entity: AgentToken | Utility | Drawing): MapPoint => {
  if ('position' in entity) return entity.position;
  if ('shape' in entity) {
    const shape = entity.shape;
    if (shape.type === 'circle') return shape.center;
    if (shape.type === 'marker') return shape.point;
    return shape.points[0]!;
  }
  if (entity.type === 'line') return entity.points[0]!;
  if (entity.type === 'area') return entity.center;
  return entity.point;
};
