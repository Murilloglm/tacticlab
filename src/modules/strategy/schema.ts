// Modelo de dados único: o que 2D, 3D, timeline, persistência e salas enxergam.
// Todo JSON externo (importação, link, sala, banco) passa por estes esquemas antes de entrar no app.
import { z } from 'zod';

export const SCHEMA_VERSION = 2;
export const MAX_AGENTS_PER_TEAM = 5;

const finite = z.number().finite();
const nonNegative = finite.min(0);
const id = z.string().min(1).max(64);

export const pointSchema = z.object({ x: finite, y: finite });
export const teamSchema = z.enum(['attack', 'defense']);
export const sideSchema = teamSchema;

export const waypointSchema = z.object({
  id,
  point: pointSchema,
  /** Pausa depois de chegar, em ms. */
  pauseMs: nonNegative,
  /** Direção assumida ao chegar. Nulo mantém a direção do movimento. */
  facing: finite.nullable(),
  /** Velocidade deste trecho. Nulo usa a velocidade da rota. */
  speedMps: finite.positive().nullable(),
  /** Keyframe: instante fixo de chegada. Nulo calcula pela velocidade. */
  arriveAtMs: nonNegative.nullable(),
});

export const routeSchema = z.object({
  startMs: nonNegative,
  speedMps: finite.positive(),
  waypoints: z.array(waypointSchema).max(200),
});

export const agentTokenSchema = z.object({
  id,
  agentUuid: z.string().min(1),
  team: teamSchema,
  position: pointSchema,
  facing: finite,
  route: routeSchema.nullable(),
});

export const abilityCategorySchema = z.enum([
  'smoke',
  'flash',
  'molotov',
  'wall',
  'recon',
  'trap',
  'teleport',
  'dash',
  'projectile',
  'area',
  'ultimate',
  'other',
]);

// A instância guarda só o que o usuário decide: posição, direção, trajetória e instante.
// Tamanho, duração e aparência vêm da definição canônica da habilidade.
export const utilityShapeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('circle'), center: pointSchema }),
  z.object({ type: z.literal('wall'), center: pointSchema, facing: finite }),
  z.object({ type: z.literal('path'), points: z.array(pointSchema).min(2).max(64), curved: z.boolean() }),
  z.object({ type: z.literal('marker'), point: pointSchema, facing: finite.nullable() }),
]);

/**
 * Até a versão 1, cada habilidade guardava tamanho e tempos próprios, e a parede era uma polilinha.
 * Vale em todas as entradas (arquivo, link, banco, histórico e operações de sala).
 */
function migrateLegacyUtility(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return input;
  const legacy = input as { shape?: { type?: unknown; points?: unknown } };
  const shape = legacy.shape;
  if (shape?.type !== 'wall' || !Array.isArray(shape.points) || shape.points.length < 2) return input;
  const first = shape.points[0] as { x?: unknown; y?: unknown };
  const last = shape.points[shape.points.length - 1] as { x?: unknown; y?: unknown };
  if (typeof first?.x !== 'number' || typeof first.y !== 'number' || typeof last?.x !== 'number' || typeof last.y !== 'number') return input;
  return {
    ...input,
    shape: {
      type: 'wall',
      center: { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 },
      facing: Math.atan2(last.y - first.y, last.x - first.x),
    },
  };
}

export const utilitySchema = z.preprocess(
  migrateLegacyUtility,
  z.object({
    id,
    agentUuid: z.string().min(1),
    abilitySlot: z.string().min(1).max(32),
    ownerTokenId: id.nullable(),
    /** Instante em que aparece na simulação. */
    timeMs: nonNegative,
    note: z.string().max(280),
    shape: utilityShapeSchema,
  }),
);

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const drawingSchema = z.discriminatedUnion('type', [
  z.object({
    id,
    type: z.literal('line'),
    points: z.array(pointSchema).min(2).max(2000),
    color: colorSchema,
    width: finite.positive(),
    arrow: z.boolean(),
    dashed: z.boolean(),
  }),
  z.object({ id, type: z.literal('marker'), point: pointSchema, color: colorSchema, label: z.string().max(60) }),
  z.object({ id, type: z.literal('text'), point: pointSchema, color: colorSchema, text: z.string().max(280), size: finite.positive() }),
  z.object({ id, type: z.literal('area'), center: pointSchema, radiusM: finite.positive(), color: colorSchema }),
]);

export const noteSchema = z.object({ id, timeMs: nonNegative, text: z.string().max(280) });

export const strategyDocSchema = z.object({
  // A versão 1 é convertida pelos esquemas das entidades e sai salva como a atual.
  schemaVersion: z.union([z.literal(1), z.literal(SCHEMA_VERSION)]).transform((): typeof SCHEMA_VERSION => SCHEMA_VERSION),
  id,
  name: z.string().min(1).max(120),
  mapId: z.string().min(1),
  side: sideSchema,
  folderId: z.string().nullable(),
  createdAt: nonNegative,
  updatedAt: nonNegative,
  durationMs: finite.min(1000).max(600000),
  agents: z.record(z.string(), agentTokenSchema),
  utilities: z.record(z.string(), utilitySchema),
  drawings: z.record(z.string(), drawingSchema),
  notes: z.record(z.string(), noteSchema),
});

export type Team = z.infer<typeof teamSchema>;
export type Waypoint = z.infer<typeof waypointSchema>;
export type Route = z.infer<typeof routeSchema>;
export type AgentToken = z.infer<typeof agentTokenSchema>;
export type AbilityCategory = z.infer<typeof abilityCategorySchema>;
export type UtilityShape = z.infer<typeof utilityShapeSchema>;
export type Utility = z.infer<typeof utilitySchema>;
export type Drawing = z.infer<typeof drawingSchema>;
export type TimelineNote = z.infer<typeof noteSchema>;
export type StrategyDoc = z.infer<typeof strategyDocSchema>;

export type CollectionName = 'agents' | 'utilities' | 'drawings' | 'notes';
export type Entity = AgentToken | Utility | Drawing | TimelineNote;
export type MetaKey = 'name' | 'side' | 'durationMs' | 'folderId';

export interface EntityRef {
  c: CollectionName;
  id: string;
}

export const COLLECTIONS: CollectionName[] = ['agents', 'utilities', 'drawings', 'notes'];

export interface ParseFailure {
  ok: false;
  error: string;
}

export function formatZodError(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) return 'Formato inválido.';
  return `Campo "${first.path.join('.') || 'raiz'}": ${first.message}`;
}

/** Valida um documento externo, incluindo os limites do jogo que o esquema não expressa. */
export function parseStrategy(input: unknown): { ok: true; doc: StrategyDoc } | ParseFailure {
  const parsed = strategyDocSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };
  const counts = { attack: 0, defense: 0 };
  for (const agent of Object.values(parsed.data.agents)) counts[agent.team]++;
  if (counts.attack > MAX_AGENTS_PER_TEAM || counts.defense > MAX_AGENTS_PER_TEAM) {
    return { ok: false, error: `Cada equipe aceita no máximo ${MAX_AGENTS_PER_TEAM} agentes.` };
  }
  return { ok: true, doc: parsed.data };
}
