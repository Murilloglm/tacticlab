// Sistema único de coordenadas do TacticLab.
//
// Todo objeto de estratégia é salvo em "coordenadas de mapa": frações [0, 1] da imagem
// do minimapa, com x para a direita e y para baixo. Os modos 2D e 3D só convertem esse
// mesmo ponto para o seu próprio espaço, então alternar de modo nunca altera os dados.
//
//   Mapa   (x, y)         fonte da verdade, salva na estratégia
//   Prancha (px, py)      x * BOARD_SIZE, usada pelo Konva
//   Mundo  (X, Y, Z)      metros no Three.js; Y é altura e Z cresce para baixo do minimapa

export interface MapPoint {
  x: number;
  y: number;
}

export interface MapFrame {
  /** Metros cobertos pela largura da imagem do minimapa. */
  worldMeters: number;
  /** Falso quando a API não publica escala e o valor é estimado. */
  scaleKnown: boolean;
}

export type WorldPoint = [x: number, y: number, z: number];

/** Tamanho lógico da prancha 2D. O zoom é aplicado por cima deste espaço. */
export const BOARD_SIZE = 1000;

export const mapToBoard = (p: MapPoint): MapPoint => ({ x: p.x * BOARD_SIZE, y: p.y * BOARD_SIZE });
export const boardToMap = (p: MapPoint): MapPoint => ({ x: p.x / BOARD_SIZE, y: p.y / BOARD_SIZE });

export function mapToWorld(p: MapPoint, frame: MapFrame, height = 0): WorldPoint {
  return [(p.x - 0.5) * frame.worldMeters, height, (p.y - 0.5) * frame.worldMeters];
}

export function worldToMap(x: number, z: number, frame: MapFrame): MapPoint {
  return { x: x / frame.worldMeters + 0.5, y: z / frame.worldMeters + 0.5 };
}

export const clampToMap = (p: MapPoint): MapPoint => ({
  x: Math.min(1, Math.max(0, p.x)),
  y: Math.min(1, Math.max(0, p.y)),
});

export const metersToMapUnits = (meters: number, frame: MapFrame): number => meters / frame.worldMeters;
export const mapUnitsToMeters = (units: number, frame: MapFrame): number => units * frame.worldMeters;

export const distanceMapUnits = (a: MapPoint, b: MapPoint): number => Math.hypot(a.x - b.x, a.y - b.y);

export const distanceMeters = (a: MapPoint, b: MapPoint, frame: MapFrame): number =>
  mapUnitsToMeters(distanceMapUnits(a, b), frame);

export const lerpPoint = (a: MapPoint, b: MapPoint, t: number): MapPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** Direção de `from` para `to`, em radianos: 0 aponta para +x e cresce no sentido horário da tela. */
export const headingBetween = (from: MapPoint, to: MapPoint): number => Math.atan2(to.y - from.y, to.x - from.x);

/** Vetor no mundo 3D para uma direção de mapa. O plano XZ tem a mesma orientação do minimapa. */
export const headingToWorld = (facing: number): WorldPoint => [Math.cos(facing), 0, Math.sin(facing)];

export const normalizeAngle = (angle: number): number => {
  const twoPi = Math.PI * 2;
  let a = angle % twoPi;
  if (a <= -Math.PI) a += twoPi;
  if (a > Math.PI) a -= twoPi;
  return a;
};

/** Interpola pelo menor arco. */
export function lerpAngle(from: number, to: number, t: number): number {
  return normalizeAngle(from + normalizeAngle(to - from) * t);
}

/** Comprimento de uma polilinha em unidades de mapa. */
export function polylineLength(points: MapPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distanceMapUnits(points[i - 1]!, points[i]!);
  }
  return total;
}

/** Ponto a uma fração [0, 1] do comprimento da polilinha. */
export function pointAlongPolyline(points: MapPoint[], t: number): MapPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1 || t <= 0) return points[0]!;
  const target = polylineLength(points) * Math.min(1, t);
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = distanceMapUnits(a, b);
    if (walked + len >= target && len > 0) return lerpPoint(a, b, (target - walked) / len);
    walked += len;
  }
  return points[points.length - 1]!;
}

/** Spline Catmull-Rom para trajetórias curvas. Passa por todos os pontos de controle. */
export function smoothPolyline(points: MapPoint[], segmentsPerSpan = 10): MapPoint[] {
  if (points.length < 3) return points;
  const out: MapPoint[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    for (let s = 0; s < segmentsPerSpan; s++) {
      const t = s / segmentsPerSpan;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (p2.x - p0.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (3 * p1.x - p0.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (p2.y - p0.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (3 * p1.y - p0.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}
