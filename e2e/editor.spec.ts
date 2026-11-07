import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  boardPoint,
  cameraPosition,
  clickBoard,
  createStrategy,
  dragBoard,
  placeAgent,
  positionText,
  readSaved,
  savedDoc,
  sceneItems,
  seekTimeline,
  singleAgent,
  stubNetwork,
  timelineMs,
  to2D,
  to3D,
  trackErrors,
} from './helpers';

let errors: string[];

test.beforeEach(async ({ page }) => {
  errors = trackErrors(page);
  await stubNetwork(page);
});

test.afterEach(() => {
  expect(errors, 'erros não tratados na página').toEqual([]);
});

test.describe('catálogo e publicação', () => {
  test('abre no subcaminho do GitHub Pages sem recursos faltando', async ({ page }) => {
    const missing: string[] = [];
    page.on('response', (response) => {
      if (response.status() >= 400) missing.push(response.url());
    });
    await page.goto('./');
    await expect(page.getByTestId('map-Ascent')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/tacticlab/');
    expect(missing).toEqual([]);
  });

  test('sem a API, usa o catálogo de reserva e avisa', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByTestId('map-Haven')).toBeVisible();
    await expect(page.getByText('Dados offline')).toBeVisible();
  });

  test('todos os mapas de plant abrem nos dois modos', async ({ page }) => {
    test.setTimeout(240000);
    await page.goto('./');
    const plates = page.locator('section[aria-labelledby="tactical-title"] [data-testid^="map-"]');
    await expect(plates.first()).toBeVisible();
    const names = await plates.evaluateAll((items) => items.map((item) => item.getAttribute('data-testid')!.replace('map-', '')));
    expect(names.length).toBeGreaterThanOrEqual(12);
    for (const name of names) {
      await createStrategy(page, name);
      await to3D(page);
      await expect(page.getByTestId('approximate-badge'), name).toBeVisible();
    }
  });

  test('rota desconhecida mostra saída', async ({ page }) => {
    await page.goto('./#/nao-existe');
    await expect(page.getByText('Esta página não existe')).toBeVisible();
  });

  test('estratégia inexistente explica o motivo', async ({ page }) => {
    await page.goto('./#/editor/nao-existe');
    await expect(page.getByText('Estratégia não encontrada neste navegador')).toBeVisible();
  });
});

test.describe('prancheta 2D', () => {
  test('posiciona agente, salva e sobrevive a recarregar', async ({ page }) => {
    const id = await createStrategy(page);
    await placeAgent(page, 'Omen', 'attack', 0.5, 0.5);
    const saved = singleAgent(await savedDoc(page, id));
    expect(saved.team).toBe('attack');
    expect(saved.position.x).toBeCloseTo(0.5, 1);

    await page.reload();
    await expect(page.getByTestId('agents-count')).toHaveText('1');
  });

  test('sair logo depois de editar não perde a alteração', async ({ page }) => {
    const id = await createStrategy(page);
    await placeAgent(page, 'Omen', 'attack', 0.5, 0.5);
    // Sai antes do intervalo do salvamento automático.
    await page.evaluate(() => {
      location.hash = '/estrategias';
    });
    await expect(page.getByTestId('strategy-row')).toHaveCount(1);
    expect(Object.keys((await readSaved(page, id))!.agents)).toHaveLength(1);
  });

  test('recarregar logo depois de editar não perde a alteração', async ({ page }) => {
    const id = await createStrategy(page);
    await placeAgent(page, 'Omen', 'attack', 0.5, 0.5);
    await page.reload();
    await expect(page.getByTestId('agents-count')).toHaveText('1');
    expect(Object.keys((await readSaved(page, id))!.agents)).toHaveLength(1);
  });

  test('o minimapa carrega na prancha', async ({ page }) => {
    await createStrategy(page);
    await expect(page.getByText('O minimapa não carregou')).toHaveCount(0);
    const loaded = await page.evaluate(async () => {
      const response = await fetch('https://media.valorant-api.com/maps/x/displayicon.png');
      const bitmap = await createImageBitmap(await response.blob());
      return bitmap.width > 0;
    });
    expect(loaded).toBe(true);
  });

  test('aceita cinco agentes por equipe e recusa o sexto', async ({ page }) => {
    const id = await createStrategy(page);
    const names = ['Omen', 'Jett', 'Sova', 'Sage', 'Killjoy'];
    for (const [index, name] of names.entries()) await placeAgent(page, name, 'attack', 0.3 + index * 0.08, 0.3);
    for (const [index, name] of names.entries()) await placeAgent(page, name, 'defense', 0.3 + index * 0.08, 0.7);
    await expect(page.getByTestId('agents-count')).toHaveText('10');
    await page.getByTestId('team-attack').click();
    await expect(page.getByTestId('agent-Gekko')).toBeDisabled();
    expect(Object.keys((await savedDoc(page, id)).agents)).toHaveLength(10);
  });

  test('arrasta um agente e desfaz em um passo', async ({ page }) => {
    const id = await createStrategy(page);
    await placeAgent(page, 'Jett', 'attack', 0.4, 0.4);
    await dragBoard(page, [0.4, 0.4], [0.6, 0.6]);
    const moved = singleAgent(await savedDoc(page, id));
    expect(moved.position.x).toBeCloseTo(0.6, 1);

    await page.getByTestId('undo').click();
    expect(singleAgent(await savedDoc(page, id)).position.x).toBeCloseTo(0.4, 1);
    await page.getByTestId('redo').click();
    expect(singleAgent(await savedDoc(page, id)).position.x).toBeCloseTo(0.6, 1);
  });

  test('atalhos de desfazer, duplicar e excluir funcionam', async ({ page }) => {
    const id = await createStrategy(page);
    await placeAgent(page, 'Jett', 'attack', 0.4, 0.4);
    await page.keyboard.press('Control+KeyD');
    await expect(page.getByTestId('agents-count')).toHaveText('2');
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('agents-count')).toHaveText('1');
    await page.keyboard.press('Control+KeyZ');
    await expect(page.getByTestId('agents-count')).toHaveText('2');
    expect(Object.keys((await savedDoc(page, id)).agents)).toHaveLength(2);
  });

  test('gira a direção pela alça e pelo painel', async ({ page }) => {
    const id = await createStrategy(page);
    await placeAgent(page, 'Sova', 'attack', 0.5, 0.5);
    const before = singleAgent(await savedDoc(page, id)).facing;
    await page.getByTestId('tab-object').click();
    await page.getByTestId('agent-facing').fill('90');
    await page.getByTestId('agent-facing').blur();
    const after = singleAgent(await savedDoc(page, id)).facing;
    expect(after).not.toBe(before);
    expect(after).toBeCloseTo(Math.PI / 2, 2);
  });

  test('desenha linha, seta, mão livre, marcação, texto e área', async ({ page }) => {
    const id = await createStrategy(page);
    await page.getByTestId('tool-line').click();
    await dragBoard(page, [0.2, 0.2], [0.3, 0.2]);
    await page.getByTestId('tool-arrow').click();
    await dragBoard(page, [0.2, 0.3], [0.3, 0.3]);
    await page.getByTestId('tool-freehand').click();
    await dragBoard(page, [0.2, 0.4], [0.3, 0.45]);
    await page.getByTestId('tool-marker').click();
    await clickBoard(page, 0.5, 0.2);
    await page.getByTestId('marker-label').fill('Entrada');
    await page.getByTestId('tool-text').click();
    await clickBoard(page, 0.5, 0.3);
    await page.getByTestId('text-content').fill('Esperar a smoke');
    await page.getByTestId('tool-area').click();
    await dragBoard(page, [0.5, 0.5], [0.55, 0.5]);

    const doc = await savedDoc(page, id);
    const drawings = Object.values(doc.drawings);
    expect(drawings.map((d) => d.type).sort()).toEqual(['area', 'line', 'line', 'line', 'marker', 'text']);
    expect(drawings.filter((d) => d.arrow)).toHaveLength(1);
    expect(drawings.find((d) => d.type === 'text')!.text).toBe('Esperar a smoke');
    expect(drawings.find((d) => d.type === 'marker')!.label).toBe('Entrada');
  });

  test('o zoom com scroll altera a visão sem alterar os dados', async ({ page }) => {
    const id = await createStrategy(page);
    await placeAgent(page, 'Sage', 'defense', 0.5, 0.5);
    const before = singleAgent(await savedDoc(page, id)).position;
    const center = await boardPoint(page, 0.5, 0.5);
    await page.mouse.move(center.x, center.y);
    const board = page.getByTestId('board-2d');
    const initial = Number(await board.getAttribute('data-scale'));
    await page.mouse.wheel(0, -600);
    await expect.poll(async () => Number(await board.getAttribute('data-scale'))).toBeGreaterThan(initial);
    // Com zoom centrado no agente, ele continua sob o ponteiro e pode ser selecionado.
    await page.mouse.click(center.x, center.y);
    await expect(page.getByTestId('tool-delete')).toBeEnabled();
    expect(singleAgent(await savedDoc(page, id)).position).toEqual(before);
  });

  test('arrastar o vazio move a visão: um agente arrastado depois cai no lugar certo', async ({ page }) => {
    const id = await createStrategy(page);
    await placeAgent(page, 'Sage', 'defense', 0.5, 0.5);
    await page.keyboard.press('Escape');
    // Move a visão 100 px para a direita, começando por um ponto vazio.
    const empty = await boardPoint(page, 0.05, 0.05);
    await page.mouse.move(empty.x, empty.y);
    await page.mouse.down();
    await page.mouse.move(empty.x + 100, empty.y, { steps: 4 });
    await page.mouse.up();
    // O agente agora está 100 px à direita na tela.
    const center = await boardPoint(page, 0.5, 0.5);
    await page.mouse.move(center.x + 100, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 140, center.y, { steps: 3 });
    await page.mouse.up();
    const moved = singleAgent(await savedDoc(page, id)).position;
    expect(moved.x).toBeGreaterThan(0.52);
    expect(moved.y).toBeCloseTo(0.5, 1);
  });
});

test.describe('alternância 2D e 3D', () => {
  test('nada se perde ao trocar de modo, e a posição é a mesma nos dois', async ({ page }) => {
    const id = await createStrategy(page);
    await placeAgent(page, 'Omen', 'attack', 0.45, 0.55);
    await page.getByTestId('tool-arrow').click();
    await dragBoard(page, [0.2, 0.2], [0.3, 0.3]);
    await page.getByTestId('tab-abilities').click();
    await page.getByTestId('ability-agent-select').selectOption({ label: 'Omen' });
    await page.getByTestId('ability-Ability2').click();
    await clickBoard(page, 0.6, 0.6);
    await seekTimeline(page, 0.2);
    const time = await timelineMs(page);
    const before = await savedDoc(page, id);

    for (let i = 0; i < 2; i++) {
      await to3D(page);
      expect(await timelineMs(page)).toBe(time);
      await to2D(page);
      expect(await timelineMs(page)).toBe(time);
    }
    await expect(page.getByTestId('agents-count')).toHaveText('1');

    const after = await savedDoc(page, id);
    expect(after.agents).toEqual(before.agents);
    expect(after.utilities).toEqual(before.utilities);
    expect(after.drawings).toEqual(before.drawings);
  });

  test('posicionar no 3D aparece no 2D, no ponto apontado', async ({ page }) => {
    const id = await createStrategy(page);
    await to3D(page);
    await page.getByTestId('tab-agents').click();
    await page.getByTestId('agent-Sova').click();
    const canvas = await page.getByTestId('viewer-3d').boundingBox();
    // A câmera aérea padrão olha para o centro do mapa.
    await page.mouse.click(canvas!.x + canvas!.width / 2, canvas!.y + canvas!.height / 2);
    const placed = singleAgent(await savedDoc(page, id)).position;
    expect(Math.abs(placed.x - 0.5)).toBeLessThan(0.06);
    expect(Math.abs(placed.y - 0.5)).toBeLessThan(0.06);
    await to2D(page);
    await expect(page.getByTestId('agents-count')).toHaveText('1');
  });

  test('mover um agente no 3D atualiza a mesma posição no 2D', async ({ page }) => {
    const id = await createStrategy(page);
    await to3D(page);
    await page.getByTestId('tab-agents').click();
    await page.getByTestId('agent-Sova').click();
    const canvas = await page.getByTestId('viewer-3d').boundingBox();
    const cx = canvas!.x + canvas!.width / 2;
    const cy = canvas!.y + canvas!.height / 2;
    await page.mouse.click(cx, cy);
    const start = singleAgent(await savedDoc(page, id)).position;

    // O corpo do boneco fica um pouco acima do ponto no piso.
    await page.waitForTimeout(300);
    await page.mouse.move(cx, cy - 12);
    await page.mouse.down();
    await page.mouse.move(cx + 80, cy - 12, { steps: 6 });
    await page.mouse.up();

    const end = singleAgent(await savedDoc(page, id)).position;
    expect(end.x).toBeGreaterThan(start.x + 0.02);

    await to2D(page);
    await page.getByTestId('tab-object').click();
    const point = await boardPoint(page, end.x, end.y);
    await page.mouse.click(point.x, point.y);
    const shown = await positionText(page);
    expect(shown).toContain(end.x.toFixed(3));
  });

  test('sem geometria para o mapa, o 3D explica e volta ao 2D', async ({ page }) => {
    await page.route('**/data/maps/**', (route) => route.fulfill({ status: 404, body: 'nada' }));
    await createStrategy(page);
    await page.getByTestId('mode-3d').click();
    await expect(page.getByTestId('geometry-error')).toBeVisible();
    await page.getByRole('button', { name: 'Voltar ao modo 2D' }).click();
    await expect(page.getByTestId('board-2d')).toBeVisible();
  });

  test('a geometria é identificada como aproximada', async ({ page }) => {
    await createStrategy(page);
    await to3D(page);
    await page.getByTestId('approximate-badge').click();
    await expect(page.getByTestId('approximate-details')).toContainText('Não é o modelo do jogo');
  });
});

test.describe('câmera fantasma', () => {
  test.beforeEach(async ({ page }) => {
    await createStrategy(page);
    await to3D(page);
    await page.getByTestId('camera-ghost').click();
    await page.waitForTimeout(300);
  });

  const hold = async (page: import('@playwright/test').Page, key: string, ms = 500) => {
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
    await page.waitForTimeout(250);
  };

  test('W avança na direção da visão e S recua', async ({ page }) => {
    const start = await cameraPosition(page);
    await hold(page, 'KeyW');
    const forward = await cameraPosition(page);
    // A câmera começa olhando para o centro, de cima: avançar desce e aproxima.
    expect(forward.y).toBeLessThan(start.y - 1);
    await hold(page, 'KeyS');
    const back = await cameraPosition(page);
    expect(back.y).toBeGreaterThan(forward.y + 1);
  });

  test('A e D deslocam para os lados', async ({ page }) => {
    const start = await cameraPosition(page);
    await hold(page, 'KeyD');
    const right = await cameraPosition(page);
    expect(Math.abs(right.x - start.x)).toBeGreaterThan(1);
    await hold(page, 'KeyA');
    const left = await cameraPosition(page);
    expect(Math.abs(left.x - right.x)).toBeGreaterThan(1);
  });

  test('Espaço sobe; Ctrl e C descem', async ({ page }) => {
    const start = await cameraPosition(page);
    await hold(page, 'Space');
    const up = await cameraPosition(page);
    expect(up.y).toBeGreaterThan(start.y + 1);
    await hold(page, 'Control');
    const down = await cameraPosition(page);
    expect(down.y).toBeLessThan(up.y - 1);
    await hold(page, 'KeyC');
    expect((await cameraPosition(page)).y).toBeLessThan(down.y - 1);
  });

  test('Shift acelera', async ({ page }) => {
    const a = await cameraPosition(page);
    await hold(page, 'Space', 500);
    const normal = (await cameraPosition(page)).y - a.y;
    const b = await cameraPosition(page);
    await page.keyboard.down('Shift');
    await hold(page, 'Space', 500);
    await page.keyboard.up('Shift');
    expect((await cameraPosition(page)).y - b.y).toBeGreaterThan(normal * 1.5);
  });

  test('atravessa o piso sem colisão nem gravidade', async ({ page }) => {
    await hold(page, 'Control', 3000);
    await page.waitForTimeout(600);
    const a = await cameraPosition(page);
    await page.waitForTimeout(400);
    const b = await cameraPosition(page);
    // Sem comando, fica parada onde estiver, sem cair nem ser empurrada de volta.
    expect(Math.abs(a.y - b.y)).toBeLessThan(0.2);
    await page.getByTestId('ghost-speed').fill('60');
    await hold(page, 'Control', 3000);
    expect((await cameraPosition(page)).y).toBeLessThan(0);
  });

  test('a velocidade é ajustável', async ({ page }) => {
    await page.getByTestId('ghost-speed').fill('50');
    const a = await cameraPosition(page);
    await hold(page, 'Space', 400);
    expect((await cameraPosition(page)).y - a.y).toBeGreaterThan(12);
  });

  test('V alterna entre fantasma e aérea', async ({ page }) => {
    await expect(page.getByTestId('camera-ghost')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('KeyV');
    await expect(page.getByTestId('camera-aerial')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('KeyV');
    await expect(page.getByTestId('camera-ghost')).toHaveAttribute('aria-pressed', 'true');
  });

  test('o botão de visão padrão volta para a câmera aérea', async ({ page }) => {
    await hold(page, 'KeyW');
    await page.getByTestId('camera-reset').click();
    await expect(page.getByTestId('camera-aerial')).toHaveAttribute('aria-pressed', 'true');
  });

  test('foca em um agente', async ({ page }) => {
    await page.getByTestId('mode-2d').click();
    await placeAgent(page, 'Jett', 'attack', 0.8, 0.5);
    await to3D(page);
    await page.getByTestId('camera-ghost').click();
    await page.waitForTimeout(300);
    const before = await cameraPosition(page);
    await page.getByTestId('camera-focus').selectOption({ index: 1 });
    await page.waitForTimeout(400);
    const after = await cameraPosition(page);
    expect(after.x).toBeGreaterThan(before.x + 20);
    expect(after.y).toBeLessThan(before.y);
  });

  test('digitar em um campo não move a câmera', async ({ page }) => {
    const before = await cameraPosition(page);
    await page.getByTestId('strategy-name').focus();
    await page.keyboard.type('wwww');
    await page.waitForTimeout(400);
    expect((await cameraPosition(page)).y).toBeCloseTo(before.y, 0);
  });
});

test.describe('habilidades', () => {
  test('posiciona com preset fixo: não há como editar tamanho nem duração', async ({ page }) => {
    const id = await createStrategy(page);
    await placeAgent(page, 'Brimstone', 'attack', 0.5, 0.5);
    await page.getByTestId('tab-abilities').click();
    await page.getByTestId('ability-Ability2').click();
    await expect(page.getByTestId('hint-bar')).toContainText('tamanho é fixo');
    await clickBoard(page, 0.6, 0.5);

    await expect(page.getByTestId('visual-values-note')).toContainText('não dados oficiais');
    await expect(page.getByTestId('utility-preset')).toContainText('raio de 4,1 m');
    for (const removed of ['utility-radius', 'utility-duration', 'utility-until-end', 'utility-travel']) {
      await expect(page.getByTestId(removed)).toHaveCount(0);
    }
    const utility = Object.values((await savedDoc(page, id)).utilities)[0]! as unknown as Record<string, unknown> & { shape: Record<string, unknown> };
    expect(Object.keys(utility.shape).sort()).toEqual(['center', 'type']);
    for (const removed of ['category', 'durationMs', 'travelMs']) expect(utility).not.toHaveProperty(removed);

    // Arrastar a habilidade já colocada só a move.
    const point = await boardPoint(page, 0.6, 0.5);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 40, point.y, { steps: 3 });
    await page.mouse.up();
    const moved = Object.values((await savedDoc(page, id)).utilities)[0]!;
    expect(moved.shape.center!.x).toBeGreaterThan(0.61);
    expect(Object.keys(moved.shape).sort()).toEqual(['center', 'type']);
  });

  test('a parede só muda de direção, nunca de comprimento', async ({ page }) => {
    const id = await createStrategy(page);
    await page.getByTestId('tab-abilities').click();
    await page.getByTestId('ability-agent-select').selectOption({ label: 'Sage' });
    await page.getByTestId('ability-Grenade').click();
    await dragBoard(page, [0.3, 0.3], [0.3, 0.4]);
    await expect(page.getByTestId('utility-facing')).toHaveValue('90');
    await page.getByTestId('utility-facing').fill('45');
    const wall = Object.values((await savedDoc(page, id)).utilities)[0]!;
    expect(wall.shape.facing).toBeCloseTo(Math.PI / 4);
    expect(Object.keys(wall.shape).sort()).toEqual(['center', 'facing', 'type']);
  });

  test('paredes, trajetórias e marcadores têm formas próprias', async ({ page }) => {
    const id = await createStrategy(page);
    await page.getByTestId('tab-abilities').click();

    await page.getByTestId('ability-agent-select').selectOption({ label: 'Sage' });
    await page.getByTestId('ability-Grenade').click();
    await dragBoard(page, [0.3, 0.3], [0.4, 0.3]);

    await page.getByTestId('tab-abilities').click();
    await page.getByTestId('ability-agent-select').selectOption({ label: 'Gekko' });
    await page.getByTestId('ability-Ability1').click();
    await clickBoard(page, 0.5, 0.5);
    await clickBoard(page, 0.55, 0.55);
    await clickBoard(page, 0.6, 0.5);
    await page.getByTestId('hint-finish').click();

    await page.getByTestId('tab-abilities').click();
    await page.getByTestId('ability-agent-select').selectOption({ label: 'Killjoy' });
    await page.getByTestId('ability-Ability1').click();
    await clickBoard(page, 0.7, 0.7);

    const utilities = Object.values((await savedDoc(page, id)).utilities);
    expect(utilities.map((u) => u.shape.type).sort()).toEqual(['marker', 'path', 'wall']);
    expect(utilities.find((u) => u.shape.type === 'path')!.shape.points).toHaveLength(3);
  });

  test('as habilidades aparecem no 3D sem erros e a edição continua no 2D', async ({ page }) => {
    const id = await createStrategy(page);
    await page.getByTestId('tab-abilities').click();
    for (const [agent, slot, x] of [['Omen', 'Ability2', 0.3], ['Viper', 'Grenade', 0.4], ['Killjoy', 'Ability1', 0.5]] as const) {
      await page.getByTestId('tab-abilities').click();
      await page.getByTestId('ability-agent-select').selectOption({ label: agent });
      await page.getByTestId(`ability-${slot}`).click();
      await clickBoard(page, x, 0.5);
    }
    await to3D(page);
    await expect.poll(async () => (await sceneItems(page)).filter((item) => item.type === 'ability').length).toBe(3);
    await to2D(page);
    expect(Object.keys((await savedDoc(page, id)).utilities)).toHaveLength(3);
  });
});

test.describe('rotas e timeline', () => {
  const setupRoute = async (page: import('@playwright/test').Page) => {
    const id = await createStrategy(page);
    await placeAgent(page, 'Jett', 'attack', 0.3, 0.5);
    await page.getByTestId('tab-object').click();
    await page.getByTestId('start-route').click();
    await clickBoard(page, 0.4, 0.5);
    await clickBoard(page, 0.5, 0.5);
    await page.getByTestId('hint-finish').click();
    return id;
  };

  test('cria rota com pausa e velocidade, e o tempo reflete os ajustes', async ({ page }) => {
    const id = await setupRoute(page);
    await page.getByTestId('waypoint-0-pause').fill('2');
    await page.getByTestId('route-speed').fill('10');
    const route = singleAgent(await savedDoc(page, id)).route!;
    expect(route.waypoints).toHaveLength(2);
    expect(route.waypoints[0]!.pauseMs).toBe(2000);
    expect(route.speedMps).toBe(10);
  });

  test('o Play move o agente; parar e voltar dá a mesma posição', async ({ page }) => {
    await setupRoute(page);
    await page.getByTestId('tl-rate').selectOption('2');
    await seekTimeline(page, 0);
    const start = await positionText(page);
    await page.getByTestId('tl-play').click();
    await expect.poll(() => timelineMs(page)).toBeGreaterThan(1500);
    await page.getByTestId('tl-play').click();
    const moved = await positionText(page);
    expect(moved).not.toBe(start);

    await seekTimeline(page, 0.1);
    const first = await positionText(page);
    await seekTimeline(page, 0.5);
    await seekTimeline(page, 0.1);
    expect(await positionText(page)).toBe(first);

    await page.getByTestId('tl-restart').click();
    expect(await timelineMs(page)).toBe(0);
    expect(await positionText(page)).toBe(start);
  });

  test('a direção editada depois da chegada vale para aquele ponto da rota', async ({ page }) => {
    const id = await setupRoute(page);
    // A rota termina bem antes da metade dos 30 s.
    await seekTimeline(page, 0.5);
    await expect(page.getByTestId('agent-facing')).toBeEnabled();
    await page.getByTestId('agent-facing').fill('90');
    await page.getByTestId('agent-facing').blur();
    const saved = singleAgent(await savedDoc(page, id));
    expect(saved.facing).toBeCloseTo(Math.PI, 3);
    await expect.poll(async () => Number(await page.getByTestId('agent-facing').inputValue())).toBeCloseTo(90, 0);
  });

  test('em movimento, a direção segue o trajeto e o campo explica o motivo', async ({ page }) => {
    await setupRoute(page);
    await page.getByTestId('tl-forward').click();
    await expect(page.getByTestId('agent-facing')).toBeDisabled();
    await expect(page.getByTestId('facing-moving-note')).toBeVisible();
  });

  test('avançar e retroceder mudam o tempo em passos', async ({ page }) => {
    await setupRoute(page);
    await page.getByTestId('tl-forward').click();
    await page.getByTestId('tl-forward').click();
    expect(await timelineMs(page)).toBe(1000);
    await page.getByTestId('tl-back').click();
    expect(await timelineMs(page)).toBe(500);
  });

  test('a reprodução também roda no 3D', async ({ page }) => {
    await setupRoute(page);
    await to3D(page);
    await page.getByTestId('tl-rate').selectOption('2');
    await page.getByTestId('tl-play').click();
    await expect.poll(() => timelineMs(page)).toBeGreaterThan(1000);
    await page.getByTestId('tl-play').click();
    const position = await positionText(page);
    await to2D(page);
    expect(await positionText(page)).toBe(position);
  });

  test('arrastar a rota na timeline sincroniza o início', async ({ page }) => {
    const id = await setupRoute(page);
    const clip = page.getByTestId('tl-route-Jett');
    const box = await clip.boundingBox();
    await page.mouse.move(box!.x + 3, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + 150, box!.y + box!.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(singleAgent(await savedDoc(page, id)).route!.startMs).toBeGreaterThan(1000);
    await page.getByTestId('undo').click();
    expect(singleAgent(await savedDoc(page, id)).route!.startMs).toBe(0);
  });

  test('keyframe fixa posição no instante e pode ser arrastado', async ({ page }) => {
    const id = await createStrategy(page);
    await placeAgent(page, 'Sova', 'attack', 0.5, 0.5);
    await seekTimeline(page, 0.5);
    const time = await timelineMs(page);
    await page.getByTestId('tl-keyframe').click();
    await expect(page.getByTestId('tl-keyframe-mark')).toBeVisible();

    await dragBoard(page, [0.5, 0.5], [0.6, 0.5]);
    const route = singleAgent(await savedDoc(page, id)).route!;
    expect(route.waypoints).toHaveLength(1);
    expect(route.waypoints[0]!.arriveAtMs).toBeCloseTo(time, -2);
    expect(route.waypoints[0]!.point.x).toBeGreaterThan(0.55);
    // A posição inicial não muda: o movimento é a partir dela.
    expect(singleAgent(await savedDoc(page, id)).position.x).toBeCloseTo(0.5, 1);

    const mark = await page.getByTestId('tl-keyframe-mark').boundingBox();
    await page.mouse.move(mark!.x + mark!.width / 2, mark!.y + mark!.height / 2);
    await page.mouse.down();
    await page.mouse.move(mark!.x + mark!.width / 2 + 100, mark!.y + mark!.height / 2, { steps: 4 });
    await page.mouse.up();
    const movedRoute = singleAgent(await savedDoc(page, id)).route!;
    expect(movedRoute.waypoints[0]!.arriveAtMs!).toBeGreaterThan(time + 500);
  });

  test('keyframe em 00:00 orienta em vez de criar movimento', async ({ page }) => {
    const id = await createStrategy(page);
    await placeAgent(page, 'Sova', 'attack', 0.5, 0.5);
    await page.getByTestId('tl-keyframe').click();
    await expect(page.getByTestId('toast-info')).toContainText('Mova o tempo');
    expect(singleAgent(await savedDoc(page, id)).route).toBeNull();
  });

  test('habilidades e notas podem ser reposicionadas no tempo', async ({ page }) => {
    const id = await createStrategy(page);
    await page.getByTestId('tab-abilities').click();
    await page.getByTestId('ability-agent-select').selectOption({ label: 'Omen' });
    await page.getByTestId('ability-Ability2').click();
    await clickBoard(page, 0.5, 0.5);

    const chip = page.getByTestId('tl-utility');
    const box = await chip.boundingBox();
    await page.mouse.move(box!.x + 4, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + 124, box!.y + box!.height / 2, { steps: 4 });
    await page.mouse.up();
    const [utility] = Object.values((await savedDoc(page, id)).utilities);
    expect(utility!.timeMs).toBeGreaterThan(1000);

    await page.getByTestId('utility-time').fill('3');
    expect(Object.values((await savedDoc(page, id)).utilities)[0]!.timeMs).toBe(3000);

    await page.getByTestId('tab-events').click();
    await page.getByTestId('add-note').click();
    await expect(page.getByTestId('tl-note')).toBeVisible();
    await expect(page.getByTestId('events-list')).toContainText('usa');
  });

  test('a lista de eventos segue a ordem do tempo e leva ao instante', async ({ page }) => {
    await setupRoute(page);
    await page.getByTestId('tab-events').click();
    await page.getByTestId('events-list').getByRole('button', { name: /chega ao destino/ }).click();
    expect(await timelineMs(page)).toBeGreaterThan(1000);
  });

  test('a duração é editável e cresce com o conteúdo', async ({ page }) => {
    const id = await setupRoute(page);
    await page.getByTestId('tl-duration').fill('5');
    await page.getByTestId('tl-duration').blur();
    expect((await savedDoc(page, id)).durationMs).toBe(5000);
    await page.getByTestId('tl-fit').click();
    expect((await savedDoc(page, id)).durationMs).toBeGreaterThanOrEqual(1000);
  });

  test('adicionar agentes não redimensiona o mapa', async ({ page }) => {
    await createStrategy(page);
    const before = await page.getByTestId('board-2d').boundingBox();
    for (const [index, name] of ['Omen', 'Jett', 'Sova', 'Sage', 'Killjoy'].entries()) {
      await placeAgent(page, name, 'attack', 0.3 + index * 0.08, 0.3);
    }
    expect(await page.getByTestId('board-2d').boundingBox()).toEqual(before);
  });

  test('com muitos agentes a timeline rola em vez de esconder linhas', async ({ page }) => {
    await createStrategy(page);
    for (const [index, name] of ['Omen', 'Jett', 'Sova', 'Sage', 'Killjoy'].entries()) {
      await placeAgent(page, name, 'attack', 0.3 + index * 0.08, 0.3);
    }
    const rows = page.getByTestId('tl-rows');
    const scrollable = await rows.evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(scrollable).toBe(true);
    await page.getByTestId('tl-row-Killjoy').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('tl-row-Killjoy')).toBeInViewport();
  });
});

test.describe('exportar e compartilhar', () => {
  test('exporta PNG válido no 2D e no 3D', async ({ page }) => {
    await createStrategy(page);
    await placeAgent(page, 'Omen', 'attack', 0.5, 0.5);
    const isPng = (path: string) => readFileSync(path).subarray(1, 4).toString() === 'PNG';

    await page.getByTestId('open-share').click();
    let [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-png').click()]);
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    expect(isPng(await download.path())).toBe(true);
    await page.getByRole('button', { name: 'Fechar' }).click();

    await to3D(page);
    await page.waitForTimeout(400);
    await page.getByTestId('open-share').click();
    [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-png').click()]);
    expect(isPng(await download.path())).toBe(true);
    await expect(page.getByTestId('toast-success').first()).toContainText('Imagem exportada');
  });

  test('o JSON exportado volta pela importação', async ({ page }) => {
    await createStrategy(page);
    await placeAgent(page, 'Omen', 'attack', 0.5, 0.5);
    await page.getByTestId('open-share').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-json').click()]);
    const file = await download.path();

    await page.goto('./#/estrategias');
    await page.getByTestId('import-input').setInputFiles(file);
    await expect(page.getByTestId('toast-success')).toContainText('importada');
    await expect(page.getByTestId('strategy-row')).toHaveCount(2);
  });

  test('arquivo inválido gera mensagem clara', async ({ page }) => {
    await page.goto('./#/estrategias');
    await page.getByTestId('import-input').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{quebrado') });
    await expect(page.getByTestId('toast-error')).toContainText('não é um JSON válido');
  });

  test('o link de compartilhamento abre uma cópia completa', async ({ page }) => {
    await createStrategy(page);
    await placeAgent(page, 'Omen', 'attack', 0.5, 0.5);
    await page.getByTestId('open-share').click();
    await expect(page.getByTestId('share-link')).not.toHaveValue('');
    const link = await page.getByTestId('share-link').inputValue();

    await page.goto(link);
    await page.reload();
    await expect(page.getByTestId('share-page')).toContainText('1 agentes');
    await page.getByTestId('share-open').click();
    await expect(page.getByTestId('agents-count')).toHaveText('1');
  });

  test('link corrompido explica o erro', async ({ page }) => {
    await page.goto('./#/s/lixo');
    await expect(page.getByText('Este link não abriu')).toBeVisible();
  });
});

test.describe('organização de estratégias', () => {
  test('renomeia, duplica, cria pasta, filtra e exclui com confirmação', async ({ page }) => {
    await createStrategy(page, 'Ascent');
    await page.goto('./#/estrategias');
    const row = page.getByTestId('strategy-row');
    await expect(row).toHaveCount(1);

    await page.getByTestId('rename-strategy').click();
    await page.getByTestId('prompt-input').fill('Rush B');
    await page.getByTestId('prompt-submit').click();
    await expect(row).toContainText('Rush B');

    await page.getByTestId('duplicate-strategy').click();
    await expect(row).toHaveCount(2);

    await page.getByTestId('new-folder').click();
    await page.getByTestId('prompt-input').fill('Treino');
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId('folders')).toContainText('Treino');

    await row.first().getByRole('combobox').selectOption({ label: 'Treino' });
    await page.getByTestId('folders').getByRole('button', { name: 'Treino', exact: true }).click();
    await expect(row).toHaveCount(1);
    await page.getByTestId('folders').getByRole('button', { name: 'Todas' }).click();
    await expect(row).toHaveCount(2);

    await page.getByTestId('filter-side').selectOption('defense');
    await expect(row).toHaveCount(0);
    await page.getByTestId('filter-side').selectOption('attack');
    await expect(row).toHaveCount(2);

    await page.getByTestId('delete-strategy').first().click();
    await page.getByTestId('confirm-action').click();
    await expect(row).toHaveCount(1);
  });

  test('uma estratégia corrompida no banco não derruba a lista', async ({ page }) => {
    await createStrategy(page);
    await page.goto('./#/estrategias');
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const open = indexedDB.open('tacticlab');
          open.onsuccess = () => {
            const tx = open.result.transaction('strategies', 'readwrite');
            tx.objectStore('strategies').put({ id: 'ruim', name: 123 });
            tx.oncomplete = () => {
              open.result.close();
              resolve();
            };
          };
        }),
    );
    await page.reload();
    await expect(page.getByTestId('corrupted-warning')).toBeVisible();
    await expect(page.getByTestId('strategy-row')).toHaveCount(1);
  });

  test('histórico: salva versão, altera e restaura', async ({ page }) => {
    const id = await createStrategy(page);
    await placeAgent(page, 'Omen', 'attack', 0.5, 0.5);
    await page.getByTestId('save-version').click();
    await expect(page.getByTestId('toast-success')).toContainText('histórico');
    await placeAgent(page, 'Jett', 'attack', 0.6, 0.6);
    expect(Object.keys((await savedDoc(page, id)).agents)).toHaveLength(2);

    await page.getByTestId('open-history').click();
    await page.getByTestId('history-restore').first().click();
    await expect(page.getByTestId('agents-count')).toHaveText('1');
    expect(Object.keys((await savedDoc(page, id)).agents)).toHaveLength(1);
  });

  test('editar o nome e o lado na barra superior salva', async ({ page }) => {
    const id = await createStrategy(page);
    await page.getByTestId('strategy-name').fill('Retake');
    await page.getByTestId('strategy-side').click();
    const doc = await savedDoc(page, id);
    expect(doc.name).toBe('Retake');
    expect(doc.side).toBe('defense');
  });
});
