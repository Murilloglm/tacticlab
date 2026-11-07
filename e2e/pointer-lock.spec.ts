// Testes com o mouse capturado (Pointer Lock). Rodam no Chromium completo, não no headless shell:
// no Linux, com o ponteiro travado, o shell leva o cursor para (0,0) e devolve cada movimento
// em seguida (movementX +612 e depois -612), então a visão nunca gira e pode dar saltos falsos.
import { expect, test } from '@playwright/test';
import { cameraPosition, createStrategy, readSaved, singleAgent, stubNetwork, to3D, trackErrors } from './helpers';

test.use({ channel: 'chromium' });

let errors: string[];

test.beforeEach(async ({ page }) => {
  errors = trackErrors(page);
  await stubNetwork(page);
  await createStrategy(page);
  await to3D(page);
  await page.getByTestId('camera-ghost').click();
  await page.waitForTimeout(300);
});

test.afterEach(() => {
  expect(errors, 'erros não tratados na página').toEqual([]);
});

test('clicar captura o mouse, o mouse gira a visão e sair libera', async ({ page }) => {
  const box = await page.getByTestId('viewer-3d').boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.getByTestId('ghost-status')).toHaveAttribute('data-locked', 'true');
  await page.waitForTimeout(250);
  const before = await cameraPosition(page);
  await page.mouse.move(box!.x + box!.width / 2 + 150, box!.y + box!.height / 2, { steps: 5 });
  await page.waitForTimeout(250);
  expect((await cameraPosition(page)).yaw).not.toBeCloseTo(before.yaw, 2);
  // Esc é tratado pelo próprio navegador; em teste, o efeito equivalente é sair da trava.
  await page.evaluate(() => document.exitPointerLock());
  await expect(page.getByTestId('ghost-status')).toHaveAttribute('data-locked', 'false');
});

test('com o mouse capturado, as ferramentas usam a mira e não a posição congelada', async ({ page }) => {
  const url = page.url();
  const id = /#\/editor\/(.+)$/.exec(url)![1]!;
  await page.getByTestId('tab-agents').click();
  await page.getByTestId('agent-Sova').click();
  const box = await page.getByTestId('viewer-3d').boundingBox();
  // Clique fora do centro: captura o mouse, sem posicionar nada.
  const off = { x: box!.x + box!.width * 0.2, y: box!.y + box!.height * 0.8 };
  await page.mouse.click(off.x, off.y);
  await expect(page.getByTestId('ghost-status')).toHaveAttribute('data-locked', 'true');
  await expect(page.getByTestId('agents-count')).toHaveCount(0);
  expect(Object.keys((await readSaved(page, id))!.agents)).toHaveLength(0);

  // O próximo clique posiciona onde a mira aponta: o centro do mapa, não onde o mouse parou.
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(async () => Object.keys((await readSaved(page, id))!.agents).length).toBe(1);
  const placed = singleAgent((await readSaved(page, id))!).position;
  expect(Math.abs(placed.x - 0.5)).toBeLessThan(0.08);
  expect(Math.abs(placed.y - 0.5)).toBeLessThan(0.08);
  await page.evaluate(() => document.exitPointerLock());
});
