// Constrói as malhas do mapa a partir dos dados gerados. Funções puras, testáveis sem WebGL.
// Materiais simples e uma única geometria por classe mantêm o cenário leve no celular.
import { BufferAttribute, BufferGeometry, Color, ShapeUtils, Vector2 } from 'three';
import type { MapFrame, MapPoint } from '../coordinates';
import { pointInRing, type HeightField, type MapGeometry } from '../maps/geometry';
import { CELL_RAMP, CELL_STAIRS, slopeHeight, type StructuredHeightField } from '../maps/terrain';
import type { TacticalRamp, TacticalSolid, TacticalZone } from '../maps/tactical/types';

/** Alturas esquemáticas, em metros. Não vêm do jogo; servem para dar leitura ao volume. */
export const SCHEMATIC_HEIGHTS = { wall: 4.5, rail: 1.1, box: 1.8 };

const FLOOR_LOW = new Color('#3a3f47');
const FLOOR_HIGH = new Color('#9aa1ad');
const SITE_TINT = new Color('#a2383f');

function pointInPolygon(x: number, y: number, polygon: number[][]): boolean {
  const [outer, ...holes] = polygon;
  if (!outer || !pointInRing(x, y, outer)) return false;
  return !holes.some((hole) => pointInRing(x, y, hole));
}

function isSitePoint(geometry: MapGeometry, x: number, y: number): boolean {
  return geometry.sites.some((site) => site.polygons.some((polygon) => pointInPolygon(x, y, polygon)));
}

/** Piso em grade, com cor por altura e tom próprio nos sites. */
export function buildFloorGeometry(geometry: MapGeometry, heights: HeightField, frame: MapFrame, zones: TacticalZone[] = [], excluded: number[][] = []): BufferGeometry {
  const zoneColor = new Color();
  const G = heights.size;
  const S = frame.worldMeters;
  const span = Math.max(geometry.heightSpanMeters, 3);

  // Uma célula a mais de margem passa por baixo das paredes e esconde o serrilhado da grade.
  const included = new Uint8Array(G * G);
  for (let gy = 0; gy < G; gy++) {
    for (let gx = 0; gx < G; gx++) {
      if (!heights.isFloorCell(gx, gy)) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = gx + dx;
          const y = gy + dy;
          if (x >= 0 && y >= 0 && x < G && y < G) included[y * G + x] = 1;
        }
      }
    }
  }

  const vertexIndex = new Int32Array((G + 1) * (G + 1)).fill(-1);
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const color = new Color();

  const vertex = (vx: number, vy: number): number => {
    const key = vy * (G + 1) + vx;
    const existing = vertexIndex[key]!;
    if (existing !== -1) return existing;
    const x = vx / G;
    const y = vy / G;
    const height = heights.heightAt({ x, y });
    positions.push((x - 0.5) * S, height, (y - 0.5) * S);
    uvs.push(x, 1 - y);
    color.copy(FLOOR_LOW).lerp(FLOOR_HIGH, Math.min(1, height / span));
    if (isSitePoint(geometry, x, y)) color.lerp(SITE_TINT, 0.55);
    for (const zone of zones) {
      if (pointInRing(x, y, zone.ring)) color.lerp(zoneColor.set(zone.color), zone.strength);
    }
    colors.push(color.r, color.g, color.b);
    const index = positions.length / 3 - 1;
    vertexIndex[key] = index;
    return index;
  };

  for (let gy = 0; gy < G; gy++) {
    for (let gx = 0; gx < G; gx++) {
      if (!included[gy * G + gx]) continue;
      // Áreas que o layout marca como inexistentes no jogo também ficam sem piso.
      if (excluded.some((ring) => pointInRing((gx + 0.5) / G, (gy + 0.5) / G, ring))) continue;
      const a = vertex(gx, gy);
      const b = vertex(gx + 1, gy);
      const c = vertex(gx + 1, gy + 1);
      const d = vertex(gx, gy + 1);
      indices.push(a, d, b, b, d, c);
    }
  }

  const result = new BufferGeometry();
  result.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  result.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  result.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  result.setIndex(indices);
  result.computeVertexNormals();
  return result;
}

function ringToVectors(ring: number[]): Vector2[] {
  const out: Vector2[] = [];
  for (let i = 0; i < ring.length; i += 2) out.push(new Vector2(ring[i]!, ring[i + 1]!));
  return out;
}

/**
 * Extruda polígonos para cima acompanhando o relevo, gerando volumes sem normais compartilhadas.
 */
export function buildExtrudedGeometry(
  polygons: number[][][],
  heights: HeightField,
  frame: MapFrame,
  extrude: number,
  bottomAt?: (point: MapPoint) => number,
): BufferGeometry {
  const S = frame.worldMeters;
  const positions: number[] = [];

  const push = (x: number, y: number, z: number) => positions.push(x, y, z);
  const world = (p: Vector2) => {
    const ground = heights.heightAt({ x: p.x, y: p.y });
    const bottom = bottomAt ? bottomAt({ x: p.x, y: p.y }) : ground - 0.15;
    return { x: (p.x - 0.5) * S, z: (p.y - 0.5) * S, bottom, top: ground + extrude };
  };

  for (const polygon of polygons) {
    const [outerRing, ...holeRings] = polygon;
    if (!outerRing || outerRing.length < 6) continue;
    const contour = ringToVectors(outerRing);
    const holes = holeRings.filter((ring) => ring.length >= 6).map(ringToVectors);

    const all = contour.concat(...holes);
    const verts = all.map(world);
    for (const face of ShapeUtils.triangulateShape(contour, holes)) {
      const va = verts[face[0]!]!;
      const vb = verts[face[1]!]!;
      const vc = verts[face[2]!]!;
      // Garante face voltada para cima, independente da orientação do anel.
      const cross = (vb.x - va.x) * (vc.z - va.z) - (vb.z - va.z) * (vc.x - va.x);
      const [p, q, r] = cross < 0 ? [va, vb, vc] : [va, vc, vb];
      push(p.x, p.top, p.z);
      push(q.x, q.top, q.z);
      push(r.x, r.top, r.z);
    }

    for (const ring of [contour, ...holes]) {
      for (let i = 0; i < ring.length; i++) {
        const a = world(ring[i]!);
        const b = world(ring[(i + 1) % ring.length]!);
        push(a.x, a.bottom, a.z);
        push(b.x, b.bottom, b.z);
        push(b.x, b.top, b.z);
        push(a.x, a.bottom, a.z);
        push(b.x, b.top, b.z);
        push(a.x, a.top, a.z);
      }
    }
  }

  const result = new BufferGeometry();
  result.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  result.computeVertexNormals();
  return result;
}

/** Remove os triângulos cujo centro cai dentro de alguma das áreas, em coordenadas de mapa. */
export function removeTrianglesInside(geometry: BufferGeometry, rings: number[][], frame: MapFrame): BufferGeometry {
  if (rings.length === 0) return geometry;
  const S = frame.worldMeters;
  const source = geometry.getAttribute('position');
  const kept: number[] = [];
  for (let i = 0; i < source.count; i += 3) {
    const x = (source.getX(i) + source.getX(i + 1) + source.getX(i + 2)) / 3 / S + 0.5;
    const y = (source.getZ(i) + source.getZ(i + 1) + source.getZ(i + 2)) / 3 / S + 0.5;
    if (rings.some((ring) => pointInRing(x, y, ring))) continue;
    for (let k = 0; k < 3; k++) kept.push(source.getX(i + k), source.getY(i + k), source.getZ(i + k));
  }
  const result = new BufferGeometry();
  result.setAttribute('position', new BufferAttribute(new Float32Array(kept), 3));
  result.computeVertexNormals();
  geometry.dispose();
  return result;
}

/** Sombreia as faces pela altura relativa ao piso: base escura, topo claro. Dá leitura de volume sem textura. */
export function shadeByHeight(geometry: BufferGeometry, heights: HeightField, frame: MapFrame, extrude: number, base: string, top: string, cap: string): BufferGeometry {
  const S = frame.worldMeters;
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const low = new Color(base);
  const high = new Color(top);
  const roof = new Color(cap);
  const paint = new Color();
  const above = (i: number) => positions.getY(i) - heights.heightAt({ x: positions.getX(i) / S + 0.5, y: positions.getZ(i) / S + 0.5 });
  for (let i = 0; i < positions.count; i += 3) {
    // Um triângulo com os três vértices no topo é a cobertura do volume.
    const isRoof = above(i) > extrude * 0.95 && above(i + 1) > extrude * 0.95 && above(i + 2) > extrude * 0.95;
    for (let k = 0; k < 3; k++) {
      if (isRoof) paint.copy(roof);
      else paint.copy(low).lerp(high, Math.min(1, Math.max(0, above(i + k) / extrude)));
      colors.set([paint.r, paint.g, paint.b], (i + k) * 3);
    }
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

/**
 * Cobre os vazios cercados por parede para aparecerem como massa construída, e não como buracos.
 * Só tampa o anel interno que não contém piso. O anel que contorna a área jogável fica aberto.
 */
export function buildVoidCaps(polygons: number[][][], heights: HeightField, frame: MapFrame, extrude: number): BufferGeometry {
  const S = frame.worldMeters;
  const G = heights.size;
  const positions: number[] = [];
  // O polígono de maior contorno é a moldura do mapa. Os furos dele são o piso principal ou áreas fora
  // do mapa, como as cercadas pela linha do teleportador no Bind, e nunca viram laje.
  const outerAreas = polygons.map((polygon) => (polygon[0] && polygon[0].length >= 6 ? Math.abs(ShapeUtils.area(ringToVectors(polygon[0]))) : 0));
  const frameIndex = outerAreas.indexOf(Math.max(...outerAreas));
  for (const [index, polygon] of polygons.entries()) {
    if (index === frameIndex) continue;
    for (const hole of polygon.slice(1)) {
      if (hole.length < 6) continue;
      const contour = ringToVectors(hole);
      const faces = ShapeUtils.triangulateShape(contour, []);
      let floorHits = 0;
      for (const face of faces) {
        const a = contour[face[0]!]!;
        const b = contour[face[1]!]!;
        const c = contour[face[2]!]!;
        if (heights.isFloorCell(Math.floor(((a.x + b.x + c.x) / 3) * G), Math.floor(((a.y + b.y + c.y) / 3) * G))) floorHits++;
      }
      if (faces.length === 0 || floorHits > faces.length * 0.25) continue;
      const verts = contour.map((p) => ({ x: (p.x - 0.5) * S, y: heights.heightAt({ x: p.x, y: p.y }) + extrude, z: (p.y - 0.5) * S }));
      // Laje plana na altura da parede mais alta em volta. O relevo sob o vazio não tem significado.
      const roofY = verts.reduce((max, vertex) => Math.max(max, vertex.y), -Infinity);
      for (const face of faces) {
        const va = verts[face[0]!]!;
        const vb = verts[face[1]!]!;
        const vc = verts[face[2]!]!;
        const cross = (vb.x - va.x) * (vc.z - va.z) - (vb.z - va.z) * (vc.x - va.x);
        const [p, q, r] = cross < 0 ? [va, vb, vc] : [va, vc, vb];
        positions.push(p.x, roofY, p.z, q.x, roofY, q.z, r.x, roofY, r.z);
      }
      // Fecha o espaço entre o topo de cada parede e a laje.
      for (let i = 0; i < verts.length; i++) {
        const a = verts[i]!;
        const b = verts[(i + 1) % verts.length]!;
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z, b.x, roofY, b.z, a.x, a.y, a.z, b.x, roofY, b.z, a.x, roofY, a.z);
      }
    }
  }
  const result = new BufferGeometry();
  result.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  result.computeVertexNormals();
  return result;
}

const SOLID_COLORS: Record<TacticalSolid['kind'], { side: string; top: string }> = {
  crate: { side: '#a98a5e', top: '#d0b488' },
  cover: { side: '#7f8a97', top: '#a8b3bf' },
  barrier: { side: '#8fa3ad', top: '#c4d2d9' },
  pillar: { side: '#8d939c', top: '#bcc2ca' },
  structure: { side: '#555c66', top: '#7b838e' },
  door: { side: '#d29a3a', top: '#efc06a' },
};

/** Coberturas do layout em uma única malha: topo plano na altura do piso sob o centro de cada uma. */
export function buildSolidsGeometry(solids: TacticalSolid[], heights: HeightField, frame: MapFrame): BufferGeometry {
  const S = frame.worldMeters;
  const positions: number[] = [];
  const colors: number[] = [];
  const side = new Color();
  const top = new Color();
  const emit = (color: Color, ...vertices: Array<[number, number, number]>) => {
    for (const [x, y, z] of vertices) {
      positions.push(x, y, z);
      colors.push(color.r, color.g, color.b);
    }
  };
  for (const solid of solids) {
    const contour = ringToVectors(solid.ring);
    if (contour.length < 3) continue;
    const center = contour.reduce((sum, p) => ({ x: sum.x + p.x / contour.length, y: sum.y + p.y / contour.length }), { x: 0, y: 0 });
    const base = heights.heightAt(center);
    const roofY = base + solid.heightM;
    const floorY = base - 0.4;
    const palette = SOLID_COLORS[solid.kind];
    side.set(palette.side);
    top.set(palette.top);
    const at = contour.map((p) => ({ x: (p.x - 0.5) * S, z: (p.y - 0.5) * S }));
    for (const face of ShapeUtils.triangulateShape(contour, [])) {
      const a = at[face[0]!]!;
      const b = at[face[1]!]!;
      const c = at[face[2]!]!;
      const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
      const [p, q, r] = cross < 0 ? [a, b, c] : [a, c, b];
      emit(top, [p.x, roofY, p.z], [q.x, roofY, q.z], [r.x, roofY, r.z]);
    }
    for (let i = 0; i < at.length; i++) {
      const a = at[i]!;
      const b = at[(i + 1) % at.length]!;
      emit(side, [a.x, floorY, a.z], [b.x, floorY, b.z], [b.x, roofY, b.z], [a.x, floorY, a.z], [b.x, roofY, b.z], [a.x, roofY, a.z]);
    }
  }
  const result = new BufferGeometry();
  result.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  result.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  result.computeVertexNormals();
  return result;
}

/** Faixas transversais sobre as rampas, para o desnível ser reconhecido de qualquer ângulo. */
export function buildRampStripes(ramps: TacticalRamp[], heights: HeightField, frame: MapFrame, spacingM = 1.8, widthM = 0.45): BufferGeometry {
  const S = frame.worldMeters;
  const positions: number[] = [];
  const lift = 0.06;
  const vertex = (x: number, y: number) => {
    positions.push((x - 0.5) * S, heights.heightAt({ x, y }) + lift, (y - 0.5) * S);
  };
  for (const ramp of ramps.filter((r) => r.kind !== 'stairs')) {
    const dx = ramp.to.x - ramp.from.x;
    const dy = ramp.to.y - ramp.from.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) continue;
    const ux = dx / length;
    const uy = dy / length;
    // Largura da rampa: projeção do contorno na perpendicular à direção de subida.
    let min = Infinity;
    let max = -Infinity;
    for (const p of ringToVectors(ramp.ring)) {
      const across = -(p.x - ramp.from.x) * uy + (p.y - ramp.from.y) * ux;
      min = Math.min(min, across);
      max = Math.max(max, across);
    }
    const steps = Math.floor((length * S) / spacingM);
    const half = widthM / S / 2;
    for (let i = 1; i < steps; i++) {
      const along = (i / steps) * length;
      const ox = ramp.from.x + ux * along;
      const oy = ramp.from.y + uy * along;
      const corner = (across: number, offset: number): [number, number] => [ox - uy * across + ux * offset, oy + ux * across + uy * offset];
      const a = corner(min, -half);
      const b = corner(max, -half);
      const c = corner(max, half);
      const d = corner(min, half);
      for (const [x, y] of [a, b, c, a, c, d]) vertex(x, y);
    }
  }
  const result = new BufferGeometry();
  result.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  result.computeVertexNormals();
  return result;
}

/**
 * Escadas do terreno estruturado: um piso plano por degrau e um espelho vertical entre eles, nas
 * mesmas alturas que o terreno devolve para agentes e habilidades. Os limites estão alinhados à grade.
 */
export function buildTerrainStairs(terrain: StructuredHeightField, frame: MapFrame): BufferGeometry {
  const S = frame.worldMeters;
  const positions: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (const slope of terrain.slopes.filter((item) => item.kind === 'stairs')) {
    const alongX = Math.abs(slope.to.x - slope.from.x) >= Math.abs(slope.to.y - slope.from.y);
    const { x0, y0, x1, y1 } = slope.bounds;
    // Eixo de subida (along) e largura (across), em coordenadas de mapa.
    const aFrom = alongX ? slope.from.x : slope.from.y;
    const aTo = alongX ? slope.to.x : slope.to.y;
    const [aMin, aMax] = alongX ? [x0, x1] : [y0, y1];
    const [cMin, cMax] = alongX ? [y0, y1] : [x0, x1];
    const point = (along: number, across: number, height: number) => {
      const x = alongX ? along : across;
      const y = alongX ? across : along;
      return [(x - 0.5) * S, height, (y - 0.5) * S];
    };
    const sign = aTo >= aFrom ? 1 : -1;
    const start = sign > 0 ? aMin : aMax;
    const end = sign > 0 ? aMax : aMin;
    let previous: number | null = null;
    for (let k = 0; k < slope.steps; k++) {
      // Os degraus das pontas se estendem até o limite da escada.
      const a0 = k === 0 ? start : aFrom + ((aTo - aFrom) * k) / slope.steps;
      const a1 = k === slope.steps - 1 ? end : aFrom + ((aTo - aFrom) * (k + 1)) / slope.steps;
      const middle = (a0 + a1) / 2;
      const tread = slopeHeight(slope, alongX ? { x: middle, y: (cMin + cMax) / 2 } : { x: (cMin + cMax) / 2, y: middle }) + 0.01;
      quad(point(a0, cMin, tread), point(a1, cMin, tread), point(a1, cMax, tread), point(a0, cMax, tread));
      const below = previous ?? slope.fromM;
      if (Math.abs(below - tread) > 0.005) quad(point(a0, cMin, Math.min(below, tread)), point(a0, cMax, Math.min(below, tread)), point(a0, cMax, Math.max(below, tread)), point(a0, cMin, Math.max(below, tread)));
      previous = tread;
    }
  }
  const result = new BufferGeometry();
  result.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  result.computeVertexNormals();
  return result;
}

const LEDGE_LOW = new Color('#2f343c');
const LEDGE_HIGH = new Color('#59606b');
const RAMP_TINT = new Color('#c9b98f');

/**
 * Piso do terreno estruturado: topo plano por platô, rampas inclinadas e faces verticais nas bordas
 * entre níveis. Os degraus ficam por conta de buildTerrainStairs.
 */
export function buildStructuredFloor(geometry: MapGeometry, terrain: StructuredHeightField, frame: MapFrame, zones: TacticalZone[] = []): { floor: BufferGeometry; ledges: BufferGeometry } {
  const G = terrain.size;
  const S = frame.worldMeters;
  const span = Math.max(geometry.heightSpanMeters, 3);
  const included = new Uint8Array(G * G);
  for (let gy = 0; gy < G; gy++) {
    for (let gx = 0; gx < G; gx++) {
      if (!terrain.isFloorCell(gx, gy)) continue;
      // Uma célula a mais de margem passa por baixo das paredes e esconde o serrilhado da grade.
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = gx + dx;
          const y = gy + dy;
          if (x >= 0 && y >= 0 && x < G && y < G) included[y * G + x] = 1;
        }
      }
    }
  }

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const vertexIndex = new Map<string, number>();
  const color = new Color();
  const zoneColor = new Color();
  const tint = (x: number, y: number, height: number, ramp: boolean) => {
    color.copy(FLOOR_LOW).lerp(FLOOR_HIGH, Math.min(1, Math.max(0, height / span)));
    if (ramp) color.lerp(RAMP_TINT, 0.25);
    if (isSitePoint(geometry, x, y)) color.lerp(SITE_TINT, 0.55);
    for (const zone of zones) if (pointInRing(x, y, zone.ring)) color.lerp(zoneColor.set(zone.color), zone.strength);
    return color;
  };
  const vertex = (vx: number, vy: number, height: number, ramp: boolean) => {
    const key = `${vx},${vy},${Math.round(height * 1000)},${ramp ? 1 : 0}`;
    const existing = vertexIndex.get(key);
    if (existing !== undefined) return existing;
    const x = vx / G;
    const y = vy / G;
    positions.push((x - 0.5) * S, height, (y - 0.5) * S);
    const c = tint(x, y, height, ramp);
    colors.push(c.r, c.g, c.b);
    const index = positions.length / 3 - 1;
    vertexIndex.set(key, index);
    return index;
  };
  const corners = (gx: number, gy: number) => [terrain.cornerHeight(gx, gy, 0, 0), terrain.cornerHeight(gx, gy, 1, 0), terrain.cornerHeight(gx, gy, 1, 1), terrain.cornerHeight(gx, gy, 0, 1)];

  for (let gy = 0; gy < G; gy++) {
    for (let gx = 0; gx < G; gx++) {
      if (!included[gy * G + gx]) continue;
      const kind = terrain.kindOfCell(gx, gy);
      if (kind === CELL_STAIRS) continue;
      const [h00, h10, h11, h01] = corners(gx, gy) as [number, number, number, number];
      const ramp = kind === CELL_RAMP;
      const a = vertex(gx, gy, h00, ramp);
      const b = vertex(gx + 1, gy, h10, ramp);
      const c = vertex(gx + 1, gy + 1, h11, ramp);
      const d = vertex(gx, gy + 1, h01, ramp);
      indices.push(a, d, b, b, d, c);
    }
  }

  // Bordas: face vertical onde os cantos de duas células vizinhas não coincidem.
  const ledgePositions: number[] = [];
  const ledgeColors: number[] = [];
  const ledgeColor = new Color();
  const pushLedge = (points: number[][]) => {
    for (const p of points) {
      ledgePositions.push(...p);
      ledgeColor.copy(LEDGE_LOW).lerp(LEDGE_HIGH, Math.min(1, Math.max(0, p[1]! / span)));
      ledgeColors.push(ledgeColor.r, ledgeColor.g, ledgeColor.b);
    }
  };
  const edge = (p0: [number, number], p1: [number, number], a0: number, a1: number, b0: number, b1: number) => {
    if (Math.abs(a0 - b0) < 0.02 && Math.abs(a1 - b1) < 0.02) return;
    const w = (p: [number, number], h: number) => [(p[0] / G - 0.5) * S, h, (p[1] / G - 0.5) * S];
    pushLedge([w(p0, a0), w(p1, a1), w(p1, b1), w(p0, a0), w(p1, b1), w(p0, b0)]);
  };
  for (let gy = 0; gy < G; gy++) {
    for (let gx = 0; gx < G; gx++) {
      if (!included[gy * G + gx]) continue;
      const here = corners(gx, gy);
      const stairs = terrain.kindOfCell(gx, gy) === CELL_STAIRS;
      if (gx + 1 < G && included[gy * G + gx + 1] && !(stairs && terrain.kindOfCell(gx + 1, gy) === CELL_STAIRS)) {
        const there = corners(gx + 1, gy);
        edge([gx + 1, gy], [gx + 1, gy + 1], here[1]!, here[2]!, there[0]!, there[3]!);
      }
      if (gy + 1 < G && included[(gy + 1) * G + gx] && !(stairs && terrain.kindOfCell(gx, gy + 1) === CELL_STAIRS)) {
        const there = corners(gx, gy + 1);
        edge([gx, gy + 1], [gx + 1, gy + 1], here[3]!, here[2]!, there[0]!, there[1]!);
      }
    }
  }

  const floor = new BufferGeometry();
  floor.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  floor.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  floor.setAttribute('uv', new BufferAttribute(new Float32Array((positions.length / 3) * 2).map((_, i) => (i % 2 === 0 ? positions[(i / 2) * 3]! / S + 0.5 : 0.5 - positions[((i - 1) / 2) * 3 + 2]! / S)), 2));
  floor.setIndex(indices);
  floor.computeVertexNormals();
  const ledges = new BufferGeometry();
  ledges.setAttribute('position', new BufferAttribute(new Float32Array(ledgePositions), 3));
  ledges.setAttribute('color', new BufferAttribute(new Float32Array(ledgeColors), 3));
  ledges.computeVertexNormals();
  return { floor, ledges };
}

/** Faixas no piso marcando as entradas dos sites. */
export function buildThresholds(segments: Array<[MapPoint, MapPoint]>, heights: HeightField, frame: MapFrame, widthM = 0.7): BufferGeometry {
  const S = frame.worldMeters;
  const positions: number[] = [];
  for (const [a, b] of segments) {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) continue;
    const nx = (-(b.y - a.y) / length) * (widthM / 2 / S);
    const ny = ((b.x - a.x) / length) * (widthM / 2 / S);
    const steps = Math.max(1, Math.round((length * S) / 1.5));
    for (let i = 0; i < steps; i++) {
      const p = { x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps };
      const q = { x: a.x + ((b.x - a.x) * (i + 1)) / steps, y: a.y + ((b.y - a.y) * (i + 1)) / steps };
      const corner = (point: MapPoint, side: number) => {
        const x = point.x + nx * side;
        const y = point.y + ny * side;
        return [(x - 0.5) * S, heights.heightAt({ x, y }) + 0.08, (y - 0.5) * S];
      };
      positions.push(...corner(p, 1), ...corner(q, 1), ...corner(q, -1), ...corner(p, 1), ...corner(q, -1), ...corner(p, -1));
    }
  }
  const result = new BufferGeometry();
  result.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  result.computeVertexNormals();
  return result;
}

/**
 * Converte um raio do mundo em ponto do mapa, marchando até encontrar o relevo.
 * Sem cruzar o piso em um alcance razoável, usa o plano da altura mínima.
 */
export function rayToMapPoint(
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  frame: MapFrame,
  heights: HeightField | null,
): MapPoint | null {
  const S = frame.worldMeters;
  const toMap = (x: number, z: number): MapPoint => ({ x: x / S + 0.5, y: z / S + 0.5 });

  if (heights) {
    const step = 0.5;
    const maxDistance = S * 3;
    let previousAbove = origin.y - heights.heightAt(toMap(origin.x, origin.z));
    for (let t = step; t <= maxDistance; t += step) {
      const x = origin.x + direction.x * t;
      const y = origin.y + direction.y * t;
      const z = origin.z + direction.z * t;
      const above = y - heights.heightAt(toMap(x, z));
      if (above <= 0 && previousAbove > 0) {
        // Interpola entre as duas amostras para reduzir a imprecisão do passo.
        const ratio = previousAbove / (previousAbove - above);
        const hit = t - step + step * ratio;
        return toMap(origin.x + direction.x * hit, origin.z + direction.z * hit);
      }
      previousAbove = above;
    }
  }
  if (direction.y >= -1e-4) return null;
  const t = -origin.y / direction.y;
  return toMap(origin.x + direction.x * t, origin.z + direction.z * t);
}

/** Disco que acompanha o relevo: área de molotov, smoke no chão, área desenhada. */
export function buildGroundDisc(center: MapPoint, radiusM: number, frame: MapFrame, heights: HeightField | null, lift = 0.12): BufferGeometry {
  const S = frame.worldMeters;
  const rings = 6;
  const sides = 40;
  const positions: number[] = [];
  const indices: number[] = [];
  const add = (dx: number, dz: number) => {
    const x = center.x + dx / S;
    const y = center.y + dz / S;
    const h = (heights?.heightAt({ x, y }) ?? 0) + lift;
    positions.push((x - 0.5) * S, h, (y - 0.5) * S);
  };
  add(0, 0);
  for (let r = 1; r <= rings; r++) {
    const radius = (radiusM * r) / rings;
    for (let s = 0; s < sides; s++) {
      const angle = (s / sides) * Math.PI * 2;
      add(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
  }
  for (let s = 0; s < sides; s++) indices.push(0, 1 + ((s + 1) % sides), 1 + s);
  for (let r = 1; r < rings; r++) {
    const inner = 1 + (r - 1) * sides;
    const outer = 1 + r * sides;
    for (let s = 0; s < sides; s++) {
      const next = (s + 1) % sides;
      indices.push(inner + s, inner + next, outer + s, inner + next, outer + next, outer + s);
    }
  }
  const result = new BufferGeometry();
  result.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  result.setIndex(indices);
  result.computeVertexNormals();
  return result;
}

/**
 * Setor que acompanha o relevo: cone de visão da torreta, alcance de criaturas. Ângulos em radianos,
 * na mesma convenção das direções de mapa (0 aponta para +x).
 */
export function buildGroundSector(
  center: MapPoint,
  radiusM: number,
  startAngle: number,
  endAngle: number,
  frame: MapFrame,
  heights: HeightField | null,
  lift = 0.12,
  innerRadiusM = 0,
): BufferGeometry {
  const S = frame.worldMeters;
  const rings = 6;
  const sides = Math.max(6, Math.round(((endAngle - startAngle) / (Math.PI * 2)) * 48));
  const positions: number[] = [];
  const indices: number[] = [];
  const add = (dx: number, dz: number) => {
    const x = center.x + dx / S;
    const y = center.y + dz / S;
    positions.push((x - 0.5) * S, (heights?.heightAt({ x, y }) ?? 0) + lift, (y - 0.5) * S);
  };
  for (let r = 0; r <= rings; r++) {
    const radius = innerRadiusM + ((radiusM - innerRadiusM) * r) / rings;
    for (let s = 0; s <= sides; s++) {
      const angle = startAngle + ((endAngle - startAngle) * s) / sides;
      add(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
  }
  const row = sides + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < sides; s++) {
      const a = r * row + s;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const result = new BufferGeometry();
  result.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  result.setIndex(indices);
  result.computeVertexNormals();
  return result;
}

/** Quadrilátero no chão (faixa direcional, área de explosão), subdividido para acompanhar o terreno. */
export function buildGroundQuad(corners: MapPoint[], frame: MapFrame, heights: HeightField | null, lift = 0.12, stepM = 1.5): BufferGeometry {
  const S = frame.worldMeters;
  const [a, b, c, d] = corners as [MapPoint, MapPoint, MapPoint, MapPoint];
  const lengthM = Math.hypot(b.x - a.x, b.y - a.y) * S;
  const widthM = Math.hypot(d.x - a.x, d.y - a.y) * S;
  const nu = Math.max(1, Math.min(64, Math.round(lengthM / stepM)));
  const nv = Math.max(1, Math.min(32, Math.round(widthM / stepM)));
  const positions: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const v = j / nv;
      const x = a.x + (b.x - a.x) * u + (d.x - a.x) * v;
      const y = a.y + (b.y - a.y) * u + (d.y - a.y) * v;
      positions.push((x - 0.5) * S, (heights?.heightAt({ x, y }) ?? 0) + lift, (y - 0.5) * S);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const p = j * (nu + 1) + i;
      indices.push(p, p + nu + 1, p + 1, p + 1, p + nu + 1, p + nu + 2);
    }
  }
  void c;
  const result = new BufferGeometry();
  result.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  result.setIndex(indices);
  result.computeVertexNormals();
  return result;
}

/** Faixa vertical sobre uma polilinha: paredes de habilidade. */
export function buildRibbon(points: MapPoint[], heightM: number, frame: MapFrame, heights: HeightField | null): BufferGeometry {
  const S = frame.worldMeters;
  const positions: number[] = [];
  const at = (p: MapPoint) => {
    const ground = heights?.heightAt(p) ?? 0;
    return { x: (p.x - 0.5) * S, z: (p.y - 0.5) * S, ground };
  };
  for (let i = 0; i < points.length - 1; i++) {
    const a = at(points[i]!);
    const b = at(points[i + 1]!);
    positions.push(a.x, a.ground, a.z, b.x, b.ground, b.z, b.x, b.ground + heightM, b.z);
    positions.push(a.x, a.ground, a.z, b.x, b.ground + heightM, b.z, a.x, a.ground + heightM, a.z);
  }
  const result = new BufferGeometry();
  result.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  result.computeVertexNormals();
  return result;
}

/** Polilinha acima do relevo com um arco, que sobe até `arcM` no meio do percurso. */
export function arcedPolyline(points: MapPoint[], frame: MapFrame, heights: HeightField | null, lift: number, arcM: number): Array<[number, number, number]> {
  const base = polylineOverTerrain(points, frame, heights, lift);
  if (arcM <= 0 || base.length < 2) return base;
  return base.map(([x, y, z], index) => {
    const t = index / (base.length - 1);
    return [x, y + arcM * 4 * t * (1 - t), z];
  });
}

/** Amostra uma polilinha sobre o relevo, subdividindo trechos longos para não cortar rampas. */
export function polylineOverTerrain(
  points: MapPoint[],
  frame: MapFrame,
  heights: HeightField | null,
  lift = 0.25,
  maxStepMeters = 1.5,
): Array<[number, number, number]> {
  const S = frame.worldMeters;
  const out: Array<[number, number, number]> = [];
  const push = (p: MapPoint) => out.push([(p.x - 0.5) * S, (heights?.heightAt(p) ?? 0) + lift, (p.y - 0.5) * S]);
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    push(a);
    const b = points[i + 1];
    if (!b) break;
    const meters = Math.hypot(b.x - a.x, b.y - a.y) * S;
    const steps = Math.min(64, Math.floor(meters / maxStepMeters));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}
