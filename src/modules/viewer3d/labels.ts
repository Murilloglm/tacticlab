// Texturas de sprite desenhadas em canvas. Evita carregar fontes externas pela cena 3D.
import { CanvasTexture, SRGBColorSpace } from 'three';

function toTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export interface LabelTexture {
  texture: CanvasTexture;
  aspect: number;
}

const labelCache = new Map<string, LabelTexture>();

export function labelTexture(text: string, options: { color?: string; weight?: number; background?: string } = {}): LabelTexture {
  const key = `${text}|${options.color}|${options.weight}|${options.background}`;
  const cached = labelCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  const fontSize = 48;
  const font = `${options.weight ?? 600} ${fontSize}px Saira, system-ui, sans-serif`;
  context.font = font;
  const width = Math.ceil(context.measureText(text).width) + 28;
  canvas.width = Math.min(1024, width);
  canvas.height = fontSize + 20;
  const paint = canvas.getContext('2d')!;
  if (options.background) {
    paint.fillStyle = options.background;
    paint.fillRect(0, 0, canvas.width, canvas.height);
  }
  paint.font = font;
  paint.textBaseline = 'middle';
  paint.textAlign = 'center';
  paint.lineWidth = 7;
  paint.strokeStyle = 'rgba(0,0,0,0.85)';
  paint.strokeText(text, canvas.width / 2, canvas.height / 2);
  paint.fillStyle = options.color ?? '#ffffff';
  paint.fillText(text, canvas.width / 2, canvas.height / 2);
  const label = { texture: toTexture(canvas), aspect: canvas.width / canvas.height };
  labelCache.set(key, label);
  return label;
}

/** Retrato circular com anel de cor, usado nos billboards de agentes e utilidades. */
export function tokenTexture(options: {
  image: HTMLImageElement | null;
  ring: string;
  fallback: string;
  selected?: boolean;
}): CanvasTexture {
  const size = 192;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  const center = size / 2;
  const radius = size / 2 - 12;

  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.fillStyle = '#14161a';
  context.fill();

  if (options.image) {
    context.save();
    context.beginPath();
    context.arc(center, center, radius - 6, 0, Math.PI * 2);
    context.clip();
    context.drawImage(options.image, center - radius, center - radius, radius * 2, radius * 2);
    context.restore();
  } else {
    context.fillStyle = '#ffffff';
    context.font = '700 76px Saira, system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(options.fallback, center, center + 4);
  }

  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.lineWidth = 12;
  context.strokeStyle = options.ring;
  context.stroke();

  if (options.selected) {
    context.beginPath();
    context.arc(center, center, radius + 8, 0, Math.PI * 2);
    context.lineWidth = 5;
    context.strokeStyle = '#ffffff';
    context.stroke();
  }
  return toTexture(canvas);
}

const dotCache = new Map<string, CanvasTexture>();

/** Ponto de edição: legível em qualquer distância, com contorno para aparecer sobre o piso claro. */
export function dotTexture(color: string): CanvasTexture {
  const cached = dotCache.get(color);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d')!;
  context.beginPath();
  context.arc(32, 32, 24, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
  context.lineWidth = 7;
  context.strokeStyle = '#0c0d10';
  context.stroke();
  const texture = toTexture(canvas);
  dotCache.set(color, texture);
  return texture;
}
