// Cliente da Valorant-API (https://valorant-api.com), serviço comunitário não oficial.
import { z } from 'zod';
import { agentInfoSchema, mapInfoSchema, type RawAgent, type RawMap } from '../catalog/types';

const BASE = 'https://valorant-api.com/v1';
const TIMEOUT_MS = 12000;

async function getData<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE}${path}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`a API respondeu ${response.status}`);
    const parsed = z.object({ data: schema }).safeParse(await response.json());
    if (!parsed.success) throw new Error('a API devolveu um formato inesperado');
    return parsed.data.data;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('a API demorou demais para responder', { cause: error });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export interface LiveCatalog {
  maps: RawMap[];
  agents: RawAgent[];
  gameVersion: string | null;
}

export async function fetchLiveCatalog(): Promise<LiveCatalog> {
  const [maps, agents, version] = await Promise.all([
    getData('/maps?language=pt-BR', z.array(mapInfoSchema)),
    getData('/agents?isPlayableCharacter=true&language=pt-BR', z.array(agentInfoSchema)),
    getData('/version', z.object({ version: z.string() })).catch(() => null),
  ]);
  return { maps, agents, gameVersion: version?.version ?? null };
}
