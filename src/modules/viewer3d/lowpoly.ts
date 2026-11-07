// Montagem de modelos low-poly a partir de primitivas: uma única geometria com cor por vértice,
// sem textura e sem arquivo externo. Cada modelo vira um único draw call. Funções puras e testáveis.
import { BoxGeometry, BufferAttribute, Color, ConeGeometry, CylinderGeometry, Euler, IcosahedronGeometry, Matrix4, Quaternion, TorusGeometry, Vector3, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Vec3 = [number, number, number];

export interface Part {
  geometry: BufferGeometry;
  color: string;
  at?: Vec3;
  rotate?: Vec3;
  scale?: Vec3;
}

export const box = (w: number, h: number, d: number): BufferGeometry => new BoxGeometry(w, h, d);
export const cylinder = (top: number, bottom: number, height: number, sides = 6): BufferGeometry => new CylinderGeometry(top, bottom, height, sides);
export const cone = (radius: number, height: number, sides = 6): BufferGeometry => new ConeGeometry(radius, height, sides);
export const ball = (radius: number, detail = 0): BufferGeometry => new IcosahedronGeometry(radius, detail);
export const torus = (radius: number, tube: number): BufferGeometry => new TorusGeometry(radius, tube, 4, 10);

export function mergeParts(parts: Part[]): BufferGeometry {
  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const paint = new Color();
  const pieces = parts.map((part) => {
    const piece = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
    part.geometry.dispose();
    piece.deleteAttribute('uv');
    quaternion.setFromEuler(new Euler(...(part.rotate ?? [0, 0, 0])));
    matrix.compose(new Vector3(...(part.at ?? [0, 0, 0])), quaternion, new Vector3(...(part.scale ?? [1, 1, 1])));
    piece.applyMatrix4(matrix);
    // Sem índice, cada triângulo recebe a própria normal: é o que dá o aspecto facetado.
    piece.computeVertexNormals();
    paint.set(part.color);
    const count = piece.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([paint.r, paint.g, paint.b], i * 3);
    piece.setAttribute('color', new BufferAttribute(colors, 3));
    return piece;
  });
  const merged = mergeGeometries(pieces, false);
  for (const piece of pieces) piece.dispose();
  if (!merged) throw new Error('Não foi possível combinar as partes do modelo.');
  return merged;
}

/** Quantidade de triângulos, usada nos limites de leveza dos testes. */
export const triangleCount = (geometry: BufferGeometry): number =>
  (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
