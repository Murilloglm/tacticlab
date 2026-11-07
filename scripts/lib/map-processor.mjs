// Converte o minimapa (RGBA) e os callouts de um mapa em geometria esquemática.
// Nada aqui é dado oficial de colisão: é uma reconstrução aproximada e assim é rotulada.
import {
  distanceTransform,
  close,
  labelComponents,
  maskToPolygons,
  median,
} from './raster.mjs';

export const GEOMETRY_VERSION = 2;
export const HEIGHT_GRID = 192;
/** Centímetros por nível de cinza acima do piso-base, medido pela regressão callout z × luminância. */
export const CM_PER_LUMINANCE = 18;
export const BASE_LUMINANCE = 118;
const DEFAULT_METERS = 110;

const CLASS = { EMPTY: 0, LINE: 1, FLOOR: 2, SITE: 3, TELEPORT: 4 };
/** Linhas têm suavização; o piso mais claro medido nos mapas fica em torno de 151. */
const LINE_MIN_CHANNEL = 158;

export function classifyPixels(rgba, w, h) {
  const cls = new Uint8Array(w * h);
  const lum = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const a = rgba[i * 4 + 3];
    if (a < 100) {
      cls[i] = CLASS.EMPTY;
    } else if (Math.min(r, g, b) >= LINE_MIN_CHANNEL) {
      cls[i] = CLASS.LINE;
    } else if (g - r > 50 && g - b > 10) {
      cls[i] = CLASS.TELEPORT;
      lum[i] = BASE_LUMINANCE;
    } else if (r - b > 18 && Math.abs(r - g) < 18) {
      cls[i] = CLASS.SITE;
      // O tom oliva preserva o nível no canal azul: (152,152,112) equivale ao piso-base (118).
      lum[i] = Math.min(255, b + 6);
    } else {
      cls[i] = CLASS.FLOOR;
      lum[i] = Math.round((r + g + b) / 3);
    }
  }
  return { cls, lum };
}

/** Transformação publicada pela API: coordenadas do jogo para fração da imagem. */
export function gameToImage(location, m) {
  return {
    x: location.y * m.xMultiplier + m.xScalarToAdd,
    y: location.x * m.yMultiplier + m.yScalarToAdd,
  };
}

/** Fração de pontos a até `radius` pixels do piso. */
export function floorRatio(points, floorDist, w, h, radius = 8) {
  if (points.length === 0) return 1;
  let inside = 0;
  for (const p of points) {
    const px = Math.round(p.x * w);
    const py = Math.round(p.y * h);
    if (px >= 0 && py >= 0 && px < w && py < h && floorDist[py * w + px] <= radius) inside++;
  }
  return inside / points.length;
}

/**
 * Alguns minimapas não coincidem com os multiplicadores da API.
 * Só procura uma translação quando o dado publicado está claramente ruim. Mais graus de
 * liberdade não ajudam: como o piso cobre boa parte da imagem, escala e rotação "encaixam"
 * quase qualquer nuvem de pontos sem que isso prove alinhamento.
 */
export function alignCallouts(points, floorDist, siteDist, w, h, manualOffset) {
  if (manualOffset) return { dx: manualOffset.dx, dy: manualOffset.dy, source: 'override' };
  if (floorRatio(points, floorDist, w, h) >= 0.9) return { dx: 0, dy: 0, source: 'api' };
  const score = (dx, dy) => {
    let total = 0;
    for (const p of points) {
      const px = Math.round((p.x + dx) * w);
      const py = Math.round((p.y + dy) * h);
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      const i = py * w + px;
      if (floorDist[i] <= 6) total += 1;
      if (p.isSite && siteDist[i] <= 6) total += 4;
    }
    return total;
  };
  const baseline = score(0, 0);
  let best = { dx: 0, dy: 0, value: baseline };
  for (let dy = -0.16; dy <= 0.1601; dy += 0.004) {
    for (let dx = -0.16; dx <= 0.1601; dx += 0.004) {
      const value = score(dx, dy);
      const closer = Math.hypot(dx, dy) < Math.hypot(best.dx, best.dy);
      if (value > best.value || (value === best.value && closer)) best = { dx, dy, value };
    }
  }
  if (best.value < baseline + 2) return { dx: 0, dy: 0, source: 'api' };
  return {
    dx: Math.round(best.dx * 1000) / 1000,
    dy: Math.round(best.dy * 1000) / 1000,
    source: 'auto',
  };
}

/** Leva um ponto ao pixel de piso mais próximo, dentro de um raio. Retorna nulo se estiver longe demais. */
export function snapToFloor(point, floorDist, w, h, maxRadius) {
  const cx = Math.round(point.x * w);
  const cy = Math.round(point.y * h);
  let best = null;
  let bestDistance = Infinity;
  const step = 2;
  for (let dy = -maxRadius; dy <= maxRadius; dy += step) {
    for (let dx = -maxRadius; dx <= maxRadius; dx += step) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= w || y >= h || floorDist[y * w + x] > 0) continue;
      const distance = Math.hypot(dx, dy);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x: x / w, y: y / h };
      }
    }
  }
  return best;
}

function encodeRings(polygons, w) {
  const round = (v) => Math.round((v / w) * 1e5) / 1e5;
  return polygons.map((poly) =>
    [poly.outer, ...poly.holes].map((ring) => ring.flatMap(([x, y]) => [round(x), round(y)])),
  );
}

function median2d(values) {
  return values.length ? median(values) : null;
}

/** Campo-base: IDW geodésico das alturas dos callouts, respeitando paredes. */
function geodesicBaseField({ cellFloor, G, cellMeters, anchors }) {
  const field = new Float32Array(G * G);
  if (anchors.length === 0) return field;
  const distances = anchors.map((anchor) => {
    const dist = new Float32Array(G * G).fill(Infinity);
    const queue = new Int32Array(G * G);
    let head = 0;
    let tail = 0;
    dist[anchor.cell] = 0;
    queue[tail++] = anchor.cell;
    while (head < tail) {
      const i = queue[head++];
      const x = i % G;
      const neighbors = [x > 0 ? i - 1 : -1, x < G - 1 ? i + 1 : -1, i - G, i + G];
      for (const n of neighbors) {
        if (n < 0 || n >= G * G || !cellFloor[n] || dist[n] !== Infinity) continue;
        dist[n] = dist[i] + cellMeters;
        queue[tail++] = n;
      }
    }
    return dist;
  });
  for (let i = 0; i < G * G; i++) {
    if (!cellFloor[i]) continue;
    let sum = 0;
    let weight = 0;
    for (let a = 0; a < anchors.length; a++) {
      const d = distances[a][i];
      if (d === Infinity) continue;
      const w = 1 / (d + 10) ** 2;
      sum += anchors[a].cm * w;
      weight += w;
    }
    field[i] = weight > 0 ? sum / weight : 0;
  }
  return { field, distances };
}

function filterAnchors(rawAnchors, G, cellFloor, cellMeters) {
  if (rawAnchors.length < 4) return rawAnchors;
  const { distances } = geodesicBaseField({ cellFloor, G, cellMeters, anchors: rawAnchors });
  return rawAnchors.filter((anchor, index) => {
    const neighbors = rawAnchors
      .map((other, j) => ({ cm: other.cm, d: j === index ? Infinity : distances[index][other.cell] }))
      .filter((n) => n.d !== Infinity)
      .sort((a, b) => a.d - b.d)
      .slice(0, 4);
    if (neighbors.length < 2) return false;
    return Math.abs(anchor.cm - median(neighbors.map((n) => n.cm))) <= 240;
  });
}

function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

/**
 * Processa um mapa. `meta` traz nome, multiplicadores e callouts em inglês e pt-BR.
 * `override` permite corrigir um mapa individualmente (scripts/map-overrides/).
 */
export function processMap({ rgba, w, h, meta, override = {} }) {
  const hasScale = Boolean(meta.xMultiplier);
  const worldMeters = hasScale ? 1 / Math.abs(meta.xMultiplier) / 100 : (override.assumedMeters ?? DEFAULT_METERS);
  const metersPerPixel = worldMeters / w;
  const areaPerPixel = metersPerPixel ** 2;
  const { cls, lum } = classifyPixels(rgba, w, h);

  const open = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) open[i] = cls[i] >= CLASS.FLOOR ? 1 : 0;
  const { labels, comps } = labelComponents(open, w, h);

  const boxLimit = override.boxMaxArea ?? 48; // m²
  const compKind = new Uint8Array(comps.length); // 0 ruído, 1 caixa, 2 piso
  for (const c of comps) {
    const m2 = c.area * areaPerPixel;
    compKind[c.id] = m2 < 0.2 ? 0 : m2 < boxLimit ? 1 : 2;
  }

  const floor = new Uint8Array(w * h);
  const boxes = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (labels[i] < 0) continue;
    if (compKind[labels[i]] === 2) floor[i] = 1;
    else if (compKind[labels[i]] === 1) boxes[i] = 1;
  }

  // Vazios pequenos cercados por piso viram massa sólida (pilares, blocos).
  const emptyMask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) emptyMask[i] = cls[i] === CLASS.EMPTY ? 1 : 0;
  const emptyParts = labelComponents(emptyMask, w, h);
  const solidFill = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const l = emptyParts.labels[i];
    if (l < 0) continue;
    const part = emptyParts.comps[l];
    if (!part.touchesBorder && part.area * areaPerPixel < 150) solidFill[i] = 1;
  }

  const walkableish = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) walkableish[i] = floor[i] || boxes[i] ? 1 : 0;
  const thicknessPx = Math.max(4, Math.round(1.0 / metersPerPixel));
  const nearFloor = distanceTransform(walkableish, w, h);
  const emptyDist = distanceTransform(emptyMask, w, h);
  const boxDist = distanceTransform(boxes, w, h);

  const walls = new Uint8Array(w * h);
  const rails = new Uint8Array(w * h);
  const boxesGrown = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const isLine = cls[i] === CLASS.LINE;
    const outerLine = isLine && emptyDist[i] <= 5;
    if (boxes[i] || (isLine && !outerLine && boxDist[i] <= 3.5)) {
      boxesGrown[i] = 1;
    } else if (solidFill[i] || outerLine || (cls[i] === CLASS.EMPTY && nearFloor[i] <= thicknessPx)) {
      walls[i] = 1;
    } else if (isLine) {
      rails[i] = 1;
    }
  }

  const wallPolys = maskToPolygons(walls, w, h, { tolerance: 1.3, minArea: 10 });
  const railPolys = maskToPolygons(rails, w, h, { tolerance: 0.9, minArea: 6 });
  const boxPolys = maskToPolygons(boxesGrown, w, h, { tolerance: 1.2, minArea: 8 });

  // Sites e teleportes vêm das cores do minimapa.
  const siteMask = new Uint8Array(w * h);
  const teleportMask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (cls[i] === CLASS.SITE) siteMask[i] = 1;
    if (cls[i] === CLASS.TELEPORT) teleportMask[i] = 1;
  }
  const closedSites = close(siteMask, w, h, 5);
  const siteParts = labelComponents(closedSites, w, h);
  const siteGroups = siteParts.comps.filter((c) => c.area * areaPerPixel >= 25);

  const floorDist = distanceTransform(floor, w, h);
  const siteDist = distanceTransform(closedSites, w, h);

  // Callouts: posição da API + alinhamento verificado contra a imagem.
  const usable = hasScale
    ? meta.calloutsEn.map((c, idx) => {
        const p = gameToImage(c.location, meta);
        return {
          ...p,
          z: c.location.z,
          isSite: c.regionName === 'Site',
          superRegion: c.superRegionName,
          regionEn: c.regionName,
          regionPt: meta.calloutsPt[idx]?.regionName ?? c.regionName,
          superRegionPt: meta.calloutsPt[idx]?.superRegionName ?? c.superRegionName,
        };
      })
    : [];
  const alignment = alignCallouts(usable, floorDist, siteDist, w, h, override.calloutOffset);
  const aligned = usable.map((c) => ({ ...c, x: c.x + alignment.dx, y: c.y + alignment.dy }));
  const alignedRatio = floorRatio(aligned, floorDist, w, h);
  const calloutsReliable = hasScale && alignedRatio >= 0.8;
  const callouts = [];
  for (const c of aligned) {
    // Sem confiança no alinhamento, encosta o rótulo no piso; longe demais, descarta.
    const position = calloutsReliable ? c : snapToFloor(c, floorDist, w, h, 80);
    if (!position) continue;
    callouts.push({
      x: Math.round(position.x * 1e4) / 1e4,
      y: Math.round(position.y * 1e4) / 1e4,
      z: Math.round(c.z),
      name: `${c.superRegionPt} ${c.regionPt}`.replace(/^no /, '').trim(),
      site: c.isSite ? c.superRegion : null,
      spawn: /Attacker Side Spawn/.test(`${c.superRegion} ${c.regionEn}`)
        ? 'attack'
        : /Defender Side Spawn/.test(`${c.superRegion} ${c.regionEn}`)
          ? 'defense'
          : null,
    });
  }

  // Agrupa os trechos oliva e nomeia cada um pelo callout de site mais próximo.
  const siteCallouts = callouts.filter((c) => c.site);
  const siteLabelOf = (comp, index) => {
    if (siteCallouts.length === 0) return String.fromCharCode(65 + index);
    let best = siteCallouts[0];
    let bestDist = Infinity;
    for (const s of siteCallouts) {
      const d = Math.hypot(s.x * w - comp.cx, s.y * h - comp.cy);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    return best.site;
  };
  const sitesByLabel = new Map();
  siteGroups.forEach((comp, index) => {
    const label = siteLabelOf(comp, index);
    if (!sitesByLabel.has(label)) sitesByLabel.set(label, []);
    sitesByLabel.get(label).push(comp);
  });
  const sites = [...sitesByLabel.entries()]
    .map(([label, parts]) => {
      const mask = new Uint8Array(w * h);
      const ids = new Set(parts.map((p) => p.id));
      for (let i = 0; i < w * h; i++) if (ids.has(siteParts.labels[i])) mask[i] = 1;
      const totalArea = parts.reduce((sum, p) => sum + p.area, 0);
      const cx = parts.reduce((sum, p) => sum + p.cx * p.area, 0) / totalArea;
      const cy = parts.reduce((sum, p) => sum + p.cy * p.area, 0) / totalArea;
      return {
        label,
        center: { x: Math.round((cx / w) * 1e4) / 1e4, y: Math.round((cy / h) * 1e4) / 1e4 },
        polygons: encodeRings(maskToPolygons(mask, w, h, { tolerance: 1.5, minArea: 40 }), w),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const teleportParts = labelComponents(teleportMask, w, h);
  const features = teleportParts.comps
    .filter((c) => c.area * areaPerPixel >= 1)
    .map((c) => ({
      type: 'teleporter',
      x: Math.round((c.cx / w) * 1e4) / 1e4,
      y: Math.round((c.cy / h) * 1e4) / 1e4,
    }));
  for (const feature of override.features ?? []) features.push(feature);

  // Grade de alturas: mediana da luminância por célula + campo-base dos callouts.
  const G = HEIGHT_GRID;
  const cellPx = w / G;
  const cellMeters = worldMeters / G;
  const cellLum = new Float32Array(G * G);
  const cellFloor = new Uint8Array(G * G);
  const samples = [];
  for (let gy = 0; gy < G; gy++) {
    for (let gx = 0; gx < G; gx++) {
      samples.length = 0;
      let floorCount = 0;
      const x0 = Math.floor(gx * cellPx);
      const x1 = Math.min(w, Math.ceil((gx + 1) * cellPx));
      const y0 = Math.floor(gy * cellPx);
      const y1 = Math.min(h, Math.ceil((gy + 1) * cellPx));
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = y * w + x;
          if (floor[i]) {
            samples.push(lum[i]);
            floorCount++;
          }
        }
      }
      const value = median2d(samples);
      if (value !== null && floorCount >= cellPx * cellPx * 0.3) {
        cellFloor[gy * G + gx] = 1;
        cellLum[gy * G + gx] = value;
      }
    }
  }

  const heightScale = override.cmPerLuminance ?? CM_PER_LUMINANCE;
  const cmFromLum = (value) => (value - BASE_LUMINANCE) * heightScale;
  const nearestFloorCell = (px, py) => {
    const gx = Math.max(0, Math.min(G - 1, Math.floor(px * G)));
    const gy = Math.max(0, Math.min(G - 1, Math.floor(py * G)));
    for (let r = 0; r <= 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = gx + dx;
          const y = gy + dy;
          if (x >= 0 && y >= 0 && x < G && y < G && cellFloor[y * G + x]) return y * G + x;
        }
      }
    }
    return -1;
  };

  const rawAnchors = [];
  for (const c of callouts) {
    if (override.flatBase || !calloutsReliable) break;
    const cell = nearestFloorCell(c.x, c.y);
    if (cell < 0) continue;
    rawAnchors.push({ cell, cm: c.z - cmFromLum(cellLum[cell]), name: c.name });
  }
  const anchors = filterAnchors(rawAnchors, G, cellFloor, cellMeters);
  const baseField = anchors.length >= 3
    ? geodesicBaseField({ cellFloor, G, cellMeters, anchors }).field
    : new Float32Array(G * G);

  const heightCm = new Float32Array(G * G);
  let minCm = Infinity;
  let maxCm = -Infinity;
  for (let i = 0; i < G * G; i++) {
    if (!cellFloor[i]) continue;
    const value = baseField[i] + cmFromLum(cellLum[i]);
    heightCm[i] = value;
    minCm = Math.min(minCm, value);
    maxCm = Math.max(maxCm, value);
  }
  if (!Number.isFinite(minCm)) {
    minCm = 0;
    maxCm = 0;
  }

  // Altura em decímetros (0–254); células sem piso herdam a altura do piso vizinho.
  const heightDm = new Uint8Array(G * G);
  const known = new Uint8Array(G * G);
  for (let i = 0; i < G * G; i++) {
    if (!cellFloor[i]) continue;
    heightDm[i] = Math.min(254, Math.round((heightCm[i] - minCm) / 10));
    known[i] = 1;
  }
  for (let pass = 0; pass < 24; pass++) {
    const newly = [];
    for (let i = 0; i < G * G; i++) {
      if (known[i]) continue;
      const x = i % G;
      const candidates = [x > 0 ? i - 1 : -1, x < G - 1 ? i + 1 : -1, i - G, i + G];
      let sum = 0;
      let count = 0;
      for (const n of candidates) {
        if (n >= 0 && n < G * G && known[n]) {
          sum += heightDm[n];
          count++;
        }
      }
      if (count) newly.push([i, Math.round(sum / count)]);
    }
    if (!newly.length) break;
    for (const [i, value] of newly) {
      heightDm[i] = value;
      known[i] = 1;
    }
  }

  const floorBits = new Uint8Array(Math.ceil((G * G) / 8));
  for (let i = 0; i < G * G; i++) if (cellFloor[i]) floorBits[i >> 3] |= 1 << (i & 7);

  return {
    version: GEOMETRY_VERSION,
    mapId: meta.uuid,
    name: meta.displayName,
    approximate: true,
    frame: { worldMeters: Math.round(worldMeters * 100) / 100, scaleKnown: hasScale },
    alignment,
    calloutsReliable,
    calloutFloorRatio: Math.round(alignedRatio * 100) / 100,
    grid: { size: G, heightsDm: toBase64(heightDm), floorBits: toBase64(floorBits) },
    heightSpanMeters: Math.round(maxCm - minCm) / 100,
    heightAnchors: anchors.length,
    walls: encodeRings(wallPolys, w),
    rails: encodeRings(railPolys, w),
    boxes: encodeRings(boxPolys, w),
    sites,
    callouts,
    features,
  };
}
