// Atalhos para escrever layouts a partir do minimapa. As coordenadas são pixels da imagem de
// 1024 px da Valorant-API, para cada valor poder ser conferido direto na imagem.
import type { SolidKind, TacticalEntrance, TacticalRamp, TacticalSolid, TacticalZone } from './types';

const IMAGE = 1024;
export const n = (value: number) => value / IMAGE;

/** Alturas estimadas de cobertura, em metros. Não são medidas do jogo. */
export const HEIGHT = { crate: 1.3, tallCrate: 2.3, cover: 1.1, barrier: 1.15, wall: 5, door: 2.7 };

export const rectRing = (x0: number, y0: number, x1: number, y1: number): number[] => [n(x0), n(y0), n(x1), n(y0), n(x1), n(y1), n(x0), n(y1)];

export const polygonRing = (...points: number[]): number[] => points.map(n);

export function circleRing(cx: number, cy: number, radius: number, sides = 8): number[] {
  const ring: number[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2;
    ring.push(n(cx + Math.cos(angle) * radius), n(cy + Math.sin(angle) * radius));
  }
  return ring;
}

export const solid = (kind: SolidKind, ring: number[], heightM: number): TacticalSolid => ({ kind, ring, heightM });
export const crate = (x0: number, y0: number, x1: number, y1: number, heightM = HEIGHT.crate) => solid('crate', rectRing(x0, y0, x1, y1), heightM);
export const cover = (x0: number, y0: number, x1: number, y1: number, heightM = HEIGHT.cover) => solid('cover', rectRing(x0, y0, x1, y1), heightM);
export const barrier = (x0: number, y0: number, x1: number, y1: number) => solid('barrier', rectRing(x0, y0, x1, y1), HEIGHT.barrier);
export const partition = (x0: number, y0: number, x1: number, y1: number) => solid('structure', rectRing(x0, y0, x1, y1), HEIGHT.wall);
export const door = (x0: number, y0: number, x1: number, y1: number) => solid('door', rectRing(x0, y0, x1, y1), HEIGHT.door);

/** Folha de porta ao longo de um segmento qualquer, com 1,8 px de espessura. */
export function doorLeaf(x0: number, y0: number, x1: number, y1: number): TacticalSolid {
  const length = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = (-(y1 - y0) / length) * 0.9;
  const ny = ((x1 - x0) / length) * 0.9;
  return solid('door', polygonRing(x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny), HEIGHT.door);
}

export const ramp = (x0: number, y0: number, x1: number, y1: number, from: [number, number], to: [number, number], kind: TacticalRamp['kind'] = 'ramp'): TacticalRamp => ({
  ring: rectRing(x0, y0, x1, y1),
  from: { x: n(from[0]), y: n(from[1]) },
  to: { x: n(to[0]), y: n(to[1]) },
  kind,
});

export const entrance = (site: string, x0: number, y0: number, x1: number, y1: number): TacticalEntrance => ({ site, from: { x: n(x0), y: n(y0) }, to: { x: n(x1), y: n(y1) } });

export const zone = (x0: number, y0: number, x1: number, y1: number, color: string, strength: number): TacticalZone => ({ ring: rectRing(x0, y0, x1, y1), color, strength });

export const DEFENDER_TINT = '#2fc4d6';
export const ATTACKER_TINT = '#ef3b48';
export const TELEPORTER_TINT = '#2ad6b4';
