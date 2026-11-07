import { expect, test, type Page } from '@playwright/test';
import { boardPoint, cameraPosition, createStrategy, savedDoc, sceneItems, singleAgent, stubNetwork, to3D, trackErrors } from './helpers';

test.beforeEach(async ({ page }) => {
  await stubNetwork(page);
});

const expectNoHorizontalScroll = async (page: Page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
};

test('as páginas cabem na largura do celular', async ({ page }) => {
  for (const hash of ['', '#/estrategias', '#/lineups', '#/conta']) {
    await page.goto(`./${hash}`);
    await page.waitForLoadState('networkidle');
    await expectNoHorizontalScroll(page);
  }
});

test('o editor cabe na tela e os controles principais ficam acessíveis', async ({ page }) => {
  await createStrategy(page);
  await expectNoHorizontalScroll(page);
  await expect(page.getByTestId('mode-2d')).toBeInViewport();
  await expect(page.getByTestId('mode-3d')).toBeInViewport();
  await expect(page.getByTestId('tool-rail')).toBeInViewport();
  await expect(page.getByTestId('tl-play')).toBeInViewport();
});

/** Elemento visível e não coberto: um toque nele chega nele mesmo. */
const expectTappable = async (page: Page, testId: string) => {
  const locator = page.getByTestId(testId);
  await expect(locator, testId).toBeInViewport({ ratio: 1 });
  // Botão desativado de propósito (desfazer sem histórico) não recebe toque, mas precisa estar à vista.
  if (await locator.isEnabled()) await locator.click({ trial: true, timeout: 3000 });
};

const expectNoOverlap = async (page: Page, a: string, b: string) => {
  const boxA = await page.getByTestId(a).boundingBox();
  const boxB = await page.getByTestId(b).boundingBox();
  const separate = boxA!.x + boxA!.width <= boxB!.x || boxB!.x + boxB!.width <= boxA!.x;
  expect(separate, `${a} sobrepõe ${b}`).toBe(true);
};

for (const width of [412, 360]) {
  test(`a barra superior não se sobrepõe em ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await createStrategy(page);
    await expectNoOverlap(page, 'mode-switch', 'undo');
    await expectNoOverlap(page, 'mode-switch', 'top-actions');
    for (const id of ['mode-2d', 'mode-3d', 'undo', 'redo', 'open-share', 'room-button', 'toggle-timeline', 'toggle-panel', 'tl-play', 'tl-keyframe', 'tool-select']) {
      await expectTappable(page, id);
    }
    await expectNoHorizontalScroll(page);
  });
}

test('todos os controles da câmera fantasma podem ser tocados', async ({ page }) => {
  await createStrategy(page);
  await to3D(page);
  await page.getByTestId('camera-ghost').click();
  for (const id of ['ghost-joystick', 'ghost-up', 'ghost-boost', 'ghost-down', 'tool-select', 'ghost-speed', 'camera-reset']) await expectTappable(page, id);
  // O controle de velocidade não pode ficar sobre os joysticks nem sobre os botões do topo.
  const speed = (await page.getByTestId('ghost-speed').boundingBox())!;
  const stick = (await page.getByTestId('ghost-joystick').boundingBox())!;
  const reset = (await page.getByTestId('camera-reset').boundingBox())!;
  expect(speed.y + speed.height).toBeLessThan(stick.y);
  expect(speed.y).toBeGreaterThan(reset.y + reset.height);
});

test('com o celular deitado, os controles continuam acessíveis', async ({ page }) => {
  await page.setViewportSize({ width: 915, height: 412 });
  await createStrategy(page);
  await to3D(page);
  await page.getByTestId('camera-ghost').click();
  await page.getByTestId('toggle-timeline').click();
  await expect(page.getByTestId('toggle-panel')).toBeVisible();
  for (const id of ['ghost-joystick', 'ghost-up', 'ghost-boost', 'ghost-down']) await expectTappable(page, id);
});

test('no celular, nome, lado e histórico ficam no painel', async ({ page }) => {
  const id = await createStrategy(page);
  await page.getByTestId('toggle-panel').click();
  await page.getByTestId('tab-object').click();
  await page.getByTestId('settings-name').fill('Retake rápido');
  await page.getByTestId('settings-side-defense').click();
  await page.getByTestId('settings-save-version').click();
  await expect(page.getByTestId('toast-success')).toContainText('histórico');
  await page.getByTestId('settings-history').click();
  await expect(page.getByTestId('history-list').locator('li')).toHaveCount(1);
  const doc = await savedDocFallback(page, id);
  expect(doc.name).toBe('Retake rápido');
  expect(doc.side).toBe('defense');
});

test('o painel abre sobre o mapa e recolhe', async ({ page }) => {
  await createStrategy(page);
  await expect(page.getByTestId('side-panel')).toBeHidden();
  await page.getByTestId('toggle-panel').click();
  await expect(page.getByTestId('side-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Recolher painel' }).first().click();
  await expect(page.getByTestId('side-panel')).toBeHidden();
});

test('posiciona um agente com toque e arrasta', async ({ page }) => {
  const id = await createStrategy(page);
  await page.getByTestId('toggle-panel').click();
  await page.getByTestId('agent-Omen').click();
  await page.getByRole('button', { name: 'Recolher painel' }).first().click();

  const p = await boardPoint(page, 0.5, 0.5);
  await page.touchscreen.tap(p.x, p.y);
  await expect(page.getByTestId('agents-count')).toHaveText('1');
  expect(singleAgent(await savedDoc(page, id).catch(async () => (await page.waitForTimeout(800), savedDocFallback(page, id)))).position.x).toBeCloseTo(0.5, 1);
});

// O indicador de salvamento fica oculto em telas pequenas; lê direto do banco depois do autosave.
async function savedDocFallback(page: Page, id: string) {
  const { readSaved } = await import('./helpers');
  const doc = await readSaved(page, id);
  if (!doc) throw new Error('Estratégia não salva');
  return doc;
}

test('pinça dá zoom e um dedo move a visão na prancha', async ({ page }) => {
  await createStrategy(page);
  const board = page.getByTestId('board-2d');
  const box = await board.boundingBox();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;
  const scale = async () => Number(await board.getAttribute('data-scale'));
  const offset = async () => Number(await board.getAttribute('data-x'));
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: Array<[number, number]>) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });

  const initial = await scale();
  await touch('touchStart', [[cx - 40, cy], [cx + 40, cy]]);
  await touch('touchMove', [[cx - 90, cy], [cx + 90, cy]]);
  await touch('touchMove', [[cx - 120, cy], [cx + 120, cy]]);
  await touch('touchEnd', []);
  await expect.poll(scale).toBeGreaterThan(initial * 2);

  const zoomed = await scale();
  await touch('touchStart', [[cx - 120, cy], [cx + 120, cy]]);
  await touch('touchMove', [[cx - 60, cy], [cx + 60, cy]]);
  await touch('touchEnd', []);
  await expect.poll(scale).toBeLessThan(zoomed);

  const before = await offset();
  await touch('touchStart', [[cx, cy]]);
  await touch('touchMove', [[cx + 40, cy]]);
  await touch('touchMove', [[cx + 80, cy]]);
  await touch('touchEnd', []);
  await expect.poll(offset).toBeGreaterThan(before + 40);
});

test('no celular, o 3D mostra bonecos e habilidades em 3D sem erros', async ({ page }) => {
  const errors = trackErrors(page);
  await createStrategy(page);
  await page.getByTestId('toggle-panel').click();
  await page.getByTestId('agent-Sage').click();
  await page.getByRole('button', { name: 'Recolher painel' }).first().click();
  const point = await boardPoint(page, 0.5, 0.48);
  await page.touchscreen.tap(point.x, point.y);
  await expect(page.getByTestId('agents-count')).toHaveText('1');
  await page.getByTestId('toggle-panel').click();
  await page.getByTestId('tab-abilities').click();
  await page.getByTestId('ability-Grenade').click();
  await page.getByRole('button', { name: 'Recolher painel' }).first().click();
  const wallPoint = await boardPoint(page, 0.45, 0.2);
  await page.touchscreen.tap(wallPoint.x, wallPoint.y);
  await page.getByRole('button', { name: 'Recolher painel' }).first().click({ timeout: 2000 }).catch(() => undefined);
  await to3D(page);
  await expect.poll(async () => (await sceneItems(page)).map((item) => item.type).sort()).toEqual(['ability', 'agent', 'scenario']);
  const all = await sceneItems(page);
  expect(all.find((item) => item.type === 'agent')).toMatchObject({ model: 'mannequin' });
  expect(all.find((item) => item.type === 'ability')).toMatchObject({ render: 'wall-solid' });
  expect(all.find((item) => item.type === 'scenario')).toMatchObject({ detail: 'tactical' });
  expect(errors).toEqual([]);
});

test('a câmera fantasma tem joystick, área de olhar e botões de altura', async ({ page }) => {
  await createStrategy(page);
  await to3D(page);
  await expect(page.getByTestId('ghost-joystick')).toHaveCount(0);
  await page.getByTestId('camera-ghost').click();
  await expect(page.getByTestId('ghost-joystick')).toBeVisible();
  await page.waitForTimeout(300);

  const read = () => cameraPosition(page);
  const start = await read();

  // Joystick para cima anda para frente.
  const stick = await page.getByTestId('ghost-joystick').boundingBox();
  const cx = stick!.x + stick!.width / 2;
  const cy = stick!.y + stick!.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 50, { steps: 3 });
  await page.waitForTimeout(600);
  await page.mouse.up();
  await page.waitForTimeout(250);
  const moved = await read();
  expect(Math.hypot(moved.x - start.x, moved.y - start.y, moved.z - start.z)).toBeGreaterThan(2);

  // Soltar para o movimento.
  const a = await read();
  await page.waitForTimeout(400);
  const b = await read();
  expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(1);

  // Botão de subir.
  const up = await page.getByTestId('ghost-up').boundingBox();
  await page.mouse.move(up!.x + up!.width / 2, up!.y + up!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await page.waitForTimeout(250);
  expect((await read()).y).toBeGreaterThan(b.y + 1);

  // Arrastar na área de olhar gira a visão.
  const before = await read();
  const pad = await page.getByTestId('ghost-look-pad').boundingBox();
  await page.mouse.move(pad!.x + 20, pad!.y + pad!.height / 2);
  await page.mouse.down();
  await page.mouse.move(pad!.x + 120, pad!.y + pad!.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  expect((await read()).yaw).not.toBeCloseTo(before.yaw, 2);
});
