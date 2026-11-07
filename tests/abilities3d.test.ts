import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BufferGeometry } from 'three';
import { abilityDefinition, presetSummary, resolveRender, utilityDefinition, type AbilityRender } from '@/modules/abilities/definitions';
import { isPlaceableSlot } from '@/modules/abilities/taxonomy';
import { utilityBarEndMs, utilityPathHeading, utilityTravelEndMs } from '@/modules/abilities/timeline';
import type { Catalog } from '@/modules/catalog/types';
import { contentEndMs } from '@/modules/timeline/simulate';
import { strategyDocSchema, parseStrategy, SCHEMA_VERSION, utilitySchema } from '@/modules/strategy/schema';
import { triangleCount } from '@/modules/viewer3d/lowpoly';
import { AGENT_MODELS, agentGeometry, agentModelFor } from '@/modules/viewer3d/agents/agentModels';
import { ABILITY_MODEL_IDS, abilityModelGeometry, segmentedWallGeometry, smokeVolumeGeometry } from '@/modules/viewer3d/abilities/abilityMeshes';
import { emptyDoc, FRAME } from './helpers';

const catalog = JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'catalog.json'), 'utf8')) as Catalog;
const uuid = (name: string) => catalog.agents.find((agent) => agent.displayName === name)!.uuid;

const hasValidVertices = (geometry: BufferGeometry) => {
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count * 3; i++) {
    if (!Number.isFinite(positions.array[i])) return false;
  }
  return true;
};

describe('definições canônicas', () => {
  const placeable = catalog.agents.flatMap((agent) =>
    agent.abilities.filter((ability) => isPlaceableSlot(ability.slot)).map((ability) => [`${agent.displayName} ${ability.slot}`, agent.uuid, ability.slot] as const),
  );

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

  it('cobre os exemplos prioritários com a representação certa', () => {
    expect(abilityDefinition(uuid('Skye'), 'Ability1').render).toEqual({ kind: 'creature', model: 'wolf' });
    expect(abilityDefinition(uuid('Gekko'), 'Ability1').render).toEqual({ kind: 'creature', model: 'minion' });
    expect(abilityDefinition(uuid('Sova'), 'Ability2').render).toMatchObject({ kind: 'projectile', model: 'arrow' });
    expect(abilityDefinition(uuid('Sage'), 'Grenade').render).toEqual({ kind: 'wall-solid', segments: 5 });
    expect(abilityDefinition(uuid('Killjoy'), 'Ability1').render).toEqual({ kind: 'device', model: 'alarm-bot' });
    expect(abilityDefinition(uuid('Killjoy'), 'Ability2').render).toEqual({ kind: 'device', model: 'turret' });
    for (const name of ['Omen', 'Brimstone', 'Astra']) {
      expect(abilityDefinition(uuid(name), 'Ability2').render.kind).toBe('smoke-volume');
    }
  });

  it('o resumo do preset é só leitura e descreve tamanho e tempo', () => {
    expect(presetSummary(abilityDefinition(uuid('Omen'), 'Ability2'))).toBe('raio de 4,1 m, 15 s visível');
    expect(presetSummary(abilityDefinition(uuid('Killjoy'), 'Ability2'))).toBe('até o fim da estratégia');
  });

  it('agente desconhecido usa um preset seguro, sem categoria inventada', () => {
    const definition = abilityDefinition('agente-novo', 'Ability1');
    expect(definition).toMatchObject({ category: 'other', placement: 'marker', classified: false });
    expect(definition.render.kind).toBe('device');
  });

  it('a forma salva decide o renderizador se a classificação tiver mudado', () => {
    const smoke = abilityDefinition(uuid('Omen'), 'Ability2');
    expect(resolveRender(smoke, 'circle')).toBe(smoke.render);
    expect(resolveRender(smoke, 'wall').kind).toBe('wall-energy');
  });
});

describe('comportamento na timeline', () => {
  const base = { id: 'u', ownerTokenId: null, timeMs: 1000, note: '' };
  const smoke = { ...base, agentUuid: uuid('Omen'), abilitySlot: 'Ability2', shape: { type: 'circle' as const, center: { x: 0.5, y: 0.5 } } };
  const bolt = { ...base, agentUuid: uuid('Sova'), abilitySlot: 'Ability2', shape: { type: 'path' as const, curved: false, points: [{ x: 0, y: 0 }, { x: 0, y: 1 }] } };

  it('a faixa termina no fim do preset, e o tempo visível não estende a timeline', () => {
    expect(utilityBarEndMs(smoke)).toBe(1000 + utilityDefinition(smoke).timing.durationMs!);
    expect(utilityTravelEndMs(smoke)).toBe(1000);
    expect(contentEndMs(emptyDoc({ utilities: { u: smoke } }), FRAME)).toBe(1000);
    expect(contentEndMs(emptyDoc({ utilities: { u: bolt } }), FRAME)).toBe(1000 + utilityDefinition(bolt).timing.travelMs);
  });

  it('o modelo aponta no sentido do percurso', () => {
    expect(utilityPathHeading(bolt, 0.5)).toBeCloseTo(Math.PI / 2);
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
    // O equipamento fica nas costas, então a frente é +X: o visor sai do lado positivo da cabeça.
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

  it('o volume de smoke segue o raio e a altura do preset, com a base no chão', () => {
    const geometry = smokeVolumeGeometry(4.1, 6.5);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    expect(bounds.max.y).toBeCloseTo(6.5);
    expect(bounds.min.y).toBeCloseTo(0);
    expect(bounds.max.x).toBeCloseTo(4.1, 1);
    expect(triangleCount(geometry)).toBeLessThan(250);
  });

  it('a parede sólida tem o comprimento do preset, dividido em blocos', () => {
    const geometry = segmentedWallGeometry(12, 3.2, 0.9, 5, '#62c6ff');
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(12 - 0.06, 1);
    expect(bounds.min.y).toBeCloseTo(0);
    expect(triangleCount(geometry)).toBe(5 * 2 * 12);
  });
});
