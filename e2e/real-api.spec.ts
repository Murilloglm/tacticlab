// Verificação opcional contra a Valorant-API de verdade. Rode com E2E_REAL_API=1.
// Fica fora do fluxo normal para o CI não falhar quando o serviço externo estiver instável.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createStrategy, placeAgent, to3D } from './helpers';

test.skip(!process.env.E2E_REAL_API, 'Defina E2E_REAL_API=1 para testar com a API real.');

test('catálogo vivo, imagens reais e PNG sem bloqueio de CORS', async ({ page }) => {
  const responses: Record<string, number> = {};
  page.on('response', (response) => {
    if (response.url().includes('valorant-api.com')) responses[new URL(response.url()).pathname] = response.status();
  });

  await createStrategy(page, 'Ascent');
  await expect(page.getByText('Dados offline')).toHaveCount(0);
  expect(responses['/v1/maps']).toBe(200);
  expect(responses['/v1/agents']).toBe(200);

  await placeAgent(page, 'Omen', 'attack', 0.5, 0.5);

  // O canvas só exporta se minimapa e retrato tiverem vindo com CORS.
  await page.getByTestId('open-share').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-png').click()]);
  const png = readFileSync(await download.path());
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  // Uma imagem real do mapa é bem maior que uma prancha vazia.
  expect(png.length).toBeGreaterThan(50000);
  await page.getByRole('button', { name: 'Fechar' }).click();

  // Descrições longas só existem na resposta viva, não no catálogo de reserva.
  await page.getByTestId('tab-abilities').click();
  await page.getByTestId('ability-agent-select').selectOption({ label: 'Omen' });
  await expect(page.getByTestId('ability-Ability2')).toContainText(/\w{4,}.*\w{4,}.*\w{4,}/);

  await to3D(page);
  await expect(page.getByTestId('approximate-badge')).toBeVisible();
});
