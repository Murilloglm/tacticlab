// Registro de modelos 3D de agentes. Todo modelo olha para +X, tem a base em y = 0 e usa metros.
// Para dar um modelo próprio a um agente, registre o construtor em AGENT_MODELS e aponte o UUID em
// AGENT_MODEL_BY_UUID. Os demais continuam usando o boneco padrão.
import type { BufferGeometry } from 'three';
import type { Team } from '../../strategy/schema';
import { TEAM_COLOR } from '../../editor/sceneStyle';
import { ball, box, cylinder, mergeParts } from '../lowpoly';

export type AgentModelId = 'mannequin';

export interface AgentModelSpec {
  id: AgentModelId;
  /** Altura em metros, usada para posicionar nome e retrato. */
  heightM: number;
  build: (teamColor: string) => BufferGeometry;
}

const DARK = '#3a404a';
const NEUTRAL = '#d3d8df';

/** Boneco neutro e estilizado: a cor vem da equipe, e o visor e a placa do peito mostram para onde olha. */
function buildMannequin(team: string): BufferGeometry {
  const leg = (side: number) => [
    { geometry: cylinder(0.12, 0.09, 0.8), at: [0, 0.46, side * 0.14] as [number, number, number], color: DARK },
    { geometry: box(0.32, 0.12, 0.17), at: [0.05, 0.06, side * 0.14] as [number, number, number], color: DARK },
  ];
  const arm = (side: number) => [
    { geometry: ball(0.13), at: [0, 1.42, side * 0.34] as [number, number, number], color: team },
    { geometry: cylinder(0.08, 0.065, 0.52), at: [0.03, 1.13, side * 0.37] as [number, number, number], color: NEUTRAL },
    { geometry: ball(0.08), at: [0.05, 0.84, side * 0.37] as [number, number, number], color: DARK },
  ];
  return mergeParts([
    ...leg(1),
    ...leg(-1),
    ...arm(1),
    ...arm(-1),
    { geometry: box(0.28, 0.2, 0.42), at: [0, 0.92, 0], color: DARK },
    { geometry: cylinder(0.32, 0.22, 0.54), at: [0, 1.22, 0], scale: [0.78, 1, 1.12], color: team },
    { geometry: box(0.06, 0.26, 0.26), at: [0.22, 1.27, 0], color: NEUTRAL },
    { geometry: box(0.16, 0.34, 0.3), at: [-0.28, 1.25, 0], color: DARK },
    { geometry: cylinder(0.07, 0.09, 0.08), at: [0, 1.51, 0], color: DARK },
    { geometry: ball(0.17, 1), at: [0, 1.68, 0], color: NEUTRAL },
    { geometry: box(0.06, 0.08, 0.26), at: [0.15, 1.7, 0], color: team },
  ]);
}

export const AGENT_MODELS: Record<AgentModelId, AgentModelSpec> = {
  mannequin: { id: 'mannequin', heightM: 1.85, build: buildMannequin },
};

/** Agentes com modelo próprio, por UUID. Vazio por enquanto: todos usam o boneco padrão. */
export const AGENT_MODEL_BY_UUID: Partial<Record<string, AgentModelId>> = {};

export const agentModelFor = (agentUuid: string): AgentModelSpec => AGENT_MODELS[AGENT_MODEL_BY_UUID[agentUuid] ?? 'mannequin'];

const cache = new Map<string, BufferGeometry>();

/** Geometria compartilhada entre os agentes: há uma por modelo e equipe, nunca descartada. */
export function agentGeometry(model: AgentModelSpec, team: Team): BufferGeometry {
  const key = `${model.id}|${team}`;
  let geometry = cache.get(key);
  if (!geometry) {
    geometry = model.build(TEAM_COLOR[team]);
    cache.set(key, geometry);
  }
  return geometry;
}
