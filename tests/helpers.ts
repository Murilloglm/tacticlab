import type { MapFrame } from '@/modules/coordinates';
import { SCHEMA_VERSION, type AgentToken, type StrategyDoc } from '@/modules/strategy/schema';

export const FRAME: MapFrame = { worldMeters: 100, scaleKnown: true };

export function emptyDoc(overrides: Partial<StrategyDoc> = {}): StrategyDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'doc-1',
    name: 'Teste',
    mapId: 'map-1',
    side: 'attack',
    folderId: null,
    createdAt: 1,
    updatedAt: 1,
    durationMs: 30000,
    agents: {},
    utilities: {},
    drawings: {},
    notes: {},
    ...overrides,
  };
}

export function agent(overrides: Partial<AgentToken> = {}): AgentToken {
  return {
    id: 'a1',
    agentUuid: 'agent-uuid',
    team: 'attack',
    position: { x: 0, y: 0 },
    facing: 0,
    route: null,
    ...overrides,
  };
}
