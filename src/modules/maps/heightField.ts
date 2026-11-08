// Campo de alturas do piso, em grade. Sem dependências de outros módulos do mapa, para o terreno
// estruturado (terrain.ts) poder estendê-lo sem importação circular.
import type { MapPoint } from '../coordinates';

export function decodeBase64(text: string): Uint8Array {
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

export type GridData = { size: number; heightsDm: string; floorBits: string } | { size: number; heights: Uint8Array; floor: Uint8Array };

/** Campo gerado: alturas suavizadas do minimapa, com interpolação bilinear entre as células. */
export class HeightField {
  readonly size: number;
  protected readonly heights: Uint8Array;
  protected readonly floor: Uint8Array;

  constructor(grid: GridData) {
    this.size = grid.size;
    this.heights = 'heights' in grid ? grid.heights : decodeBase64(grid.heightsDm);
    this.floor = 'floor' in grid ? grid.floor : decodeBase64(grid.floorBits);
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

  /** Menor altura num raio de células: base de paredes, para não sobrar fresta junto a um desnível. */
  minAround(point: MapPoint, cells = 2): number {
    const gx = Math.floor(point.x * this.size);
    const gy = Math.floor(point.y * this.size);
    let min = Infinity;
    for (let dy = -cells; dy <= cells; dy++) {
      for (let dx = -cells; dx <= cells; dx++) min = Math.min(min, this.cellHeight(gx + dx, gy + dy));
    }
    return min;
  }
}
