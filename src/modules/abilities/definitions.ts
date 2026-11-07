// Definições canônicas: o que cada habilidade é, de que tamanho e por quanto tempo.
// A instância salva na estratégia guarda só posição, direção, trajetória e instante.
//
// Os números são presets internos do TacticLab. São aproximações escolhidas para o planejamento,
// não dados extraídos do jogo, e por isso `approximate` é sempre verdadeiro. Corrigir um valor aqui
// vale para todas as estratégias, já que nenhuma guarda cópia dele.
import type { AbilityCategory, Utility } from '../strategy/schema';
import { CATEGORY_COLOR, classifyAbility, type AbilityShapeKind } from './taxonomy';

export type AbilityModelId = 'wolf' | 'minion' | 'arrow' | 'orb' | 'drone' | 'turret' | 'alarm-bot' | 'trap' | 'sensor' | 'puck';

/** Como a habilidade aparece no 3D. Cada tipo tem um renderizador em viewer3d/abilities. */
export type AbilityRender =
  | { kind: 'smoke-volume' }
  | { kind: 'wall-solid'; segments: number }
  | { kind: 'wall-energy' }
  | { kind: 'ground-area' }
  | { kind: 'projectile'; model: AbilityModelId; arcM: number }
  | { kind: 'creature'; model: AbilityModelId }
  | { kind: 'trail' }
  | { kind: 'device'; model: AbilityModelId };

export interface AbilitySize {
  /** Raio de volumes e áreas. */
  radiusM: number;
  /** Comprimento de paredes. */
  lengthM: number;
  /** Altura de volumes e paredes. */
  heightM: number;
  /** Espessura de paredes. */
  thicknessM: number;
}

export interface AbilityTiming {
  /** Tempo visível a partir do início. Nulo: fica até o fim da estratégia. */
  durationMs: number | null;
  /** Tempo de percurso em trajetórias. */
  travelMs: number;
}

export interface AbilityDefinition {
  agentUuid: string;
  slot: string;
  category: AbilityCategory;
  placement: AbilityShapeKind;
  classified: boolean;
  isUltimate: boolean;
  size: AbilitySize;
  timing: AbilityTiming;
  render: AbilityRender;
  approximate: true;
}

const SIZE_BY_CATEGORY: Partial<Record<AbilityCategory, Partial<AbilitySize>>> = {
  smoke: { radiusM: 4.2, heightM: 6.5 },
  molotov: { radiusM: 4.5 },
  area: { radiusM: 6 },
  recon: { radiusM: 8 },
  trap: { radiusM: 4 },
  wall: { lengthM: 14, heightM: 4.2, thicknessM: 0.5 },
};

const DEFAULT_SIZE: AbilitySize = { radiusM: 5, lengthM: 14, heightM: 4, thicknessM: 0.5 };

const TIMING_BY_CATEGORY: Record<AbilityCategory, AbilityTiming> = {
  smoke: { durationMs: 15000, travelMs: 0 },
  flash: { durationMs: 2500, travelMs: 800 },
  molotov: { durationMs: 7000, travelMs: 0 },
  wall: { durationMs: 15000, travelMs: 0 },
  recon: { durationMs: 6000, travelMs: 1500 },
  trap: { durationMs: null, travelMs: 0 },
  teleport: { durationMs: 2000, travelMs: 400 },
  dash: { durationMs: 1200, travelMs: 400 },
  projectile: { durationMs: 4000, travelMs: 1500 },
  area: { durationMs: 7000, travelMs: 1000 },
  ultimate: { durationMs: 10000, travelMs: 0 },
  other: { durationMs: null, travelMs: 800 },
};

interface Preset {
  size?: Partial<AbilitySize>;
  timing?: Partial<AbilityTiming>;
  render?: AbilityRender;
}

const AGENT = {
  astra: '41fb69c1-4189-7b37-f117-bcaf1e96f1bf',
  brimstone: '9f0d8ba9-4140-b941-57d3-a7ad57c6b417',
  clove: '1dbf2edd-4729-0984-3115-daa5eed44993',
  cypher: '117ed9e3-49f3-6512-3ccf-0cada7e3823b',
  deadlock: 'cc8b64c8-4b25-4ff9-6e7f-37b4da43d235',
  fade: 'dade69b4-4f5a-8528-247b-219e5a1facd6',
  gekko: 'e370fa57-4757-3604-3648-499e1f642d3f',
  harbor: '95b78ed7-4637-86d9-7e41-71ba8c293152',
  jett: 'add6443a-41bd-e414-f6ad-e58d267f4e95',
  killjoy: '1e58de9c-4950-5125-93e9-a0aee9f98746',
  neon: 'bb2a4828-46eb-8cd1-e765-15848195d751',
  omen: '8e253930-4c05-31dd-1b6c-968525494517',
  phoenix: 'eb93336a-449b-9c1b-0a54-a891f7921d69',
  sage: '569fdd95-4d10-43ab-ca70-79becc718b46',
  skye: '6f2a04ca-43e0-be17-7f36-b3908627744d',
  sova: '320b2a48-4d9b-a075-30f1-1f93a9b638fa',
  viper: '707eab51-4836-f488-046a-cda6bf494859',
} as const;

/** Ajustes por habilidade. O que não aparece aqui usa o padrão da categoria. */
const PRESETS: Record<string, Partial<Record<string, Preset>>> = {
  [AGENT.astra]: {
    Ability2: { size: { radiusM: 4.75, heightM: 7 }, timing: { durationMs: 14000 } },
    Ultimate: { size: { lengthM: 120, heightM: 12, thicknessM: 0.4 }, timing: { durationMs: 21000 } },
  },
  [AGENT.brimstone]: {
    Ability2: { size: { radiusM: 4.1, heightM: 7 }, timing: { durationMs: 19000 } },
    Ability1: { size: { radiusM: 4.5 }, timing: { durationMs: 7000 } },
    Grenade: { size: { radiusM: 6 }, timing: { durationMs: 12000 } },
    Ultimate: { size: { radiusM: 9 }, timing: { durationMs: 4000 } },
  },
  [AGENT.clove]: { Ability2: { size: { radiusM: 4.1 }, timing: { durationMs: 14000 } } },
  [AGENT.cypher]: {
    Ability1: { size: { radiusM: 3.6, heightM: 5 }, timing: { durationMs: 7000 } },
    Grenade: { size: { lengthM: 12, heightM: 0.25, thicknessM: 0.1 }, timing: { durationMs: null } },
  },
  [AGENT.deadlock]: { Grenade: { size: { lengthM: 10, heightM: 3.5 }, timing: { durationMs: 30000 } } },
  [AGENT.fade]: { Grenade: { render: { kind: 'creature', model: 'minion' }, timing: { travelMs: 3000, durationMs: 4000 } } },
  [AGENT.gekko]: {
    Ability1: { render: { kind: 'creature', model: 'minion' }, timing: { travelMs: 3000, durationMs: 6000 } },
    Ability2: { render: { kind: 'creature', model: 'minion' }, timing: { travelMs: 1200, durationMs: 3000 } },
    Ultimate: { render: { kind: 'creature', model: 'minion' }, timing: { travelMs: 4000, durationMs: 6000 } },
  },
  [AGENT.harbor]: {
    Ability1: { size: { lengthM: 40, heightM: 5 }, timing: { durationMs: 15000 } },
    Ability2: { size: { radiusM: 4.5, heightM: 6.5 }, timing: { durationMs: 15000 } },
  },
  [AGENT.jett]: { Grenade: { size: { radiusM: 3.35, heightM: 5 }, timing: { durationMs: 4500 } } },
  [AGENT.killjoy]: {
    Grenade: { size: { radiusM: 4.5 }, timing: { durationMs: 4000 } },
    Ability1: { render: { kind: 'device', model: 'alarm-bot' } },
    Ability2: { render: { kind: 'device', model: 'turret' } },
    Ultimate: { size: { radiusM: 32 }, timing: { durationMs: 13000 } },
  },
  [AGENT.neon]: { Grenade: { size: { lengthM: 40, heightM: 3.5 }, timing: { durationMs: 6000 } } },
  [AGENT.omen]: {
    Ability2: { size: { radiusM: 4.1, heightM: 6.5 }, timing: { durationMs: 15000 } },
    Ability1: { render: { kind: 'projectile', model: 'orb', arcM: 0 }, timing: { travelMs: 1500, durationMs: 2500 } },
  },
  [AGENT.phoenix]: { Grenade: { size: { lengthM: 18, heightM: 3.5 }, timing: { durationMs: 8000 } } },
  [AGENT.sage]: {
    Grenade: { size: { lengthM: 12, heightM: 3.2, thicknessM: 0.9 }, timing: { durationMs: 40000 }, render: { kind: 'wall-solid', segments: 5 } },
    Ability1: { size: { radiusM: 6.5 }, timing: { durationMs: 7000 } },
  },
  [AGENT.skye]: {
    Ability1: { render: { kind: 'creature', model: 'wolf' }, timing: { travelMs: 3000, durationMs: 5000 } },
    Ability2: { render: { kind: 'projectile', model: 'orb', arcM: 3 }, timing: { travelMs: 900, durationMs: 2000 } },
  },
  [AGENT.sova]: {
    Ability1: { render: { kind: 'projectile', model: 'arrow', arcM: 8 }, timing: { travelMs: 1500, durationMs: 2500 } },
    Ability2: { render: { kind: 'projectile', model: 'arrow', arcM: 8 }, timing: { travelMs: 1500, durationMs: 6000 } },
    Grenade: { render: { kind: 'projectile', model: 'drone', arcM: 2 }, timing: { travelMs: 4000, durationMs: 10000 } },
    Ultimate: { render: { kind: 'trail' }, timing: { travelMs: 300, durationMs: 6000 } },
  },
  [AGENT.viper]: {
    Ability1: { size: { radiusM: 4.5, heightM: 6.5 }, timing: { durationMs: 15000 } },
    Ability2: { size: { lengthM: 50, heightM: 5 }, timing: { durationMs: 15000 } },
    Ultimate: { size: { radiusM: 20, heightM: 7 }, timing: { durationMs: 15000 } },
  },
};

/** Representação padrão: depende da categoria e de como a habilidade é posicionada. */
function defaultRender(category: AbilityCategory, placement: AbilityShapeKind): AbilityRender {
  switch (placement) {
    case 'circle':
      return category === 'smoke' ? { kind: 'smoke-volume' } : { kind: 'ground-area' };
    case 'wall':
      return { kind: 'wall-energy' };
    case 'path':
      if (category === 'dash' || category === 'teleport') return { kind: 'trail' };
      if (category === 'area') return { kind: 'trail' };
      return { kind: 'projectile', model: category === 'recon' ? 'arrow' : 'orb', arcM: category === 'recon' ? 6 : 2 };
    case 'marker':
      if (category === 'trap') return { kind: 'device', model: 'trap' };
      if (category === 'recon') return { kind: 'device', model: 'sensor' };
      if (category === 'flash') return { kind: 'device', model: 'orb' };
      return { kind: 'device', model: 'puck' };
  }
}

/**
 * Renderização para a forma salva. Normalmente é a da definição. Se a classificação de uma habilidade
 * mudar depois de salva, cai no padrão da forma que a instância tem, sem quebrar a estratégia antiga.
 */
export function resolveRender(definition: AbilityDefinition, placement: AbilityShapeKind): AbilityRender {
  return definition.placement === placement ? definition.render : defaultRender(definition.category, placement);
}

const cache = new Map<string, AbilityDefinition>();

export function abilityDefinition(agentUuid: string, slot: string): AbilityDefinition {
  const key = `${agentUuid}|${slot}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const info = classifyAbility(agentUuid, slot);
  const preset = PRESETS[agentUuid]?.[slot];
  const definition: AbilityDefinition = {
    agentUuid,
    slot,
    category: info.category,
    placement: info.shape,
    classified: info.classified,
    isUltimate: info.isUltimate,
    size: { ...DEFAULT_SIZE, ...SIZE_BY_CATEGORY[info.category], ...preset?.size },
    timing: { ...TIMING_BY_CATEGORY[info.category], ...preset?.timing },
    render: preset?.render ?? defaultRender(info.category, info.shape),
    approximate: true,
  };
  cache.set(key, definition);
  return definition;
}

export const utilityDefinition = (utility: Pick<Utility, 'agentUuid' | 'abilitySlot'>): AbilityDefinition =>
  abilityDefinition(utility.agentUuid, utility.abilitySlot);

export const utilityColor = (utility: Pick<Utility, 'agentUuid' | 'abilitySlot'>): string => CATEGORY_COLOR[utilityDefinition(utility).category];

const number = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/** Resumo somente leitura do preset, mostrado no painel da habilidade. */
export function presetSummary(definition: AbilityDefinition): string {
  const parts: string[] = [];
  if (definition.placement === 'circle') parts.push(`raio de ${number(definition.size.radiusM)} m`);
  if (definition.placement === 'wall') parts.push(`${number(definition.size.lengthM)} m de comprimento`);
  if (definition.placement === 'path' && definition.timing.travelMs > 0) parts.push(`percurso de ${number(definition.timing.travelMs / 1000)} s`);
  parts.push(definition.timing.durationMs === null ? 'até o fim da estratégia' : `${number(definition.timing.durationMs / 1000)} s visível`);
  return parts.join(', ');
}
