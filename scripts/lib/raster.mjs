// Utilitários de raster puros, sem dependências, usados pelo gerador de mapas.
// Testados em tests/raster.test.ts.

/** Rotula componentes conexos (conectividade 4) de uma máscara binária. */
export function labelComponents(mask, w, h) {
  const labels = new Int32Array(w * h).fill(-1);
  const comps = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || labels[start] !== -1) continue;
    const id = comps.length;
    let top = 0;
    let area = 0;
    let sx = 0;
    let sy = 0;
    let touchesBorder = false;
    stack[top++] = start;
    labels[start] = id;
    while (top > 0) {
      const i = stack[--top];
      const x = i % w;
      const y = (i - x) / w;
      area++;
      sx += x;
      sy += y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesBorder = true;
      if (x > 0 && mask[i - 1] && labels[i - 1] === -1) { labels[i - 1] = id; stack[top++] = i - 1; }
      if (x < w - 1 && mask[i + 1] && labels[i + 1] === -1) { labels[i + 1] = id; stack[top++] = i + 1; }
      if (y > 0 && mask[i - w] && labels[i - w] === -1) { labels[i - w] = id; stack[top++] = i - w; }
      if (y < h - 1 && mask[i + w] && labels[i + w] === -1) { labels[i + w] = id; stack[top++] = i + w; }
    }
    comps.push({ id, area, cx: sx / area, cy: sy / area, touchesBorder });
  }
  return { labels, comps };
}

/** Distância (chanfro 3-4, em pixels) até o pixel marcado mais próximo. */
export function distanceTransform(mask, w, h) {
  const big = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = mask[i] ? 0 : big;
  const a = 1;
  const b = Math.SQRT2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x > 0) d[i] = Math.min(d[i], d[i - 1] + a);
      if (y > 0) {
        d[i] = Math.min(d[i], d[i - w] + a);
        if (x > 0) d[i] = Math.min(d[i], d[i - w - 1] + b);
        if (x < w - 1) d[i] = Math.min(d[i], d[i - w + 1] + b);
      }
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (x < w - 1) d[i] = Math.min(d[i], d[i + 1] + a);
      if (y < h - 1) {
        d[i] = Math.min(d[i], d[i + w] + a);
        if (x < w - 1) d[i] = Math.min(d[i], d[i + w + 1] + b);
        if (x > 0) d[i] = Math.min(d[i], d[i + w - 1] + b);
      }
    }
  }
  return d;
}

/** Dilata uma máscara por um raio em pixels. */
export function dilate(mask, w, h, radius) {
  const d = distanceTransform(mask, w, h);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = d[i] <= radius ? 1 : 0;
  return out;
}

/** Fechamento morfológico: preenche frestas menores que 2×raio. */
export function close(mask, w, h, radius) {
  const dilated = dilate(mask, w, h, radius);
  const inverted = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) inverted[i] = dilated[i] ? 0 : 1;
  const grown = dilate(inverted, w, h, radius);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = grown[i] ? 0 : 1;
  return out;
}

/**
 * Traça os contornos de uma máscara sobre as arestas dos pixels.
 * Anéis externos têm área positiva (horário com y para baixo); buracos, negativa.
 */
export function traceContours(mask, w, h) {
  const vw = w + 1;
  const vertexCount = vw * (h + 1);
  // Cada vértice tem no máximo duas arestas de saída (caso em xadrez).
  const out = new Int32Array(vertexCount * 2).fill(-1);
  const addEdge = (from, to) => {
    if (out[from * 2] === -1) out[from * 2] = to;
    else out[from * 2 + 1] = to;
  };
  const isSet = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] !== 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      if (!isSet(x, y - 1)) addEdge(y * vw + x, y * vw + x + 1);
      if (!isSet(x + 1, y)) addEdge(y * vw + x + 1, (y + 1) * vw + x + 1);
      if (!isSet(x, y + 1)) addEdge((y + 1) * vw + x + 1, (y + 1) * vw + x);
      if (!isSet(x - 1, y)) addEdge((y + 1) * vw + x, y * vw + x);
    }
  }
  const rings = [];
  for (let v = 0; v < vertexCount; v++) {
    while (out[v * 2] !== -1) {
      const ring = [];
      let current = v;
      let prevDx = 0;
      let prevDy = 0;
      do {
        const x = current % vw;
        const y = (current - x) / vw;
        ring.push([x, y]);
        let slot = current * 2;
        if (out[slot + 1] !== -1 && (prevDx !== 0 || prevDy !== 0)) {
          // Em cruzamentos, vira à direita para manter componentes 4-conexos separados.
          const a = out[slot];
          const ax = a % vw;
          const ay = (a - ax) / vw;
          const cross = prevDx * (ay - y) - prevDy * (ax - x);
          if (cross < 0) slot += 1;
        }
        const next = out[slot];
        if (next === -1) break;
        if (slot % 2 === 0) {
          out[slot] = out[slot + 1];
          out[slot + 1] = -1;
        } else {
          out[slot] = -1;
        }
        const nx = next % vw;
        const ny = (next - nx) / vw;
        prevDx = nx - x;
        prevDy = ny - y;
        current = next;
      } while (current !== v);
      rings.push(ring);
    }
  }
  return rings;
}

export function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function perpendicularDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
}

function simplifyOpen(points, first, last, tolerance, keep) {
  const stack = [[first, last]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxDist = 0;
    let index = -1;
    for (let i = a + 1; i < b; i++) {
      const dist = perpendicularDistance(points[i], points[a], points[b]);
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }
    if (index !== -1 && maxDist > tolerance) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
}

/** Douglas-Peucker para anel fechado. */
export function simplifyRing(ring, tolerance) {
  if (ring.length < 4) return ring;
  let farIndex = 0;
  let far = -1;
  for (let i = 1; i < ring.length; i++) {
    const dist = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (dist > far) {
      far = dist;
      farIndex = i;
    }
  }
  const points = [...ring, ring[0]];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[farIndex] = 1;
  keep[points.length - 1] = 1;
  simplifyOpen(points, 0, farIndex, tolerance, keep);
  simplifyOpen(points, farIndex, points.length - 1, tolerance, keep);
  const result = [];
  for (let i = 0; i < points.length - 1; i++) if (keep[i]) result.push(points[i]);
  return result;
}

export function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Converte máscara em polígonos simplificados `[externo, ...buracos]`.
 * `minArea` descarta ruído em pixels² (externos e buracos).
 */
export function maskToPolygons(mask, w, h, { tolerance = 1.2, minArea = 4 } = {}) {
  const rings = traceContours(mask, w, h)
    .map((ring) => ({ ring: simplifyRing(ring, tolerance), area: ringArea(ring) }))
    .filter(({ ring, area }) => ring.length >= 3 && Math.abs(area) >= minArea);
  const outers = rings.filter((r) => r.area > 0).sort((a, b) => a.area - b.area);
  const polygons = outers.map((o) => ({ outer: o.ring, area: o.area, holes: [] }));
  for (const hole of rings.filter((r) => r.area < 0)) {
    const [hx, hy] = hole.ring[0];
    const owner = polygons.find((p) => pointInRing(hx + 0.01, hy + 0.01, p.outer));
    if (owner) owner.holes.push(hole.ring);
  }
  return polygons;
}

/** Mediana de um array numérico (não altera a entrada). */
export function median(values) {
  if (values.length === 0) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
