import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyTacticalLayout, parseGeometry, type LoadedMapGeometry } from '@/modules/maps/geometry';
import { ASCENT_LAYOUT } from '@/modules/maps/tactical/ascent';
import { BIND_LAYOUT } from '@/modules/maps/tactical/bind';
import { HAVEN_LAYOUT } from '@/modules/maps/tactical/haven';
import { hasTacticalLayout, loadTacticalLayout } from '@/modules/maps/tactical';
import type { TacticalLayout } from '@/modules/maps/tactical/types';
import { buildSolidsGeometry, buildVoidCaps } from '@/modules/viewer3d/mapMeshes';
import type { StructuredHeightField } from '@/modules/maps/terrain';
import { buildScenario, disposeScenario } from '@/modules/viewer3d/scenario';

const dir = join(process.cwd(), 'public', 'data', 'maps');
const maps: LoadedMapGeometry[] = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => parseGeometry(JSON.parse(readFileSync(join(dir, f), 'utf8'))));

const LAYOUTS: TacticalLayout[] = [ASCENT_LAYOUT, BIND_LAYOUT, HAVEN_LAYOUT];
const baseOf = (layout: TacticalLayout) => maps.find((m) => m.geometry.mapId === layout.mapId)!;
const cases = LAYOUTS.map((layout) => [layout.name, layout] as const);

const center = (ring: number[]) => {
  let x = 0;
  let y = 0;
  for (let i = 0; i < ring.length; i += 2) {
    x += ring[i]! / (ring.length / 2);
    y += ring[i + 1]! / (ring.length / 2);
  }
  return { x, y };
};

const isFloor = (map: LoadedMapGeometry, x: number, y: number) => map.heights.isFloorCell(Math.floor(x * map.heights.size), Math.floor(y * map.heights.size));

describe('registro dos layouts táticos', () => {
  it.each(cases)('%s está registrado para o UUID certo e carrega sob demanda', async (_name, layout) => {
    expect(baseOf(layout).geometry.name).toBe(layout.name);
    expect(hasTacticalLayout(layout.mapId)).toBe(true);
    expect(await loadTacticalLayout(layout.mapId)).toBe(layout);
  });

  it('os outros mapas seguem só com a geometria gerada', async () => {
    const others = maps.filter((m) => !LAYOUTS.some((layout) => layout.mapId === m.geometry.mapId));
    expect(others.length).toBeGreaterThan(10);
    for (const map of others) {
      expect(hasTacticalLayout(map.geometry.mapId)).toBe(false);
      expect(await loadTacticalLayout(map.geometry.mapId)).toBeNull();
    }
  });

  it('o piloto tem coberturas de todos os tipos, escadas e entradas em cada site', () => {
    const kinds = new Set(ASCENT_LAYOUT.solids.map((solid) => solid.kind));
    expect([...kinds].sort()).toEqual(['barrier', 'cover', 'crate', 'door', 'pillar', 'structure']);
    expect(ASCENT_LAYOUT.solids.length).toBeGreaterThan(40);
    expect(ASCENT_LAYOUT.ramps.filter((ramp) => ramp.kind === 'stairs').length).toBeGreaterThanOrEqual(1);
  });
});

describe.each(cases)('layout de %s', (_name, layout) => {
  const base = baseOf(layout);
  const map = applyTacticalLayout(base, layout);

  it('tem coberturas e paredes com altura plausível, dentro do mapa', () => {
    expect(layout.solids.length).toBeGreaterThan(20);
    expect(layout.wallHeightM).toBeGreaterThanOrEqual(5);
    for (const solid of layout.solids) {
      expect(solid.heightM).toBeGreaterThan(0.5);
      expect(solid.heightM).toBeLessThan(layout.wallHeightM + 0.01);
      for (const value of solid.ring) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it('as caixas estão junto ao piso, não no meio de um vazio', () => {
    // O gerador marca a área contornada como "não piso", então o centro de uma caixa legítima pode
    // não ser piso. O que importa é haver piso logo em volta.
    const margin = 4 / base.heights.size;
    const misplaced = layout.solids.filter((solid) => solid.kind === 'crate').filter((solid) => {
      const { x, y } = center(solid.ring);
      return ![[0, 0], [margin, 0], [-margin, 0], [0, margin], [0, -margin]].some(([dx, dy]) => isFloor(base, x + dx!, y + dy!));
    });
    expect(misplaced.map((solid) => solid.ring.slice(0, 2).map((v) => Math.round(v * 1024)))).toEqual([]);
  });

  it('todo site tem cobertura e entrada perto dele', () => {
    for (const site of base.geometry.sites) {
      // O gerador recorta as caixas do polígono do site, então a conta usa a área envolvente dele.
      const ring = site.polygons[0]![0]!;
      const xs = ring.filter((_, i) => i % 2 === 0);
      const ys = ring.filter((_, i) => i % 2 === 1);
      const covers = layout.solids.filter((solid) => {
        const { x, y } = center(solid.ring);
        return x >= Math.min(...xs) && x <= Math.max(...xs) && y >= Math.min(...ys) && y <= Math.max(...ys);
      });
      expect(covers.length, `site ${site.label}`).toBeGreaterThanOrEqual(1);
      const entrances = layout.entrances.filter((entrance) => entrance.site === site.label);
      expect(entrances.length, `entradas do site ${site.label}`).toBeGreaterThanOrEqual(2);
      for (const entrance of entrances) {
        const middle = { x: (entrance.from.x + entrance.to.x) / 2, y: (entrance.from.y + entrance.to.y) / 2 };
        const meters = Math.hypot(middle.x - site.center.x, middle.y - site.center.y) * base.frame.worldMeters;
        expect(meters, `entrada do site ${site.label}`).toBeLessThan(30);
      }
    }
    expect(new Set(layout.entrances.map((entrance) => entrance.site))).toEqual(new Set(base.geometry.sites.map((site) => site.label)));
  });

  it('as rampas sobem de forma contínua, de um platô ao outro', () => {
    expect(layout.ramps.length).toBeGreaterThanOrEqual(1);
    const terrain = map.heights as StructuredHeightField;
    expect(terrain.slopes).toHaveLength(layout.ramps.length);
    for (const slope of terrain.slopes) {
      const samples = Array.from({ length: 9 }, (_, i) => {
        const t = 0.1 + (0.8 * i) / 8;
        return map.heights.heightAt({ x: slope.from.x + (slope.to.x - slope.from.x) * t, y: slope.from.y + (slope.to.y - slope.from.y) * t });
      });
      const direction = Math.sign(slope.toM - slope.fromM);
      for (let i = 1; i < samples.length; i++) {
        expect((samples[i]! - samples[i - 1]!) * direction, `rampa de ${slope.fromM} a ${slope.toM}`).toBeGreaterThanOrEqual(-1e-6);
      }
      // Cada ponta emenda no platô logo depois dela, sem degrau.
      const unit = { x: (slope.to.x - slope.from.x) / Math.hypot(slope.to.x - slope.from.x, slope.to.y - slope.from.y), y: (slope.to.y - slope.from.y) / Math.hypot(slope.to.x - slope.from.x, slope.to.y - slope.from.y) };
      const cell = 1 / terrain.size;
      const outside = (p: { x: number; y: number }, sign: number) => ({ x: p.x + unit.x * sign * cell * 1.5, y: p.y + unit.y * sign * cell * 1.5 });
      const before = outside(slope.from, -1);
      const after = outside(slope.to, 1);
      if (terrain.kindAt(before) === 1) expect(terrain.heightAt(before)).toBeCloseTo(slope.fromM, 0);
      if (terrain.kindAt(after) === 1) expect(terrain.heightAt(after)).toBeCloseTo(slope.toM, 0);
      expect(Math.abs(slope.toM - slope.fromM)).toBeGreaterThan(0.5);
    }
  });

  it('monta o cenário tático leve, sem as coberturas geradas', () => {
    const scenario = buildScenario(map);
    expect(scenario.detail).toBe('tactical');
    expect(scenario.boxes).toBeNull();
    expect(scenario.rails).toBeNull();
    expect(scenario.stats.solids).toBe(layout.solids.length);
    expect(scenario.stats.entrances).toBe(layout.entrances.length);
    for (const geometry of [scenario.floor, scenario.walls, scenario.solids!, scenario.thresholds!]) {
      expect(geometry.getAttribute('position').count).toBeLessThan(45000);
    }
    expect(scenario.ledges!.getAttribute('position').count).toBeGreaterThan(0);
    expect(scenario.edges!.getAttribute('position').count).toBeLessThan(40000);
    disposeScenario(scenario);
  });
});

describe('terreno do piloto', () => {
  const base = baseOf(ASCENT_LAYOUT);
  const ascent = applyTacticalLayout(base, ASCENT_LAYOUT);

  it('não altera o campo original', () => {
    expect(ascent.heights).not.toBe(base.heights);
    const reloaded = parseGeometry(JSON.parse(readFileSync(join(dir, `${base.geometry.mapId}.json`), 'utf8')));
    expect(reloaded.heights.heightAt({ x: 0.5, y: 0.5 })).toBeCloseTo(base.heights.heightAt({ x: 0.5, y: 0.5 }));
  });

  it('a escada da plataforma do site A desce em degraus até o piso do site', () => {
    const terrain = ascent.heights as StructuredHeightField;
    const stairs = terrain.slopes.filter((slope) => slope.kind === 'stairs');
    expect(stairs.length).toBeGreaterThanOrEqual(1);
    const platform = stairs[0]!;
    expect(platform.fromM - platform.toM).toBeGreaterThan(2);
    expect(platform.steps).toBeGreaterThanOrEqual(7);
  });
});

describe('montagem do cenário', () => {
  const base = baseOf(ASCENT_LAYOUT);
  const ascent = applyTacticalLayout(base, ASCENT_LAYOUT);

  it.each(maps.map((m) => [m.geometry.name, m] as const))('%s sem layout continua como antes', (_name, map) => {
    const scenario = buildScenario(map);
    expect(scenario.detail).toBe('generated');
    expect(scenario.boxes).not.toBeNull();
    expect(scenario.solids).toBeNull();
    expect(scenario.thresholds).toBeNull();
    disposeScenario(scenario);
  });

  it('as lajes são planas e só cobrem vazios', () => {
    const caps = buildVoidCaps(base.geometry.walls, ascent.heights, base.frame, ASCENT_LAYOUT.wallHeightM);
    const positions = caps.getAttribute('position');
    expect(positions.count).toBeGreaterThan(0);
    let coveredFloor = 0;
    let triangles = 0;
    for (let i = 0; i < positions.count; i += 3) {
      const ys = [positions.getY(i), positions.getY(i + 1), positions.getY(i + 2)];
      if (Math.max(...ys) - Math.min(...ys) > 1e-3) continue; // Faces laterais.
      triangles++;
      const x = (positions.getX(i) + positions.getX(i + 1) + positions.getX(i + 2)) / 3 / base.frame.worldMeters + 0.5;
      const y = (positions.getZ(i) + positions.getZ(i + 1) + positions.getZ(i + 2)) / 3 / base.frame.worldMeters + 0.5;
      if (isFloor(base, x, y)) coveredFloor++;
    }
    expect(triangles).toBeGreaterThan(0);
    expect(coveredFloor / triangles).toBeLessThan(0.25);
  });

  it('no Bind, as áreas cercadas pela linha do teleportador e as plataformas não viram laje', () => {
    const bind = baseOf(BIND_LAYOUT);
    const caps = buildVoidCaps(bind.geometry.walls, bind.heights, bind.frame, BIND_LAYOUT.wallHeightM);
    const positions = caps.getAttribute('position');
    expect(positions.count).toBeGreaterThan(0);
    const inside = (px: number, py: number, rect: [number, number, number, number]) => px >= rect[0] && px <= rect[2] && py >= rect[1] && py <= rect[3];
    const outsideRegions: Array<[number, number, number, number]> = [
      [120, 705, 440, 795],
      [800, 665, 985, 795],
      [120, 428, 145, 458],
      [962, 512, 987, 543],
    ];
    for (let i = 0; i < positions.count; i += 3) {
      const px = ((positions.getX(i) + positions.getX(i + 1) + positions.getX(i + 2)) / 3 / bind.frame.worldMeters + 0.5) * 1024;
      const py = ((positions.getZ(i) + positions.getZ(i + 1) + positions.getZ(i + 2)) / 3 / bind.frame.worldMeters + 0.5) * 1024;
      for (const rect of outsideRegions) expect(inside(px, py, rect), `laje em ${Math.round(px)},${Math.round(py)}`).toBe(false);
    }
  });

  it('no Bind, a linha do teleportador não vira parede, e o corredor atacante mantém as paredes', () => {
    const bind = applyTacticalLayout(baseOf(BIND_LAYOUT), BIND_LAYOUT);
    const scenario = buildScenario(bind);
    const positions = scenario.walls.getAttribute('position');
    let onLine = 0;
    let corridor = 0;
    for (let i = 0; i < positions.count; i += 3) {
      const px = ((positions.getX(i) + positions.getX(i + 1) + positions.getX(i + 2)) / 3 / bind.frame.worldMeters + 0.5) * 1024;
      const py = ((positions.getZ(i) + positions.getZ(i + 1) + positions.getZ(i + 2)) / 3 / bind.frame.worldMeters + 0.5) * 1024;
      if ((px < 110 || px > 985) && py > 570 && py < 800) onLine++;
      if (px > 482 && px < 698 && py > 790 && py < 990) corridor++;
    }
    expect(onLine).toBe(0);
    expect(corridor).toBeGreaterThan(0);
    disposeScenario(scenario);
  });

  it('a cobertura tem topo plano na altura indicada acima do piso', () => {
    const solid = { kind: 'crate' as const, heightM: 1.5, ring: [0.45, 0.48, 0.47, 0.48, 0.47, 0.5, 0.45, 0.5] };
    const geometry = buildSolidsGeometry([solid], ascent.heights, base.frame);
    const ground = ascent.heights.heightAt({ x: 0.46, y: 0.49 });
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.max.y).toBeCloseTo(ground + 1.5);
    expect(geometry.boundingBox!.min.y).toBeCloseTo(ground - 0.4);
  });
});
