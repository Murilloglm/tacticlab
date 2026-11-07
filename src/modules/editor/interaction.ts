// Controlador único das ferramentas. O 2D e o 3D só informam "ponteiro neste ponto do mapa,
// sobre este objeto"; toda a regra de edição mora aqui e vale igual nos dois modos.
import { abilityDefinition } from '../abilities/definitions';
import { clampToMap, distanceMapUnits, headingBetween, mapUnitsToMeters, type MapPoint } from '../coordinates';
import { docActions, docStore, type ChangeInput } from '../strategy/docStore';
import {
  appendWaypoint,
  createAgentToken,
  createUtility,
  faceAgentAt,
  newId,
  placeAgentAt,
  translateDrawing,
  translateUtility,
  updateWaypoint,
  wallFromGesture,
} from '../strategy/factory';
import {
  MAX_AGENTS_PER_TEAM,
  type AgentToken,
  type CollectionName,
  type Drawing,
  type Entity,
  type EntityRef,
  type Team,
  type Utility,
  type UtilityShape,
} from '../strategy/schema';
import { playbackStore } from '../timeline/playbackStore';
import { agentPoseAt } from '../timeline/simulate';
import { editorStore, setEditor, type Tool } from './editorStore';
import { toast } from '../../ui/toastStore';

export type Hit =
  | { kind: 'entity'; ref: EntityRef }
  | { kind: 'vertex'; ref: EntityRef; index: number }
  | { kind: 'radius'; ref: EntityRef }
  | { kind: 'rotate'; ref: EntityRef }
  | { kind: 'waypoint'; agentId: string; waypointId: string };

export interface Modifiers {
  shift?: boolean;
}

type Gesture =
  | { type: 'move'; anchor: MapPoint; origins: Array<{ ref: EntityRef; entity: Entity; pose: MapPoint }>; key: string }
  | { type: 'vertex'; ref: EntityRef; index: number; key: string }
  | { type: 'radius'; ref: EntityRef; key: string }
  | { type: 'rotate'; ref: EntityRef; key: string }
  | { type: 'waypoint'; agentId: string; waypointId: string; key: string }
  | { type: 'draft'; start: MapPoint }
  | { type: 'empty'; start: MapPoint };

let gesture: Gesture | null = null;

const MIN_DRAG_UNITS = 0.004;
const FREEHAND_STEP = 0.003;

const sameRef = (a: EntityRef, b: EntityRef) => a.c === b.c && a.id === b.id;

function getEntity(ref: EntityRef): Entity | null {
  const doc = docStore.getState().doc;
  return doc ? ((doc[ref.c] as Record<string, Entity>)[ref.id] ?? null) : null;
}

const now = () => playbackStore.getState().timeMs;
const frame = () => editorStore.getState().frame;

function teamCount(team: Team): number {
  const doc = docStore.getState().doc;
  return doc ? Object.values(doc.agents).filter((agent) => agent.team === team).length : 0;
}

function commit(entity: Entity, c: CollectionName, coalesce?: string): void {
  docActions.change([{ c, id: entity.id, after: entity }], coalesce ? { coalesce } : {});
}

function select(ref: EntityRef | null, additive = false): void {
  if (!ref) {
    setEditor({ selection: [] });
    return;
  }
  const { selection } = editorStore.getState();
  if (additive) {
    const exists = selection.some((item) => sameRef(item, ref));
    setEditor({ selection: exists ? selection.filter((item) => !sameRef(item, ref)) : [...selection, ref] });
  } else if (!selection.some((item) => sameRef(item, ref))) {
    setEditor({ selection: [ref] });
  }
}

function startMoveGesture(point: MapPoint): void {
  const { selection } = editorStore.getState();
  const origins = selection
    .map((ref) => {
      const entity = getEntity(ref);
      if (!entity || ref.c === 'notes') return null;
      const pose =
        ref.c === 'agents' ? agentPoseAt(entity as AgentToken, now(), frame()).point : point;
      return { ref, entity, pose };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
  gesture = { type: 'move', anchor: point, origins, key: `move:${newId()}` };
}

function applyMove(point: MapPoint, g: Extract<Gesture, { type: 'move' }>): void {
  const dx = point.x - g.anchor.x;
  const dy = point.y - g.anchor.y;
  const inputs: ChangeInput[] = g.origins.map(({ ref, entity, pose }) => {
    if (ref.c === 'agents') {
      const target = clampToMap({ x: pose.x + dx, y: pose.y + dy });
      return { c: 'agents', id: ref.id, after: placeAgentAt(entity as AgentToken, target, now(), frame()) };
    }
    if (ref.c === 'utilities') return { c: 'utilities', id: ref.id, after: translateUtility(entity as Utility, dx, dy) };
    return { c: 'drawings', id: ref.id, after: translateDrawing(entity as Drawing, dx, dy) };
  });
  docActions.change(inputs, { coalesce: g.key });
}

function applyVertex(point: MapPoint, g: Extract<Gesture, { type: 'vertex' }>): void {
  const entity = getEntity(g.ref);
  if (!entity) return;
  const target = clampToMap(point);
  const replace = (points: MapPoint[]) => points.map((p, i) => (i === g.index ? target : p));
  if (g.ref.c === 'utilities') {
    const utility = entity as Utility;
    if (utility.shape.type !== 'path') return;
    commit({ ...utility, shape: { ...utility.shape, points: replace(utility.shape.points) } }, 'utilities', g.key);
  } else if (g.ref.c === 'drawings' && (entity as Drawing).type === 'line') {
    const line = entity as Extract<Drawing, { type: 'line' }>;
    commit({ ...line, points: replace(line.points) }, 'drawings', g.key);
  }
}

/** Só áreas desenhadas têm raio ajustável. O tamanho das habilidades vem do preset. */
function applyRadius(point: MapPoint, g: Extract<Gesture, { type: 'radius' }>): void {
  const entity = getEntity(g.ref);
  if (!entity || g.ref.c !== 'drawings' || (entity as Drawing).type !== 'area') return;
  const area = entity as Extract<Drawing, { type: 'area' }>;
  commit({ ...area, radiusM: Math.max(0.5, mapUnitsToMeters(distanceMapUnits(area.center, point), frame())) }, 'drawings', g.key);
}

function applyRotate(point: MapPoint, g: Extract<Gesture, { type: 'rotate' }>): void {
  const entity = getEntity(g.ref);
  if (!entity) return;
  if (g.ref.c === 'agents') {
    const agent = entity as AgentToken;
    const center = agentPoseAt(agent, now(), frame()).point;
    commit(faceAgentAt(agent, headingBetween(center, point), now(), frame()), 'agents', g.key);
  } else if (g.ref.c === 'utilities') {
    const utility = entity as Utility;
    if (utility.shape.type === 'marker') {
      commit({ ...utility, shape: { ...utility.shape, facing: headingBetween(utility.shape.point, point) } }, 'utilities', g.key);
    } else if (utility.shape.type === 'wall') {
      commit({ ...utility, shape: { ...utility.shape, facing: headingBetween(utility.shape.center, point) } }, 'utilities', g.key);
    }
  }
}

function finishLine(points: MapPoint[], arrow: boolean, freehand: boolean): void {
  const { drawColor } = editorStore.getState();
  if (points.length < 2) return;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (!freehand && distanceMapUnits(first, last) < MIN_DRAG_UNITS) return;
  const drawing: Drawing = { id: newId(), type: 'line', points, color: drawColor, width: 3, arrow, dashed: false };
  commit(drawing, 'drawings');
  setEditor({ selection: [{ c: 'drawings', id: drawing.id }] });
}

function placeUtility(shape: UtilityShape): void {
  const pending = editorStore.getState().pendingUtility;
  if (!pending) return;
  const utility = createUtility({
    agentUuid: pending.agentUuid,
    slot: pending.slot,
    ownerTokenId: pending.ownerTokenId,
    timeMs: now(),
    shape,
  });
  commit(utility, 'utilities');
  setEditor({
    selection: [{ c: 'utilities', id: utility.id }],
    draft: null,
    tool: 'select',
    pendingUtility: null,
    panelTab: 'object',
  });
}

function finishUtilityDraft(endPoint: MapPoint | null): void {
  const { draft, pendingUtility } = editorStore.getState();
  if (!draft || !pendingUtility) return;
  const definition = abilityDefinition(pendingUtility.agentUuid, pendingUtility.slot);
  const start = draft.points[0]!;
  const end = endPoint ?? draft.cursor ?? start;
  const dragged = distanceMapUnits(start, end) >= MIN_DRAG_UNITS;
  switch (pendingUtility.shape) {
    case 'circle':
      // Arrastar só reposiciona: o raio é sempre o do preset.
      placeUtility({ type: 'circle', center: end });
      break;
    case 'marker':
      placeUtility({ type: 'marker', point: start, facing: dragged ? headingBetween(start, end) : null });
      break;
    case 'wall':
      placeUtility(wallFromGesture(start, dragged ? end : null, definition.size.lengthM, frame()));
      break;
    case 'path': {
      if (draft.points.length < 2) {
        toast.info('Adicione pelo menos dois pontos à trajetória.');
        return;
      }
      placeUtility({ type: 'path', points: draft.points, curved: false });
      break;
    }
  }
}

/** Ponto de partida da trajetória: a posição atual do dono, se houver. */
function ownerPoint(ownerTokenId: string | null): MapPoint | null {
  const doc = docStore.getState().doc;
  const owner = ownerTokenId ? doc?.agents[ownerTokenId] : null;
  return owner ? agentPoseAt(owner, now(), frame()).point : null;
}

let cursorListener: ((point: MapPoint) => void) | null = null;

/** A sala usa isto para publicar a posição do ponteiro, nos dois modos de visão. */
export function setCursorListener(listener: ((point: MapPoint) => void) | null): void {
  cursorListener = listener;
}

export const interaction = {
  /** Retorna verdadeiro quando consumiu o evento; caso contrário a visão pode mover a câmera. */
  down(rawPoint: MapPoint, hit: Hit | null, modifiers: Modifiers = {}): boolean {
    const point = clampToMap(rawPoint);
    const state = editorStore.getState();
    const readOnly = docStore.getState().readOnly;

    if (state.tool === 'pan') return false;

    if (state.tool === 'select' || readOnly) {
      if (!hit) {
        gesture = { type: 'empty', start: point };
        return false;
      }
      if (hit.kind === 'entity') {
        select(hit.ref, modifiers.shift);
        if (!readOnly && !modifiers.shift) startMoveGesture(point);
        return true;
      }
      if (readOnly) return true;
      const key = `handle:${newId()}`;
      if (hit.kind === 'vertex') gesture = { type: 'vertex', ref: hit.ref, index: hit.index, key };
      if (hit.kind === 'radius') gesture = { type: 'radius', ref: hit.ref, key };
      if (hit.kind === 'rotate') gesture = { type: 'rotate', ref: hit.ref, key };
      if (hit.kind === 'waypoint') gesture = { type: 'waypoint', agentId: hit.agentId, waypointId: hit.waypointId, key };
      return true;
    }

    switch (state.tool) {
      case 'agent': {
        const pending = state.pendingAgent;
        if (!pending) return true;
        if (teamCount(pending.team) >= MAX_AGENTS_PER_TEAM) {
          toast.error(`Esta equipe já tem ${MAX_AGENTS_PER_TEAM} agentes.`);
          setEditor({ pendingAgent: null, tool: 'select' });
          return true;
        }
        const token = createAgentToken(pending.agentUuid, pending.team, point);
        commit(token, 'agents');
        setEditor({ selection: [{ c: 'agents', id: token.id }], pendingAgent: null, tool: 'select' });
        return true;
      }
      case 'route': {
        const ref = state.selection.find((item) => item.c === 'agents');
        const agent = ref ? (getEntity(ref) as AgentToken | null) : null;
        if (!agent) {
          toast.info('Selecione um agente para criar a rota.');
          setEditor({ tool: 'select' });
          return true;
        }
        commit(appendWaypoint(agent, point, now()), 'agents');
        return true;
      }
      case 'line':
      case 'arrow':
      case 'area':
        setEditor({ draft: { kind: state.tool === 'area' ? 'area' : 'line', points: [point, point], cursor: point } });
        gesture = { type: 'draft', start: point };
        return true;
      case 'freehand':
        setEditor({ draft: { kind: 'freehand', points: [point], cursor: point } });
        gesture = { type: 'draft', start: point };
        return true;
      case 'marker': {
        const marker: Drawing = { id: newId(), type: 'marker', point, color: state.drawColor, label: '' };
        commit(marker, 'drawings');
        setEditor({ selection: [{ c: 'drawings', id: marker.id }], tool: 'select', panelTab: 'object' });
        return true;
      }
      case 'text': {
        const text: Drawing = { id: newId(), type: 'text', point, color: state.drawColor, text: 'Texto', size: 18 };
        commit(text, 'drawings');
        setEditor({
          selection: [{ c: 'drawings', id: text.id }],
          tool: 'select',
          panelTab: 'object',
          panelOpen: true,
          focusTextId: text.id,
        });
        return true;
      }
      case 'utility': {
        const pending = state.pendingUtility;
        if (!pending) return true;
        if (pending.shape === 'path') {
          const existing = state.draft;
          setEditor({
            draft: {
              kind: 'utility',
              shape: 'path',
              points: existing ? [...existing.points, point] : [ownerPoint(pending.ownerTokenId) ?? point, ...(ownerPoint(pending.ownerTokenId) ? [point] : [])],
              cursor: point,
            },
          });
          return true;
        }
        const { size } = abilityDefinition(pending.agentUuid, pending.slot);
        const previewM = pending.shape === 'circle' ? size.radiusM : pending.shape === 'wall' ? size.lengthM : undefined;
        setEditor({ draft: { kind: 'utility', shape: pending.shape, points: [point], cursor: point, previewM } });
        gesture = { type: 'draft', start: point };
        return true;
      }
      default:
        return false;
    }
  },

  move(rawPoint: MapPoint): void {
    const point = clampToMap(rawPoint);
    cursorListener?.(point);
    const state = editorStore.getState();
    if (state.draft && !gesture) {
      setEditor({ draft: { ...state.draft, cursor: point } });
      return;
    }
    if (!gesture) return;
    switch (gesture.type) {
      case 'move':
        applyMove(point, gesture);
        break;
      case 'vertex':
        applyVertex(point, gesture);
        break;
      case 'radius':
        applyRadius(point, gesture);
        break;
      case 'rotate':
        applyRotate(point, gesture);
        break;
      case 'waypoint': {
        const agent = docStore.getState().doc?.agents[gesture.agentId];
        if (agent) commit(updateWaypoint(agent, gesture.waypointId, { point }), 'agents', gesture.key);
        break;
      }
      case 'draft': {
        const draft = state.draft;
        if (!draft) break;
        if (draft.kind === 'freehand') {
          const last = draft.points[draft.points.length - 1]!;
          const points = distanceMapUnits(last, point) >= FREEHAND_STEP ? [...draft.points, point] : draft.points;
          setEditor({ draft: { ...draft, points, cursor: point } });
        } else if (draft.kind === 'utility') {
          setEditor({ draft: { ...draft, cursor: point } });
        } else {
          setEditor({ draft: { ...draft, points: [draft.points[0]!, point], cursor: point } });
        }
        break;
      }
      default:
        break;
    }
  },

  up(rawPoint: MapPoint | null): void {
    const current = gesture;
    gesture = null;
    docActions.endGesture();
    if (!current) return;
    const point = rawPoint ? clampToMap(rawPoint) : null;
    const state = editorStore.getState();

    if (current.type === 'empty') {
      // Clique sem arrastar no vazio limpa a seleção; arrastar é navegação da câmera.
      if (point && distanceMapUnits(current.start, point) < MIN_DRAG_UNITS) setEditor({ selection: [] });
      return;
    }
    if (current.type !== 'draft' || !state.draft) return;

    const draft = state.draft;
    if (draft.kind === 'line') {
      finishLine(draft.points, state.tool === 'arrow', false);
      setEditor({ draft: null });
    } else if (draft.kind === 'freehand') {
      finishLine(draft.points, false, true);
      setEditor({ draft: null });
    } else if (draft.kind === 'area') {
      const center = draft.points[0]!;
      const edge = draft.points[1] ?? center;
      const meters = mapUnitsToMeters(distanceMapUnits(center, edge), frame());
      const area: Drawing = { id: newId(), type: 'area', center, radiusM: meters >= 0.5 ? meters : 5, color: state.drawColor };
      commit(area, 'drawings');
      setEditor({ draft: null, selection: [{ c: 'drawings', id: area.id }] });
    } else {
      finishUtilityDraft(point);
    }
  },

  /** Conclui o que estiver em andamento (Enter, duplo clique ou botão Concluir). */
  finish(): void {
    const { tool, draft } = editorStore.getState();
    if (tool === 'route') {
      setEditor({ tool: 'select' });
      return;
    }
    if (tool === 'utility' && draft) finishUtilityDraft(null);
  },

  cancel(): void {
    gesture = null;
    docActions.endGesture();
    setEditor({ draft: null, pendingAgent: null, pendingUtility: null, tool: 'select' });
  },

  isBusy(): boolean {
    return gesture !== null && gesture.type !== 'empty';
  },
};

export function setTool(tool: Tool): void {
  setEditor({ tool, draft: null, pendingAgent: null, pendingUtility: null });
}

export function armAgent(agentUuid: string, team: Team): void {
  if (teamCount(team) >= MAX_AGENTS_PER_TEAM) {
    toast.error(`Esta equipe já tem ${MAX_AGENTS_PER_TEAM} agentes.`);
    return;
  }
  setEditor({ tool: 'agent', pendingAgent: { agentUuid, team }, pendingUtility: null, draft: null, activeTeam: team });
}

export function armUtility(agentUuid: string, slot: string, ownerTokenId: string | null): void {
  setEditor({
    tool: 'utility',
    pendingUtility: { agentUuid, slot, ownerTokenId, shape: abilityDefinition(agentUuid, slot).placement },
    pendingAgent: null,
    draft: null,
  });
}

export function deleteSelection(): void {
  const { selection } = editorStore.getState();
  if (selection.length === 0) return;
  const doc = docStore.getState().doc;
  const inputs: ChangeInput[] = selection.map((ref) => ({ c: ref.c, id: ref.id, after: null }));
  // Utilidades de um agente excluído ficam sem dono, mas não desaparecem.
  for (const ref of selection) {
    if (ref.c !== 'agents') continue;
    for (const utility of Object.values(doc?.utilities ?? {})) {
      if (utility.ownerTokenId === ref.id && !selection.some((s) => s.c === 'utilities' && s.id === utility.id)) {
        inputs.push({ c: 'utilities', id: utility.id, after: { ...utility, ownerTokenId: null } });
      }
    }
  }
  docActions.change(inputs);
  setEditor({ selection: [] });
}

const DUPLICATE_OFFSET = 0.02;

export function duplicateSelection(): void {
  const { selection } = editorStore.getState();
  const inputs: ChangeInput[] = [];
  const created: EntityRef[] = [];
  for (const ref of selection) {
    const entity = getEntity(ref);
    if (!entity || ref.c === 'notes') continue;
    const id = newId();
    if (ref.c === 'agents') {
      const agent = entity as AgentToken;
      if (teamCount(agent.team) + inputs.filter((i) => i.c === 'agents' && (i.after as AgentToken).team === agent.team).length >= MAX_AGENTS_PER_TEAM) {
        toast.error(`Esta equipe já tem ${MAX_AGENTS_PER_TEAM} agentes.`);
        continue;
      }
      inputs.push({
        c: 'agents',
        id,
        after: { ...agent, id, route: null, position: clampToMap({ x: agent.position.x + DUPLICATE_OFFSET, y: agent.position.y + DUPLICATE_OFFSET }) },
      });
    } else if (ref.c === 'utilities') {
      inputs.push({ c: 'utilities', id, after: { ...translateUtility(entity as Utility, DUPLICATE_OFFSET, DUPLICATE_OFFSET), id } });
    } else {
      inputs.push({ c: 'drawings', id, after: { ...translateDrawing(entity as Drawing, DUPLICATE_OFFSET, DUPLICATE_OFFSET), id } });
    }
    created.push({ c: ref.c, id });
  }
  if (inputs.length) {
    docActions.change(inputs);
    setEditor({ selection: created });
  }
}
