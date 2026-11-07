// Geometria esquemática de cada mapa, gerada por scripts/generate-map-data.mjs.
// Não contém colisão real do jogo: é uma reconstrução aproximada a partir do minimapa e
// dos callouts da Valorant-API, identificada como tal na interface.
import { z } from 'zod';
import type { MapFrame, MapPoint } from '../coordinates';
import { loadTacticalLayout } from './tactical';
import type { TacticalLayout, TacticalRamp } from './tactical/types';

const ring = z.array(z.number());
const polygon = z.array(ring).min(1);

const geometrySchema = z.object({
  version: z.number(),
  mapId: z.string(),
  name: z.string(),
  approximate: z.literal(true),
  frame: z.object({ worldMeters: z.number().positive(), scaleKnown: z.boolean() }),
  alignment: z.object({ dx: z.number(), dy: z.number(), source: z.string() }),
  calloutsReliable: z.boolean(),
  grid: z.object({ size: z.number().int().positive(), heightsDm: z.string(), floorBits: z.string() }),
  heightSpanMeters: z.number(),
  heightAnchors: z.number(),
  walls: z.array(polygon),
  rails: z.array(polygon),
  boxes: z.array(polygon),
  sites: z.array(z.object({ label: z.string(), center: z.object({ x: z.number(), y: z.number() }), polygons: z.array(polygon) })),
  callouts: z.array(
    z.object({ x: z.number(), y: z.number(), z: z.number(), name: z.string(), site: z.string().nullable(), spawn: z.string().nullable() }),
  ),
  features: z.array(z.object({ type: z.string(), x: z.number(), y: z.number() })),
  gameVersion: z.string().optional(),
});

export type MapGeometry = z.infer<typeof geometrySchema>;

function decodeBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function pointInRing(x: number, y: number, ring: number[]): boolean {
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

export class HeightField {
  readonly size: number;
  private readonly heights: Uint8Array;
  private readonly floor: Uint8Array;

  constructor(grid: MapGeometry['grid'] | { size: number; heights: Uint8Array; floor: Uint8Array }) {
    this.size = grid.size;
    this.heights = 'heights' in grid ? grid.heights : decodeBase64(grid.heightsDm);
    this.floor = 'floor' in grid ? grid.floor : decodeBase64(grid.floorBits);
  }

  /** Novo campo com as rampas alisadas: altura linear entre os pontos de início e fim de cada uma. */
  withRamps(ramps: TacticalRamp[]): HeightField {
    const heights = this.heights.slice();
    const G = this.size;
    for (const ramp of ramps) {
      const from = this.heightAt(ramp.from);
      const to = this.heightAt(ramp.to);
      const dx = ramp.to.x - ramp.from.x;
      const dy = ramp.to.y - ramp.from.y;
      const lengthSq = dx * dx + dy * dy || 1;
      for (let gy = 0; gy < G; gy++) {
        for (let gx = 0; gx < G; gx++) {
          const x = (gx + 0.5) / G;
          const y = (gy + 0.5) / G;
          if (!this.isFloorCell(gx, gy) || !pointInRing(x, y, ramp.ring)) continue;
          const t = Math.min(1, Math.max(0, ((x - ramp.from.x) * dx + (y - ramp.from.y) * dy) / lengthSq));
          heights[gy * G + gx] = Math.round((from + (to - from) * t) * 10);
        }
      }
    }
    return new HeightField({ size: G, heights, floor: this.floor });
  }

  isFloorCell(gx: number, gy: number): boolean {
    if (gx < 0 || gy < 0 || gx >= this.size || gy >= this.size) return false;
    const i = gy * this.size + gx;
    return ((this.floor[i >> 3]! >> (i & 7)) & 1) === 1;
  }

  /** Altura da célula em metros. */
  cellHeight(gx: number, gy: number): number {
    const x = Math.max(0, Math.min(this.size - 1, gx));
    const y = Math.max(0, Math.min(this.size - 1, gy));
    return this.heights[y * this.size + x]! / 10;
  }

  /** Altura aproximada do piso em um ponto do mapa, com interpolação bilinear. */
  heightAt(point: MapPoint): number {
    const fx = point.x * this.size - 0.5;
    const fy = point.y * this.size - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const a = this.cellHeight(x0, y0);
    const b = this.cellHeight(x0 + 1, y0);
    const c = this.cellHeight(x0, y0 + 1);
    const d = this.cellHeight(x0 + 1, y0 + 1);
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
}

export interface LoadedMapGeometry {
  geometry: MapGeometry;
  frame: MapFrame;
  heights: HeightField;
  /** Camada revisada à mão. Nula nos mapas que só têm a geometria gerada. */
  layout: TacticalLayout | null;
}

const cache = new Map<string, Promise<LoadedMapGeometry>>();

export function parseGeometry(data: unknown): LoadedMapGeometry {
  const geometry = geometrySchema.parse(data);
  return { geometry, frame: geometry.frame as MapFrame, heights: new HeightField(geometry.grid), layout: null };
}

export function applyTacticalLayout(map: LoadedMapGeometry, layout: TacticalLayout): LoadedMapGeometry {
  return { ...map, heights: map.heights.withRamps(layout.ramps), layout };
}

export function loadMapGeometry(mapId: string): Promise<LoadedMapGeometry> {
  let pending = cache.get(mapId);
  if (!pending) {
    pending = fetch(`${import.meta.env.BASE_URL}data/maps/${mapId}.json`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Geometria deste mapa ainda não foi gerada (${response.status}).`);
        const map = parseGeometry(await response.json());
        const layout = await loadTacticalLayout(mapId);
        return layout ? applyTacticalLayout(map, layout) : map;
      })
      .catch((error: unknown) => {
        cache.delete(mapId);
        throw error;
      });
    cache.set(mapId, pending);
  }
  return pending;
}
