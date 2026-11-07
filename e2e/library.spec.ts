import { expect, test, type Page } from '@playwright/test';
import { stubNetwork } from './helpers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAGklEQVR4AWMsKyv7z4AEmBjQABMDGmBiQAMAnFgCaep+VgIAAAAASUVORK5CYII=', 'base64');

async function fillLineup(page: Page, title: string) {
  await page.getByTestId('new-lineup').click();
  await page.getByTestId('lineup-title').fill(title);
  await page.getByTestId('lineup-agent').selectOption({ label: 'Sova' });
  await page.getByTestId('lineup-ability').selectOption({ index: 1 });
  const box = await page.getByTestId('lineup-map-picker').boundingBox();
  // Cada clique marca um ponto e passa para o próximo que falta.
  await page.mouse.click(box!.x + box!.width * 0.2, box!.y + box!.height * 0.2);
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
  await expect(page.getByTestId('lineup-save')).toBeDisabled();
  await page.mouse.click(box!.x + box!.width * 0.8, box!.y + box!.height * 0.8);
}

test.beforeEach(async ({ page }) => {
  await stubNetwork(page);
  await page.goto('./#/lineups');
  await expect(page.getByTestId('lineups-empty')).toBeVisible();
});

test('cria uma lineup com todos os campos e ela sobrevive a recarregar', async ({ page }) => {
  await fillLineup(page, 'Recon no site A');
  await page.getByTestId('lineup-version').fill('13.09');
  await page.getByTestId('lineup-images').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByAltText('Imagem 1')).toBeVisible();
  await page.getByTestId('lineup-save').click();

  const card = page.getByTestId('lineup-card');
  await expect(card).toContainText('Recon no site A');
  await expect(card).toContainText('Sova');
  await expect(card).toContainText('13.09');

  await page.reload();
  await expect(card).toContainText('Recon no site A');
  await expect(card.getByAltText(/Imagem 1/)).toBeVisible();
});

test('nunca aparece como oficial: nova lineup é não verificada', async ({ page }) => {
  await fillLineup(page, 'Sem verificar');
  const options = await page.getByTestId('lineup-status').locator('option').allInnerTexts();
  expect(options.join(' ').toLowerCase()).not.toContain('oficial');
  await page.getByTestId('lineup-save').click();
  await expect(page.getByTestId('lineup-status-label')).toHaveText('Não verificada');
});

test('o usuário informa que testou, e o texto diz exatamente isso', async ({ page }) => {
  await fillLineup(page, 'Testada');
  await page.getByTestId('lineup-status').selectOption('self-tested');
  await page.getByTestId('lineup-save').click();
  await expect(page.getByTestId('lineup-status-label')).toHaveText('Testada por você');
});

test('edita, filtra e exclui', async ({ page }) => {
  await fillLineup(page, 'Primeira');
  await page.getByTestId('lineup-save').click();
  await page.getByTestId('lineup-edit').click();
  await page.getByTestId('lineup-title').fill('Renomeada');
  await page.getByTestId('lineup-save').click();
  await expect(page.getByTestId('lineup-card')).toContainText('Renomeada');

  const maps = page.getByTestId('lineup-filter-map');
  const current = await maps.locator('option').nth(1).getAttribute('value');
  await maps.selectOption(current!);
  await expect(page.getByTestId('lineup-card')).toHaveCount(1);
  await maps.selectOption({ index: 2 });
  await expect(page.getByTestId('lineup-card')).toHaveCount(0);
  await maps.selectOption('');

  await page.getByTestId('lineup-delete').click();
  await page.getByTestId('lineup-confirm-delete').click();
  await expect(page.getByTestId('lineups-empty')).toBeVisible();
});

test('recusa arquivo que não é imagem', async ({ page }) => {
  await page.getByTestId('new-lineup').click();
  await page.getByTestId('lineup-images').setInputFiles({ name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  await expect(page.getByTestId('toast-error')).toContainText('não é uma imagem');
});
