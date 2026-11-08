// Geometrias 3D das habilidades. Modelos genéricos de poucos polígonos, sem arquivo externo e sem
// imitar o desenho do jogo: a forma comunica a função (criatura que corre, torreta, robô, seta).
// Olham para +X, têm a base em y = 0, medem em metros e ficam em cache por modelo e cor.
import { BufferGeometry, CylinderGeometry, IcosahedronGeometry, SphereGeometry } from 'three';
import type { AbilityModelId } from '../../abilities/definitions';
import { ball, box, cone, cylinder, mergeParts, torus, type Part } from '../lowpoly';

const DARK = '#3a404a';
const MID = '#6d7581';
const LIGHT = '#eef2f6';

type Vec3 = [number, number, number];
const v = (x: number, y: number, z: number): Vec3 => [x, y, z];

const BUILDERS: Record<AbilityModelId, (accent: string) => Part[]> = {
  // Quadrúpede de patrulha em corrida: cerca de 1,2 m de comprimento e 0,75 m de cernelha.
  wolf: (accent) => [
    { geometry: box(0.7, 0.3, 0.3), at: v(0, 0.6, 0), color: MID },
    { geometry: box(0.32, 0.38, 0.33), at: v(0.3, 0.63, 0), color: accent },
    { geometry: box(0.28, 0.3, 0.29), at: v(-0.32, 0.58, 0), color: MID },
    { geometry: box(0.2, 0.24, 0.18), at: v(0.5, 0.78, 0), rotate: v(0, 0, -0.6), color: MID },
    { geometry: box(0.28, 0.2, 0.2), at: v(0.64, 0.88, 0), color: MID },
    { geometry: box(0.22, 0.1, 0.13), at: v(0.84, 0.84, 0), color: DARK },
    { geometry: cone(0.05, 0.15, 4), at: v(0.58, 1.03, 0.07), color: DARK },
    { geometry: cone(0.05, 0.15, 4), at: v(0.58, 1.03, -0.07), color: DARK },
    { geometry: box(0.02, 0.04, 0.15), at: v(0.78, 0.92, 0), color: LIGHT },
    { geometry: box(0.5, 0.03, 0.08), at: v(-0.02, 0.76, 0), color: accent },
    { geometry: cylinder(0.05, 0.02, 0.4, 4), at: v(-0.55, 0.7, 0), rotate: v(0, 0, 1.1), color: accent },
    // Patas em passada: as dianteiras avançam e as traseiras empurram.
    { geometry: cylinder(0.05, 0.035, 0.56, 4), at: v(0.44, 0.29, 0.1), rotate: v(0, 0, 0.38), color: DARK },
    { geometry: cylinder(0.05, 0.035, 0.56, 4), at: v(0.3, 0.29, -0.1), rotate: v(0, 0, 0.12), color: DARK },
    { geometry: cylinder(0.055, 0.035, 0.56, 4), at: v(-0.4, 0.29, 0.1), rotate: v(0, 0, -0.38), color: DARK },
    { geometry: cylinder(0.055, 0.035, 0.56, 4), at: v(-0.26, 0.29, -0.1), rotate: v(0, 0, -0.12), color: DARK },
  ],
  // Criatura pequena (cerca de 0,8 m): corpo arredondado, olho grande à frente, crista e pés curtos.
  minion: (accent) => [
    { geometry: ball(0.3, 1), at: v(0, 0.44, 0), scale: v(1.05, 0.95, 0.92), color: accent },
    { geometry: ball(0.13, 1), at: v(0.24, 0.52, 0), color: LIGHT },
    { geometry: ball(0.06, 0), at: v(0.35, 0.53, 0), color: DARK },
    { geometry: cone(0.07, 0.24, 4), at: v(-0.04, 0.8, 0.12), rotate: v(0.4, 0, 0), color: DARK },
    { geometry: cone(0.07, 0.24, 4), at: v(-0.04, 0.8, -0.12), rotate: v(-0.4, 0, 0), color: DARK },
    { geometry: cylinder(0.04, 0.035, 0.24, 4), at: v(0.06, 0.38, 0.31), rotate: v(0.9, 0, 0), color: DARK },
    { geometry: cylinder(0.04, 0.035, 0.24, 4), at: v(0.06, 0.38, -0.31), rotate: v(-0.9, 0, 0), color: DARK },
    { geometry: cylinder(0.05, 0.04, 0.16, 4), at: v(0.02, 0.12, 0.13), color: DARK },
    { geometry: cylinder(0.05, 0.04, 0.16, 4), at: v(0.02, 0.12, -0.13), color: DARK },
    { geometry: box(0.16, 0.07, 0.12), at: v(0.06, 0.04, 0.13), color: DARK },
    { geometry: box(0.16, 0.07, 0.12), at: v(0.06, 0.04, -0.13), color: DARK },
    { geometry: cone(0.06, 0.22, 4), at: v(-0.32, 0.36, 0), rotate: v(0, 0, 1.9), color: accent },
  ],
  // Seta de reconhecimento: haste, ponta com sensor e aletas. 1,2 m.
  arrow: (accent) => [
    { geometry: cylinder(0.03, 0.03, 1.1, 5), at: v(0, 0, 0), rotate: v(0, 0, Math.PI / 2), color: MID },
    { geometry: cone(0.08, 0.26, 5), at: v(0.66, 0, 0), rotate: v(0, 0, -Math.PI / 2), color: accent },
    { geometry: torus(0.07, 0.02), at: v(0.46, 0, 0), rotate: v(0, Math.PI / 2, 0), color: LIGHT },
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
  // Torreta sobre tripé (cerca de 1 m), com cano e visor na direção escolhida.
  turret: (accent) => [
    { geometry: cylinder(0.035, 0.05, 0.68, 4), at: v(0.17, 0.3, 0.17), rotate: v(0.42, 0, -0.42), color: DARK },
    { geometry: cylinder(0.035, 0.05, 0.68, 4), at: v(0.17, 0.3, -0.17), rotate: v(-0.42, 0, -0.42), color: DARK },
    { geometry: cylinder(0.035, 0.05, 0.68, 4), at: v(-0.24, 0.3, 0), rotate: v(0, 0, 0.5), color: DARK },
    { geometry: cylinder(0.1, 0.13, 0.14, 6), at: v(0, 0.6, 0), color: DARK },
    { geometry: box(0.44, 0.3, 0.36), at: v(0.02, 0.8, 0), color: accent },
    { geometry: box(0.03, 0.12, 0.26), at: v(0.25, 0.84, 0), color: LIGHT },
    { geometry: cylinder(0.05, 0.05, 0.5, 6), at: v(0.47, 0.76, 0), rotate: v(0, 0, Math.PI / 2), color: DARK },
    { geometry: cylinder(0.07, 0.07, 0.06, 6), at: v(0.72, 0.76, 0), rotate: v(0, 0, Math.PI / 2), color: DARK },
    { geometry: cylinder(0.012, 0.012, 0.26, 4), at: v(-0.12, 1.08, 0.12), color: DARK },
  ],
  // Robô rasteiro de alerta (cerca de 0,55 m): domo sobre base com rodas e visor à frente.
  'alarm-bot': (accent) => [
    { geometry: cylinder(0.12, 0.12, 0.06, 8), at: v(0, 0.12, 0.24), rotate: v(Math.PI / 2, 0, 0), color: DARK },
    { geometry: cylinder(0.12, 0.12, 0.06, 8), at: v(0, 0.12, -0.24), rotate: v(Math.PI / 2, 0, 0), color: DARK },
    { geometry: cylinder(0.27, 0.3, 0.12, 8), at: v(0, 0.18, 0), color: DARK },
    { geometry: ball(0.26, 1), at: v(0, 0.34, 0), scale: v(1, 0.85, 1), color: accent },
    { geometry: box(0.04, 0.07, 0.24), at: v(0.24, 0.38, 0), color: LIGHT },
    { geometry: cylinder(0.012, 0.012, 0.22, 4), at: v(-0.08, 0.62, 0), color: DARK },
    { geometry: ball(0.04, 0), at: v(-0.08, 0.74, 0), color: LIGHT },
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

export type SmokeVolumeKind = 'sphere' | 'dome' | 'cylinder';

const volumeCache = new Map<SmokeVolumeKind, BufferGeometry>();

/**
 * Volume de raio 1 e base em y = 0, compartilhado e escalado por instância.
 * Esfera: centro na origem, posicionada pelo renderizador. Domo e cilindro: altura 1.
 */
export function unitVolumeGeometry(kind: SmokeVolumeKind): BufferGeometry {
  let geometry = volumeCache.get(kind);
  if (geometry) return geometry;
  if (kind === 'sphere') geometry = new IcosahedronGeometry(1, 2);
  else if (kind === 'dome') geometry = new SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  else geometry = new CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0);
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  flat.computeVertexNormals();
  volumeCache.set(kind, flat);
  return flat;
}

/**
 * Posição e escala do volume: a esfera fica com o centro acima do piso, de forma que a parte
 * visível tenha a altura da calibração. Domo e cilindro sobem da base.
 */
export function volumeTransform(kind: SmokeVolumeKind, radiusM: number, heightM: number): { lift: number; scale: Vec3 } {
  if (kind === 'sphere') return { lift: heightM - radiusM, scale: v(radiusM, radiusM, radiusM) };
  return { lift: 0, scale: v(radiusM, heightM, radiusM) };
}

const wallCache = new Map<string, BufferGeometry>();

/**
 * Parede sólida em blocos ao longo de X, centrada na origem, com a base em y = 0. Cada bloco é um
 * prisma levemente afunilado com topo facetado, para ler como blocos de gelo e não como caixas.
 */
export function segmentedWallGeometry(lengthM: number, heightM: number, thicknessM: number, segments: number, color: string): BufferGeometry {
  const key = `${lengthM}|${heightM}|${thicknessM}|${segments}|${color}`;
  const cached = wallCache.get(key);
  if (cached) return cached;
  const gap = 0.08;
  const width = lengthM / segments;
  const body = heightM * 0.82;
  const parts: Part[] = [];
  for (let i = 0; i < segments; i++) {
    const x = -lengthM / 2 + width * (i + 0.5);
    // O cilindro de 4 lados, girado 45°, vira um prisma de base quadrada; a escala ajusta largura e espessura.
    const half = Math.SQRT1_2;
    parts.push({ geometry: new CylinderGeometry(half * 0.9, half, body, 4), at: v(x, body / 2, 0), rotate: v(0, Math.PI / 4, 0), scale: v(width - gap, 1, thicknessM), color });
    parts.push({ geometry: new CylinderGeometry(0.05, half * 0.9, heightM - body, 4), at: v(x, body + (heightM - body) / 2, 0), rotate: v(0, Math.PI / 4, 0), scale: v(width - gap, 1, thicknessM), color: LIGHT });
  }
  const geometry = mergeParts(parts);
  wallCache.set(key, geometry);
  return geometry;
}

const rimCache = new Map<number, BufferGeometry>();

/** Borda baixa em volta de uma área no chão, de raio 1, escalada por instância. */
export function areaRimGeometry(heightM = 0.3): BufferGeometry {
  let geometry = rimCache.get(heightM);
  if (!geometry) {
    geometry = new CylinderGeometry(1, 1, heightM, 32, 1, true).translate(0, heightM / 2, 0);
    rimCache.set(heightM, geometry);
  }
  return geometry;
}
