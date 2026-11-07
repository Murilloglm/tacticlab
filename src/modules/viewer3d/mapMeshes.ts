// Constrói as malhas do mapa a partir dos dados gerados. Funções puras, testáveis sem WebGL.
// Materiais simples e uma única geometria por classe mantêm o cenário leve no celular.
import { BufferAttribute, BufferGeometry, Color, ShapeUtils, Vector2 } from 'three';
import type { MapFrame, MapPoint } from '../coordinates';
import type { HeightField, MapGeometry } from '../maps/geometry';

/** Alturas esquemáticas, em metros. Não vêm do jogo; servem para dar leitura ao volume. */
export const SCHEMATIC_HEIGHTS = { wall: 4.5, rail: 1.1, box: 1.8 };

const FLOOR_LOW = new Color('#3a3f47');
const FLOOR_HIGH = new Color('#9aa1ad');
const SITE_TINT = new Color('#a2383f');

function pointInRing(x: number, y: number, ring: number[]): boolean {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i * 2]!;
    const yi = ring[i * 2 + 1]!;
    const xj = ring[j * 2]!;
    const yj = ring[j * 2 + 1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInPolygon(x: number, y: number, polygon: number[][]): boolean {
  const [outer, ...holes] = polygon;
  if (!outer || !pointInRing(x, y, outer)) return false;
  return !holes.some((hole) => pointInRing(x, y, hole));
}

function isSitePoint(geometry: MapGeometry, x: number, y: number): boolean {
  return geometry.sites.some((site) => site.polygons.some((polygon) => pointInPolygon(x, y, polygon)));
}

/** Piso em grade, com cor por altura e tom próprio nos sites. */
export function buildFloorGeometry(geometry: MapGeometry, heights: HeightField, frame: MapFrame): BufferGeometry {
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
    colors.push(color.r, color.g, color.b);
    const index = positions.length / 3 - 1;
    vertexIndex[key] = index;
    return index;
  };

  for (let gy = 0; gy < G; gy++) {
    for (let gx = 0; gx < G; gx++) {
      if (!included[gy * G + gx]) continue;
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
): BufferGeometry {
  const S = frame.worldMeters;
  const positions: number[] = [];

  const push = (x: number, y: number, z: number) => positions.push(x, y, z);
  const world = (p: Vector2) => {
    const ground = heights.heightAt({ x: p.x, y: p.y });
    return { x: (p.x - 0.5) * S, z: (p.y - 0.5) * S, bottom: ground - 0.15, top: ground + extrude };
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
