import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { linkEndpoints, nearestWallAnchor, throughWall } from '@/modules/abilities/anchoring';
import { CALIBRATION } from '@/modules/abilities/calibration';
import { abilityDefinition, presetSummary, utilityDefinition } from '@/modules/abilities/definitions';
import { directionalStrip, linkWireEnds, wallBurstShape } from '@/modules/abilities/shapes';
import { classifyAbility } from '@/modules/abilities/taxonomy';
import type { Catalog } from '@/modules/catalog/types';
import { distanceMeters } from '@/modules/coordinates';
import { editorStore, initialEditorState } from '@/modules/editor/editorStore';
import { armAgent, armUtility, interaction } from '@/modules/editor/interaction';
import { applyTacticalLayout, parseGeometry } from '@/modules/maps/geometry';
import { ASCENT_LAYOUT } from '@/modules/maps/tactical/ascent';
import { docActions, docStore } from '@/modules/strategy/docStore';
import { playbackActions } from '@/modules/timeline/playbackStore';
import { toast } from '@/ui/toastStore';
import { emptyDoc } from './helpers';

const catalog = JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'catalog.json'), 'utf8')) as Catalog;
const uuid = (name: string) => catalog.agents.find((agent) => agent.displayName === name)!.uuid;
const ascent = applyTacticalLayout(parseGeometry(JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'maps', `${ASCENT_LAYOUT.mapId}.json`), 'utf8'))), ASCENT_LAYOUT);
const mask = ascent.heights;
const frame = ascent.frame;

// Parede fina perto do Meio Nicho: piso dos dois lados, a 2,2 m de distância.
const NEAR_THIN_WALL = { x: 0.45, y: 0.35 };
// Corredor do B Principal: as paredes ficam a cerca de 6,6 m uma da outra.
const CORRIDOR = { x: 0.39, y: 0.7 };
// Meio da área de surgimento atacante: nenhuma parede a menos de 3 m.
const OPEN_FLOOR = { x: 0.83, y: 0.56 };

describe('geometria de ancoragem', () => {
  it('acha a face da parede mais próxima e a direção que sai dela', () => {
    const wall = nearestWallAnchor(NEAR_THIN_WALL, mask, frame, 3)!;
    expect(wall).not.toBeNull();
    expect(wall.point.x).toBeLessThan(NEAR_THIN_WALL.x);
    expect(Math.cos(wall.normal)).toBeGreaterThan(0.9);
    expect(mask.isFloorCell(Math.floor(wall.point.x * mask.size), Math.floor(wall.point.y * mask.size))).toBe(true);
  });

  it('não acha parede no meio de uma área aberta', () => {
    expect(nearestWallAnchor(OPEN_FLOOR, mask, frame, 3)).toBeNull();
  });

  it('atravessa a parede e sai do outro lado, dentro do limite de profundidade', () => {
    const wall = nearestWallAnchor(NEAR_THIN_WALL, mask, frame, 3)!;
    const crossing = throughWall(wall.point, wall.normal + Math.PI, mask, frame, 10)!;
    expect(crossing).not.toBeNull();
    expect(crossing.depthM).toBeGreaterThan(1);
    expect(crossing.depthM).toBeLessThan(4);
    expect(crossing.exit.x).toBeLessThan(wall.point.x);
    expect(throughWall(wall.point, wall.normal + Math.PI, mask, frame, 1)).toBeNull();
    // De costas para a parede, não há o que atravessar.
    expect(throughWall(wall.point, wall.normal, mask, frame, 10)).toBeNull();
  });

  it('o fio vai de parede a parede e respeita o comprimento máximo', () => {
    const link = linkEndpoints(CORRIDOR, 0, mask, frame, 15);
    expect(link.anchored).toBe(true);
    const length = distanceMeters(link.ends[0], link.ends[1], frame);
    expect(length).toBeGreaterThan(5);
    expect(length).toBeLessThan(8);
    const tooShort = linkEndpoints(CORRIDOR, 0, mask, frame, 4);
    expect(tooShort.anchored).toBe(false);
    expect(distanceMeters(tooShort.ends[0], tooShort.ends[1], frame)).toBeCloseTo(4, 1);
  });
});

describe('tipos de ancoragem', () => {
  it('cada linha da tabela tem uma ancoragem válida e compatível com a forma', () => {
    const allowed: Record<string, string[]> = {
      circle: ['ground'],
      wall: ['ground', 'link'],
      path: ['ground', 'projectile', 'path'],
      marker: ['wall', 'surface', 'placement'],
    };
    for (const row of CALIBRATION) {
      const definition = abilityDefinition(row.agentUuid, row.slot);
      expect(allowed[classifyAbility(row.agentUuid, row.slot).shape], `${row.agent} ${row.ability}`).toContain(definition.anchor);
    }
  });

  it('o Breach usa parede nas cargas e faixa a partir dele nas outras', () => {
    expect(abilityDefinition(uuid('Breach'), 'Grenade')).toMatchObject({ anchor: 'wall', placement: 'marker', render: { kind: 'wall-burst', effect: 'blast', lengthM: 10, radiusM: 3 } });
    expect(abilityDefinition(uuid('Breach'), 'Ability1')).toMatchObject({ anchor: 'wall', render: { kind: 'wall-burst', effect: 'flash' } });
    expect(abilityDefinition(uuid('Breach'), 'Ability2')).toMatchObject({ anchor: 'ground', render: { kind: 'directional-area', startM: 8, minLengthM: 8, lengthM: 56, widthM: 8, aimed: true } });
    expect(abilityDefinition(uuid('Breach'), 'Ultimate')).toMatchObject({ render: { kind: 'directional-area', lengthM: 32, widthM: 18, aimed: false } });
  });

  it('câmera, sensor e Arc Rose ficam presos em superfície; o fio do Cypher liga paredes', () => {
    expect(abilityDefinition(uuid('Cypher'), 'Ability2').anchor).toBe('surface');
    expect(abilityDefinition(uuid('Deadlock'), 'Ability1').anchor).toBe('surface');
    expect(abilityDefinition(uuid('Vyse'), 'Ability2').anchor).toBe('surface');
    expect(abilityDefinition(uuid('Cypher'), 'Grenade')).toMatchObject({ anchor: 'link', render: { kind: 'link-wire', maxLengthM: 15 } });
    expect(abilityDefinition(uuid('Killjoy'), 'Ability2').anchor).toBe('placement');
    expect(abilityDefinition(uuid('Omen'), 'Ability2').anchor).toBe('ground');
    expect(abilityDefinition(uuid('Sova'), 'Ability2').anchor).toBe('projectile');
    expect(abilityDefinition(uuid('Gekko'), 'Ability1').anchor).toBe('path');
  });

  it('o resumo descreve a parede, a faixa e o fio', () => {
    expect(presetSummary(abilityDefinition(uuid('Breach'), 'Grenade'))).toContain('atravessa até 10 m de parede');
    expect(presetSummary(abilityDefinition(uuid('Breach'), 'Ability2'))).toContain('de 8 a 56 m');
    expect(presetSummary(abilityDefinition(uuid('Cypher'), 'Grenade'))).toContain('de parede a parede');
  });
});

describe('formas derivadas', () => {
  const base = { id: 'u', ownerTokenId: null, timeMs: 0, note: '' };

  it('a Aftershock forma o cilindro de 10 × 3 m do outro lado da parede', () => {
    const wall = nearestWallAnchor(NEAR_THIN_WALL, mask, frame, 3)!;
    const utility = { ...base, agentUuid: uuid('Breach'), abilitySlot: 'Grenade', shape: { type: 'marker' as const, point: wall.point, facing: wall.normal + Math.PI } };
    const burst = wallBurstShape(utility, utilityDefinition(utility), mask, frame)!;
    expect(burst.crossing).not.toBeNull();
    expect(burst.area).toHaveLength(4);
    expect(distanceMeters(burst.area[0]!, burst.area[1]!, frame)).toBeCloseTo(10, 1);
    expect(distanceMeters(burst.area[1]!, burst.area[2]!, frame)).toBeCloseTo(6, 1);
    // A área começa depois da parede, não no ponto de colocação.
    expect(Math.min(burst.area[0]!.x, burst.area[3]!.x)).toBeLessThan(wall.point.x);
  });

  it('a Aftershock salva como círculo no chão vai para a parede mais próxima', () => {
    const utility = { ...base, agentUuid: uuid('Breach'), abilitySlot: 'Grenade', shape: { type: 'circle' as const, center: NEAR_THIN_WALL } };
    const burst = wallBurstShape(utility, utilityDefinition(utility), mask, frame)!;
    expect(burst.anchor.x).toBeLessThan(NEAR_THIN_WALL.x);
    expect(burst.crossing).not.toBeNull();
  });

  it('a Fault Line começa 8 m à frente do Breach e o alvo define o comprimento, de 8 a 56 m', () => {
    const at = (meters: number) => ({ ...base, agentUuid: uuid('Breach'), abilitySlot: 'Ability2', shape: { type: 'path' as const, curved: false, points: [{ x: 0.3, y: 0.5 }, { x: 0.3 + meters / frame.worldMeters, y: 0.5 }] } });
    const strip = (meters: number) => directionalStrip(at(meters), utilityDefinition(at(meters)), frame)!;
    expect(distanceMeters(strip(30).origin, strip(30).start, frame)).toBeCloseTo(8, 3);
    expect(strip(30).lengthM).toBeCloseTo(22, 3);
    expect(strip(5).lengthM).toBe(8);
    expect(strip(200).lengthM).toBe(56);
    expect(strip(30).widthM).toBe(8);
  });

  it('a Rolling Thunder tem tamanho fixo, só a direção muda', () => {
    const utility = { ...base, agentUuid: uuid('Breach'), abilitySlot: 'Ultimate', shape: { type: 'path' as const, curved: false, points: [{ x: 0.3, y: 0.5 }, { x: 0.31, y: 0.5 }] } };
    expect(directionalStrip(utility, utilityDefinition(utility), frame)!.lengthM).toBe(32);
  });

  it('o fio usa as paredes do mapa, e sem mapa usa o comprimento máximo', () => {
    const utility = { ...base, agentUuid: uuid('Cypher'), abilitySlot: 'Grenade', shape: { type: 'wall' as const, center: CORRIDOR, facing: 0 } };
    expect(linkWireEnds(utility, utilityDefinition(utility), mask, frame)!.anchored).toBe(true);
    const free = linkWireEnds(utility, utilityDefinition(utility), null, frame)!;
    expect(distanceMeters(free.ends[0], free.ends[1], frame)).toBeCloseTo(15, 1);
  });
});

describe('posicionamento no editor', () => {
  const doc = () => docStore.getState().doc!;
  const click = (point: { x: number; y: number }) => {
    interaction.down(point, null);
    interaction.up(point);
  };

  beforeEach(() => {
    editorStore.setState({ ...initialEditorState(), frame, map: ascent });
    docActions.load(emptyDoc());
    playbackActions.reset();
    vi.restoreAllMocks();
  });

  it('a carga do Breach fica na parede, mirando a partir dele', () => {
    armAgent(uuid('Breach'), 'attack');
    click({ x: 0.48, y: 0.35 });
    const owner = Object.keys(doc().agents)[0]!;
    armUtility(uuid('Breach'), 'Grenade', owner);
    click(NEAR_THIN_WALL);
    const [utility] = Object.values(doc().utilities);
    expect(utility!.shape.type).toBe('marker');
    if (utility!.shape.type !== 'marker') return;
    expect(utility!.shape.point.x).toBeLessThan(NEAR_THIN_WALL.x);
    expect(Math.cos(utility!.shape.facing!)).toBeLessThan(-0.9);
  });

  it('longe de parede, a habilidade de parede não é colocada solta no chão', () => {
    const info = vi.spyOn(toast, 'info');
    armUtility(uuid('Breach'), 'Grenade', null);
    click(OPEN_FLOOR);
    expect(Object.keys(doc().utilities)).toHaveLength(0);
    expect(info.mock.calls.flat().join(' ')).toContain('parede');
  });

  it('fora do alcance de 35 m do Breach, a carga não é colocada', () => {
    const info = vi.spyOn(toast, 'info');
    armAgent(uuid('Breach'), 'attack');
    click({ x: 0.83, y: 0.56 });
    const owner = Object.keys(doc().agents)[0]!;
    armUtility(uuid('Breach'), 'Grenade', owner);
    click(NEAR_THIN_WALL);
    expect(Object.keys(doc().utilities)).toHaveLength(0);
    expect(info.mock.calls.flat().join(' ')).toContain('alcance');
  });

  it('a câmera do Cypher fica presa na parede, olhando para fora dela', () => {
    armUtility(uuid('Cypher'), 'Ability2', null);
    click(NEAR_THIN_WALL);
    const [utility] = Object.values(doc().utilities);
    expect(utility!.shape.type === 'marker' && Math.cos(utility!.shape.facing!)).toBeGreaterThan(0.9);
  });

  it('arrastar uma habilidade presa mantém ela na parede', () => {
    armUtility(uuid('Cypher'), 'Ability2', null);
    click(NEAR_THIN_WALL);
    const [placed] = Object.values(doc().utilities);
    const start = placed!.shape.type === 'marker' ? placed!.shape.point : NEAR_THIN_WALL;
    interaction.down(start, { kind: 'entity', ref: { c: 'utilities', id: placed!.id } });
    interaction.move({ x: start.x + 0.03, y: start.y });
    interaction.up({ x: start.x + 0.03, y: start.y });
    const moved = doc().utilities[placed!.id]!;
    expect(moved.shape.type === 'marker' && nearestWallAnchor(moved.shape.point, mask, frame, 0.5)).not.toBeNull();
  });

  it('a Fault Line sai do Breach e termina com um clique no alvo', () => {
    armAgent(uuid('Breach'), 'attack');
    click({ x: 0.5, y: 0.5 });
    const owner = Object.keys(doc().agents)[0]!;
    armUtility(uuid('Breach'), 'Ability2', owner);
    click({ x: 0.7, y: 0.5 });
    const [utility] = Object.values(doc().utilities);
    expect(utility!.shape).toMatchObject({ type: 'path', points: [{ x: 0.5, y: 0.5 }, { x: 0.7, y: 0.5 }] });
    expect(editorStore.getState().tool).toBe('select');
  });
});
