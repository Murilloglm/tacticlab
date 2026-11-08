// Terreno estruturado: o piso dos mapas com layout tático deixa de ser um relevo suave e passa a ser
// o que o jogo tem. Platôs retos com bordas verticais, rampas inclinadas e escadas em degraus.
//
// O campo gerado vem do tom do minimapa, desfocado, então toda mudança de nível vira um "morro". Aqui
// as células de piso são agrupadas em platôs de altura única. Rampas e escadas do layout ficam
// alinhadas à grade, com as pontas na altura dos platôs vizinhos. Bombsites e plataformas declaradas
// são pisos planos. Entre platôs com até SOFT_STEP_M de diferença, a borda vira um chanfro estreito
// (ruído do minimapa); acima disso, é uma borda vertical. `heightAt` devolve a superfície desenhada.
import type { MapPoint } from '../coordinates';
import { HeightField, pointInRing } from './heightField';
import type { TacticalLayout, TacticalRamp } from './tactical/types';

export const CELL_EMPTY = 0;
export const CELL_PLATEAU = 1;
export const CELL_RAMP = 2;
export const CELL_STAIRS = 3;

/** Diferença máxima de altura em relação à semente, ao crescer um platô. */
const PLATEAU_TOLERANCE_M = 0.3;
/** Platôs menores que isto (em células) são ruído da transição desfocada. */
const MIN_PLATEAU_CELLS = 14;
/** Platôs vizinhos mais próximos que isto viram um só, se o resultado continuar plano. */
const MERGE_STEP_M = 0.3;
/** Variação interna máxima de um platô (entre os percentis 10 e 90). */
const MAX_PLATEAU_SPREAD_M = 0.6;
/** Até esta diferença, a borda entre platôs é um chanfro de uma célula; acima, é vertical. */
export const SOFT_STEP_M = 0.6;
/** Altura alvo de cada degrau. */
export const STAIR_RISE_M = 0.28;

export interface TerrainSlope {
  kind: 'ramp' | 'stairs';
  from: MapPoint;
  to: MapPoint;
  fromM: number;
  toM: number;
  steps: number;
  /** Limites alinhados à grade, em coordenadas de mapa. */
  bounds: { x0: number; y0: number; x1: number; y1: number };
}

/** Altura sobre uma rampa ou escada, pela projeção no eixo de subida. */
export function slopeHeight(slope: TerrainSlope, point: MapPoint): number {
  const dx = slope.to.x - slope.from.x;
  const dy = slope.to.y - slope.from.y;
  const lengthSq = dx * dx + dy * dy || 1;
  const t = Math.min(1, Math.max(0, ((point.x - slope.from.x) * dx + (point.y - slope.from.y) * dy) / lengthSq));
  if (slope.kind === 'ramp') return slope.fromM + (slope.toM - slope.fromM) * t;
  // Degrau k ocupa t de k/n a (k+1)/n, com piso na altura do fim dele: o último é o próprio patamar.
  const step = Math.min(slope.steps - 1, Math.floor(t * slope.steps));
  return slope.fromM + ((slope.toM - slope.fromM) * (step + 1)) / slope.steps;
}

interface TerrainData {
  kinds: Uint8Array;
  levels: Float32Array;
  slopeOf: Int16Array;
  slopes: TerrainSlope[];
  plateaus: number;
  vertexSoft: Uint8Array;
  vertexHeight: Float32Array;
}

export class StructuredHeightField extends HeightField {
  readonly kinds: Uint8Array;
  readonly levels: Float32Array;
  readonly slopeOf: Int16Array;
  readonly slopes: TerrainSlope[];
  /** Quantidade de platôs encontrados, para os testes e o inventário da cena. */
  readonly plateaus: number;
  private readonly vertexSoft: Uint8Array;
  private readonly vertexHeight: Float32Array;

  constructor(base: HeightField, data: TerrainData) {
    super({ size: base.size, heights: new Uint8Array(base.size * base.size), floor: new Uint8Array(Math.ceil((base.size * base.size) / 8)) });
    this.kinds = data.kinds;
    this.levels = data.levels;
    this.slopeOf = data.slopeOf;
    this.slopes = data.slopes;
    this.plateaus = data.plateaus;
    this.vertexSoft = data.vertexSoft;
    this.vertexHeight = data.vertexHeight;
  }

  private clampCell(value: number): number {
    return Math.max(0, Math.min(this.size - 1, value));
  }

  override isFloorCell(gx: number, gy: number): boolean {
    if (gx < 0 || gy < 0 || gx >= this.size || gy >= this.size) return false;
    return this.kinds[gy * this.size + gx] !== CELL_EMPTY;
  }

  kindOfCell(gx: number, gy: number): number {
    return this.kinds[this.clampCell(gy) * this.size + this.clampCell(gx)]!;
  }

  /**
   * Altura de um canto da célula (cx, cy de 0 a 1). Em platô, o canto compartilhado com vizinhos de
   * altura próxima é a média deles (chanfro); senão, é a altura do próprio platô (borda vertical).
   */
  cornerHeight(gx: number, gy: number, cx: 0 | 1, cy: 0 | 1): number {
    const x = this.clampCell(gx);
    const y = this.clampCell(gy);
    const i = y * this.size + x;
    const kind = this.kinds[i];
    const point = { x: (x + cx) / this.size, y: (y + cy) / this.size };
    if (kind === CELL_RAMP) return slopeHeight(this.slopes[this.slopeOf[i]!]!, point);
    if (kind === CELL_STAIRS) {
      // Um pouco para dentro da célula: pega o degrau dela, e não o vizinho.
      const inset = { x: (x + 0.5 + (cx - 0.5) * 0.98) / this.size, y: (y + 0.5 + (cy - 0.5) * 0.98) / this.size };
      return slopeHeight(this.slopes[this.slopeOf[i]!]!, inset);
    }
    if (kind === CELL_PLATEAU) {
      const v = (y + cy) * (this.size + 1) + (x + cx);
      if (this.vertexSoft[v]) return this.vertexHeight[v]!;
    }
    return this.levels[i]!;
  }

  override cellHeight(gx: number, gy: number): number {
    const x = this.clampCell(gx);
    const y = this.clampCell(gy);
    const i = y * this.size + x;
    const kind = this.kinds[i];
    if (kind === CELL_RAMP || kind === CELL_STAIRS) return slopeHeight(this.slopes[this.slopeOf[i]!]!, { x: (x + 0.5) / this.size, y: (y + 0.5) / this.size });
    return this.levels[i]!;
  }

  override heightAt(point: MapPoint): number {
    const fx = point.x * this.size;
    const fy = point.y * this.size;
    const gx = this.clampCell(Math.floor(fx));
    const gy = this.clampCell(Math.floor(fy));
    const i = gy * this.size + gx;
    const kind = this.kinds[i];
    if (kind === CELL_RAMP || kind === CELL_STAIRS) return slopeHeight(this.slopes[this.slopeOf[i]!]!, point);
    if (kind !== CELL_PLATEAU) return this.levels[i]!;
    // Mesma superfície desenhada: bilinear entre os quatro cantos da célula.
    const tx = Math.min(1, Math.max(0, fx - gx));
    const ty = Math.min(1, Math.max(0, fy - gy));
    const a = this.cornerHeight(gx, gy, 0, 0);
    const b = this.cornerHeight(gx, gy, 1, 0);
    const c = this.cornerHeight(gx, gy, 0, 1);
    const d = this.cornerHeight(gx, gy, 1, 1);
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }

  kindAt(point: MapPoint): number {
    return this.kindOfCell(Math.floor(point.x * this.size), Math.floor(point.y * this.size));
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const quantize = (value: number) => Math.round(value * 20) / 20;

/** Rampa ou escada com os limites alinhados à grade. */
function snapSlope(ramp: TacticalRamp, G: number): TerrainSlope['bounds'] {
  const xs = ramp.ring.filter((_, i) => i % 2 === 0);
  const ys = ramp.ring.filter((_, i) => i % 2 === 1);
  const snap = (value: number) => Math.round(value * G) / G;
  return { x0: snap(Math.min(...xs)), y0: snap(Math.min(...ys)), x1: snap(Math.max(...xs)), y1: snap(Math.max(...ys)) };
}

export function structureTerrain(
  base: HeightField,
  layout: Pick<TacticalLayout, 'ramps' | 'platforms' | 'wallExclusions'>,
  /** Contornos dos bombsites: pisos planos, sem o efeito da tinta do minimapa sobre a altura. */
  siteRings: number[][] = [],
): StructuredHeightField {
  const G = base.size;
  const N = G * G;
  const kinds = new Uint8Array(N);
  const levels = new Float32Array(N);
  const slopeOf = new Int16Array(N).fill(-1);
  const region = new Int32Array(N).fill(-1);
  const raw = new Float32Array(N);
  const center = (i: number) => ({ x: ((i % G) + 0.5) / G, y: (Math.floor(i / G) + 0.5) / G });
  const excluded = layout.wallExclusions ?? [];

  for (let i = 0; i < N; i++) {
    const gx = i % G;
    const gy = Math.floor(i / G);
    raw[i] = base.cellHeight(gx, gy);
    if (!base.isFloorCell(gx, gy)) continue;
    const c = center(i);
    if (excluded.some((ring) => pointInRing(c.x, c.y, ring))) continue;
    kinds[i] = CELL_PLATEAU;
  }

  // Rampas e escadas: células de piso dentro dos limites alinhados à grade.
  const slopeBounds = layout.ramps.map((ramp) => snapSlope(ramp, G));
  layout.ramps.forEach((ramp, index) => {
    const b = slopeBounds[index]!;
    for (let i = 0; i < N; i++) {
      if (kinds[i] === CELL_EMPTY) continue;
      const c = center(i);
      if (c.x > b.x0 && c.x < b.x1 && c.y > b.y0 && c.y < b.y1) {
        kinds[i] = ramp.kind === 'stairs' ? CELL_STAIRS : CELL_RAMP;
        slopeOf[i] = index;
      }
    }
  });

  const regionLevels: number[] = [];
  const regionCells: number[][] = [];
  const fixed = new Set<number>();
  const neighbors = (i: number) => {
    const gx = i % G;
    const out: number[] = [];
    if (gx > 0) out.push(i - 1);
    if (gx < G - 1) out.push(i + 1);
    if (i >= G) out.push(i - G);
    if (i < N - G) out.push(i + G);
    return out;
  };
  const isPlateau = (i: number) => kinds[i] === CELL_PLATEAU;

  // Plataformas declaradas e bombsites: piso plano, na altura dada ou na mediana do campo.
  const flatAreas = [...(layout.platforms ?? []).map((platform) => ({ ring: platform.ring, heightM: platform.heightM })), ...siteRings.map((ring) => ({ ring, heightM: undefined }))];
  for (const area of flatAreas) {
    const cells: number[] = [];
    for (let i = 0; i < N; i++) {
      if (!isPlateau(i) || region[i] !== -1) continue;
      const c = center(i);
      if (pointInRing(c.x, c.y, area.ring)) cells.push(i);
    }
    if (cells.length === 0) continue;
    const id = regionLevels.length;
    fixed.add(id);
    regionLevels.push(area.heightM ?? median(cells.map((i) => raw[i]!)));
    regionCells.push(cells);
    for (const i of cells) region[i] = id;
  }

  // Suaviza o ruído antes de agrupar, só entre células de piso.
  const smooth = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (!isPlateau(i)) continue;
    const values = [raw[i]!];
    const gx = i % G;
    const gy = Math.floor(i / G);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = gx + dx;
        const y = gy + dy;
        if ((dx || dy) && x >= 0 && y >= 0 && x < G && y < G && isPlateau(y * G + x)) values.push(raw[y * G + x]!);
      }
    }
    smooth[i] = median(values);
  }

  // Crescimento de regiões, começando pelas células mais planas.
  const order = Array.from({ length: N }, (_, i) => i).filter((i) => isPlateau(i) && region[i] === -1);
  const flatness = new Float32Array(N);
  for (const i of order) flatness[i] = neighbors(i).filter(isPlateau).reduce((max, j) => Math.max(max, Math.abs(smooth[j]! - smooth[i]!)), 0);
  order.sort((a, b) => flatness[a]! - flatness[b]!);
  for (const seed of order) {
    if (region[seed] !== -1) continue;
    const id = regionLevels.length;
    const level = smooth[seed]!;
    const cells = [seed];
    region[seed] = id;
    for (let k = 0; k < cells.length; k++) {
      for (const j of neighbors(cells[k]!)) {
        if (!isPlateau(j) || region[j] !== -1 || Math.abs(smooth[j]! - level) > PLATEAU_TOLERANCE_M) continue;
        region[j] = id;
        cells.push(j);
      }
    }
    regionLevels.push(median(cells.map((i) => raw[i]!)));
    regionCells.push(cells);
  }

  const adjacent = (id: number) => {
    const found = new Set<number>();
    for (const i of regionCells[id]!) for (const j of neighbors(i)) if (region[j] !== -1 && region[j] !== id) found.add(region[j]!);
    return found;
  };
  // A altura de um platô é a mediana das células, recalculada a cada fusão, para não derivar.
  const levelOf = (cells: number[]) => median(cells.map((i) => raw[i]!));
  const spreadOf = (cells: number[]) => {
    const step = Math.max(1, Math.floor(cells.length / 400));
    const sample: number[] = [];
    for (let k = 0; k < cells.length; k += step) sample.push(raw[cells[k]!]!);
    sample.sort((p, q) => p - q);
    return sample[Math.floor(sample.length * 0.9)]! - sample[Math.floor(sample.length * 0.1)]!;
  };
  const absorb = (from: number, into: number) => {
    for (const i of regionCells[from]!) region[i] = into;
    regionCells[into]!.push(...regionCells[from]!);
    regionCells[from] = [];
    if (!fixed.has(into)) regionLevels[into] = levelOf(regionCells[into]!);
  };

  // Ruído da transição: platôs pequenos entram no vizinho de altura mais próxima.
  for (let changed = true; changed; ) {
    changed = false;
    for (let id = 0; id < regionCells.length; id++) {
      const size = regionCells[id]!.length;
      if (size === 0 || size >= MIN_PLATEAU_CELLS || fixed.has(id)) continue;
      let best = -1;
      for (const other of adjacent(id)) {
        if (best === -1 || Math.abs(regionLevels[other]! - regionLevels[id]!) < Math.abs(regionLevels[best]! - regionLevels[id]!)) best = other;
      }
      if (best !== -1) {
        absorb(id, best);
        changed = true;
      }
    }
  }
  // Degraus mínimos entre platôs vizinhos viram um platô só, desde que o resultado continue plano.
  for (let changed = true; changed; ) {
    changed = false;
    for (let id = 0; id < regionCells.length; id++) {
      if (regionCells[id]!.length === 0 || fixed.has(id)) continue;
      const candidates = [...adjacent(id)].filter((other) => !fixed.has(other) && Math.abs(regionLevels[other]! - regionLevels[id]!) < MERGE_STEP_M);
      candidates.sort((p, q) => Math.abs(regionLevels[p]! - regionLevels[id]!) - Math.abs(regionLevels[q]! - regionLevels[id]!));
      for (const other of candidates) {
        if (spreadOf([...regionCells[id]!, ...regionCells[other]!]) > MAX_PLATEAU_SPREAD_M) continue;
        if (regionCells[other]!.length >= regionCells[id]!.length) absorb(id, other);
        else absorb(other, id);
        changed = true;
        break;
      }
    }
  }

  let plateaus = 0;
  for (let id = 0; id < regionCells.length; id++) {
    if (regionCells[id]!.length === 0) continue;
    plateaus++;
    const level = quantize(regionLevels[id]!);
    for (const i of regionCells[id]!) levels[i] = level;
  }

  // Pontas das rampas e escadas: na altura do platô logo depois de cada ponta. O eixo vai de uma borda
  // alinhada à outra, para os degraus ocuparem a escada inteira, sem degrau cortado no fim.
  const slopes: TerrainSlope[] = layout.ramps.map((source, index) => {
    const b = slopeBounds[index]!;
    const alongX = Math.abs(source.to.x - source.from.x) >= Math.abs(source.to.y - source.from.y);
    const ramp = alongX
      ? { ...source, from: { x: source.to.x >= source.from.x ? b.x0 : b.x1, y: source.from.y }, to: { x: source.to.x >= source.from.x ? b.x1 : b.x0, y: source.to.y } }
      : { ...source, from: { x: source.from.x, y: source.to.y >= source.from.y ? b.y0 : b.y1 }, to: { x: source.to.x, y: source.to.y >= source.from.y ? b.y1 : b.y0 } };
    const dx = ramp.to.x - ramp.from.x;
    const dy = ramp.to.y - ramp.from.y;
    const length = Math.hypot(dx, dy) || 1;
    // A ponta encosta no platô logo depois dela: a emenda não tem degrau. Dentro da rampa o campo
    // original não serve de referência, porque é justamente onde o desfoque e os artefatos ficam.
    const beyond = (point: MapPoint, sign: number) => {
      for (let k = 1; k <= 4; k++) {
        const p = { x: point.x + ((dx / length) * sign * k) / G, y: point.y + ((dy / length) * sign * k) / G };
        const gx = Math.floor(p.x * G);
        const gy = Math.floor(p.y * G);
        if (gx < 0 || gy < 0 || gx >= G || gy >= G) break;
        const i = gy * G + gx;
        if (kinds[i] === CELL_PLATEAU) return levels[i]!;
      }
      return quantize(base.heightAt(point));
    };
    const fromM = beyond(ramp.from, -1);
    const toM = beyond(ramp.to, 1);
    return {
      kind: ramp.kind === 'stairs' ? 'stairs' : 'ramp',
      from: ramp.from,
      to: ramp.to,
      fromM,
      toM,
      steps: Math.max(2, Math.round(Math.abs(toM - fromM) / STAIR_RISE_M)),
      bounds: slopeBounds[index]!,
    };
  });
  for (let i = 0; i < N; i++) {
    if (kinds[i] === CELL_RAMP || kinds[i] === CELL_STAIRS) levels[i] = slopeHeight(slopes[slopeOf[i]!]!, center(i));
  }

  // Paredes e vazios herdam a altura do piso mais próximo, para nada ficar suspenso ou enterrado.
  const queue: number[] = [];
  const filled = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (kinds[i] !== CELL_EMPTY) {
      filled[i] = 1;
      queue.push(i);
    }
  }
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k]!;
    for (const j of neighbors(i)) {
      if (filled[j]) continue;
      filled[j] = 1;
      levels[j] = levels[i]!;
      queue.push(j);
    }
  }

  // Cantos compartilhados: chanfro onde os platôs em volta têm altura próxima.
  const V = G + 1;
  const vertexSoft = new Uint8Array(V * V);
  const vertexHeight = new Float32Array(V * V);
  for (let vy = 0; vy <= G; vy++) {
    for (let vx = 0; vx <= G; vx++) {
      let min = Infinity;
      let max = -Infinity;
      let sum = 0;
      let count = 0;
      for (const [cx, cy] of [[vx - 1, vy - 1], [vx, vy - 1], [vx - 1, vy], [vx, vy]] as const) {
        if (cx < 0 || cy < 0 || cx >= G || cy >= G) continue;
        const i = cy * G + cx;
        if (kinds[i] !== CELL_PLATEAU) continue;
        min = Math.min(min, levels[i]!);
        max = Math.max(max, levels[i]!);
        sum += levels[i]!;
        count++;
      }
      if (count > 1 && max - min > 0 && max - min <= SOFT_STEP_M) {
        vertexSoft[vy * V + vx] = 1;
        vertexHeight[vy * V + vx] = sum / count;
      }
    }
  }

  return new StructuredHeightField(base, { kinds, levels, slopeOf, slopes, plateaus, vertexSoft, vertexHeight });
}
