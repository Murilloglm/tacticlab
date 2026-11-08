// Definições canônicas: o que cada habilidade é, de que tamanho e por quanto tempo. Montadas a partir
// da tabela de calibração (calibration.ts) sobre a classificação tática (taxonomy.ts).
// A instância salva na estratégia guarda só posição, direção, trajetória e instante.
import type { AbilityCategory, Utility } from '../strategy/schema';
import { CATEGORY_CALIBRATION, calibrationRow, type AbilityAnchor, type AbilityModelId, type AbilityRender, type CalibratedField } from './calibration';
import { CATEGORY_COLOR, classifyAbility, type AbilityShapeKind } from './taxonomy';

export type { AbilityAnchor, AbilityModelId, AbilityRender };

export interface AbilitySize {
  /** Raio de volumes e áreas. */
  radiusM: number;
  /** Comprimento de paredes. */
  lengthM: number;
  /** Altura visível de volumes e paredes. */
  heightM: number;
  /** Espessura de paredes. */
  thicknessM: number;
}

export interface AbilityTiming {
  /** Tempo visível a partir do início. Nulo: fica até o fim da estratégia. */
  durationMs: number | null;
  /** Percurso fixo, usado quando não há velocidade. */
  travelMs: number;
  /** Tempo visível depois de chegar, somado ao percurso. */
  afterArrivalMs: number | null;
}

export interface AbilityTrajectory {
  speedMps: number | null;
  maxTravelMs: number | null;
  arcM: number;
}

export interface AbilityDefinition {
  agentUuid: string;
  slot: string;
  category: AbilityCategory;
  placement: AbilityShapeKind;
  classified: boolean;
  isUltimate: boolean;
  /** Nome em inglês da tabela de calibração. Nulo quando a habilidade usa o padrão da categoria. */
  abilityName: string | null;
  size: AbilitySize;
  scale2d: number;
  scale3d: number;
  offset: { liftM: number; backM: number };
  timing: AbilityTiming;
  trajectory: AbilityTrajectory;
  render: AbilityRender;
  /** Como a habilidade se prende ao mapa. */
  anchor: AbilityAnchor;
  /** Cor própria da habilidade. Nula: usa a cor da categoria. */
  tint: string | null;
  source: 'wiki' | 'estimate';
  reference: string | null;
  /** Campos que vêm de estimativa, e não da fonte. */
  estimated: CalibratedField[];
  approximate: true;
}

/** Ancoragem padrão, pela forma de renderizar. */
export function defaultAnchor(render: AbilityRender): AbilityAnchor {
  switch (render.kind) {
    case 'device':
      return 'placement';
    case 'projectile':
      return 'projectile';
    case 'creature':
    case 'trail':
      return 'path';
    case 'wall-burst':
      return 'wall';
    case 'link-wire':
      return 'link';
    default:
      return 'ground';
  }
}

/** Representação padrão: depende da categoria e de como a habilidade é posicionada. */
export function defaultRender(category: AbilityCategory, placement: AbilityShapeKind): AbilityRender {
  switch (placement) {
    case 'circle':
      return category === 'smoke' ? { kind: 'smoke-volume', volume: 'sphere' } : { kind: 'ground-area' };
    case 'wall':
      return { kind: 'wall-energy' };
    case 'path':
      if (category === 'dash' || category === 'teleport' || category === 'area') return { kind: 'trail' };
      return { kind: 'projectile', model: category === 'recon' ? 'arrow' : 'orb' };
    case 'marker':
      if (category === 'trap') return { kind: 'device', model: 'trap' };
      if (category === 'recon') return { kind: 'device', model: 'sensor' };
      if (category === 'flash') return { kind: 'device', model: 'orb' };
      return { kind: 'device', model: 'puck' };
  }
}

const cache = new Map<string, AbilityDefinition>();

export function abilityDefinition(agentUuid: string, slot: string): AbilityDefinition {
  const key = `${agentUuid}|${slot}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const info = classifyAbility(agentUuid, slot);
  const base = CATEGORY_CALIBRATION[info.category];
  const row = calibrationRow(agentUuid, slot);
  const trajectory = { ...base.trajectory, ...row?.trajectory };
  const render = row?.render ?? defaultRender(info.category, info.shape);
  const definition: AbilityDefinition = {
    agentUuid,
    slot,
    category: info.category,
    placement: info.shape,
    classified: info.classified,
    isUltimate: info.isUltimate,
    abilityName: row?.ability ?? null,
    size: {
      radiusM: row?.radiusM ?? base.radiusM,
      lengthM: row?.lengthM ?? base.lengthM,
      heightM: row?.heightM ?? base.heightM,
      thicknessM: row?.widthM ?? base.widthM,
    },
    scale2d: row?.scale2d ?? base.scale2d ?? 1,
    scale3d: row?.scale3d ?? base.scale3d ?? 1,
    offset: { liftM: row?.offset?.liftM ?? 1, backM: row?.offset?.backM ?? 0 },
    timing: {
      durationMs: row && 'durationMs' in row ? (row.durationMs ?? null) : base.durationMs,
      travelMs: trajectory.travelMs ?? 0,
      afterArrivalMs: row?.afterArrivalMs ?? null,
    },
    trajectory: { speedMps: trajectory.speedMps ?? null, maxTravelMs: trajectory.maxTravelMs ?? null, arcM: trajectory.arcM ?? 0 },
    render,
    anchor: row?.anchor ?? defaultAnchor(render),
    tint: row?.tint ?? null,
    source: row?.source ?? 'estimate',
    reference: row?.reference ?? null,
    estimated: row ? (row.source === 'estimate' ? (Object.keys(row) as CalibratedField[]) : (row.estimated ?? [])) : [],
    approximate: true,
  };
  cache.set(key, definition);
  return definition;
}

export const utilityDefinition = (utility: Pick<Utility, 'agentUuid' | 'abilitySlot'>): AbilityDefinition =>
  abilityDefinition(utility.agentUuid, utility.abilitySlot);

/** Cor usada nos dois modos e na timeline: a da habilidade, ou a da categoria. */
export const definitionColor = (definition: AbilityDefinition): string => definition.tint ?? CATEGORY_COLOR[definition.category];

export const utilityColor = (utility: Pick<Utility, 'agentUuid' | 'abilitySlot'>): string => definitionColor(utilityDefinition(utility));

/**
 * Renderização para a forma salva. Normalmente é a da definição. Se a classificação de uma habilidade
 * mudar depois de salva, cai no padrão da forma que a instância tem, sem quebrar a estratégia antiga.
 */
export function resolveRender(definition: AbilityDefinition, placement: AbilityShapeKind): AbilityRender {
  return definition.placement === placement ? definition.render : defaultRender(definition.category, placement);
}

const number = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/** Resumo somente leitura do preset, mostrado no painel da habilidade. */
export function presetSummary(definition: AbilityDefinition): string {
  const parts: string[] = [];
  const { render } = definition;
  if (definition.placement === 'circle') parts.push(`raio de ${number(definition.size.radiusM)} m`);
  if (definition.placement === 'wall' && render.kind !== 'link-wire') parts.push(`${number(definition.size.lengthM)} m de comprimento`);
  if (definition.placement === 'path' && render.kind !== 'directional-area') {
    if (definition.trajectory.speedMps) parts.push(`${number(definition.trajectory.speedMps)} m/s`);
    else if (definition.timing.travelMs > 0) parts.push(`percurso de ${number(definition.timing.travelMs / 1000)} s`);
  }
  if (render.kind === 'wall-burst') parts.push(render.effect === 'blast' ? `atravessa até ${number(render.maxDepthM)} m de parede, área de ${number(render.lengthM)} × ${number(render.radiusM * 2)} m do outro lado` : `atravessa até ${number(render.maxDepthM)} m de parede e estoura do outro lado`);
  if (render.kind === 'directional-area') parts.push(render.aimed ? `faixa de ${number(render.widthM)} m de largura, de ${number(render.minLengthM ?? 0)} a ${number(render.lengthM)} m` : `faixa de ${number(render.lengthM)} × ${number(render.widthM)} m`);
  if (render.kind === 'link-wire') parts.push(`fio de parede a parede, até ${number(render.maxLengthM)} m`);
  if (render.kind === 'device' && render.area) parts.push(`área de ${number(render.area.lengthM)} × ${number(render.area.widthM)} m`);
  if (render.kind === 'device' && render.cone) parts.push(`cone de ${render.cone.degrees}°`);
  if (render.kind === 'device' && render.detectRadiusM) parts.push(`detecção de ${number(render.detectRadiusM)} m`);
  if (render.kind === 'projectile' && render.revealRadiusM) parts.push(`revela até ${number(render.revealRadiusM)} m`);
  parts.push(definition.timing.durationMs === null ? 'até o fim da estratégia' : `${number(definition.timing.durationMs / 1000)} s visível`);
  return parts.join(', ');
}
