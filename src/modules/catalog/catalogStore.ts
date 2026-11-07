// Carrega agentes e mapas: mostra o que houver em cache de imediato e atualiza pela
// Valorant-API. Sem rede, recorre ao catálogo gerado junto com o site.
import { createStore, useStore } from 'zustand';
import { z } from 'zod';
import { fetchLiveCatalog } from '../services/valorantApi';
import { kvGet, kvSet } from '../persistence/idb';
import { agentInfoSchema, mapInfoSchema, type AgentInfo, type Catalog, type MapInfo, type RawAgent, type RawMap } from './types';

const CACHE_KEY = 'catalog:v2';
const CACHE_MAX_AGE = 1000 * 60 * 60 * 12;

const FALLBACK_METERS = 110;

export function normalizeAgent(raw: RawAgent): AgentInfo {
  const hex = raw.backgroundGradientColors?.[0]?.slice(0, 6);
  return {
    uuid: raw.uuid,
    displayName: raw.displayName,
    description: raw.description ?? null,
    role: raw.role?.displayName ?? null,
    displayIcon: raw.displayIconSmall ?? raw.displayIcon ?? null,
    fullPortrait: raw.fullPortrait ?? null,
    color: hex && /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex.toLowerCase()}` : '#8d95a3',
    abilities: raw.abilities.map((ability) => ({
      slot: ability.slot,
      displayName: ability.displayName,
      description: ability.description ?? null,
      displayIcon: ability.displayIcon ?? null,
    })),
  };
}

export function normalizeMap(raw: RawMap): MapInfo | null {
  if (!raw.displayIcon) return null;
  const fromMultiplier = raw.xMultiplier ? 1 / Math.abs(raw.xMultiplier) / 100 : null;
  return {
    uuid: raw.uuid,
    displayName: raw.displayName,
    kind: raw.tacticalDescription ? 'tactical' : 'other',
    sitesLabel: raw.tacticalDescription ?? null,
    coordinates: raw.coordinates ?? null,
    displayIcon: raw.displayIcon,
    listViewIcon: raw.listViewIcon ?? null,
    splash: raw.splash ?? null,
    worldMeters: fromMultiplier ?? raw.worldMeters ?? FALLBACK_METERS,
    scaleKnown: raw.scaleKnown ?? fromMultiplier !== null,
  };
}

const sortMaps = (maps: MapInfo[]): MapInfo[] =>
  [...maps].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'tactical' ? -1 : 1;
    return a.displayName.localeCompare(b.displayName, 'pt-BR');
  });

export function buildCatalog(
  rawMaps: RawMap[],
  rawAgents: RawAgent[],
  gameVersion: string | null,
  source: Catalog['source'],
): Catalog {
  const seenAgents = new Set<string>();
  const agents = rawAgents
    .filter((agent) => !seenAgents.has(agent.uuid) && seenAgents.add(agent.uuid))
    .map(normalizeAgent)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'));
  const maps = sortMaps(rawMaps.map(normalizeMap).filter((m): m is MapInfo => m !== null));
  return { maps, agents, gameVersion, source, fetchedAt: Date.now() };
}

const snapshotSchema = z.object({
  gameVersion: z.string().nullish(),
  maps: z.array(mapInfoSchema),
  agents: z.array(agentInfoSchema),
});

async function loadSnapshot(): Promise<Catalog> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/catalog.json`);
  if (!response.ok) throw new Error(`Catálogo local respondeu ${response.status}`);
  const parsed = snapshotSchema.parse(await response.json());
  return buildCatalog(parsed.maps, parsed.agents, parsed.gameVersion ?? null, 'snapshot');
}

export interface CatalogState {
  catalog: Catalog | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
}

export const catalogStore = createStore<CatalogState>(() => ({ catalog: null, status: 'idle', error: null }));

export const useCatalog = <T,>(selector: (state: CatalogState) => T): T => useStore(catalogStore, selector);

export async function loadCatalog(force = false): Promise<void> {
  const state = catalogStore.getState();
  if (state.status === 'loading' || (state.status === 'ready' && !force)) return;
  catalogStore.setState({ status: 'loading', error: null });

  let current: Catalog | null = state.catalog;
  try {
    const cached = await kvGet<Catalog>(CACHE_KEY);
    if (cached && Array.isArray(cached.maps) && cached.maps.length > 0) {
      current = { ...cached, source: 'cache' };
      catalogStore.setState({ catalog: current, status: 'ready' });
      if (!force && Date.now() - cached.fetchedAt < CACHE_MAX_AGE) return;
    }
  } catch {
    // Cache indisponível não impede o carregamento.
  }

  try {
    const live = await fetchLiveCatalog();
    const catalog = buildCatalog(live.maps, live.agents, live.gameVersion, 'api');
    catalogStore.setState({ catalog, status: 'ready', error: null });
    void kvSet(CACHE_KEY, catalog).catch(() => undefined);
    return;
  } catch (error) {
    if (current) {
      catalogStore.setState({ status: 'ready' });
      return;
    }
    try {
      catalogStore.setState({ catalog: await loadSnapshot(), status: 'ready', error: null });
    } catch {
      const message = error instanceof Error ? error.message : 'erro desconhecido';
      catalogStore.setState({ status: 'error', error: `Não foi possível carregar mapas e agentes (${message}).` });
    }
  }
}

export const findAgent = (catalog: Catalog | null, uuid: string): AgentInfo | undefined =>
  catalog?.agents.find((agent) => agent.uuid === uuid);

export const findMap = (catalog: Catalog | null, uuid: string): MapInfo | undefined =>
  catalog?.maps.find((map) => map.uuid === uuid);
