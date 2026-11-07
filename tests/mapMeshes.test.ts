import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGeometry, type LoadedMapGeometry } from '@/modules/maps/geometry';
import {
  buildExtrudedGeometry,
  buildFloorGeometry,
  buildGroundDisc,
  buildRibbon,
  polylineOverTerrain,
  rayToMapPoint,
  SCHEMATIC_HEIGHTS,
} from '@/modules/viewer3d/mapMeshes';
import { mapToWorld } from '@/modules/coordinates';

const dir = join(process.cwd(), 'public', 'data', 'maps');
const maps: LoadedMapGeometry[] = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => parseGeometry(JSON.parse(readFileSync(join(dir, f), 'utf8'))));

describe('geometria 3D', () => {
  it('todo arquivo de mapa passa pela validação de esquema', () => {
    expect(maps.length).toBeGreaterThanOrEqual(12);
  });

  it.each(maps.map((m) => [m.geometry.name, m] as const))('%s gera piso, paredes e caixas sem coordenadas inválidas', (_n, map) => {
    const floor = buildFloorGeometry(map.geometry, map.heights, map.frame);
    const walls = buildExtrudedGeometry(map.geometry.walls, map.heights, map.frame, SCHEMATIC_HEIGHTS.wall);
    const boxes = buildExtrudedGeometry(map.geometry.boxes, map.heights, map.frame, SCHEMATIC_HEIGHTS.box);
    for (const geometry of [floor, walls, boxes]) {
      const positions = geometry.getAttribute('position');
      expect(positions.count).toBeGreaterThan(0);
      for (let i = 0; i < positions.count; i++) {
        expect(Number.isFinite(positions.getX(i))).toBe(true);
        expect(Number.isFinite(positions.getY(i))).toBe(true);
        expect(Number.isFinite(positions.getZ(i))).toBe(true);
      }
    }
    // Limite de leveza: o cenário precisa rodar em celular.
    expect(floor.getAttribute('position').count).toBeLessThan(40000);
    expect(walls.getAttribute('position').count).toBeLessThan(40000);
  });

  it('o piso coincide com o campo de alturas usado para posicionar agentes', () => {
    const map = maps.find((m) => m.geometry.name === 'Ascent')!;
    const floor = buildFloorGeometry(map.geometry, map.heights, map.frame);
    const positions = floor.getAttribute('position');
    for (let i = 0; i < positions.count; i += 97) {
      const x = positions.getX(i) / map.frame.worldMeters + 0.5;
      const y = positions.getZ(i) / map.frame.worldMeters + 0.5;
      expect(positions.getY(i)).toBeCloseTo(map.heights.heightAt({ x, y }), 4);
    }
  });

  it('paredes ficam acima do piso local', () => {
    const map = maps[0]!;
    const walls = buildExtrudedGeometry(map.geometry.walls, map.heights, map.frame, SCHEMATIC_HEIGHTS.wall);
    const positions = walls.getAttribute('position');
    let tops = 0;
    for (let i = 0; i < positions.count; i++) {
      const ground = map.heights.heightAt({
        x: positions.getX(i) / map.frame.worldMeters + 0.5,
        y: positions.getZ(i) / map.frame.worldMeters + 0.5,
      });
      if (positions.getY(i) > ground + 1) tops++;
    }
    expect(tops).toBeGreaterThan(0);
  });

  it('há diferença de altura real no cenário dos mapas com dados de altura', () => {
    for (const map of maps.filter((m) => m.geometry.frame.scaleKnown)) {
      expect(map.geometry.heightSpanMeters, map.geometry.name).toBeGreaterThan(1);
    }
  });
});

describe('transformação de ponteiro em ponto de mapa', () => {
  const map = maps.find((m) => m.geometry.name === 'Ascent')!;

  it('um raio vertical acerta exatamente o ponto abaixo dele', () => {
    const target = { x: 0.53, y: 0.5 };
    const [x, , z] = mapToWorld(target, map.frame);
    const hit = rayToMapPoint({ x, y: 100, z }, { x: 0, y: -1, z: 0 }, map.frame, map.heights)!;
    expect(hit.x).toBeCloseTo(target.x, 5);
    expect(hit.y).toBeCloseTo(target.y, 5);
  });

  it('um raio inclinado volta ao ponto de origem do mapeamento 3D', () => {
    const target = { x: 0.4, y: 0.6 };
    const height = map.heights.heightAt(target);
    const [tx, ty, tz] = mapToWorld(target, map.frame, height);
    const origin = { x: tx + 30, y: ty + 40, z: tz + 20 };
    const length = Math.hypot(30, 40, 20);
    const hit = rayToMapPoint(origin, { x: -30 / length, y: -40 / length, z: -20 / length }, map.frame, map.heights)!;
    expect(Math.hypot(hit.x - target.x, hit.y - target.y) * map.frame.worldMeters).toBeLessThan(1.5);
  });

  it('um raio para cima não encontra o chão', () => {
    expect(rayToMapPoint({ x: 0, y: 200, z: 0 }, { x: 0, y: 1, z: 0 }, map.frame, map.heights)).toBeNull();
  });

  it('sem geometria carregada ainda usa o plano do chão', () => {
    const hit = rayToMapPoint({ x: 0, y: 10, z: 0 }, { x: 0, y: -1, z: 0 }, map.frame, null)!;
    expect(hit).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe('formas no cenário', () => {
  const map = maps.find((m) => m.geometry.name === 'Ascent')!;

  it('o disco acompanha o relevo e respeita o raio em metros', () => {
    const center = { x: 0.5, y: 0.5 };
    const disc = buildGroundDisc(center, 5, map.frame, map.heights);
    const positions = disc.getAttribute('position');
    const [cx, , cz] = mapToWorld(center, map.frame);
    let farthest = 0;
    for (let i = 0; i < positions.count; i++) {
      farthest = Math.max(farthest, Math.hypot(positions.getX(i) - cx, positions.getZ(i) - cz));
    }
    expect(farthest).toBeCloseTo(5, 1);
  });

  it('a parede de habilidade sobe a partir do piso', () => {
    const a = { x: 0.5, y: 0.5 };
    const ribbon = buildRibbon([a, { x: 0.55, y: 0.5 }], 3, map.frame, map.heights);
    const positions = ribbon.getAttribute('position');
    expect(positions.getY(0)).toBeCloseTo(map.heights.heightAt(a), 4);
    const ys = Array.from({ length: positions.count }, (_, i) => positions.getY(i));
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(3, 4);
  });

  it('trajetórias são subdivididas para seguir o relevo', () => {
    const line = polylineOverTerrain([{ x: 0.3, y: 0.5 }, { x: 0.6, y: 0.5 }], map.frame, map.heights, 0.2);
    expect(line.length).toBeGreaterThan(5);
    for (const [x, y, z] of line) {
      const point = { x: x / map.frame.worldMeters + 0.5, y: z / map.frame.worldMeters + 0.5 };
      expect(y).toBeCloseTo(map.heights.heightAt(point) + 0.2, 3);
    }
  });
});
