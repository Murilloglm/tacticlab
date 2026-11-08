// Geometria esquemática de cada mapa, gerada por scripts/generate-map-data.mjs.
// Não contém colisão real do jogo: é uma reconstrução aproximada a partir do minimapa e
// dos callouts da Valorant-API, identificada como tal na interface.
import { z } from 'zod';
import type { MapFrame } from '../coordinates';
import { loadTacticalLayout } from './tactical';
import type { TacticalLayout } from './tactical/types';
import { HeightField } from './heightField';
import { structureTerrain } from './terrain';

export { HeightField, pointInRing } from './heightField';
export { StructuredHeightField } from './terrain';

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
  const siteRings = map.geometry.sites.flatMap((site) => site.polygons.map((polygon) => polygon[0]!).filter(Boolean));
  return { ...map, heights: structureTerrain(map.heights, layout, siteRings), layout };
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
