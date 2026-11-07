// Lista cronológica da execução, derivada dos mesmos dados que a simulação usa.
import type { MapFrame } from '../coordinates';
import type { Catalog } from '../catalog/types';
import type { StrategyDoc } from '../strategy/schema';
import { compileRoute } from './simulate';

export type TimelineEventKind = 'route-start' | 'arrival' | 'utility' | 'note';

export interface TimelineEvent {
  key: string;
  timeMs: number;
  kind: TimelineEventKind;
  label: string;
  /** Objeto que o clique no evento seleciona. */
  ref: { c: 'agents' | 'utilities' | 'notes'; id: string };
}

export function buildEvents(doc: StrategyDoc, catalog: Catalog | null, frame: MapFrame): TimelineEvent[] {
  const agentName = (uuid: string) => catalog?.agents.find((agent) => agent.uuid === uuid)?.displayName ?? 'Agente';
  const abilityName = (uuid: string, slot: string) =>
    catalog?.agents.find((agent) => agent.uuid === uuid)?.abilities.find((ability) => ability.slot === slot)?.displayName ?? slot;

  const events: TimelineEvent[] = [];

  for (const agent of Object.values(doc.agents)) {
    if (!agent.route?.waypoints.length) continue;
    const compiled = compileRoute(agent, frame);
    const name = agentName(agent.agentUuid);
    const ref = { c: 'agents' as const, id: agent.id };
    events.push({ key: `start:${agent.id}`, timeMs: compiled.startMs, kind: 'route-start', label: `${name} começa a se mover`, ref });
    const waypoints = agent.route.waypoints;
    waypoints.forEach((waypoint, index) => {
      const arrival = compiled.arrivals[waypoint.id];
      if (arrival === undefined) return;
      const isLast = index === waypoints.length - 1;
      if (isLast || waypoint.pauseMs > 0 || waypoint.arriveAtMs !== null) {
        const detail = isLast ? 'chega ao destino' : waypoint.pauseMs > 0 ? `pausa por ${(waypoint.pauseMs / 1000).toFixed(1)} s` : 'passa pelo keyframe';
        events.push({ key: `arrive:${waypoint.id}`, timeMs: arrival, kind: 'arrival', label: `${name} ${detail}`, ref });
      }
    });
  }

  for (const utility of Object.values(doc.utilities)) {
    events.push({
      key: `utility:${utility.id}`,
      timeMs: utility.timeMs,
      kind: 'utility',
      label: `${agentName(utility.agentUuid)} usa ${abilityName(utility.agentUuid, utility.abilitySlot)}`,
      ref: { c: 'utilities', id: utility.id },
    });
  }

  for (const note of Object.values(doc.notes)) {
    events.push({ key: `note:${note.id}`, timeMs: note.timeMs, kind: 'note', label: note.text || 'Nota', ref: { c: 'notes', id: note.id } });
  }

  return events.sort((a, b) => a.timeMs - b.timeMs || a.key.localeCompare(b.key));
}
