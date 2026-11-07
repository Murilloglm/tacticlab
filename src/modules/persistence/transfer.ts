// Importação e exportação de JSON, e links de compartilhamento que carregam a própria estratégia.
import { newId } from '../strategy/factory';
import { parseStrategy, type StrategyDoc } from '../strategy/schema';

const EXPORT_FORMAT = 'tacticlab.strategy';

export function exportStrategyJson(doc: StrategyDoc): string {
  return JSON.stringify({ format: EXPORT_FORMAT, exportedAt: new Date().toISOString(), strategy: doc }, null, 2);
}

export type ImportResult = { ok: true; doc: StrategyDoc } | { ok: false; error: string };

/** Valida o arquivo e devolve uma cópia com novo id, sem sobrescrever nada do usuário. */
export function importStrategyJson(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'O arquivo não é um JSON válido.' };
  }
  const payload =
    data && typeof data === 'object' && 'strategy' in data ? (data as { strategy: unknown }).strategy : data;
  const parsed = parseStrategy(payload);
  if (!parsed.ok) return { ok: false, error: `Estratégia inválida. ${parsed.error}` };
  const now = Date.now();
  return { ok: true, doc: { ...parsed.doc, id: newId(), createdAt: now, updatedAt: now, folderId: null } };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(text: string): Uint8Array {
  const normalized = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, transform: ReadableWritablePair<Uint8Array, Uint8Array>): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeShare(doc: StrategyDoc): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(doc));
  return bytesToBase64Url(await pipe(json, new CompressionStream('deflate-raw') as ReadableWritablePair<Uint8Array, Uint8Array>));
}

export async function decodeShare(encoded: string): Promise<ImportResult> {
  try {
    const raw = await pipe(
      base64UrlToBytes(encoded),
      new DecompressionStream('deflate-raw') as ReadableWritablePair<Uint8Array, Uint8Array>,
    );
    return importStrategyJson(new TextDecoder().decode(raw));
  } catch {
    return { ok: false, error: 'O link está incompleto ou corrompido.' };
  }
}

/** Navegadores e mensageiros começam a cortar URLs acima de cerca de 8 mil caracteres. */
export const SHARE_URL_SAFE_LENGTH = 8000;

export function buildShareUrl(encoded: string): string {
  return `${location.origin}${location.pathname}#/s/${encoded}`;
}

export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  triggerDownload(filename, url);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function triggerDownload(filename: string, href: string): void {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export const safeFilename = (name: string): string =>
  name.normalize('NFD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'estrategia';
