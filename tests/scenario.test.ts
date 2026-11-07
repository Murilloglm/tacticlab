import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyTacticalLayout, parseGeometry, pointInRing, type LoadedMapGeometry } from '@/modules/maps/geometry';
import { ASCENT_LAYOUT } from '@/modules/maps/tactical/ascent';
import { hasTacticalLayout, loadTacticalLayout } from '@/modules/maps/tactical';
import { buildSolidsGeometry, buildVoidCaps } from '@/modules/viewer3d/mapMeshes';
import { buildScenario, disposeScenario } from '@/modules/viewer3d/scenario';

const dir = join(process.cwd(), 'public', 'data', 'maps');
const maps: LoadedMapGeometry[] = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => parseGeometry(JSON.parse(readFileSync(join(dir, f), 'utf8'))));

const base = maps.find((m) => m.geometry.name === 'Ascent')!;
const ascent = applyTacticalLayout(base, ASCENT_LAYOUT);

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

describe('layout tático do mapa piloto', () => {
  it('está registrado para o UUID certo e carrega sob demanda', async () => {
    expect(ASCENT_LAYOUT.mapId).toBe(base.geometry.mapId);
    expect(hasTacticalLayout(base.geometry.mapId)).toBe(true);
    expect(await loadTacticalLayout(base.geometry.mapId)).toBe(ASCENT_LAYOUT);
  });

  it('os outros mapas seguem só com a geometria gerada', async () => {
    const others = maps.filter((m) => m !== base);
    expect(others.length).toBeGreaterThan(10);
    for (const map of others) {
      expect(hasTacticalLayout(map.geometry.mapId)).toBe(false);
      expect(await loadTacticalLayout(map.geometry.mapId)).toBeNull();
    }
  });

  it('tem coberturas de cada tipo e rampas', () => {
    const kinds = new Set(ASCENT_LAYOUT.solids.map((solid) => solid.kind));
    expect([...kinds].sort()).toEqual(['barrier', 'cover', 'crate', 'door', 'pillar', 'structure']);
    expect(ASCENT_LAYOUT.solids.length).toBeGreaterThan(40);
    expect(ASCENT_LAYOUT.ramps.length).toBeGreaterThanOrEqual(5);
  });

  it('coberturas ficam dentro do mapa, com altura plausível', () => {
    for (const solid of ASCENT_LAYOUT.solids) {
      expect(solid.heightM).toBeGreaterThan(0.5);
      expect(solid.heightM).toBeLessThan(ASCENT_LAYOUT.wallHeightM + 0.01);
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
    const misplaced = ASCENT_LAYOUT.solids.filter((solid) => solid.kind === 'crate').filter((solid) => {
      const { x, y } = center(solid.ring);
      return ![[0, 0], [margin, 0], [-margin, 0], [0, margin], [0, -margin]].some(([dx, dy]) => isFloor(base, x + dx!, y + dy!));
    });
    expect(misplaced.map((solid) => solid.ring.slice(0, 2).map((v) => Math.round(v * 1024)))).toEqual([]);
  });

  it('os sites têm cobertura', () => {
    for (const site of base.geometry.sites) {
      const covers = ASCENT_LAYOUT.solids.filter((solid) => {
        const { x, y } = center(solid.ring);
        return site.polygons.some((polygon) => pointInRing(x, y, polygon[0]!));
      });
      expect(covers.length, `site ${site.label}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('rampas no campo de alturas', () => {
  it('sobem de forma contínua entre as alturas originais das pontas', () => {
    for (const ramp of ASCENT_LAYOUT.ramps) {
      const from = base.heights.heightAt(ramp.from);
      const to = base.heights.heightAt(ramp.to);
      const samples = Array.from({ length: 9 }, (_, i) => {
        const t = 0.1 + (0.8 * i) / 8;
        return ascent.heights.heightAt({ x: ramp.from.x + (ramp.to.x - ramp.from.x) * t, y: ramp.from.y + (ramp.to.y - ramp.from.y) * t });
      });
      const direction = Math.sign(to - from);
      for (let i = 1; i < samples.length; i++) {
        expect((samples[i]! - samples[i - 1]!) * direction, `rampa de ${from} a ${to}`).toBeGreaterThanOrEqual(-0.15);
      }
      expect(Math.abs(samples[4]! - (from + to) / 2)).toBeLessThan(0.6);
    }
  });

  it('não altera o piso fora das rampas nem o campo original', () => {
    const outside = { x: 0.817, y: 0.569 };
    expect(ascent.heights.heightAt(outside)).toBeCloseTo(base.heights.heightAt(outside));
    expect(ascent.heights).not.toBe(base.heights);
    const ramp = ASCENT_LAYOUT.ramps[0]!;
    expect(parseGeometry(JSON.parse(readFileSync(join(dir, `${base.geometry.mapId}.json`), 'utf8'))).heights.heightAt(ramp.from)).toBeCloseTo(base.heights.heightAt(ramp.from));
  });
});

describe('montagem do cenário', () => {
  it('o piloto usa as coberturas do layout no lugar das geradas', () => {
    const scenario = buildScenario(ascent);
    expect(scenario.detail).toBe('tactical');
    expect(scenario.boxes).toBeNull();
    expect(scenario.rails).toBeNull();
    expect(scenario.stats.solids).toBe(ASCENT_LAYOUT.solids.length);
    expect(scenario.stats.ramps).toBe(ASCENT_LAYOUT.ramps.length);
    // Limite de leveza: o cenário precisa rodar em celular.
    for (const geometry of [scenario.floor, scenario.walls, scenario.solids!, scenario.rampStripes!]) {
      expect(geometry.getAttribute('position').count).toBeLessThan(40000);
    }
    expect(scenario.edges!.getAttribute('position').count).toBeLessThan(12000);
    disposeScenario(scenario);
  });

  it.each(maps.map((m) => [m.geometry.name, m] as const))('%s sem layout continua como antes', (_name, map) => {
    const scenario = buildScenario(map);
    expect(scenario.detail).toBe('generated');
    expect(scenario.boxes).not.toBeNull();
    expect(scenario.solids).toBeNull();
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

  it('a cobertura tem topo plano na altura indicada acima do piso', () => {
    const solid = { kind: 'crate' as const, heightM: 1.5, ring: [0.45, 0.48, 0.47, 0.48, 0.47, 0.5, 0.45, 0.5] };
    const geometry = buildSolidsGeometry([solid], ascent.heights, base.frame);
    const ground = ascent.heights.heightAt({ x: 0.46, y: 0.49 });
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.max.y).toBeCloseTo(ground + 1.5);
    expect(geometry.boundingBox!.min.y).toBeCloseTo(ground - 0.4);
  });
});
