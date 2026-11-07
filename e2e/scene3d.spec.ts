// O que a cena 3D mostra de fato. Lê o grafo de objetos pelo inventário da cena, não o documento.
import { expect, test, type Page } from '@playwright/test';
import { boardPoint, clickBoard, createStrategy, placeAgent, savedDoc, sceneItems, seekTimeline, singleAgent, stubNetwork, timelineMs, to2D, to3D, trackErrors, type SceneItem } from './helpers';

const WORLD_METERS = 142.86;

let errors: string[];

test.beforeEach(async ({ page }) => {
  errors = trackErrors(page);
  await stubNetwork(page);
});

test.afterEach(() => {
  expect(errors, 'erros não tratados na página').toEqual([]);
});

const items = async (page: Page, type: SceneItem['type']) => (await sceneItems(page)).filter((item) => item.type === type);

async function placeAbility(page: Page, agent: string, slot: string, points: Array<[number, number]>) {
  await page.getByTestId('tab-abilities').click();
  await page.getByTestId('ability-agent-select').selectOption({ label: agent });
  await page.getByTestId(`ability-${slot}`).click();
  for (const [x, y] of points) await clickBoard(page, x, y);
  if (points.length > 1) await page.getByTestId('hint-finish').click();
}

test.describe('agentes como bonecos', () => {
  test('cada agente vira um modelo 3D, com posição e direção do 2D', async ({ page }) => {
    const id = await createStrategy(page);
    await placeAgent(page, 'Jett', 'attack', 0.5, 0.48);
    await placeAgent(page, 'Sage', 'defense', 0.3, 0.75);
    const doc = await savedDoc(page, id);
    await to3D(page);
    await expect.poll(async () => (await items(page, 'agent')).length).toBe(2);

    for (const agent of Object.values(doc.agents)) {
      const model = (await items(page, 'agent')).find((item) => item.team === agent.team)!;
      expect(model.model).toBe('mannequin');
      expect(model.x).toBeCloseTo((agent.position.x - 0.5) * WORLD_METERS, 1);
      expect(model.z).toBeCloseTo((agent.position.y - 0.5) * WORLD_METERS, 1);
      expect(model.yaw).toBeCloseTo(-agent.facing, 2);
    }
    expect(await page.getByTestId('scene-manifest').innerText()).toContain('2 agentes');
  });

  test('o selecionado ganha destaque, e girar no 2D gira o boneco', async ({ page }) => {
    const id = await createStrategy(page);
    await placeAgent(page, 'Jett', 'attack', 0.5, 0.48);
    await page.getByTestId('tab-object').click();
    await page.getByTestId('agent-facing').fill('90');
    await savedDoc(page, id);
    await to3D(page);
    await expect.poll(async () => (await items(page, 'agent'))[0]?.selected).toBe(true);
    expect((await items(page, 'agent'))[0]!.yaw).toBeCloseTo(-Math.PI / 2, 2);

    // Clicar no piso, longe do boneco, limpa a seleção.
    const box = await page.getByTestId('viewer-3d').boundingBox();
    await page.mouse.click(box!.x + box!.width * 0.74, box!.y + box!.height * 0.57);
    await expect.poll(async () => (await items(page, 'agent'))[0]?.selected).toBe(false);
  });

  test('clicar no boneco seleciona, e arrastar move a mesma posição do 2D', async ({ page }) => {
    const id = await createStrategy(page);
    await to3D(page);
    await page.getByTestId('tab-agents').click();
    await page.getByTestId('agent-Sova').click();
    const box = await page.getByTestId('viewer-3d').boundingBox();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    await page.mouse.click(cx, cy);
    await expect.poll(async () => (await items(page, 'agent')).length).toBe(1);
    const start = singleAgent(await savedDoc(page, id)).position;

    await page.waitForTimeout(300);
    await page.mouse.move(cx, cy - 10);
    await page.mouse.down();
    await page.mouse.move(cx + 70, cy - 10, { steps: 6 });
    await page.mouse.up();
    const end = singleAgent(await savedDoc(page, id)).position;
    expect(end.x).toBeGreaterThan(start.x + 0.02);
    await expect.poll(async () => (await items(page, 'agent'))[0]?.x).toBeCloseTo((end.x - 0.5) * WORLD_METERS, 1);
  });

  test('a rota move o boneco na timeline, e a posição é a mesma ao voltar ao 2D', async ({ page }) => {
    const id = await createStrategy(page);
    await placeAgent(page, 'Jett', 'attack', 0.5, 0.48);
    await page.getByTestId('tab-object').click();
    await page.getByTestId('start-route').click();
    await clickBoard(page, 0.56, 0.48);
    await page.getByTestId('hint-finish').click();
    await savedDoc(page, id);
    await to3D(page);
    await expect.poll(async () => (await items(page, 'agent')).length).toBe(1);
    const startX = (await items(page, 'agent'))[0]!.x;
    await seekTimeline(page, 0.05);
    await expect.poll(async () => (await items(page, 'agent'))[0]!.x).toBeGreaterThan(startX + 1);

    const time = await timelineMs(page);
    const inScene = (await items(page, 'agent'))[0]!;
    await to2D(page);
    expect(await timelineMs(page)).toBe(time);
    await page.getByTestId('tab-object').click();
    const shown = await page.getByTestId('agent-position').innerText();
    expect(Number(shown.split(',')[0])).toBeCloseTo(inScene.x / WORLD_METERS + 0.5, 2);
  });
});

test.describe('habilidades em 3D', () => {
  test('cada categoria tem o próprio renderizador', async ({ page }) => {
    await createStrategy(page);
    await placeAbility(page, 'Omen', 'Ability2', [[0.3, 0.12]]);
    await placeAbility(page, 'Brimstone', 'Ability2', [[0.33, 0.15]]);
    await placeAbility(page, 'Astra', 'Ability2', [[0.27, 0.18]]);
    await placeAbility(page, 'Sage', 'Grenade', [[0.42, 0.2]]);
    await placeAbility(page, 'Brimstone', 'Ability1', [[0.45, 0.5]]);
    await placeAbility(page, 'Sova', 'Ability2', [[0.58, 0.28], [0.65, 0.26]]);
    await placeAbility(page, 'Skye', 'Ability1', [[0.51, 0.5], [0.56, 0.48]]);
    await placeAbility(page, 'Gekko', 'Ability1', [[0.25, 0.83], [0.3, 0.84]]);
    await placeAbility(page, 'Killjoy', 'Ability1', [[0.31, 0.77]]);
    await placeAbility(page, 'Killjoy', 'Ability2', [[0.255, 0.8]]);
    await to3D(page);
    await expect.poll(async () => (await items(page, 'ability')).length).toBe(10);

    const abilities = await items(page, 'ability');
    const rendered = abilities.map((item) => `${item.render}:${item.model ?? '-'}`).sort();
    expect(rendered).toEqual(
      [
        'smoke-volume:-',
        'smoke-volume:-',
        'smoke-volume:-',
        'wall-solid:-',
        'ground-area:-',
        'projectile:arrow',
        'creature:wolf',
        'creature:minion',
        'device:alarm-bot',
        'device:turret',
      ].sort(),
    );
    const omen = abilities.find((item) => item.render === 'smoke-volume' && item.radiusM === 4.1);
    expect(omen).toBeTruthy();
    expect(abilities.find((item) => item.render === 'wall-solid')).toMatchObject({ lengthM: 12, segments: 5 });
  });

  test('o preset vale igual para todos: reposicionar não muda o tamanho no 3D', async ({ page }) => {
    const id = await createStrategy(page);
    await placeAbility(page, 'Omen', 'Ability2', [[0.5, 0.5]]);
    const point = await boardPoint(page, 0.5, 0.5);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 50, point.y, { steps: 3 });
    await page.mouse.up();
    const [utility] = Object.values((await savedDoc(page, id)).utilities);
    await to3D(page);
    await expect.poll(async () => (await items(page, 'ability')).length).toBe(1);
    expect((await items(page, 'ability'))[0]).toMatchObject({ render: 'smoke-volume', radiusM: 4.1 });
    expect(utility!.shape.center!.x).toBeGreaterThan(0.51);
  });

  test('a timeline move a criatura e o projétil no 3D', async ({ page }) => {
    await createStrategy(page);
    await placeAbility(page, 'Skye', 'Ability1', [[0.51, 0.5], [0.56, 0.48]]);
    await placeAbility(page, 'Sova', 'Ability2', [[0.58, 0.28], [0.65, 0.26]]);
    await to3D(page);
    await expect.poll(async () => (await items(page, 'ability')).length).toBe(2);
    const at = async (render: string) => (await items(page, 'ability')).find((item) => item.render === render)!;
    expect((await at('creature')).progress).toBe(0);

    await seekTimeline(page, 0.05);
    await expect.poll(async () => (await at('creature')).progress as number).toBeGreaterThan(0.2);
    const running = await at('creature');
    expect(running.progress).toBeLessThan(1);
    expect(running.mapX).toBeGreaterThan(0.51);
    expect((await at('projectile')).progress).toBe(1);

    await seekTimeline(page, 0);
    await expect.poll(async () => (await at('creature')).progress as number).toBeLessThan(0.05);
  });

  test('reproduzindo, só aparece o que está ativo naquele instante', async ({ page }) => {
    await createStrategy(page);
    await placeAbility(page, 'Jett', 'Grenade', [[0.5, 0.5]]);
    await page.getByTestId('tab-object').click();
    await page.getByTestId('utility-time').fill('2');
    await to3D(page);
    await expect.poll(async () => (await items(page, 'ability')).length).toBe(1);

    await page.getByTestId('tl-play').click();
    await expect.poll(async () => (await items(page, 'ability')).length).toBe(0);
    await expect.poll(async () => (await items(page, 'ability')).length, { timeout: 15000 }).toBe(1);
    // Com o tempo do preset esgotado, volta a sumir enquanto reproduz.
    await expect.poll(async () => (await items(page, 'ability')).length, { timeout: 15000 }).toBe(0);
    await page.getByTestId('tl-play').click();
  });
});

test.describe('cenário 3D', () => {
  test('o mapa piloto usa o layout tático', async ({ page }) => {
    await createStrategy(page, 'Ascent');
    await to3D(page);
    await expect.poll(async () => (await items(page, 'scenario'))[0]?.detail).toBe('tactical');
    const [scenario] = await items(page, 'scenario');
    expect(scenario!.solids).toBeGreaterThan(40);
    expect(scenario!.ramps).toBeGreaterThanOrEqual(5);
    await page.getByTestId('approximate-badge').click();
    await expect(page.getByTestId('tactical-layout-note')).toBeVisible();
    await expect(page.getByTestId('approximate-details')).toContainText('Não é o modelo do jogo');
  });

  test('os outros mapas continuam abrindo com a geometria gerada', async ({ page }) => {
    await createStrategy(page, 'Bind');
    await to3D(page);
    await expect.poll(async () => (await items(page, 'scenario'))[0]?.detail).toBe('generated');
    await page.getByTestId('approximate-badge').click();
    await expect(page.getByTestId('tactical-layout-note')).toHaveCount(0);
  });

  test('a estratégia antiga, com tamanho próprio, abre no 3D com o preset', async ({ page }) => {
    const id = await createStrategy(page);
    const doc = await savedDoc(page, id);
    await page.evaluate(
      ([key, row]) =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('tacticlab');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const request = db.transaction('strategies', 'readwrite').objectStore('strategies').put(row, undefined);
            request.onsuccess = () => {
              db.close();
              resolve();
            };
            request.onerror = () => reject(request.error ?? new Error(String(key)));
          };
        }),
      [
        id,
        {
          ...doc,
          schemaVersion: 1,
          utilities: {
            old: {
              id: 'old',
              agentUuid: '8e253930-4c05-31dd-1b6c-968525494517',
              abilitySlot: 'Ability2',
              ownerTokenId: null,
              category: 'smoke',
              timeMs: 0,
              durationMs: null,
              travelMs: 0,
              note: '',
              shape: { type: 'circle', center: { x: 0.5, y: 0.5 }, radiusM: 30 },
            },
          },
        },
      ] as const,
    );
    await page.reload();
    await expect(page.getByTestId('board-2d').locator('canvas').first()).toBeVisible();
    await to3D(page);
    await expect.poll(async () => (await items(page, 'ability')).length).toBe(1);
    expect((await items(page, 'ability'))[0]).toMatchObject({ render: 'smoke-volume', radiusM: 4.1 });
  });
});
