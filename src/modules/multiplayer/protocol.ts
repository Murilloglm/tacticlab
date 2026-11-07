// Contrato das mensagens da sala e resolução de conflitos.
//
// Cada objeto é uma chave (`agents:<id>`, `meta:name`). Vence a escrita com o maior carimbo
// (relógio de Lamport, depois id do cliente), então todos convergem para o mesmo estado
// independentemente da ordem de chegada. Excluir grava `null`, preservando o carimbo.
import { z } from 'zod';
import type { Change, ChangeInput } from '../strategy/docStore';
import {
  agentTokenSchema,
  drawingSchema,
  noteSchema,
  utilitySchema,
  type CollectionName,
  type Entity,
  type MetaKey,
  type StrategyDoc,
} from '../strategy/schema';

export interface Stamp {
  l: number;
  c: string;
}

export const ZERO_STAMP: Stamp = { l: 0, c: '' };

export function isNewer(a: Stamp, b: Stamp): boolean {
  return a.l > b.l || (a.l === b.l && a.c > b.c);
}

const stampSchema = z.object({ l: z.number().int().min(0), c: z.string().max(64) });
export const stampsSchema = z.record(z.string(), stampSchema);

export interface WireOp {
  /** Chave do objeto. */
  k: string;
  /** Novo valor; `null` exclui. */
  v: unknown;
  s: Stamp;
}

const wireOpSchema = z.object({ k: z.string().max(100), v: z.unknown(), s: stampSchema });

export const roomMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('ops'), from: z.string(), ops: z.array(wireOpSchema).max(500) }),
  z.object({ t: z.literal('sync-request'), from: z.string() }),
  z.object({ t: z.literal('sync-state'), from: z.string(), to: z.string().nullable(), doc: z.unknown(), stamps: stampsSchema }),
  z.object({ t: z.literal('cursor'), from: z.string(), x: z.number().finite(), y: z.number().finite() }),
  z.object({ t: z.literal('roles'), from: z.string(), roles: z.record(z.string(), z.enum(['admin', 'editor', 'viewer'])) }),
]);

export type RoomMessage = z.infer<typeof roomMessageSchema>;

const META_SCHEMAS: Partial<Record<MetaKey, z.ZodType>> = {
  name: z.string().min(1).max(120),
  side: z.enum(['attack', 'defense']),
  durationMs: z.number().finite().min(1000).max(600000),
};

const ENTITY_SCHEMAS: Record<CollectionName, z.ZodType> = {
  agents: agentTokenSchema,
  utilities: utilitySchema,
  drawings: drawingSchema,
  notes: noteSchema,
};

export const changeKey = (change: Change | ChangeInput): string =>
  change.c === 'meta' ? `meta:${change.key}` : `${change.c}:${change.id}`;

/**
 * Converte uma operação recebida em alteração local, validando o conteúdo.
 * Retorna nulo para dados inválidos: um participante com defeito não corrompe a sala.
 * `folderId` nunca trafega porque pastas são pessoais.
 */
export function opToChange(op: WireOp): ChangeInput | null {
  const separator = op.k.indexOf(':');
  if (separator <= 0) return null;
  const scope = op.k.slice(0, separator);
  const id = op.k.slice(separator + 1);
  if (scope === 'meta') {
    const schema = META_SCHEMAS[id as MetaKey];
    if (!schema) return null;
    const parsed = schema.safeParse(op.v);
    return parsed.success ? { c: 'meta', key: id as MetaKey, after: parsed.data } : null;
  }
  const schema = ENTITY_SCHEMAS[scope as CollectionName];
  if (!schema || !id) return null;
  if (op.v === null) return { c: scope as CollectionName, id, after: null };
  const parsed = schema.safeParse(op.v);
  if (!parsed.success) return null;
  if ((parsed.data as Entity).id !== id) return null;
  return { c: scope as CollectionName, id, after: parsed.data as Entity };
}

/** Valor atual de uma chave no documento. */
export function readKey(doc: StrategyDoc, key: string): unknown {
  const separator = key.indexOf(':');
  const scope = key.slice(0, separator);
  const id = key.slice(separator + 1);
  if (scope === 'meta') return (doc as unknown as Record<string, unknown>)[id] ?? null;
  return (doc[scope as CollectionName] as Record<string, unknown> | undefined)?.[id] ?? null;
}

/** Todas as chaves de objetos existentes no documento. */
export function documentKeys(doc: StrategyDoc): string[] {
  const keys = ['meta:name', 'meta:side', 'meta:durationMs'];
  for (const c of ['agents', 'utilities', 'drawings', 'notes'] as const) {
    for (const id of Object.keys(doc[c])) keys.push(`${c}:${id}`);
  }
  return keys;
}

/**
 * Funde o estado recebido com o local, chave a chave, e devolve as alterações a aplicar.
 * O que mudou offline e tem carimbo mais novo sobrevive à reconexão.
 */
export function mergeRemoteState(
  local: StrategyDoc,
  localStamps: Record<string, Stamp>,
  remote: StrategyDoc,
  remoteStamps: Record<string, Stamp>,
): { changes: ChangeInput[]; stamps: Record<string, Stamp> } {
  const changes: ChangeInput[] = [];
  const stamps = { ...localStamps };
  const keys = new Set([...documentKeys(remote), ...documentKeys(local), ...Object.keys(remoteStamps)]);
  for (const key of keys) {
    const remoteStamp = remoteStamps[key] ?? ZERO_STAMP;
    const localStamp = localStamps[key] ?? ZERO_STAMP;
    const remoteValue = readKey(remote, key);
    const localValue = readKey(local, key);
    // Sem carimbo dos dois lados, é conteúdo do documento inicial: quem está na sala prevalece.
    const remoteWins = isNewer(remoteStamp, localStamp) || (remoteStamp.l === 0 && localStamp.l === 0);
    if (!remoteWins) continue;
    if (remoteStamp.l > 0) stamps[key] = remoteStamp;
    if (JSON.stringify(remoteValue) === JSON.stringify(localValue)) continue;
    const change = opToChange({ k: key, v: remoteValue, s: remoteStamp });
    if (change) changes.push(change);
  }
  return { changes, stamps };
}
