// Classificação tática das habilidades: categoria e forma de desenho na prancha.
// A Valorant-API fornece nome, descrição e ícone, mas não diz "isto é uma smoke".
// Esta tabela é uma curadoria manual baseada nas descrições da API. Ela não contém
// alcance, duração nem qualquer número do jogo. Agente ou habilidade ausente aparece
// como "Não classificada", nunca com uma categoria inventada.
import type { AbilityCategory } from '../strategy/schema';

export type AbilityShapeKind = 'circle' | 'wall' | 'path' | 'marker';

export interface AbilityRule {
  category: AbilityCategory;
  shape: AbilityShapeKind;
}

const rule = (category: AbilityCategory, shape: AbilityShapeKind): AbilityRule => ({ category, shape });

type AgentRules = Partial<Record<'Ability1' | 'Ability2' | 'Grenade' | 'Ultimate', AbilityRule>>;

// As chaves são os UUIDs estáveis da API; o nome fica no comentário por legibilidade.
export const ABILITY_TAXONOMY: Record<string, AgentRules> = {
  // Astra
  '41fb69c1-4189-7b37-f117-bcaf1e96f1bf': {
    Ability1: rule('area', 'circle'),
    Ability2: rule('smoke', 'circle'),
    Grenade: rule('area', 'circle'),
    Ultimate: rule('wall', 'wall'),
  },
  // Breach
  '5f8d3a7f-467b-97f3-062c-13acf203c006': {
    Ability1: rule('flash', 'marker'),
    Ability2: rule('area', 'path'),
    Grenade: rule('area', 'circle'),
    Ultimate: rule('area', 'path'),
  },
  // Brimstone
  '9f0d8ba9-4140-b941-57d3-a7ad57c6b417': {
    Grenade: rule('area', 'circle'),
    Ability1: rule('molotov', 'circle'),
    Ability2: rule('smoke', 'circle'),
    Ultimate: rule('area', 'circle'),
  },
  // Chamber
  '22697a3d-45bf-8dd7-4fec-84a9e28c69d7': {
    Ability2: rule('teleport', 'path'),
    Grenade: rule('trap', 'marker'),
    Ability1: rule('other', 'marker'),
    Ultimate: rule('other', 'marker'),
  },
  // Clove
  '1dbf2edd-4729-0984-3115-daa5eed44993': {
    Grenade: rule('other', 'marker'),
    Ability2: rule('smoke', 'circle'),
    Ultimate: rule('other', 'marker'),
    Ability1: rule('area', 'circle'),
  },
  // Cypher
  '117ed9e3-49f3-6512-3ccf-0cada7e3823b': {
    Ability1: rule('smoke', 'circle'),
    Ability2: rule('recon', 'marker'),
    Grenade: rule('trap', 'wall'),
    Ultimate: rule('recon', 'marker'),
  },
  // Deadlock
  'cc8b64c8-4b25-4ff9-6e7f-37b4da43d235': {
    Ability1: rule('trap', 'marker'),
    Grenade: rule('wall', 'wall'),
    Ability2: rule('area', 'circle'),
    Ultimate: rule('area', 'path'),
  },
  // Fade
  'dade69b4-4f5a-8528-247b-219e5a1facd6': {
    Ability1: rule('area', 'circle'),
    Ability2: rule('recon', 'circle'),
    Grenade: rule('projectile', 'path'),
    Ultimate: rule('area', 'path'),
  },
  // Gekko
  'e370fa57-4757-3604-3648-499e1f642d3f': {
    Ability1: rule('projectile', 'path'),
    Ability2: rule('flash', 'path'),
    Grenade: rule('molotov', 'circle'),
    Ultimate: rule('projectile', 'path'),
  },
  // Harbor
  '95b78ed7-4637-86d9-7e41-71ba8c293152': {
    Ability1: rule('wall', 'wall'),
    Grenade: rule('area', 'circle'),
    Ability2: rule('smoke', 'circle'),
    Ultimate: rule('area', 'circle'),
  },
  // Hush
  'ddd5a15c-4fbe-42fa-3789-11a55ca5ee04': {
    Ability1: rule('flash', 'path'),
    Ability2: rule('area', 'path'),
    Grenade: rule('dash', 'path'),
    Ultimate: rule('area', 'path'),
  },
  // Iso
  '0e38b510-41a8-5780-5e8f-568b2a4f2d6c': {
    Ability1: rule('projectile', 'path'),
    Ultimate: rule('area', 'path'),
    Ability2: rule('other', 'marker'),
    Grenade: rule('wall', 'wall'),
  },
  // Jett
  'add6443a-41bd-e414-f6ad-e58d267f4e95': {
    Ability1: rule('other', 'marker'),
    Ability2: rule('dash', 'path'),
    Grenade: rule('smoke', 'circle'),
    Ultimate: rule('other', 'marker'),
  },
  // KAY/O
  '601dbbe7-43ce-be57-2a40-4abd24953621': {
    Grenade: rule('molotov', 'circle'),
    Ability1: rule('flash', 'marker'),
    Ability2: rule('recon', 'circle'),
    Ultimate: rule('area', 'circle'),
  },
  // Killjoy
  '1e58de9c-4950-5125-93e9-a0aee9f98746': {
    Grenade: rule('molotov', 'circle'),
    Ability1: rule('trap', 'marker'),
    Ability2: rule('trap', 'marker'),
    Ultimate: rule('area', 'circle'),
  },
  // Miks
  '7c8a4701-4de6-9355-b254-e09bc2a34b72': {
    Grenade: rule('area', 'circle'),
    Ability2: rule('smoke', 'circle'),
    Ability1: rule('other', 'marker'),
    Ultimate: rule('area', 'path'),
  },
  // Neon
  'bb2a4828-46eb-8cd1-e765-15848195d751': {
    Ability2: rule('dash', 'path'),
    Ability1: rule('area', 'circle'),
    Grenade: rule('wall', 'wall'),
    Ultimate: rule('other', 'marker'),
  },
  // Omen
  '8e253930-4c05-31dd-1b6c-968525494517': {
    Ability1: rule('flash', 'path'),
    Ability2: rule('smoke', 'circle'),
    Grenade: rule('teleport', 'path'),
    Ultimate: rule('teleport', 'marker'),
  },
  // Phoenix
  'eb93336a-449b-9c1b-0a54-a891f7921d69': {
    Grenade: rule('wall', 'wall'),
    Ability1: rule('molotov', 'circle'),
    Ability2: rule('flash', 'marker'),
    Ultimate: rule('other', 'marker'),
  },
  // Raze
  'f94c3b30-42be-e959-889c-5aa313dba261': {
    Ability1: rule('projectile', 'path'),
    Ability2: rule('area', 'circle'),
    Grenade: rule('projectile', 'path'),
    Ultimate: rule('projectile', 'path'),
  },
  // Reyna
  'a3bfb853-43b2-7238-a4f1-ad90e9e46bcc': {
    Ability1: rule('other', 'marker'),
    Ability2: rule('other', 'marker'),
    Grenade: rule('flash', 'marker'),
    Ultimate: rule('other', 'marker'),
  },
  // Sage
  '569fdd95-4d10-43ab-ca70-79becc718b46': {
    Ability1: rule('area', 'circle'),
    Ability2: rule('other', 'marker'),
    Grenade: rule('wall', 'wall'),
    Ultimate: rule('other', 'marker'),
  },
  // Skye
  '6f2a04ca-43e0-be17-7f36-b3908627744d': {
    Ability1: rule('projectile', 'path'),
    Ability2: rule('flash', 'path'),
    Grenade: rule('area', 'circle'),
    Ultimate: rule('recon', 'marker'),
  },
  // Sova
  '320b2a48-4d9b-a075-30f1-1f93a9b638fa': {
    Ability1: rule('projectile', 'path'),
    Ability2: rule('recon', 'path'),
    Grenade: rule('recon', 'path'),
    Ultimate: rule('projectile', 'path'),
  },
  // Tejo
  'b444168c-4e35-8076-db47-ef9bf368f384': {
    Ability2: rule('area', 'circle'),
    Ability1: rule('projectile', 'path'),
    Ultimate: rule('area', 'path'),
    Grenade: rule('recon', 'path'),
  },
  // Veto
  '92eeef5d-43b5-1d4a-8d03-b3927a09034b': {
    Ability2: rule('trap', 'marker'),
    Grenade: rule('teleport', 'marker'),
    Ultimate: rule('other', 'marker'),
    Ability1: rule('trap', 'marker'),
  },
  // Viper
  '707eab51-4836-f488-046a-cda6bf494859': {
    Ability1: rule('smoke', 'circle'),
    Ability2: rule('wall', 'wall'),
    Grenade: rule('molotov', 'circle'),
    Ultimate: rule('smoke', 'circle'),
  },
  // Vyse
  'efba5359-4016-a1e5-7626-b1ae76895940': {
    Ability1: rule('trap', 'wall'),
    Ability2: rule('flash', 'marker'),
    Grenade: rule('trap', 'circle'),
    Ultimate: rule('area', 'circle'),
  },
  // Waylay
  'df1cb487-4902-002e-5c17-d28e83e78588': {
    Ability2: rule('teleport', 'marker'),
    Grenade: rule('area', 'circle'),
    Ability1: rule('dash', 'path'),
    Ultimate: rule('area', 'path'),
  },
  // Yoru
  '7f94d92c-4234-0a36-9646-3a87eb8b5c89': {
    Grenade: rule('projectile', 'path'),
    Ability1: rule('flash', 'path'),
    Ability2: rule('teleport', 'path'),
    Ultimate: rule('other', 'marker'),
  },
};

export const CATEGORY_LABEL: Record<AbilityCategory, string> = {
  smoke: 'Smoke',
  flash: 'Flash',
  molotov: 'Molotov',
  wall: 'Parede',
  recon: 'Reconhecimento',
  trap: 'Armadilha',
  teleport: 'Teleporte',
  dash: 'Dash',
  projectile: 'Projétil',
  area: 'Área',
  ultimate: 'Ultimate',
  other: 'Outra',
};

export const CATEGORY_COLOR: Record<AbilityCategory, string> = {
  smoke: '#b9c2cf',
  flash: '#f6e27a',
  molotov: '#ff7a3c',
  wall: '#62c6ff',
  recon: '#6fe0c0',
  trap: '#c792ff',
  teleport: '#a877ff',
  dash: '#58e1ff',
  projectile: '#ffc857',
  area: '#ff8fc4',
  ultimate: '#ffffff',
  other: '#a2a9b4',
};

export const SHAPE_HINT: Record<AbilityShapeKind, string> = {
  circle: 'Clique no mapa para posicionar. Arraste para definir o tamanho.',
  wall: 'Arraste no mapa do início ao fim da parede.',
  path: 'Clique para adicionar pontos da trajetória e depois em Concluir.',
  marker: 'Clique no mapa para posicionar. Arraste para indicar a direção.',
};

/** Passivas não têm posicionamento tático; ficam só como informação. */
export const isPlaceableSlot = (slot: string): boolean => slot !== 'Passive';

export interface ClassifiedAbility {
  category: AbilityCategory;
  shape: AbilityShapeKind;
  isUltimate: boolean;
  classified: boolean;
}

export function classifyAbility(agentUuid: string, slot: string): ClassifiedAbility {
  const found = ABILITY_TAXONOMY[agentUuid]?.[slot as keyof AgentRules];
  return {
    category: found?.category ?? 'other',
    shape: found?.shape ?? 'marker',
    isUltimate: slot === 'Ultimate',
    classified: Boolean(found),
  };
}

/**
 * Tamanhos usados só para desenhar. Valem por categoria, não por habilidade,
 * justamente porque não representam o alcance real de nada no jogo. O usuário ajusta cada um.
 */
export const VISUAL_DEFAULTS = {
  radiusM: { smoke: 4.5, molotov: 4, area: 6, recon: 8, trap: 4, default: 5 } as Record<string, number>,
  wallLengthM: 12,
  wallThicknessM: 0.6,
  travelMs: { projectile: 1500, recon: 1500, flash: 800, dash: 400, teleport: 0, area: 1000, default: 800 } as Record<string, number>,
};

export const defaultRadius = (category: AbilityCategory): number =>
  VISUAL_DEFAULTS.radiusM[category] ?? VISUAL_DEFAULTS.radiusM.default!;

export const defaultTravelMs = (category: AbilityCategory): number =>
  VISUAL_DEFAULTS.travelMs[category] ?? VISUAL_DEFAULTS.travelMs.default!;
