import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  close,
  dilate,
  labelComponents,
  maskToPolygons,
  ringArea,
  simplifyRing,
  traceContours,
} from '../scripts/lib/raster.mjs';
import { alignCallouts, classifyPixels, floorRatio, gameToImage, snapToFloor } from '../scripts/lib/map-processor.mjs';

function grid(rows: string[]) {
  const h = rows.length;
  const w = rows[0]!.length;
  const mask = new Uint8Array(w * h);
  rows.forEach((row, y) => [...row].forEach((c, x) => (mask[y * w + x] = c === '#' ? 1 : 0)));
  return { mask, w, h };
}

describe('raster', () => {
  it('separa componentes conexos e detecta contato com a borda', () => {
    const { mask, w, h } = grid(['##..', '##..', '....', '..#.']);
    const { comps } = labelComponents(mask, w, h);
    expect(comps).toHaveLength(2);
    expect(comps[0]!.area).toBe(4);
    expect(comps[0]!.touchesBorder).toBe(true);
  });

  it('traça um quadrado com a área correta e orientação positiva', () => {
    const { mask, w, h } = grid(['....', '.##.', '.##.', '....']);
    const rings = traceContours(mask, w, h);
    expect(rings).toHaveLength(1);
    expect(ringArea(rings[0]!)).toBe(4);
  });

  it('um buraco tem área negativa e fica associado ao polígono externo', () => {
    const { mask, w, h } = grid(['#####', '#...#', '#...#', '#...#', '#####']);
    const polygons = maskToPolygons(mask, w, h, { tolerance: 0, minArea: 1 });
    expect(polygons).toHaveLength(1);
    expect(polygons[0]!.holes).toHaveLength(1);
    expect(ringArea(polygons[0]!.holes[0]!)).toBe(-9);
  });

  it('pixels em xadrez não geram anéis inválidos', () => {
    const { mask, w, h } = grid(['#.', '.#']);
    const rings = traceContours(mask, w, h);
    const total = rings.reduce((sum, ring) => sum + ringArea(ring), 0);
    expect(total).toBe(2);
  });

  it('simplificar um retângulo mantém apenas os cantos', () => {
    const ring = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]] as Array<[number, number]>;
    expect(simplifyRing(ring, 0.1)).toHaveLength(4);
  });

  it('dilatação e fechamento preenchem frestas', () => {
    const { mask, w, h } = grid(['.......', '.##.##.', '.##.##.', '.##.##.', '.......']);
    expect(mask[2 * w + 3]).toBe(0);
    expect(dilate(mask, w, h, 1)[0 * w + 1]).toBe(1);
    expect(close(mask, w, h, 1)[2 * w + 3]).toBe(1);
  });
});

describe('classificação de pixels do minimapa', () => {
  const pixel = (r: number, g: number, b: number, a = 255) => classifyPixels(new Uint8Array([r, g, b, a]), 1, 1);

  it('reconhece vazio, linhas, piso, site e teleporte', () => {
    expect(pixel(0, 0, 0, 0).cls[0]).toBe(0);
    expect(pixel(248, 248, 248).cls[0]).toBe(1);
    expect(pixel(118, 118, 118).cls[0]).toBe(2);
    expect(pixel(152, 152, 112).cls[0]).toBe(3);
    expect(pixel(24, 160, 128).cls[0]).toBe(4);
  });

  it('mantém o nível do site no canal azul, equivalente ao piso-base', () => {
    expect(pixel(152, 152, 112).lum[0]).toBe(118);
  });

  it('usa a transformação publicada pela API', () => {
    const p = gameToImage({ x: 1000, y: 2000 }, { xMultiplier: 0.0001, yMultiplier: -0.0001, xScalarToAdd: 0.5, yScalarToAdd: 0.5 });
    expect(p.x).toBeCloseTo(0.7);
    expect(p.y).toBeCloseTo(0.4);
  });

  it('não desloca callouts que já estão alinhados e corrige os deslocados', () => {
    const w = 100;
    const h = 100;
    const floor = new Float32Array(w * h).fill(99);
    const site = new Float32Array(w * h).fill(99);
    const paint = (x: number, y: number) => {
      floor[y * w + x] = 0;
      site[y * w + x] = 0;
    };
    paint(50, 50);
    paint(20, 70);
    const aligned = [{ x: 0.5, y: 0.5, isSite: true }, { x: 0.2, y: 0.7, isSite: true }];
    expect(alignCallouts(aligned, floor, site, w, h, null)).toMatchObject({ dx: 0, dy: 0, source: 'api' });
    const shifted = aligned.map((p) => ({ ...p, x: p.x - 0.1, y: p.y + 0.04 }));
    const fixed = alignCallouts(shifted, floor, site, w, h, null);
    expect(fixed.source).toBe('auto');
    expect(fixed.dx).toBeCloseTo(0.1, 1);
    expect(fixed.dy).toBeCloseTo(-0.04, 1);
    expect(alignCallouts(aligned, floor, site, w, h, { dx: 0.01, dy: 0.02 })).toEqual({ dx: 0.01, dy: 0.02, source: 'override' });
  });
});

describe('callouts pouco confiáveis', () => {
  const w = 20;
  const h = 20;
  const floor = new Float32Array(w * h).fill(99);
  floor[10 * w + 10] = 0;

  it('mede a fração de pontos sobre o piso', () => {
    expect(floorRatio([{ x: 0.5, y: 0.5 }, { x: 0, y: 0 }], floor, w, h, 0)).toBe(0.5);
  });

  it('encosta no piso quando está perto e descarta quando está longe', () => {
    expect(snapToFloor({ x: 0.4, y: 0.5 }, floor, w, h, 4)).toEqual({ x: 0.5, y: 0.5 });
    expect(snapToFloor({ x: 0, y: 0 }, floor, w, h, 4)).toBeNull();
  });
});

describe('dados de mapa gerados', () => {
  const dir = join(process.cwd(), 'public', 'data', 'maps');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const maps = files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));

  it('existem mapas gerados', () => {
    expect(maps.length).toBeGreaterThanOrEqual(12);
  });

  it('cada mapa tem geometria própria (nenhum cenário reaproveitado)', () => {
    const signatures = new Set(maps.map((m) => JSON.stringify(m.walls)));
    expect(signatures.size).toBe(maps.length);
  });

  it('toda geometria declara ser aproximada', () => {
    for (const map of maps) expect(map.approximate).toBe(true);
  });

  it.each(maps.map((m) => [m.name, m]))('%s tem paredes, grade válida e coordenadas normalizadas', (_name, map) => {
    expect(map.walls.length).toBeGreaterThan(0);
    const size = map.grid.size;
    expect(Buffer.from(map.grid.heightsDm, 'base64').length).toBe(size * size);
    for (const poly of map.walls) {
      for (const ring of poly) {
        expect(ring.length).toBeGreaterThanOrEqual(6);
        for (const value of ring) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('mapas táticos têm sites identificados e cada callout de site cai perto da área do site', () => {
    const tactical = maps.filter((m) => m.frame.scaleKnown);
    expect(tactical.length).toBeGreaterThanOrEqual(12);
    for (const map of tactical) {
      const siteCallouts = map.callouts.filter((c: { site: string | null }) => c.site);
      expect(map.sites.length, map.name).toBe(siteCallouts.length);
      for (const callout of siteCallouts) {
        const site = map.sites.find((s: { label: string }) => s.label === callout.site);
        expect(site, `${map.name} ${callout.site}`).toBeDefined();
        const distance = Math.hypot(site.center.x - callout.x, site.center.y - callout.y);
        expect(distance, `${map.name} site ${callout.site}`).toBeLessThan(0.1);
      }
    }
  });

  it('os mapas táticos têm spawns de ataque e defesa', () => {
    for (const map of maps.filter((m) => m.frame.scaleKnown)) {
      const spawns = map.callouts.map((c: { spawn: string | null }) => c.spawn);
      expect(spawns, map.name).toContain('attack');
      expect(spawns, map.name).toContain('defense');
    }
  });

  it('mapas confiáveis têm callouts sobre o piso; os demais são marcados como não confiáveis', () => {
    for (const map of maps.filter((m) => m.frame.scaleKnown)) {
      expect(typeof map.calloutsReliable, map.name).toBe('boolean');
      if (map.calloutsReliable) expect(map.calloutFloorRatio, map.name).toBeGreaterThanOrEqual(0.8);
      else expect(map.calloutFloorRatio, map.name).toBeLessThan(0.8);
    }
  });

  it('mapa sem callouts confiáveis usa só o sombreamento do minimapa para as alturas', () => {
    for (const map of maps.filter((m) => m.frame.scaleKnown && !m.calloutsReliable)) {
      expect(map.heightAnchors, map.name).toBe(0);
    }
  });

  it('o alinhamento automático fica restrito aos mapas em que o dado publicado está ruim', () => {
    const adjusted = maps.filter((m) => m.alignment.source === 'auto').map((m) => m.name);
    expect(adjusted.length).toBeLessThanOrEqual(4);
  });
});
