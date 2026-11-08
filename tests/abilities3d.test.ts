import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BufferGeometry } from 'three';
import { CALIBRATION, CATEGORY_CALIBRATION, calibrationRow } from '@/modules/abilities/calibration';
import { abilityDefinition, definitionColor, presetSummary, resolveRender, utilityDefinition, type AbilityRender } from '@/modules/abilities/definitions';
import { abilityWallLines } from '@/modules/abilities/shapes';
import { classifyAbility, isPlaceableSlot } from '@/modules/abilities/taxonomy';
import { pulsePhase, utilityBarEndMs, utilityPathHeading, utilityStateAt, utilityTravelEndMs, utilityTravelMs } from '@/modules/abilities/timeline';
import type { Catalog } from '@/modules/catalog/types';
import { distanceMeters } from '@/modules/coordinates';
import { contentEndMs } from '@/modules/timeline/simulate';
import { strategyDocSchema, parseStrategy, SCHEMA_VERSION, utilitySchema } from '@/modules/strategy/schema';
import { triangleCount } from '@/modules/viewer3d/lowpoly';
import { AGENT_MODELS, agentGeometry, agentModelFor } from '@/modules/viewer3d/agents/agentModels';
import { ABILITY_MODEL_IDS, abilityModelGeometry, segmentedWallGeometry, unitVolumeGeometry, volumeTransform } from '@/modules/viewer3d/abilities/abilityMeshes';
import { deployScale } from '@/modules/viewer3d/abilities/Utility3D';
import { emptyDoc, FRAME } from './helpers';

const catalog = JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'catalog.json'), 'utf8')) as Catalog;
const uuid = (name: string) => catalog.agents.find((agent) => agent.displayName === name)!.uuid;
const def = (name: string, slot: string) => abilityDefinition(uuid(name), slot);

const hasValidVertices = (geometry: BufferGeometry) => {
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count * 3; i++) {
    if (!Number.isFinite(positions.array[i])) return false;
  }
  return true;
};

const placeable = catalog.agents.flatMap((agent) =>
  agent.abilities.filter((ability) => isPlaceableSlot(ability.slot)).map((ability) => [`${agent.displayName} ${ability.slot}`, agent.uuid, ability.slot] as const),
);

describe('tabela de calibração', () => {
  it('toda linha aponta para uma habilidade real, com nome, origem e sem duplicata', () => {
    const keys = new Set<string>();
    for (const row of CALIBRATION) {
      const agent = catalog.agents.find((item) => item.uuid === row.agentUuid);
      expect(agent?.displayName, row.ability).toBe(row.agent);
      expect(agent!.abilities.some((ability) => ability.slot === row.slot), row.ability).toBe(true);
      expect(classifyAbility(row.agentUuid, row.slot).classified, row.ability).toBe(true);
      expect(row.ability.length).toBeGreaterThan(2);
      if (row.source === 'wiki') expect(row.reference, row.ability).toBeTruthy();
      const key = `${row.agentUuid}|${row.slot}`;
      expect(keys.has(key), `${row.agent} ${row.slot} repetida`).toBe(false);
      keys.add(key);
    }
  });

  it('a renderização de cada linha combina com a forma de posicionamento da habilidade', () => {
    const allowed: Record<string, Array<AbilityRender['kind']>> = {
      circle: ['smoke-volume', 'ground-area'],
      wall: ['wall-solid', 'wall-energy'],
      path: ['projectile', 'creature', 'trail'],
      marker: ['device'],
    };
    for (const row of CALIBRATION.filter((item) => item.render)) {
      expect(allowed[classifyAbility(row.agentUuid, row.slot).shape], `${row.agent} ${row.ability}`).toContain(row.render!.kind);
    }
  });

  it('os padrões de categoria têm tamanhos coerentes entre si', () => {
    expect(CATEGORY_CALIBRATION.smoke.radiusM).toBeGreaterThanOrEqual(3.5);
    expect(CATEGORY_CALIBRATION.smoke.radiusM).toBeLessThanOrEqual(5);
    expect(CATEGORY_CALIBRATION.smoke.heightM / CATEGORY_CALIBRATION.smoke.radiusM).toBeLessThanOrEqual(1.3);
    expect(CATEGORY_CALIBRATION.molotov.radiusM).toBeLessThanOrEqual(5);
    expect(CATEGORY_CALIBRATION.area.radiusM).toBeLessThanOrEqual(6);
    expect(CATEGORY_CALIBRATION.wall.heightM).toBeLessThanOrEqual(5);
  });
});

describe('smokes de referência', () => {
  const astra = def('Astra', 'Ability2');
  const omen = def('Omen', 'Ability2');
  const brimstone = def('Brimstone', 'Ability2');

  it('usam os raios e as durações do wiki oficial', () => {
    expect(astra.size.radiusM).toBe(4.75);
    expect(omen.size.radiusM).toBe(4.1);
    expect(brimstone.size.radiusM).toBe(4.15);
    expect([astra.timing.durationMs, omen.timing.durationMs, brimstone.timing.durationMs]).toEqual([14250, 15000, 19250]);
    for (const smoke of [astra, omen, brimstone]) expect(smoke.source).toBe('wiki');
  });

  it('a da Astra é a maior, e Omen e Brimstone têm praticamente o mesmo tamanho', () => {
    expect(astra.size.radiusM).toBeGreaterThan(omen.size.radiusM);
    expect(astra.size.radiusM).toBeGreaterThan(brimstone.size.radiusM);
    expect(Math.abs(omen.size.radiusM - brimstone.size.radiusM)).toBeLessThan(0.1);
  });

  it('mantêm a mesma proporção de altura e cores diferentes', () => {
    const ratios = [astra, omen, brimstone].map((smoke) => smoke.size.heightM / smoke.size.radiusM);
    expect(Math.max(...ratios) - Math.min(...ratios)).toBeLessThan(0.05);
    for (const ratio of ratios) expect(ratio).toBeLessThanOrEqual(1.3);
    expect(new Set([astra, omen, brimstone].map(definitionColor)).size).toBe(3);
  });

  it('ficam no tamanho real com a timeline parada e só abrem durante a reprodução', () => {
    const atStart = { started: true, active: true, progress: 1, elapsedMs: 0, travelMs: 0 };
    expect(deployScale(atStart, false)).toBe(1);
    expect(deployScale(atStart, true)).toBeLessThan(0.5);
    expect(deployScale({ ...atStart, elapsedMs: 600 }, true)).toBe(1);
  });
});

describe('escala geral', () => {
  it.each(placeable)('%s não fica exagerada nem minúscula', (_name, agentUuid, slot) => {
    const definition = abilityDefinition(agentUuid, slot);
    const { radiusM, heightM, lengthM, thicknessM } = definition.size;
    if (definition.render.kind === 'smoke-volume') {
      expect(radiusM).toBeGreaterThanOrEqual(3);
      expect(radiusM).toBeLessThanOrEqual(definition.isUltimate ? 10 : 5);
      expect(heightM / radiusM).toBeLessThanOrEqual(1.3);
    }
    if (definition.render.kind === 'ground-area') {
      expect(radiusM).toBeGreaterThanOrEqual(2.5);
      expect(radiusM).toBeLessThanOrEqual(definition.isUltimate ? 33 : 6.5);
    }
    if (definition.placement === 'wall') {
      expect(heightM).toBeLessThanOrEqual(definition.isUltimate ? 12 : 8);
      expect(thicknessM).toBeLessThanOrEqual(1.6);
      expect(lengthM).toBeGreaterThan(0);
    }
    expect(definition.scale2d).toBeGreaterThanOrEqual(0.5);
    expect(definition.scale3d).toBeLessThanOrEqual(2);
  });

  it('a Viper deixou de ter uma ultimate com o dobro do tamanho', () => {
    expect(def('Viper', 'Ultimate').size.radiusM).toBe(9);
  });
});

describe('definições canônicas', () => {
  it.each(placeable)('%s tem preset completo e renderizador compatível', (_name, agentUuid, slot) => {
    const definition = abilityDefinition(agentUuid, slot);
    expect(definition.size.radiusM).toBeGreaterThan(0);
    expect(definition.size.lengthM).toBeGreaterThan(0);
    expect(definition.size.heightM).toBeGreaterThan(0);
    expect(definition.size.thicknessM).toBeGreaterThan(0);
    expect(definition.timing.travelMs).toBeGreaterThanOrEqual(0);
    expect(definition.approximate).toBe(true);
    const allowed: Record<typeof definition.placement, Array<AbilityRender['kind']>> = {
      circle: ['smoke-volume', 'ground-area'],
      wall: ['wall-solid', 'wall-energy'],
      path: ['projectile', 'creature', 'trail'],
      marker: ['device'],
    };
    expect(allowed[definition.placement]).toContain(definition.render.kind);
  });

  it('cobre os exemplos prioritários com os dados do wiki', () => {
    expect(def('Skye', 'Ability1').render).toEqual({ kind: 'creature', model: 'wolf', sense: { radiusM: 22.5 } });
    expect(def('Skye', 'Ability1').timing.durationMs).toBe(6000);
    expect(def('Gekko', 'Ability1').render).toEqual({ kind: 'creature', model: 'minion', sense: { radiusM: 15, degrees: 65 } });
    expect(def('Gekko', 'Ability1').trajectory.speedMps).toBe(6.3);
    expect(def('Sova', 'Ability2').render).toMatchObject({ kind: 'projectile', model: 'arrow', revealRadiusM: 30, pulses: { count: 2, intervalMs: 1600 } });
    expect(def('Sage', 'Grenade').render).toEqual({ kind: 'wall-solid', segments: 4 });
    expect(def('Sage', 'Grenade').size.lengthM).toBe(10.4);
    expect(def('Killjoy', 'Ability1').render).toEqual({ kind: 'device', model: 'alarm-bot', detectRadiusM: 5.5 });
    expect(def('Killjoy', 'Ability2').render).toMatchObject({ kind: 'device', model: 'turret', cone: { degrees: 100 } });
    expect(def('Killjoy', 'Ultimate').size.radiusM).toBe(32.5);
  });

  it('marca o que é estimativa mesmo nas linhas do wiki', () => {
    expect(def('Sage', 'Grenade').estimated).toContain('heightM');
    expect(def('Omen', 'Ability2').estimated).toEqual(['heightM']);
    expect(def('Raze', 'Ability1').source).toBe('estimate');
    expect(calibrationRow(uuid('Raze'), 'Ability1')).toBeUndefined();
  });

  it('o resumo do preset é só leitura e descreve tamanho, alcance e tempo', () => {
    expect(presetSummary(def('Omen', 'Ability2'))).toBe('raio de 4,1 m, 15 s visível');
    expect(presetSummary(def('Brimstone', 'Ability2'))).toBe('raio de 4,15 m, 19,25 s visível');
    expect(presetSummary(def('Killjoy', 'Ability2'))).toBe('cone de 100°, até o fim da estratégia');
    expect(presetSummary(def('Gekko', 'Ability1'))).toBe('6,3 m/s, 5 s visível');
  });

  it('agente desconhecido usa um preset seguro, sem categoria inventada', () => {
    const definition = abilityDefinition('agente-novo', 'Ability1');
    expect(definition).toMatchObject({ category: 'other', placement: 'marker', classified: false, source: 'estimate' });
    expect(definition.render.kind).toBe('device');
  });

  it('a forma salva decide o renderizador se a classificação tiver mudado', () => {
    const smoke = def('Omen', 'Ability2');
    expect(resolveRender(smoke, 'circle')).toBe(smoke.render);
    expect(resolveRender(smoke, 'wall').kind).toBe('wall-energy');
  });
});

describe('paredes calibradas', () => {
  const center = { x: 0.5, y: 0.5 };

  it('a Neon tem duas paredes paralelas, separadas pela distância do wiki', () => {
    const lines = abilityWallLines(center, 0, def('Neon', 'Grenade'), FRAME);
    expect(lines).toHaveLength(2);
    const [first, second] = [lines[0]!, lines[1]!];
    expect(Math.abs(second[0].y - first[0].y) * FRAME.worldMeters).toBeCloseTo(3.5);
    expect(distanceMeters(first[0], first[1], FRAME)).toBeCloseTo(46.5);
  });

  it('o Deadlock tem duas paredes cruzadas e as demais têm uma', () => {
    const [a, b] = abilityWallLines(center, 0, def('Deadlock', 'Grenade'), FRAME);
    expect(a![0].y).toBeCloseTo(a![1].y);
    expect(b![0].x).toBeCloseTo(b![1].x);
    expect(abilityWallLines(center, 0, def('Viper', 'Ability2'), FRAME)).toHaveLength(1);
  });
});

describe('comportamento na timeline', () => {
  const base = { id: 'u', ownerTokenId: null, timeMs: 1000, note: '' };
  const smoke = { ...base, agentUuid: uuid('Omen'), abilitySlot: 'Ability2', shape: { type: 'circle' as const, center: { x: 0.5, y: 0.5 } } };
  // 40 m de percurso no mapa de teste, que tem 100 m de largura.
  const path = (agent: string, slot: string, lengthUnits = 0.4) => ({ ...base, agentUuid: uuid(agent), abilitySlot: slot, shape: { type: 'path' as const, curved: false, points: [{ x: 0.1, y: 0.5 }, { x: 0.1 + lengthUnits, y: 0.5 }] } });

  it('o percurso depende da velocidade calibrada e do comprimento da trajetória', () => {
    expect(utilityTravelMs(path('Gekko', 'Ability1', 0.2), FRAME)).toBe(Math.round((20 / 6.3) * 1000));
    // O lobo tem teto de 6 s: em 80 m, a 8 m/s, levaria 10 s.
    expect(utilityTravelMs(path('Skye', 'Ability1', 0.8), FRAME)).toBe(6000);
    expect(utilityTravelMs(path('Sova', 'Ability2'), FRAME)).toBe(1000);
  });

  it('a flecha de reconhecimento fica visível pelos pulsos depois de chegar', () => {
    const bolt = path('Sova', 'Ability2');
    expect(utilityBarEndMs(bolt, FRAME)).toBe(1000 + 1000 + 3200);
    expect(utilityStateAt(bolt, 1000 + 500, FRAME).progress).toBeCloseTo(0.5);
    expect(utilityStateAt(bolt, 1000 + 4199, FRAME).active).toBe(true);
    expect(utilityStateAt(bolt, 1000 + 4201, FRAME).active).toBe(false);
    expect(pulsePhase(0, { count: 2, intervalMs: 1600 })).toBe(0);
    expect(pulsePhase(1600 + 300, { count: 2, intervalMs: 1600 })).toBeCloseTo(0.5);
    expect(pulsePhase(3200 + 100, { count: 2, intervalMs: 1600 })).toBeNull();
  });

  it('a faixa termina no fim do preset, e o tempo visível não estende a timeline', () => {
    expect(utilityBarEndMs(smoke, FRAME)).toBe(1000 + utilityDefinition(smoke).timing.durationMs!);
    expect(utilityTravelEndMs(smoke, FRAME)).toBe(1000);
    expect(contentEndMs(emptyDoc({ utilities: { u: smoke } }), FRAME)).toBe(1000);
    const bolt = path('Sova', 'Ability2');
    expect(contentEndMs(emptyDoc({ utilities: { u: bolt } }), FRAME)).toBe(1000 + utilityTravelMs(bolt, FRAME));
  });

  it('o modelo aponta no sentido do percurso', () => {
    const vertical = { ...path('Sova', 'Ability2'), shape: { type: 'path' as const, curved: false, points: [{ x: 0, y: 0 }, { x: 0, y: 1 }] } };
    expect(utilityPathHeading(vertical, 0.5)).toBeCloseTo(Math.PI / 2);
  });
});

describe('migração da versão 1', () => {
  const legacy = {
    id: 'u1',
    agentUuid: uuid('Omen'),
    abilitySlot: 'Ability2',
    ownerTokenId: null,
    category: 'smoke',
    timeMs: 500,
    durationMs: 99000,
    travelMs: 0,
    note: 'antiga',
  };

  it('descarta o tamanho salvo e mantém posição, instante e nota', () => {
    const utility = utilitySchema.parse({ ...legacy, shape: { type: 'circle', center: { x: 0.2, y: 0.3 }, radiusM: 40 } });
    expect(utility).toEqual({
      id: 'u1',
      agentUuid: legacy.agentUuid,
      abilitySlot: 'Ability2',
      ownerTokenId: null,
      timeMs: 500,
      note: 'antiga',
      shape: { type: 'circle', center: { x: 0.2, y: 0.3 } },
    });
  });

  it('converte a parede em centro e direção', () => {
    const utility = utilitySchema.parse({ ...legacy, shape: { type: 'wall', thicknessM: 3, points: [{ x: 0.1, y: 0.5 }, { x: 0.2, y: 0.5 }, { x: 0.3, y: 0.5 }] } });
    expect(utility.shape).toEqual({ type: 'wall', center: { x: 0.2, y: 0.5 }, facing: 0 });
  });

  it('abre o documento antigo como a versão atual', () => {
    const parsed = parseStrategy({ ...emptyDoc(), schemaVersion: 1, utilities: { u1: { ...legacy, shape: { type: 'circle', center: { x: 0.2, y: 0.3 }, radiusM: 40 } } } });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.doc.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('recusa versão desconhecida e parede sem dados', () => {
    expect(strategyDocSchema.safeParse({ ...emptyDoc(), schemaVersion: 99 }).success).toBe(false);
    expect(utilitySchema.safeParse({ ...legacy, shape: { type: 'wall', points: [{ x: 1, y: 1 }] } }).success).toBe(false);
  });
});

describe('modelos de agente', () => {
  it('todo agente tem um modelo, e o registro aceita modelos próprios', () => {
    for (const agent of catalog.agents) expect(AGENT_MODELS[agentModelFor(agent.uuid).id]).toBeDefined();
    expect(agentModelFor('agente-novo').id).toBe('mannequin');
  });

  it('o boneco é leve, tem a altura de uma pessoa e olha para +X', () => {
    const model = agentModelFor('qualquer');
    const geometry = agentGeometry(model, 'attack');
    expect(hasValidVertices(geometry)).toBe(true);
    expect(triangleCount(geometry)).toBeLessThan(600);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    expect(bounds.max.y).toBeGreaterThan(1.7);
    expect(bounds.max.y).toBeLessThan(2.05);
    expect(bounds.min.y).toBeCloseTo(0, 1);
    const positions = geometry.getAttribute('position');
    let frontOfHead = -Infinity;
    let backOfHead = Infinity;
    for (let i = 0; i < positions.count; i++) {
      if (positions.getY(i) > 1.6) {
        frontOfHead = Math.max(frontOfHead, positions.getX(i));
        backOfHead = Math.min(backOfHead, positions.getX(i));
      }
    }
    expect(frontOfHead).toBeGreaterThan(-backOfHead);
  });

  it('as equipes têm cores diferentes e a geometria é compartilhada', () => {
    const model = agentModelFor('qualquer');
    const attack = agentGeometry(model, 'attack');
    expect(agentGeometry(model, 'attack')).toBe(attack);
    const colorsOf = (geometry: BufferGeometry) => Array.from(geometry.getAttribute('color').array);
    expect(colorsOf(attack)).not.toEqual(colorsOf(agentGeometry(model, 'defense')));
  });
});

describe('modelos de habilidade', () => {
  it.each(ABILITY_MODEL_IDS)('%s é leve e tem geometria válida', (model) => {
    const geometry = abilityModelGeometry(model, '#ff00ff');
    expect(hasValidVertices(geometry)).toBe(true);
    expect(triangleCount(geometry)).toBeLessThan(400);
    expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
  });

  it('criaturas e dispositivos têm tamanho de objeto real, não de prédio', () => {
    const size = (model: Parameters<typeof abilityModelGeometry>[0]) => {
      const geometry = abilityModelGeometry(model, '#ffffff');
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      return { length: box.max.x - box.min.x, height: box.max.y - box.min.y };
    };
    expect(size('wolf').length).toBeGreaterThan(1);
    expect(size('wolf').length).toBeLessThan(1.8);
    expect(size('minion').height).toBeLessThan(1.1);
    expect(size('turret').height).toBeLessThan(1.3);
    expect(size('alarm-bot').height).toBeLessThan(0.9);
  });

  it('o volume de smoke tem a altura visível da calibração, com a base no chão', () => {
    const astra = def('Astra', 'Ability2');
    const { lift, scale } = volumeTransform('sphere', astra.size.radiusM, astra.size.heightM);
    expect(lift + scale[1]).toBeCloseTo(astra.size.heightM);
    expect(scale[0]).toBe(astra.size.radiusM);
    const dome = volumeTransform('dome', 4.6, 4.6);
    expect(dome).toEqual({ lift: 0, scale: [4.6, 4.6, 4.6] });
    expect(triangleCount(unitVolumeGeometry('sphere'))).toBeLessThan(400);
  });

  it('a parede da Sage tem 4 blocos e o comprimento do wiki', () => {
    const sage = def('Sage', 'Grenade');
    const geometry = segmentedWallGeometry(sage.size.lengthM, sage.size.heightM, sage.size.thicknessM, 4, '#bfe6f2');
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(10.4 - 0.08, 1);
    expect(bounds.max.y).toBeCloseTo(sage.size.heightM, 1);
    expect(bounds.min.y).toBeCloseTo(0);
    expect(segmentedWallGeometry(sage.size.lengthM, sage.size.heightM, sage.size.thicknessM, 4, '#bfe6f2')).toBe(geometry);
  });
});
