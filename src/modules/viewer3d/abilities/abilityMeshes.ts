// Geometrias 3D das habilidades. Modelos genéricos de poucos polígonos, sem arquivo externo:
// olham para +X, têm a base em y = 0 e são guardados em cache por modelo e cor.
import { BufferGeometry, CylinderGeometry, SphereGeometry } from 'three';
import type { AbilityModelId } from '../../abilities/definitions';
import { ball, box, cone, cylinder, mergeParts, torus, type Part } from '../lowpoly';

const DARK = '#3a404a';
const MID = '#6d7581';
const LIGHT = '#d9dee5';

type Vec3 = [number, number, number];
const v = (x: number, y: number, z: number): Vec3 => [x, y, z];

const BUILDERS: Record<AbilityModelId, (accent: string) => Part[]> = {
  // Quadrúpede genérico de patrulha.
  wolf: (accent) => [
    { geometry: box(0.82, 0.3, 0.3), at: v(0, 0.62, 0), color: MID },
    { geometry: box(0.36, 0.34, 0.32), at: v(0.3, 0.66, 0), color: accent },
    { geometry: box(0.28, 0.24, 0.22), at: v(0.58, 0.84, 0), color: MID },
    { geometry: box(0.2, 0.1, 0.13), at: v(0.78, 0.8, 0), color: DARK },
    { geometry: cone(0.05, 0.16, 4), at: v(0.52, 1.02, 0.08), color: DARK },
    { geometry: cone(0.05, 0.16, 4), at: v(0.52, 1.02, -0.08), color: DARK },
    { geometry: box(0.02, 0.05, 0.16), at: v(0.71, 0.88, 0), color: LIGHT },
    { geometry: cylinder(0.05, 0.03, 0.5, 4), at: v(-0.55, 0.72, 0), rotate: v(0, 0, 0.9), color: accent },
    ...[v(0.3, 0.25, 0.11), v(0.3, 0.25, -0.11), v(-0.3, 0.25, 0.11), v(-0.3, 0.25, -0.11)].map((at) => ({ geometry: cylinder(0.05, 0.035, 0.5, 4), at, color: DARK })),
  ],
  // Criatura pequena e arredondada: corpo, olho e patas.
  minion: (accent) => [
    { geometry: ball(0.32, 1), at: v(0, 0.48, 0), scale: v(1.1, 0.9, 1), color: accent },
    { geometry: ball(0.11, 0), at: v(0.28, 0.58, 0), color: LIGHT },
    { geometry: ball(0.05, 0), at: v(0.37, 0.59, 0), color: DARK },
    { geometry: cone(0.07, 0.2, 4), at: v(-0.08, 0.84, 0.13), color: DARK },
    { geometry: cone(0.07, 0.2, 4), at: v(-0.08, 0.84, -0.13), color: DARK },
    { geometry: cylinder(0.06, 0.04, 0.22, 4), at: v(0.08, 0.11, 0.17), color: DARK },
    { geometry: cylinder(0.06, 0.04, 0.22, 4), at: v(0.08, 0.11, -0.17), color: DARK },
    { geometry: cylinder(0.06, 0.04, 0.22, 4), at: v(-0.14, 0.11, 0), color: DARK },
  ],
  arrow: (accent) => [
    { geometry: cylinder(0.03, 0.03, 1.1, 5), at: v(0, 0, 0), rotate: v(0, 0, Math.PI / 2), color: MID },
    { geometry: cone(0.08, 0.26, 5), at: v(0.66, 0, 0), rotate: v(0, 0, -Math.PI / 2), color: accent },
    { geometry: box(0.24, 0.02, 0.26), at: v(-0.46, 0, 0), color: accent },
    { geometry: box(0.24, 0.26, 0.02), at: v(-0.46, 0, 0), color: accent },
  ],
  orb: (accent) => [
    { geometry: ball(0.32, 1), at: v(0, 0.55, 0), color: accent },
    { geometry: torus(0.44, 0.03), at: v(0, 0.55, 0), rotate: v(Math.PI / 2, 0, 0), color: LIGHT },
  ],
  drone: (accent) => [
    { geometry: box(0.46, 0.14, 0.3), at: v(0, 0.6, 0), color: MID },
    { geometry: ball(0.09, 0), at: v(0.26, 0.6, 0), color: accent },
    ...[v(0.2, 0.68, 0.26), v(0.2, 0.68, -0.26), v(-0.2, 0.68, 0.26), v(-0.2, 0.68, -0.26)].map((at) => ({ geometry: cylinder(0.14, 0.14, 0.02, 8), at, color: DARK })),
    { geometry: box(0.52, 0.03, 0.04), at: v(0, 0.65, 0.26), color: DARK },
    { geometry: box(0.52, 0.03, 0.04), at: v(0, 0.65, -0.26), color: DARK },
  ],
  // Torreta sobre tripé, com o cano na direção escolhida.
  turret: (accent) => [
    { geometry: cylinder(0.04, 0.06, 0.62, 4), at: v(0.14, 0.28, 0.14), rotate: v(0.35, 0, -0.35), color: DARK },
    { geometry: cylinder(0.04, 0.06, 0.62, 4), at: v(0.14, 0.28, -0.14), rotate: v(-0.35, 0, -0.35), color: DARK },
    { geometry: cylinder(0.04, 0.06, 0.62, 4), at: v(-0.2, 0.28, 0), rotate: v(0, 0, 0.4), color: DARK },
    { geometry: box(0.4, 0.26, 0.32), at: v(0, 0.68, 0), color: accent },
    { geometry: cylinder(0.045, 0.045, 0.56, 5), at: v(0.46, 0.7, 0), rotate: v(0, 0, Math.PI / 2), color: DARK },
    { geometry: box(0.03, 0.08, 0.18), at: v(0.21, 0.74, 0), color: LIGHT },
  ],
  // Robô rasteiro de alerta: domo sobre base com rodas.
  'alarm-bot': (accent) => [
    { geometry: cylinder(0.26, 0.3, 0.14, 8), at: v(0, 0.13, 0), color: DARK },
    { geometry: ball(0.25, 1), at: v(0, 0.33, 0), scale: v(1, 0.8, 1), color: accent },
    { geometry: box(0.03, 0.06, 0.2), at: v(0.23, 0.36, 0), color: LIGHT },
    { geometry: cylinder(0.012, 0.012, 0.22, 4), at: v(-0.08, 0.6, 0), color: DARK },
    { geometry: ball(0.04, 0), at: v(-0.08, 0.72, 0), color: LIGHT },
  ],
  trap: (accent) => [
    { geometry: cylinder(0.32, 0.36, 0.08, 8), at: v(0, 0.05, 0), color: DARK },
    { geometry: cone(0.14, 0.36, 5), at: v(0, 0.26, 0), color: accent },
  ],
  sensor: (accent) => [
    { geometry: cylinder(0.03, 0.06, 0.9, 5), at: v(0, 0.45, 0), color: DARK },
    { geometry: ball(0.17, 1), at: v(0, 0.98, 0), color: accent },
    { geometry: box(0.03, 0.05, 0.14), at: v(0.16, 1, 0), color: LIGHT },
  ],
  puck: (accent) => [
    { geometry: cylinder(0.3, 0.34, 0.14, 8), at: v(0, 0.08, 0), color: DARK },
    { geometry: cylinder(0.18, 0.24, 0.16, 8), at: v(0, 0.23, 0), color: accent },
  ],
};

const modelCache = new Map<string, BufferGeometry>();

/** Geometria compartilhada entre instâncias: há uma por modelo e cor, nunca descartada. */
export function abilityModelGeometry(model: AbilityModelId, accent: string): BufferGeometry {
  const key = `${model}|${accent}`;
  let geometry = modelCache.get(key);
  if (!geometry) {
    geometry = mergeParts(BUILDERS[model](accent));
    modelCache.set(key, geometry);
  }
  return geometry;
}

export const ABILITY_MODEL_IDS = Object.keys(BUILDERS) as AbilityModelId[];

/** Domo facetado de raio e altura canônicos, com a base em y = 0. */
export function smokeVolumeGeometry(radiusM: number, heightM: number): BufferGeometry {
  const geometry = new SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
  geometry.scale(radiusM, heightM, radiusM);
  geometry.computeVertexNormals();
  return geometry;
}

/** Parede sólida em blocos ao longo de X, centrada na origem, com a base em y = 0. */
export function segmentedWallGeometry(lengthM: number, heightM: number, thicknessM: number, segments: number, color: string): BufferGeometry {
  const gap = 0.06;
  const width = lengthM / segments;
  const parts: Part[] = [];
  for (let i = 0; i < segments; i++) {
    const x = -lengthM / 2 + width * (i + 0.5);
    parts.push({ geometry: box(width - gap, heightM, thicknessM), at: v(x, heightM / 2, 0), color });
    parts.push({ geometry: box(width - gap - 0.12, 0.08, thicknessM + 0.04), at: v(x, heightM + 0.02, 0), color: LIGHT });
  }
  return mergeParts(parts);
}

/** Borda baixa em volta de uma área no chão, para ela ser lida de lado. */
export function areaRimGeometry(radiusM: number, heightM: number): BufferGeometry {
  const geometry = new CylinderGeometry(radiusM, radiusM, heightM, 28, 1, true);
  geometry.translate(0, heightM / 2, 0);
  return geometry;
}
