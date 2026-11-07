// Modelo de dados único: o que 2D, 3D, timeline, persistência e salas enxergam.
// Todo JSON externo (importação, link, sala, banco) passa por estes esquemas antes de entrar no app.
import { z } from 'zod';

export const SCHEMA_VERSION = 1;
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

export const utilityShapeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('circle'), center: pointSchema, radiusM: finite.positive() }),
  z.object({ type: z.literal('wall'), points: z.array(pointSchema).min(2).max(32), thicknessM: finite.positive() }),
  z.object({ type: z.literal('path'), points: z.array(pointSchema).min(2).max(64), curved: z.boolean() }),
  z.object({ type: z.literal('marker'), point: pointSchema, facing: finite.nullable() }),
]);

export const utilitySchema = z.object({
  id,
  agentUuid: z.string().min(1),
  abilitySlot: z.string().min(1).max(32),
  ownerTokenId: id.nullable(),
  category: abilityCategorySchema,
  /** Instante em que aparece na simulação. */
  timeMs: nonNegative,
  /** Tempo visível definido pelo usuário. Nulo: fica até o fim. */
  durationMs: nonNegative.nullable(),
  /** Tempo de percurso em trajetórias. */
  travelMs: nonNegative,
  note: z.string().max(280),
  shape: utilityShapeSchema,
});

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
  schemaVersion: z.literal(SCHEMA_VERSION),
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
