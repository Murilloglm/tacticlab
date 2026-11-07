// Monta as malhas do cenário de um mapa. Com layout tático, usa as coberturas revisadas à mão e
// tampa os vazios. Sem layout, é a mesma geometria gerada de antes. Sem WebGL, testável em Node.
import { BufferGeometry, EdgesGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LoadedMapGeometry } from '../maps/geometry';
import { buildExtrudedGeometry, buildFloorGeometry, buildRampStripes, buildSolidsGeometry, buildVoidCaps, SCHEMATIC_HEIGHTS, shadeByHeight } from './mapMeshes';

export type ScenarioDetail = 'tactical' | 'generated';

export interface Scenario {
  detail: ScenarioDetail;
  floor: BufferGeometry;
  walls: BufferGeometry;
  /** Geometria gerada: muretas e caixas, ausentes quando o layout traz as próprias coberturas. */
  rails: BufferGeometry | null;
  boxes: BufferGeometry | null;
  solids: BufferGeometry | null;
  rampStripes: BufferGeometry | null;
  /** Contornos das coberturas e das paredes, que separam os volumes sem textura. */
  edges: BufferGeometry | null;
  stats: { solids: number; ramps: number };
}

const EDGE_ANGLE = 40;

function mergeEdges(geometries: BufferGeometry[]): BufferGeometry {
  const edges = geometries.map((geometry) => new EdgesGeometry(geometry, EDGE_ANGLE));
  const merged = mergeGeometries(edges, false);
  for (const edge of edges) edge.dispose();
  return merged ?? new BufferGeometry();
}

export function buildScenario(map: LoadedMapGeometry): Scenario {
  const { geometry, heights, frame, layout } = map;
  if (!layout) {
    return {
      detail: 'generated',
      floor: buildFloorGeometry(geometry, heights, frame),
      walls: buildExtrudedGeometry(geometry.walls, heights, frame, SCHEMATIC_HEIGHTS.wall),
      rails: buildExtrudedGeometry(geometry.rails, heights, frame, SCHEMATIC_HEIGHTS.rail),
      boxes: buildExtrudedGeometry(geometry.boxes, heights, frame, SCHEMATIC_HEIGHTS.box),
      solids: null,
      rampStripes: null,
      edges: null,
      stats: { solids: 0, ramps: 0 },
    };
  }

  const height = layout.wallHeightM;
  const body = buildExtrudedGeometry(geometry.walls, heights, frame, height);
  const caps = buildVoidCaps(geometry.walls, heights, frame, height);
  const merged = mergeGeometries([body, caps], false) ?? body;
  if (merged !== body) body.dispose();
  caps.dispose();
  const walls = shadeByHeight(merged, heights, frame, height, '#3b4048', '#6d747f', '#4c525c');
  const solids = buildSolidsGeometry(layout.solids, heights, frame);

  return {
    detail: 'tactical',
    floor: buildFloorGeometry(geometry, heights, frame, layout.zones),
    walls,
    rails: null,
    boxes: null,
    solids,
    rampStripes: buildRampStripes(layout.ramps, heights, frame),
    edges: mergeEdges([walls, solids]),
    stats: { solids: layout.solids.length, ramps: layout.ramps.length },
  };
}

export function disposeScenario(scenario: Scenario): void {
  for (const geometry of [scenario.floor, scenario.walls, scenario.rails, scenario.boxes, scenario.solids, scenario.rampStripes, scenario.edges]) {
    geometry?.dispose();
  }
}
