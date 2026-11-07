import { expect, type Page } from '@playwright/test';

// PNG cinza válido. Os testes não dependem da rede nem de recursos externos.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAGklEQVR4AWMsKyv7z4AEmBjQABMDGmBiQAMAnFgCaep+VgIAAAAASUVORK5CYII=',
  'base64',
);

/** Sem API: o app usa o catálogo publicado com o site. Imagens viram um PNG com CORS liberado. */
export async function stubNetwork(page: Page): Promise<void> {
  await page.route('https://valorant-api.com/**', (route) => route.abort());
  await page.route('https://media.valorant-api.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG, headers: { 'access-control-allow-origin': '*' } }),
  );
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
}

/** Falha o teste se a página gerar erro não tratado. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

export async function createStrategy(page: Page, map = 'Ascent'): Promise<string> {
  await page.goto('./');
  await page.getByTestId(`map-${map}`).click();
  await page.getByTestId('create-strategy').click();
  await expect(page.getByTestId('board-2d').locator('canvas').first()).toBeVisible();
  const match = /#\/editor\/(.+)$/.exec(page.url());
  if (!match) throw new Error(`URL inesperada: ${page.url()}`);
  return match[1]!;
}

/** Converte coordenadas de mapa em posição de tela na prancha, com o zoom inicial. */
export async function boardPoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId('board-2d').boundingBox();
  if (!box) throw new Error('Prancha não encontrada');
  const size = Math.min(box.width, box.height);
  return { x: box.x + box.width / 2 + (x - 0.5) * size, y: box.y + box.height / 2 + (y - 0.5) * size };
}

export async function clickBoard(page: Page, x: number, y: number): Promise<void> {
  const p = await boardPoint(page, x, y);
  await page.mouse.click(p.x, p.y);
}

export async function dragBoard(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const a = await boardPoint(page, from[0], from[1]);
  const b = await boardPoint(page, to[0], to[1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}

export async function placeAgent(page: Page, name: string, team: 'attack' | 'defense', x: number, y: number): Promise<void> {
  await page.getByTestId('tab-agents').click();
  await page.getByTestId(`team-${team}`).click();
  await page.getByTestId(`agent-${name}`).click();
  await clickBoard(page, x, y);
}

export interface SavedDoc {
  id: string;
  name: string;
  side: string;
  folderId: string | null;
  durationMs: number;
  agents: Record<string, { agentUuid: string; team: string; position: { x: number; y: number }; facing: number; route: { startMs: number; speedMps: number; waypoints: Array<{ id: string; point: { x: number; y: number }; pauseMs: number; arriveAtMs: number | null }> } | null }>;
  utilities: Record<string, { category: string; timeMs: number; durationMs: number | null; shape: { type: string; radiusM?: number; points?: unknown[] } }>;
  drawings: Record<string, { type: string; text?: string; arrow?: boolean; label?: string }>;
  notes: Record<string, { timeMs: number; text: string }>;
}

/** Lê do IndexedDB, ou seja, o que de fato foi salvo, não o que está na tela. */
export function readSaved(page: Page, id: string): Promise<SavedDoc | null> {
  return page.evaluate(
    (key) =>
      new Promise<SavedDoc | null>((resolve, reject) => {
        const open = indexedDB.open('tacticlab');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction('strategies').objectStore('strategies').get(key);
          request.onsuccess = () => {
            db.close();
            resolve((request.result as SavedDoc | undefined) ?? null);
          };
          request.onerror = () => reject(request.error);
        };
      }),
    id,
  );
}

/** Espera o salvamento automático concluir e devolve o documento. */
export async function savedDoc(page: Page, id: string): Promise<SavedDoc> {
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  const doc = await readSaved(page, id);
  if (!doc) throw new Error('Estratégia não encontrada no IndexedDB');
  return doc;
}

export const singleAgent = (doc: SavedDoc) => {
  const agents = Object.values(doc.agents);
  if (agents.length !== 1) throw new Error(`Esperava um agente, há ${agents.length}`);
  return agents[0]!;
};

export async function to3D(page: Page): Promise<void> {
  await page.getByTestId('mode-3d').click();
  await expect(page.locator('[data-testid="viewer-3d"][data-map-ready="true"] canvas')).toBeVisible({ timeout: 30000 });
}

export async function to2D(page: Page): Promise<void> {
  await page.getByTestId('mode-2d').click();
  await expect(page.getByTestId('board-2d').locator('canvas').first()).toBeVisible();
}

export async function cameraPosition(page: Page): Promise<{ x: number; y: number; z: number; yaw: number }> {
  const el = page.getByTestId('camera-position');
  const read = async (name: string) => Number(await el.getAttribute(name));
  return { x: await read('data-x'), y: await read('data-y'), z: await read('data-z'), yaw: await read('data-yaw') };
}

export async function timelineMs(page: Page): Promise<number> {
  return Number(await page.getByTestId('tl-time').getAttribute('data-ms'));
}

/** Clica na régua da timeline na fração indicada da duração. */
export async function seekTimeline(page: Page, fraction: number): Promise<void> {
  const box = await page.getByTestId('tl-track').boundingBox();
  if (!box) throw new Error('Timeline não encontrada');
  await page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2);
}

export const positionText = (page: Page) => page.getByTestId('agent-position').innerText();
