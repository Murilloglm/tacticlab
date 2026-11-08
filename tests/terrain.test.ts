import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyTacticalLayout, parseGeometry, pointInRing, StructuredHeightField, type LoadedMapGeometry } from '@/modules/maps/geometry';
import { ASCENT_LAYOUT } from '@/modules/maps/tactical/ascent';
import { BIND_LAYOUT } from '@/modules/maps/tactical/bind';
import { HAVEN_LAYOUT } from '@/modules/maps/tactical/haven';
import { CELL_PLATEAU, CELL_RAMP, CELL_STAIRS, slopeHeight, SOFT_STEP_M, STAIR_RISE_M, structureTerrain } from '@/modules/maps/terrain';
import type { TacticalLayout } from '@/modules/maps/tactical/types';
import { buildStructuredFloor, buildTerrainStairs } from '@/modules/viewer3d/mapMeshes';

const load = (layout: TacticalLayout) => parseGeometry(JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'maps', `${layout.mapId}.json`), 'utf8')));
const cases = [ASCENT_LAYOUT, BIND_LAYOUT, HAVEN_LAYOUT].map((layout) => {
  const base = load(layout);
  const map = applyTacticalLayout(base, layout);
  return [layout.name, { layout, base, map, terrain: map.heights as StructuredHeightField }] as const;
});

describe.each(cases)('terreno estruturado de %s', (_name, { layout, base, map, terrain }) => {
  const G = terrain.size;

  it('substitui o relevo suave por platôs retos, sem mexer no campo original', () => {
    expect(terrain).toBeInstanceOf(StructuredHeightField);
    expect(base.heights).not.toBeInstanceOf(StructuredHeightField);
    expect(terrain.plateaus).toBeGreaterThan(3);
    expect(terrain.plateaus).toBeLessThan(60);
  });

  it('dentro de um platô o piso é plano; entre platôs há chanfro curto ou borda vertical', () => {
    let hard = 0;
    for (let gy = 1; gy < G - 1; gy++) {
      for (let gx = 1; gx < G - 1; gx++) {
        const i = gy * G + gx;
        if (terrain.kinds[i] !== CELL_PLATEAU) continue;
        const corners = [terrain.cornerHeight(gx, gy, 0, 0), terrain.cornerHeight(gx, gy, 1, 0), terrain.cornerHeight(gx, gy, 0, 1), terrain.cornerHeight(gx, gy, 1, 1)];
        // Nenhum canto se afasta da altura do platô mais que o chanfro permitido: não há morro.
        // No pior caso, um canto compartilhado com três células mais altas fica a 3/4 do chanfro máximo.
        for (const corner of corners) expect(Math.abs(corner - terrain.levels[i]!)).toBeLessThanOrEqual(SOFT_STEP_M * 0.75 + 1e-6);
        const right = i + 1;
        if (terrain.kinds[right] === CELL_PLATEAU && Math.abs(terrain.levels[right]! - terrain.levels[i]!) > SOFT_STEP_M) hard++;
      }
    }
    if (layout !== HAVEN_LAYOUT) expect(hard).toBeGreaterThan(0);
  });

  it('cada bombsite é um piso plano', () => {
    for (const site of map.geometry.sites) {
      const levels = new Set<number>();
      for (let i = 0; i < G * G; i++) {
        if (terrain.kinds[i] !== CELL_PLATEAU) continue;
        const x = ((i % G) + 0.5) / G;
        const y = (Math.floor(i / G) + 0.5) / G;
        if (pointInRing(x, y, site.polygons[0]![0]!)) levels.add(terrain.levels[i]!);
      }
      expect(levels.size, `site ${site.label}`).toBe(1);
    }
  });

  it('rampas são inclinações lineares que chegam na altura dos platôs vizinhos', () => {
    for (const slope of terrain.slopes.filter((item) => item.kind === 'ramp')) {
      const at = (t: number) => slopeHeight(slope, { x: slope.from.x + (slope.to.x - slope.from.x) * t, y: slope.from.y + (slope.to.y - slope.from.y) * t });
      expect(at(0.5)).toBeCloseTo((slope.fromM + slope.toM) / 2, 5);
      expect(at(0.25)).toBeCloseTo(slope.fromM + (slope.toM - slope.fromM) * 0.25, 5);
      expect(Math.abs(slope.toM - slope.fromM)).toBeGreaterThan(0.5);
    }
  });

  it('escadas têm degraus individuais, com espelho e piso coerentes', () => {
    for (const slope of terrain.slopes.filter((item) => item.kind === 'stairs')) {
      const rise = Math.abs(slope.toM - slope.fromM) / slope.steps;
      expect(rise).toBeGreaterThan(0.15);
      expect(rise).toBeLessThanOrEqual(STAIR_RISE_M + 0.1);
      const run = Math.hypot(slope.to.x - slope.from.x, slope.to.y - slope.from.y) * map.frame.worldMeters;
      expect(run / slope.steps).toBeGreaterThan(0.2);
      // Piso de cada degrau é plano: duas amostras no mesmo degrau dão a mesma altura.
      for (let k = 0; k < slope.steps; k++) {
        const t0 = (k + 0.2) / slope.steps;
        const t1 = (k + 0.8) / slope.steps;
        const p = (t: number) => ({ x: slope.from.x + (slope.to.x - slope.from.x) * t, y: slope.from.y + (slope.to.y - slope.from.y) * t });
        expect(slopeHeight(slope, p(t0))).toBeCloseTo(slopeHeight(slope, p(t1)), 6);
      }
    }
  });

  it('o piso desenhado coincide com a altura usada por agentes e habilidades', () => {
    const { floor, ledges } = buildStructuredFloor(map.geometry, terrain, map.frame);
    const positions = floor.getAttribute('position');
    for (let v = 0; v < positions.count; v += 37) {
      const x = positions.getX(v) / map.frame.worldMeters + 0.5;
      const y = positions.getZ(v) / map.frame.worldMeters + 0.5;
      // O vértice pertence a várias células; ao menos uma delas tem exatamente essa altura no canto.
      const gx = Math.round(x * G);
      const gy = Math.round(y * G);
      const candidates = [
        [gx - 1, gy - 1, 1, 1],
        [gx, gy - 1, 0, 1],
        [gx - 1, gy, 1, 0],
        [gx, gy, 0, 0],
      ] as const;
      expect(candidates.some(([cx, cy, ox, oy]) => Math.abs(terrain.cornerHeight(cx, cy, ox, oy) - positions.getY(v)) < 1e-3)).toBe(true);
    }
    // Limite de leveza: o cenário precisa rodar em celular.
    expect(positions.count).toBeLessThan(45000);
    expect(ledges.getAttribute('position').count).toBeGreaterThan(0);
    expect(ledges.getAttribute('position').count).toBeLessThan(60000);
  });

  it('as bordas entre níveis são faces verticais', () => {
    const { ledges } = buildStructuredFloor(map.geometry, terrain, map.frame);
    const positions = ledges.getAttribute('position');
    for (let i = 0; i < Math.min(positions.count, 3000); i += 3) {
      const xs = [positions.getX(i), positions.getX(i + 1), positions.getX(i + 2)];
      const zs = [positions.getZ(i), positions.getZ(i + 1), positions.getZ(i + 2)];
      // Os três vértices estão sobre a mesma linha da grade: a face não tem inclinação horizontal.
      const sameX = Math.max(...xs) - Math.min(...xs) < 1e-4;
      const sameZ = Math.max(...zs) - Math.min(...zs) < 1e-4;
      expect(sameX || sameZ).toBe(true);
    }
  });

  it('a escada desenhada tem um piso por degrau, na altura do terreno', () => {
    const stairs = terrain.slopes.filter((item) => item.kind === 'stairs');
    const geometry = buildTerrainStairs(terrain, map.frame);
    if (stairs.length === 0) {
      expect(geometry.getAttribute('position').count).toBe(0);
      return;
    }
    const positions = geometry.getAttribute('position');
    const treads = new Set<number>();
    for (let i = 0; i < positions.count; i += 3) {
      const ys = [positions.getY(i), positions.getY(i + 1), positions.getY(i + 2)];
      if (Math.max(...ys) - Math.min(...ys) < 1e-4) treads.add(Math.round(ys[0]! * 1000));
    }
    expect(treads.size).toBe(stairs.reduce((sum, slope) => sum + slope.steps, 0));
  });

  it('monta o terreno rápido o bastante para abrir no celular', () => {
    const start = performance.now();
    structureTerrain(base.heights, layout, map.geometry.sites.map((site) => site.polygons[0]![0]!));
    expect(performance.now() - start).toBeLessThan(1500);
  });

  it('ramps e escadas ocupam só células de piso dentro dos próprios limites', () => {
    for (let i = 0; i < G * G; i++) {
      const kind = terrain.kinds[i];
      if (kind !== CELL_RAMP && kind !== CELL_STAIRS) continue;
      const slope = terrain.slopes[terrain.slopeOf[i]!]!;
      const x = ((i % G) + 0.5) / G;
      const y = (Math.floor(i / G) + 0.5) / G;
      expect(x > slope.bounds.x0 && x < slope.bounds.x1 && y > slope.bounds.y0 && y < slope.bounds.y1).toBe(true);
    }
  });
});

describe('mapas sem layout', () => {
  it('continuam com o relevo gerado', () => {
    const split = parseGeometry(JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'maps', 'd960549e-485c-e861-8d71-aa9d1aed12a2.json'), 'utf8'))) as LoadedMapGeometry;
    expect(split.heights).not.toBeInstanceOf(StructuredHeightField);
  });
});
