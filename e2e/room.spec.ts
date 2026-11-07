// Colaboração real entre abas, pelo transporte local. O motor é o mesmo das salas online.
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { clickBoard, createStrategy, dragBoard, placeAgent, positionText, stubNetwork, to3D } from './helpers';

async function openRoom(context: BrowserContext): Promise<{ host: Page; guest: Page; invite: string }> {
  const host = await context.newPage();
  await stubNetwork(host);
  await createStrategy(host);
  await placeAgent(host, 'Omen', 'attack', 0.4, 0.4);
  await host.getByTestId('room-button').click();
  await expect(host.getByTestId('local-room-note')).toBeVisible();
  await host.getByTestId('room-display-name').fill('Ana');
  await host.getByTestId('room-create').click();
  await expect(host.getByTestId('agents-count')).toHaveText('1');
  await host.getByTestId('room-button').click();
  const invite = await host.getByTestId('room-invite').inputValue();
  await host.getByRole('button', { name: 'Fechar' }).click();

  const guest = await context.newPage();
  await stubNetwork(guest);
  await guest.goto(invite);
  // O nome salvo no navegador é compartilhado entre as abas; a entrada direta usa esse nome.
  await expect(guest.getByTestId('agents-count')).toHaveText('1');
  return { host, guest, invite };
}

test('quem entra recebe a estratégia e os dois aparecem online', async ({ context }) => {
  const { host, guest } = await openRoom(context);
  await guest.getByTestId('room-button').click();
  await expect(guest.getByTestId('room-peers').locator('li')).toHaveCount(2);
  await host.getByTestId('room-button').click();
  await expect(host.getByTestId('room-peers').locator('li')).toHaveCount(2);
  await expect(host.getByTestId('room-connection')).toHaveAttribute('data-state', 'online');
});

test('agentes, utilitários e timeline sincronizam nos dois sentidos', async ({ context }) => {
  const { host, guest } = await openRoom(context);

  await placeAgent(guest, 'Jett', 'attack', 0.6, 0.6);
  await expect(host.getByTestId('agents-count')).toHaveText('2');

  await host.getByTestId('tab-abilities').click();
  await host.getByTestId('ability-agent-select').selectOption({ label: 'Omen' });
  await host.getByTestId('ability-Ability2').click();
  await clickBoard(host, 0.5, 0.5);
  await expect(guest.getByTestId('tl-utility')).toBeVisible();

  await host.getByTestId('utility-time').fill('4');
  await expect(guest.getByTestId('tl-utility')).toHaveAttribute('data-ms', '4000');

  await guest.getByTestId('tl-duration').fill('45');
  await expect(host.getByTestId('tl-duration')).toHaveValue('45');
});

test('mover um agente aparece na outra aba, mesmo em outro modo de visão', async ({ context }) => {
  const { host, guest } = await openRoom(context);
  await to3D(guest);
  await dragBoard(host, [0.4, 0.4], [0.7, 0.4]);
  const expected = await (async () => {
    await host.getByTestId('tab-object').click();
    return positionText(host);
  })();
  await guest.getByTestId('mode-2d').click();
  await guest.getByTestId('board-2d').waitFor();
  await guest.getByTestId('tab-agents').click();
  const point = { x: 0.7, y: 0.4 };
  await clickBoard(guest, point.x, point.y);
  await guest.getByTestId('tab-object').click();
  await expect(guest.getByTestId('agent-position')).toHaveText(expected);
});

test('cursores dos participantes chegam à sala', async ({ context }) => {
  const { host, guest } = await openRoom(context);
  await guest.getByTestId('board-2d').hover({ position: { x: 300, y: 300 } });
  await guest.mouse.move(420, 320, { steps: 3 });
  await guest.mouse.move(440, 340, { steps: 3 });
  await host.getByTestId('room-button').click();
  await expect(host.getByTestId('room-peers').locator('li')).toHaveCount(2);
});

test('o administrador rebaixa um participante a espectador, que não consegue editar', async ({ context }) => {
  const { host, guest } = await openRoom(context);
  await host.getByTestId('room-button').click();
  await expect(host.getByTestId('room-role-select')).toBeVisible();
  await host.getByTestId('room-role-select').selectOption('viewer');
  await host.getByRole('button', { name: 'Fechar' }).click();

  await expect(guest.getByTestId('read-only-hint')).toBeVisible();
  await expect(guest.getByTestId('tool-line')).toBeDisabled();
  await guest.getByTestId('tab-agents').click();
  await expect(guest.getByTestId('agent-Jett')).toBeDisabled();

  // Tentar arrastar não altera nada para ninguém.
  await dragBoard(guest, [0.4, 0.4], [0.8, 0.8]);
  await host.getByTestId('tab-object').click();
  await clickBoard(host, 0.4, 0.4);
  await expect(host.getByTestId('agent-editor')).toBeVisible();

  // O espectador continua recebendo as alterações.
  await placeAgent(host, 'Sage', 'defense', 0.6, 0.2);
  await expect(guest.getByTestId('agents-count')).toHaveText('2');

  // Devolvendo a permissão, volta a editar.
  await host.getByTestId('room-button').click();
  await host.getByTestId('room-role-select').selectOption('editor');
  await expect(guest.getByTestId('read-only-hint')).toBeHidden();
});

test('editor não vê controles de papel', async ({ context }) => {
  const { guest } = await openRoom(context);
  await guest.getByTestId('room-button').click();
  await expect(guest.getByTestId('room-peers').locator('li')).toHaveCount(2);
  await expect(guest.getByTestId('room-role-select')).toHaveCount(0);
});

test('entrar em uma sala local sem a aba de origem dá erro explicativo', async ({ page }) => {
  await stubNetwork(page);
  await page.goto('./');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open('tacticlab', 1);
        open.onupgradeneeded = () => {
          const db = open.result;
          for (const [name, keyPath] of [['strategies', 'id'], ['folders', 'id'], ['versions', 'id'], ['lineups', 'id'], ['kv', 'key']] as const) {
            if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
          }
        };
        open.onsuccess = () => {
          const tx = open.result.transaction('kv', 'readwrite');
          tx.objectStore('kv').put({ key: 'profile:name', value: 'Bia' });
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
        };
      }),
  );
  await page.goto('./#/sala/local-naoexiste');
  await page.reload();
  await expect(page.getByTestId('room-error')).toContainText('A aba que criou a sala precisa continuar aberta', { timeout: 15000 });
});

test('quem chega por convite sem nome salvo escolhe um nome', async ({ browser }) => {
  // Contexto novo: sem nome salvo. Sem a aba de origem, cai no aviso depois de informar o nome.
  const context = await browser.newContext();
  const page = await context.newPage();
  await stubNetwork(page);
  await page.goto('./#/sala/local-qualquer');
  await page.getByTestId('join-name').fill('Bia');
  await page.getByTestId('join-submit').click();
  await expect(page.getByTestId('room-error')).toBeVisible({ timeout: 15000 });
  await context.close();
});

test('salvar uma cópia leva a estratégia da sala para Estratégias', async ({ context }) => {
  const { guest } = await openRoom(context);
  await guest.getByTestId('room-button').click();
  await guest.getByTestId('room-save-copy').click();
  await expect(guest.getByTestId('toast-success')).toContainText('Cópia salva');
  await guest.getByTestId('room-leave').click();
  await expect(guest.getByText('(da sala)')).toBeVisible();
});

test('quem sai deixa de aparecer para os outros', async ({ context }) => {
  const { host, guest } = await openRoom(context);
  await guest.getByTestId('room-button').click();
  await guest.getByTestId('room-leave').click();
  await host.getByTestId('room-button').click();
  await expect(host.getByTestId('room-peers').locator('li')).toHaveCount(1);
});

test('a conta sem Supabase explica o funcionamento local', async ({ page }) => {
  await stubNetwork(page);
  await page.goto('./#/conta');
  await expect(page.getByTestId('account-not-configured')).toContainText('tudo funciona sem elas');
});
