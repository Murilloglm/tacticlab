// Estado da sessão de edição que não pertence à estratégia salva.
import { createStore, useStore } from 'zustand';
import type { MapFrame, MapPoint } from '../coordinates';
import type { LoadedMapGeometry } from '../maps/geometry';
import type { EntityRef, Team } from '../strategy/schema';
import type { AbilityShapeKind } from '../abilities/taxonomy';

export type Tool =
  | 'select'
  | 'pan'
  | 'agent'
  | 'route'
  | 'line'
  | 'arrow'
  | 'freehand'
  | 'marker'
  | 'text'
  | 'area'
  | 'utility';

export type ViewMode = '2d' | '3d';
export type CameraMode = 'aerial' | 'ghost';
export type PanelTab = 'agents' | 'abilities' | 'object' | 'events';

export interface Draft {
  kind: 'line' | 'freehand' | 'area' | 'utility';
  shape?: AbilityShapeKind;
  points: MapPoint[];
  /** Posição atual do ponteiro, para pré-visualizar o próximo ponto. */
  cursor: MapPoint | null;
  /** Raio ou comprimento do preset da habilidade, para a pré-visualização mostrar o tamanho real. */
  previewM?: number;
  /** Parte da parede que começa atrás do ponto inicial. */
  previewBackM?: number;
}

export interface PendingUtility {
  agentUuid: string;
  slot: string;
  ownerTokenId: string | null;
  shape: AbilityShapeKind;
}

export interface EditorState {
  viewMode: ViewMode;
  cameraMode: CameraMode;
  tool: Tool;
  selection: EntityRef[];
  draft: Draft | null;
  activeTeam: Team;
  pendingAgent: { agentUuid: string; team: Team } | null;
  pendingUtility: PendingUtility | null;
  drawColor: string;
  panelOpen: boolean;
  panelTab: PanelTab;
  timelineOpen: boolean;
  frame: MapFrame;
  map: LoadedMapGeometry | null;
  mapError: string | null;
  showCallouts: boolean;
  xrayWalls: boolean;
  minimapOnFloor: boolean;
  /** Texto recém-criado que deve receber o foco no painel. */
  focusTextId: string | null;
}

export const initialEditorState = (): EditorState => ({
  viewMode: '2d',
  cameraMode: 'aerial',
  tool: 'select',
  selection: [],
  draft: null,
  activeTeam: 'attack',
  pendingAgent: null,
  pendingUtility: null,
  drawColor: '#ffffff',
  panelOpen: typeof window === 'undefined' || window.innerWidth >= 900,
  panelTab: 'agents',
  timelineOpen: true,
  frame: { worldMeters: 110, scaleKnown: false },
  map: null,
  mapError: null,
  showCallouts: true,
  xrayWalls: false,
  minimapOnFloor: false,
  focusTextId: null,
});

export const editorStore = createStore<EditorState>(() => initialEditorState());

export const useEditor = <T,>(selector: (state: EditorState) => T): T => useStore(editorStore, selector);

export const setEditor = (patch: Partial<EditorState>): void => editorStore.setState(patch);
