// Tabela de calibração das habilidades. É a única fonte de tamanho, tempo, trajetória e aparência.
// Cada linha diz de onde vêm os números. "wiki" usa o wiki oficial (wiki.playvalorant.com, consultado
// em 2026-11-07, versão PC). Os campos listados em `estimated` são estimativas do TacticLab, porque a
// fonte não os informa. O que não tem linha usa o padrão da categoria, também estimado.
//
// Para corrigir um valor, edite a linha: vale para todas as estratégias, já que nenhuma guarda cópia.
import type { AbilityCategory } from '../strategy/schema';

export type AbilitySlot = 'Ability1' | 'Ability2' | 'Grenade' | 'Ultimate';
export type AbilityModelId = 'wolf' | 'minion' | 'arrow' | 'orb' | 'drone' | 'turret' | 'alarm-bot' | 'trap' | 'sensor' | 'puck';

/** Como a habilidade aparece no 3D. Cada tipo tem um renderizador em viewer3d/abilities. */
export type AbilityRender =
  | { kind: 'smoke-volume'; volume: 'sphere' | 'dome' | 'cylinder' }
  | { kind: 'wall-solid'; segments: number }
  | { kind: 'wall-energy'; parallelGapM?: number; crossed?: boolean }
  | { kind: 'ground-area' }
  | { kind: 'projectile'; model: AbilityModelId; impactRadiusM?: number; revealRadiusM?: number; pulses?: { count: number; intervalMs: number } }
  | { kind: 'creature'; model: AbilityModelId; sense?: { radiusM: number; degrees?: number } }
  | { kind: 'trail' }
  | { kind: 'device'; model: AbilityModelId; cone?: { degrees: number; rangeM: number; outerRangeM?: number }; detectRadiusM?: number };

export interface Trajectory {
  /** Velocidade em m/s. Com ela, o tempo de percurso depende do comprimento da trajetória. */
  speedMps?: number;
  /** Teto do percurso, em ms: a habilidade para ao fim da duração mesmo sem chegar. */
  maxTravelMs?: number;
  /** Percurso fixo, em ms, quando não há velocidade. */
  travelMs?: number;
  /** Altura do arco no meio do percurso, em metros. */
  arcM?: number;
}

export interface Calibration {
  /** Raio de volumes e áreas. */
  radiusM?: number;
  /** Altura visível acima do piso. */
  heightM?: number;
  /** Comprimento de paredes. */
  lengthM?: number;
  /** Largura (espessura) de paredes. */
  widthM?: number;
  /** Escala do desenho no 2D e do modelo no 3D. 1 é o tamanho real. */
  scale2d?: number;
  scale3d?: number;
  /** liftM: altura do modelo acima do piso. backM: quanto a parede começa atrás do ponto inicial. */
  offset?: { liftM?: number; backM?: number };
  /** Tempo visível a partir do uso. Nulo: até o fim da estratégia. */
  durationMs?: number | null;
  /** Tempo visível depois de chegar ao destino, somado ao percurso. */
  afterArrivalMs?: number;
  trajectory?: Trajectory;
  render?: AbilityRender;
  /** Cor própria, para reconhecer de quem é a habilidade nos dois modos. */
  tint?: string;
}

export type CalibratedField = keyof Calibration;

export interface CalibrationRow extends Calibration {
  agent: string;
  agentUuid: string;
  slot: AbilitySlot;
  /** Nome da habilidade em inglês, como no wiki. */
  ability: string;
  source: 'wiki' | 'estimate';
  /** Página do wiki oficial usada, quando há. */
  reference?: string;
  /** Campos estimados em uma linha do wiki: a página não informa esses valores. */
  estimated?: CalibratedField[];
}

export interface CategoryCalibration extends Calibration {
  radiusM: number;
  heightM: number;
  lengthM: number;
  widthM: number;
  durationMs: number | null;
  trajectory: Trajectory;
}

/**
 * Padrões por categoria: estimativas coerentes com as linhas medidas. Smokes ficam perto de 4,2 m de
 * raio, áreas no chão perto de 4,5 m, e a altura visível de um volume não passa de 1,3 vez o raio.
 */
export const CATEGORY_CALIBRATION: Record<AbilityCategory, CategoryCalibration> = {
  smoke: { radiusM: 4.2, heightM: 5.2, lengthM: 12, widthM: 0.5, durationMs: 15000, trajectory: {} },
  flash: { radiusM: 3, heightM: 3, lengthM: 12, widthM: 0.5, durationMs: 2500, trajectory: { travelMs: 800, arcM: 2 } },
  molotov: { radiusM: 4.5, heightM: 3, lengthM: 12, widthM: 0.5, durationMs: 7000, trajectory: {} },
  wall: { radiusM: 4, heightM: 4, lengthM: 12, widthM: 0.5, durationMs: 15000, trajectory: {} },
  recon: { radiusM: 6, heightM: 3, lengthM: 12, widthM: 0.5, durationMs: 6000, trajectory: { travelMs: 1500, arcM: 5 } },
  trap: { radiusM: 4, heightM: 3, lengthM: 8, widthM: 0.2, durationMs: null, trajectory: {} },
  teleport: { radiusM: 3, heightM: 3, lengthM: 12, widthM: 0.5, durationMs: 2000, trajectory: { travelMs: 400 } },
  dash: { radiusM: 3, heightM: 3, lengthM: 12, widthM: 0.5, durationMs: 1200, trajectory: { travelMs: 400 } },
  projectile: { radiusM: 4, heightM: 3, lengthM: 12, widthM: 0.5, durationMs: 4000, trajectory: { travelMs: 1500, arcM: 2 } },
  area: { radiusM: 5, heightM: 3, lengthM: 12, widthM: 0.5, durationMs: 6000, trajectory: { travelMs: 1000 } },
  ultimate: { radiusM: 8, heightM: 4, lengthM: 12, widthM: 0.5, durationMs: 10000, trajectory: {} },
  other: { radiusM: 3, heightM: 3, lengthM: 12, widthM: 0.5, durationMs: null, trajectory: { travelMs: 800 } },
};

const UUID = {
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

const SMOKE = { kind: 'smoke-volume', volume: 'sphere' } as const;

export const CALIBRATION: CalibrationRow[] = [
  // Smokes: as três de referência ficam juntas para a proporção entre elas ser conferida de uma vez.
  // A Astra tem o maior raio das três (4,75 m contra 4,1 e 4,15).
  { agent: 'Astra', agentUuid: UUID.astra, slot: 'Ability2', ability: 'Nebula', source: 'wiki', reference: 'Nebula_/_Dissipate', radiusM: 4.75, heightM: 5.9, durationMs: 14250, render: SMOKE, tint: '#b07de0', estimated: ['heightM'] },
  { agent: 'Omen', agentUuid: UUID.omen, slot: 'Ability2', ability: 'Dark Cover', source: 'wiki', reference: 'Dark_Cover', radiusM: 4.1, heightM: 5.1, durationMs: 15000, render: SMOKE, tint: '#6d5c9e', estimated: ['heightM'] },
  { agent: 'Brimstone', agentUuid: UUID.brimstone, slot: 'Ability2', ability: 'Sky Smoke', source: 'wiki', reference: 'Sky_Smoke', radiusM: 4.15, heightM: 5.2, durationMs: 19250, render: SMOKE, tint: '#c4b39b', estimated: ['heightM'] },
  { agent: 'Clove', agentUuid: UUID.clove, slot: 'Ability2', ability: 'Ruse', source: 'wiki', reference: 'Ruse', radiusM: 4, heightM: 5, durationMs: 14000, render: SMOKE, tint: '#d68ad6', estimated: ['heightM'] },
  { agent: 'Jett', agentUuid: UUID.jett, slot: 'Grenade', ability: 'Cloudburst', source: 'wiki', reference: 'Cloudburst', radiusM: 3.35, heightM: 4.2, durationMs: 2500, render: SMOKE, tint: '#e6eef5', estimated: ['heightM'] },
  { agent: 'Viper', agentUuid: UUID.viper, slot: 'Ability1', ability: 'Poison Cloud', source: 'wiki', reference: 'Poison_Cloud', radiusM: 4.5, heightM: 5.6, durationMs: 15000, render: SMOKE, tint: '#5cbf6c', estimated: ['heightM', 'durationMs'] },
  { agent: 'Harbor', agentUuid: UUID.harbor, slot: 'Ability2', ability: 'Cove', source: 'wiki', reference: 'Cove', radiusM: 4.6, heightM: 4.6, durationMs: 19250, render: { kind: 'smoke-volume', volume: 'dome' }, tint: '#4aa9d8', estimated: ['heightM'] },
  { agent: 'Cypher', agentUuid: UUID.cypher, slot: 'Ability1', ability: 'Cyber Cage', source: 'wiki', reference: 'Cyber_Cage', radiusM: 3.72, heightM: 4.5, durationMs: 7250, render: { kind: 'smoke-volume', volume: 'cylinder' }, tint: '#9fbbdb', estimated: ['heightM'] },
  { agent: 'Viper', agentUuid: UUID.viper, slot: 'Ultimate', ability: "Viper's Pit", source: 'wiki', reference: "Viper's_Pit", radiusM: 9, heightM: 6, durationMs: 15000, render: { kind: 'smoke-volume', volume: 'dome' }, tint: '#4fae62', estimated: ['radiusM', 'heightM', 'durationMs'] },

  // Paredes.
  { agent: 'Sage', agentUuid: UUID.sage, slot: 'Grenade', ability: 'Barrier Orb', source: 'wiki', reference: 'Barrier_Orb', lengthM: 10.4, widthM: 1.5, heightM: 3.6, durationMs: 40000, render: { kind: 'wall-solid', segments: 4 }, tint: '#bfe6f2', estimated: ['heightM', 'widthM'] },
  { agent: 'Viper', agentUuid: UUID.viper, slot: 'Ability2', ability: 'Toxic Screen', source: 'wiki', reference: 'Toxic_Screen', lengthM: 60, heightM: 4, widthM: 0.4, durationMs: 15000, render: { kind: 'wall-energy' }, tint: '#5cbf6c', estimated: ['durationMs', 'widthM'] },
  { agent: 'Harbor', agentUuid: UUID.harbor, slot: 'Ability1', ability: 'High Tide', source: 'wiki', reference: 'High_Tide', lengthM: 60, heightM: 8, widthM: 0.4, durationMs: 15000, render: { kind: 'wall-energy' }, tint: '#3a9fd6', estimated: ['widthM'] },
  { agent: 'Phoenix', agentUuid: UUID.phoenix, slot: 'Grenade', ability: 'Blaze', source: 'wiki', reference: 'Blaze', lengthM: 21, heightM: 3.5, widthM: 0.4, durationMs: 8000, render: { kind: 'wall-energy' }, tint: '#ff8a3c', estimated: ['lengthM', 'heightM', 'widthM'] },
  { agent: 'Neon', agentUuid: UUID.neon, slot: 'Grenade', ability: 'Fast Lane', source: 'wiki', reference: 'Fast_Lane', lengthM: 46.5, heightM: 3.5, widthM: 0.3, offset: { backM: 1.5 }, durationMs: 4000, render: { kind: 'wall-energy', parallelGapM: 3.5 }, tint: '#3fd0ff', estimated: ['heightM', 'widthM'] },
  { agent: 'Deadlock', agentUuid: UUID.deadlock, slot: 'Grenade', ability: 'Barrier Mesh', source: 'wiki', reference: 'Barrier_Mesh', lengthM: 10, heightM: 3, widthM: 0.4, durationMs: 30000, render: { kind: 'wall-energy', crossed: true }, tint: '#cfd8e0', estimated: ['heightM', 'widthM'] },
  { agent: 'Astra', agentUuid: UUID.astra, slot: 'Ultimate', ability: 'Cosmic Divide', source: 'wiki', reference: 'Cosmic_Divide', lengthM: 130, heightM: 10, widthM: 0.4, durationMs: 21000, render: { kind: 'wall-energy' }, tint: '#8f6fd8', estimated: ['lengthM', 'heightM', 'widthM'] },
  // O fio vai de parede a parede, até 15 m. O preset usa uma passagem típica, porque a cena não tem colisão.
  { agent: 'Cypher', agentUuid: UUID.cypher, slot: 'Grenade', ability: 'Trapwire', source: 'wiki', reference: 'Trapwire', lengthM: 7, heightM: 0.25, widthM: 0.1, durationMs: null, render: { kind: 'wall-energy' }, tint: '#9fbbdb', estimated: ['lengthM', 'heightM', 'widthM'] },

  // Áreas no chão.
  { agent: 'Astra', agentUuid: UUID.astra, slot: 'Grenade', ability: 'Gravity Well', source: 'wiki', reference: 'Gravity_Well', radiusM: 4.75, durationMs: 3250, tint: '#9a78dc' },
  { agent: 'Astra', agentUuid: UUID.astra, slot: 'Ability1', ability: 'Nova Pulse', source: 'wiki', reference: 'Nova_Pulse', radiusM: 4.75, durationMs: 3500, tint: '#c79bf0' },
  { agent: 'Brimstone', agentUuid: UUID.brimstone, slot: 'Ability1', ability: 'Incendiary', source: 'wiki', reference: 'Incendiary', radiusM: 4.5, durationMs: 8000, tint: '#ff7a3c' },
  { agent: 'Brimstone', agentUuid: UUID.brimstone, slot: 'Grenade', ability: 'Stim Beacon', source: 'wiki', reference: 'Stim_Beacon', radiusM: 6, durationMs: 12000, tint: '#f2a23a' },
  { agent: 'Brimstone', agentUuid: UUID.brimstone, slot: 'Ultimate', ability: 'Orbital Strike', source: 'wiki', reference: 'Orbital_Strike', radiusM: 9, durationMs: 5750, tint: '#ff5a2c' },
  { agent: 'Killjoy', agentUuid: UUID.killjoy, slot: 'Grenade', ability: 'Nanoswarm', source: 'wiki', reference: 'Nanoswarm', radiusM: 4.5, durationMs: 5000, tint: '#f2c94c' },
  { agent: 'Killjoy', agentUuid: UUID.killjoy, slot: 'Ultimate', ability: 'Lockdown', source: 'wiki', reference: 'Lockdown', radiusM: 32.5, durationMs: 13000, tint: '#f2c94c' },
  { agent: 'Viper', agentUuid: UUID.viper, slot: 'Grenade', ability: 'Snake Bite', source: 'wiki', reference: 'Snake_Bite', radiusM: 4.5, durationMs: 6500, tint: '#8ed14f' },
  { agent: 'Phoenix', agentUuid: UUID.phoenix, slot: 'Ability1', ability: 'Hot Hands', source: 'wiki', reference: 'Hot_Hands', radiusM: 4.5, durationMs: 4000, tint: '#ff7a3c', estimated: ['radiusM'] },
  { agent: 'Gekko', agentUuid: UUID.gekko, slot: 'Grenade', ability: 'Mosh Pit', source: 'wiki', reference: 'Mosh_Pit', radiusM: 6.2, durationMs: 6000, tint: '#a6e05a', estimated: ['durationMs'] },
  { agent: 'Sage', agentUuid: UUID.sage, slot: 'Ability1', ability: 'Slow Orb', source: 'wiki', reference: 'Slow_Orb', radiusM: 6.5, durationMs: 7000, tint: '#7fd8c9', estimated: ['radiusM'] },

  // Criaturas.
  { agent: 'Skye', agentUuid: UUID.skye, slot: 'Ability1', ability: 'Trailblazer', source: 'wiki', reference: 'Trailblazer', durationMs: 6000, trajectory: { speedMps: 8, maxTravelMs: 6000 }, render: { kind: 'creature', model: 'wolf', sense: { radiusM: 22.5 } }, tint: '#7fd36b', estimated: ['trajectory'] },
  { agent: 'Gekko', agentUuid: UUID.gekko, slot: 'Ability1', ability: 'Wingman', source: 'wiki', reference: 'Wingman', durationMs: 5000, trajectory: { speedMps: 6.3, maxTravelMs: 5000 }, render: { kind: 'creature', model: 'minion', sense: { radiusM: 15, degrees: 65 } }, tint: '#b6e85a' },
  { agent: 'Gekko', agentUuid: UUID.gekko, slot: 'Ability2', ability: 'Dizzy', source: 'estimate', durationMs: 3000, trajectory: { speedMps: 10, maxTravelMs: 1500, arcM: 3 }, render: { kind: 'creature', model: 'minion' }, tint: '#b6e85a' },
  { agent: 'Gekko', agentUuid: UUID.gekko, slot: 'Ultimate', ability: 'Thrash', source: 'estimate', durationMs: 6000, trajectory: { speedMps: 7, maxTravelMs: 4000 }, render: { kind: 'creature', model: 'minion' }, tint: '#b6e85a' },
  { agent: 'Fade', agentUuid: UUID.fade, slot: 'Grenade', ability: 'Prowler', source: 'estimate', durationMs: 4000, trajectory: { speedMps: 7, maxTravelMs: 3000 }, render: { kind: 'creature', model: 'minion' } },

  // Projéteis e drones.
  { agent: 'Sova', agentUuid: UUID.sova, slot: 'Ability2', ability: 'Recon Bolt', source: 'wiki', reference: 'Recon_Bolt', afterArrivalMs: 3200, trajectory: { speedMps: 40, arcM: 6 }, render: { kind: 'projectile', model: 'arrow', revealRadiusM: 30, pulses: { count: 2, intervalMs: 1600 } }, tint: '#4fd1c5', estimated: ['trajectory', 'afterArrivalMs'] },
  { agent: 'Sova', agentUuid: UUID.sova, slot: 'Ability1', ability: 'Shock Bolt', source: 'wiki', reference: 'Shock_Bolt', afterArrivalMs: 700, trajectory: { speedMps: 40, arcM: 6 }, render: { kind: 'projectile', model: 'arrow', impactRadiusM: 4 }, tint: '#4fd1c5', estimated: ['trajectory', 'afterArrivalMs'] },
  { agent: 'Sova', agentUuid: UUID.sova, slot: 'Grenade', ability: 'Owl Drone', source: 'wiki', reference: 'Owl_Drone', durationMs: 7000, offset: { liftM: 2.5 }, trajectory: { speedMps: 8, maxTravelMs: 7000 }, render: { kind: 'projectile', model: 'drone' }, tint: '#4fd1c5', estimated: ['trajectory', 'offset'] },
  { agent: 'Sova', agentUuid: UUID.sova, slot: 'Ultimate', ability: "Hunter's Fury", source: 'estimate', durationMs: 6000, trajectory: { travelMs: 300 }, render: { kind: 'trail' }, tint: '#4fd1c5' },
  { agent: 'Skye', agentUuid: UUID.skye, slot: 'Ability2', ability: 'Guiding Light', source: 'estimate', durationMs: 2000, trajectory: { speedMps: 15, maxTravelMs: 2000, arcM: 3 }, render: { kind: 'projectile', model: 'orb' }, tint: '#e6d36b' },
  { agent: 'Omen', agentUuid: UUID.omen, slot: 'Ability1', ability: 'Paranoia', source: 'estimate', durationMs: 2500, trajectory: { speedMps: 16, maxTravelMs: 2000 }, render: { kind: 'projectile', model: 'orb' }, tint: '#6d5c9e' },

  // Dispositivos.
  { agent: 'Killjoy', agentUuid: UUID.killjoy, slot: 'Ability2', ability: 'Turret', source: 'wiki', reference: 'Turret', durationMs: null, render: { kind: 'device', model: 'turret', cone: { degrees: 100, rangeM: 20, outerRangeM: 35 } }, tint: '#f2c94c' },
  { agent: 'Killjoy', agentUuid: UUID.killjoy, slot: 'Ability1', ability: 'Alarmbot', source: 'wiki', reference: 'Alarmbot', durationMs: null, render: { kind: 'device', model: 'alarm-bot', detectRadiusM: 5.5 }, tint: '#f2c94c' },
];

const rowCache = new Map<string, CalibrationRow>();
for (const row of CALIBRATION) rowCache.set(`${row.agentUuid}|${row.slot}`, row);

export const calibrationRow = (agentUuid: string, slot: string): CalibrationRow | undefined => rowCache.get(`${agentUuid}|${slot}`);
