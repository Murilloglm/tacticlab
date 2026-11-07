import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ABILITY_TAXONOMY, classifyAbility, isPlaceableSlot, CATEGORY_LABEL, CATEGORY_COLOR } from '@/modules/abilities/taxonomy';
import { buildCatalog, normalizeAgent, normalizeMap } from '@/modules/catalog/catalogStore';
import { kvGet, kvSet, resetDbForTests } from '@/modules/persistence/idb';
import { clearJournal, readJournals, writeJournal } from '@/modules/persistence/journal';
import {
  addVersion,
  createFolder,
  deleteFolder,
  deleteStrategy,
  duplicateStrategy,
  getStrategy,
  listFolders,
  listStrategies,
  listVersions,
  moveStrategy,
  renameStrategy,
  saveStrategy,
  TOMBSTONES_KEY,
} from '@/modules/persistence/strategyRepo';
import { decodeShare, encodeShare, exportStrategyJson, importStrategyJson, safeFilename } from '@/modules/persistence/transfer';
import { planSync } from '@/modules/services/cloudSync';
import { fetchLiveCatalog } from '@/modules/services/valorantApi';
import { parseLineup, lineupStatusSchema, LINEUP_STATUS_LABEL, listLineups, saveLineup, deleteLineupLocal, LINEUP_TOMBSTONES_KEY } from '@/modules/library/lineupRepo';
import { buildEvents } from '@/modules/timeline/events';
import { effectiveDuration, playbackActions, playbackStore } from '@/modules/timeline/playbackStore';
import { dbPut } from '@/modules/persistence/idb';
import { docActions, docStore } from '@/modules/strategy/docStore';
import { editorStore, initialEditorState } from '@/modules/editor/editorStore';
import { armAgent, armUtility, deleteSelection, duplicateSelection, interaction, setTool } from '@/modules/editor/interaction';
import { appendWaypoint, createWaypoint, faceAgentAt, placeAgentAt, removeWaypoint, shiftRoute, translateAgent, translateDrawing, translateUtility, createUtility, defaultShapeFor } from '@/modules/strategy/factory';
import { compileRoute } from '@/modules/timeline/simulate';
import { agent, emptyDoc, FRAME } from './helpers';

const snapshot = JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'catalog.json'), 'utf8'));

describe('taxonomia de habilidades', () => {
  it('classifica todas as habilidades ativas de todos os agentes atuais', () => {
    const missing: string[] = [];
    for (const a of snapshot.agents) {
      for (const ability of a.abilities) {
        if (!isPlaceableSlot(ability.slot)) continue;
        if (!classifyAbility(a.uuid, ability.slot).classified) missing.push(`${a.displayName}:${ability.slot}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('não tem agentes que a API não conhece', () => {
    const known = new Set(snapshot.agents.map((a: { uuid: string }) => a.uuid));
    expect(Object.keys(ABILITY_TAXONOMY).filter((uuid) => !known.has(uuid))).toEqual([]);
  });

  it('habilidade desconhecida fica como não classificada, sem categoria inventada', () => {
    expect(classifyAbility('agente-novo', 'Ability1')).toEqual({ category: 'other', shape: 'marker', isUltimate: false, classified: false });
  });

  it('cobre os exemplos pedidos', () => {
    const byName = (name: string) => snapshot.agents.find((a: { displayName: string }) => a.displayName === name).uuid;
    expect(classifyAbility(byName('Omen'), 'Ability2').category).toBe('smoke');
    expect(classifyAbility(byName('Brimstone'), 'Ability2').category).toBe('smoke');
    expect(classifyAbility(byName('Brimstone'), 'Ability1').category).toBe('molotov');
    expect(classifyAbility(byName('Sova'), 'Ability2')).toMatchObject({ category: 'recon', shape: 'path' });
    expect(classifyAbility(byName('Jett'), 'Ability2')).toMatchObject({ category: 'dash', shape: 'path' });
    expect(classifyAbility(byName('Jett'), 'Grenade').category).toBe('smoke');
    expect(classifyAbility(byName('Sage'), 'Grenade')).toMatchObject({ category: 'wall', shape: 'wall' });
    expect(classifyAbility(byName('Sage'), 'Ability1').category).toBe('area');
    expect(classifyAbility(byName('Killjoy'), 'Ability1').category).toBe('trap');
    expect(classifyAbility(byName('Gekko'), 'Ability1')).toMatchObject({ category: 'projectile', shape: 'path' });
  });

  it('todas as categorias pedidas existem e têm rótulo e cor', () => {
    for (const category of ['smoke', 'flash', 'molotov', 'wall', 'recon', 'trap', 'teleport', 'dash', 'projectile', 'area', 'ultimate'] as const) {
      expect(CATEGORY_LABEL[category]).toBeTruthy();
      expect(CATEGORY_COLOR[category]).toMatch(/^#/);
    }
  });

  it('a slot Ultimate é reconhecida e passivas não são posicionáveis', () => {
    const omen = snapshot.agents.find((a: { displayName: string }) => a.displayName === 'Omen').uuid;
    expect(classifyAbility(omen, 'Ultimate').isUltimate).toBe(true);
    expect(isPlaceableSlot('Passive')).toBe(false);
  });
});

describe('cliente da Valorant-API', () => {
  afterEach(() => vi.unstubAllGlobals());

  const respondWith = (handler: (url: string) => unknown, status = 200) =>
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(handler(url)), { status })));

  it('pede os dados em português e monta o catálogo', async () => {
    const urls: string[] = [];
    respondWith((url) => {
      urls.push(url);
      if (url.includes('/version')) return { data: { version: '13.09' } };
      if (url.includes('/maps')) return { data: [{ uuid: 'm', displayName: 'Mapa', displayIcon: 'x.png', xMultiplier: 0.0001 }] };
      return { data: [{ uuid: 'a', displayName: 'Agente', abilities: [] }] };
    });
    const live = await fetchLiveCatalog();
    expect(live.gameVersion).toBe('13.09');
    expect(live.maps).toHaveLength(1);
    expect(urls.filter((u) => u.includes('language=pt-BR'))).toHaveLength(2);
  });

  it('a versão é opcional: o catálogo carrega sem ela', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/version')) return new Response('', { status: 500 });
      return new Response(JSON.stringify({ data: [] }));
    }));
    expect((await fetchLiveCatalog()).gameVersion).toBeNull();
  });

  it('informa erro de servidor e formato inesperado', async () => {
    respondWith(() => ({}), 503);
    await expect(fetchLiveCatalog()).rejects.toThrow('503');
    respondWith(() => ({ data: 'nada' }));
    await expect(fetchLiveCatalog()).rejects.toThrow('formato inesperado');
  });
});

describe('catálogo', () => {
  it('o catálogo de reserva tem os mapas de plant e todos os agentes', () => {
    const catalog = buildCatalog(snapshot.maps, snapshot.agents, snapshot.gameVersion, 'snapshot');
    expect(catalog.maps.filter((m) => m.kind === 'tactical').length).toBeGreaterThanOrEqual(12);
    expect(catalog.agents.length).toBeGreaterThanOrEqual(25);
    expect(catalog.maps[0]!.kind).toBe('tactical');
  });

  it('o catálogo de reserva não embute descrições longas', () => {
    expect(JSON.stringify(snapshot.agents)).not.toContain('"description"');
  });

  it('calcula a escala do multiplicador da API e descarta mapa sem imagem', () => {
    const map = normalizeMap({ uuid: 'm', displayName: 'M', displayIcon: 'x.png', xMultiplier: 0.00007, tacticalDescription: 'A/B Sites' });
    expect(map?.worldMeters).toBeCloseTo(142.857, 2);
    expect(map?.scaleKnown).toBe(true);
    expect(map?.kind).toBe('tactical');
    expect(normalizeMap({ uuid: 'n', displayName: 'N', displayIcon: null })).toBeNull();
  });

  it('sem multiplicador, marca a escala como desconhecida', () => {
    const map = normalizeMap({ uuid: 'm', displayName: 'M', displayIcon: 'x.png', xMultiplier: 0 });
    expect(map?.scaleKnown).toBe(false);
    expect(map?.kind).toBe('other');
  });

  it('extrai a cor do agente e tolera dados ausentes', () => {
    expect(normalizeAgent({ uuid: 'a', displayName: 'A', abilities: [], backgroundGradientColors: ['ff4655ff'] }).color).toBe('#ff4655');
    expect(normalizeAgent({ uuid: 'a', displayName: 'A', abilities: [], backgroundGradientColors: null }).color).toBe('#8d95a3');
  });

  it('remove agentes duplicados (a API devolve o mesmo agente mais de uma vez)', () => {
    const raw = { uuid: 'dup', displayName: 'Dup', abilities: [] };
    expect(buildCatalog([], [raw, raw], null, 'api').agents).toHaveLength(1);
  });
});

describe('persistência local', () => {
  beforeEach(async () => {
    resetDbForTests();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('tacticlab');
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
  });

  it('salva e lê de volta a estratégia completa', async () => {
    const doc = emptyDoc({ agents: { a1: agent({ position: { x: 0.25, y: 0.75 } }) } });
    await saveStrategy(doc);
    expect(await getStrategy('doc-1')).toEqual(doc);
  });

  it('renomeia, duplica e exclui', async () => {
    await saveStrategy(emptyDoc());
    await renameStrategy('doc-1', 'Novo nome');
    expect((await getStrategy('doc-1'))!.name).toBe('Novo nome');
    const copy = await duplicateStrategy('doc-1');
    expect(copy!.id).not.toBe('doc-1');
    expect(copy!.name).toContain('cópia');
    expect((await listStrategies()).strategies).toHaveLength(2);
    await deleteStrategy('doc-1');
    expect(await getStrategy('doc-1')).toBeNull();
  });

  it('excluir registra lápide para a sincronização', async () => {
    await saveStrategy(emptyDoc());
    await deleteStrategy('doc-1');
    expect((await kvGet<Record<string, number>>(TOMBSTONES_KEY))!['doc-1']).toBeGreaterThan(0);
  });

  it('um registro corrompido é ignorado e contado, sem derrubar a lista', async () => {
    await saveStrategy(emptyDoc());
    await dbPut('strategies', { id: 'quebrada', name: 42 });
    const { strategies, corrupted } = await listStrategies();
    expect(strategies).toHaveLength(1);
    expect(corrupted).toBe(1);
    expect(await getStrategy('quebrada')).toBeNull();
  });

  it('pastas organizam e excluir pasta preserva as estratégias', async () => {
    const folder = await createFolder('Ataques');
    await saveStrategy(emptyDoc());
    await moveStrategy('doc-1', folder.id);
    expect((await getStrategy('doc-1'))!.folderId).toBe(folder.id);
    await deleteFolder(folder.id);
    expect(await listFolders()).toHaveLength(0);
    const kept = await getStrategy('doc-1');
    expect(kept).not.toBeNull();
    expect(kept!.folderId).toBeNull();
  });

  it('o histórico guarda versões, da mais nova para a mais antiga, com limite', async () => {
    const doc = emptyDoc();
    await saveStrategy(doc);
    for (let i = 0; i < 35; i++) await addVersion({ ...doc, name: `v${i}` }, `Versão ${i}`);
    const versions = await listVersions(doc.id);
    expect(versions).toHaveLength(30);
    expect(versions[0]!.createdAt).toBeGreaterThanOrEqual(versions[29]!.createdAt);
  });

  it('excluir a estratégia apaga o histórico dela', async () => {
    const doc = emptyDoc();
    await saveStrategy(doc);
    await addVersion(doc, 'v1');
    await deleteStrategy(doc.id);
    expect(await listVersions(doc.id)).toHaveLength(0);
  });

  it('guarda chave e valor', async () => {
    await kvSet('x', { a: 1 });
    expect(await kvGet('x')).toEqual({ a: 1 });
    expect(await kvGet('nada')).toBeUndefined();
  });

  it('lineups são salvas, listadas e excluídas com lápide', async () => {
    const saved = await saveLineup({
      title: 'Smoke',
      mapId: 'm',
      agentUuid: 'a',
      abilitySlot: 'Ability2',
      start: { x: 0, y: 0 },
      aim: { x: 0.5, y: 0.5 },
      impact: { x: 1, y: 1 },
      images: [],
      notes: '',
      gameVersion: '13.09',
      status: 'unverified',
    });
    expect((await listLineups())[0]!.id).toBe(saved.id);
    await deleteLineupLocal(saved.id);
    expect(await listLineups()).toHaveLength(0);
    expect((await kvGet<Record<string, number>>(LINEUP_TOMBSTONES_KEY))![saved.id]).toBeGreaterThan(0);
  });
});

describe('diário de emergência', () => {
  const memoryStorage = () => {
    const data = new Map<string, string>();
    return {
      get length() {
        return data.size;
      },
      key: (i: number) => [...data.keys()][i] ?? null,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
  };

  beforeEach(async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    resetDbForTests();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('tacticlab');
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('recupera a alteração que não chegou ao IndexedDB', async () => {
    const older = emptyDoc({ updatedAt: 10 });
    await saveStrategy(older);
    writeJournal(emptyDoc({ updatedAt: 20, agents: { a1: agent() } }));
    const recovered = await getStrategy(older.id);
    expect(recovered!.agents.a1).toBeDefined();
    expect(readJournals()).toHaveLength(0);
  });

  it('recupera mesmo sem nenhuma versão anterior salva', async () => {
    writeJournal(emptyDoc({ id: 'nova' }));
    expect((await listStrategies()).strategies.map((d) => d.id)).toEqual(['nova']);
  });

  it('não sobrescreve uma versão salva mais nova', async () => {
    await saveStrategy(emptyDoc({ updatedAt: 50, name: 'Salva' }));
    writeJournal(emptyDoc({ updatedAt: 20, name: 'Antiga' }));
    expect((await getStrategy('doc-1'))!.name).toBe('Salva');
    expect(readJournals()).toHaveLength(0);
  });

  it('descarta entradas corrompidas', () => {
    localStorage.setItem('tacticlab:journal:x', '{quebrado');
    localStorage.setItem('tacticlab:journal:y', JSON.stringify({ id: 'y' }));
    expect(readJournals()).toEqual([]);
    expect(localStorage.length).toBe(0);
  });

  it('excluir a estratégia limpa o diário, para ela não voltar', async () => {
    await saveStrategy(emptyDoc());
    writeJournal(emptyDoc({ updatedAt: 99 }));
    await deleteStrategy('doc-1');
    expect(await getStrategy('doc-1')).toBeNull();
  });

  it('cota cheia não quebra o app', () => {
    vi.stubGlobal('localStorage', {
      ...memoryStorage(),
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(() => writeJournal(emptyDoc())).not.toThrow();
    clearJournal('x');
  });

  it('sem localStorage, nada acontece', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => writeJournal(emptyDoc())).not.toThrow();
    expect(readJournals()).toEqual([]);
  });
});

describe('importação, exportação e compartilhamento', () => {
  it('exporta e importa sem perder dados, com novo id', () => {
    const doc = emptyDoc({ name: 'Ação', agents: { a1: agent() } });
    const result = importStrategyJson(exportStrategyJson(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.id).not.toBe(doc.id);
    expect(result.doc.name).toBe('Ação');
    expect(result.doc.agents).toEqual(doc.agents);
  });

  it('aceita também um JSON com a estratégia pura', () => {
    expect(importStrategyJson(JSON.stringify(emptyDoc())).ok).toBe(true);
  });

  it('dá mensagens claras para arquivo inválido', () => {
    expect(importStrategyJson('{quebrado')).toEqual({ ok: false, error: 'O arquivo não é um JSON válido.' });
    const invalid = importStrategyJson(JSON.stringify({ strategy: { name: 'x' } }));
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error).toContain('Estratégia inválida');
  });

  it('o link de compartilhamento reconstrói a estratégia', async () => {
    const doc = emptyDoc({ name: 'Compartilhada çãé', agents: { a1: agent({ position: { x: 0.33, y: 0.66 } }) } });
    const encoded = await encodeShare(doc);
    expect(encoded).toMatch(/^[\w-]+$/);
    const result = await decodeShare(encoded);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.name).toBe('Compartilhada çãé');
    expect(result.doc.agents.a1!.position).toEqual({ x: 0.33, y: 0.66 });
  });

  it('link corrompido dá erro em vez de quebrar', async () => {
    const result = await decodeShare('nao-e-um-link-valido');
    expect(result).toEqual({ ok: false, error: 'O link está incompleto ou corrompido.' });
  });

  it('gera nomes de arquivo seguros', () => {
    expect(safeFilename('Execução A: "rápida"/2')).toBe('execucao-a-rapida2');
    expect(safeFilename('***')).toBe('estrategia');
  });
});

describe('sincronização com a conta', () => {
  const item = (id: string, updatedAt: number) => ({ id, updatedAt });

  it('envia o que é novo ou mais recente aqui e baixa o inverso', () => {
    const plan = planSync([item('a', 5), item('b', 9), item('c', 1)], [item('b', 3), item('c', 8), item('d', 2)], {});
    expect(plan.upload.map((i) => i.id).sort()).toEqual(['a', 'b']);
    expect(plan.download.map((i) => i.id).sort()).toEqual(['c', 'd']);
    expect(plan.deleteRemote).toEqual([]);
  });

  it('exclusão local remove da conta', () => {
    const plan = planSync([], [item('a', 5)], { a: 10 });
    expect(plan.deleteRemote).toEqual(['a']);
    expect(plan.download).toEqual([]);
  });

  it('item alterado na conta depois da exclusão local volta em vez de sumir', () => {
    const plan = planSync([], [item('a', 20)], { a: 10 });
    expect(plan.deleteRemote).toEqual([]);
    expect(plan.download.map((i) => i.id)).toEqual(['a']);
  });

  it('não faz nada quando os dois lados são iguais', () => {
    expect(planSync([item('a', 5)], [item('a', 5)], {})).toEqual({ upload: [], download: [], deleteRemote: [] });
  });
});

describe('biblioteca de lineups', () => {
  it('não existe status oficial', () => {
    expect(lineupStatusSchema.safeParse('official').success).toBe(false);
    expect(lineupStatusSchema.safeParse('verified').success).toBe(false);
    expect(Object.values(LINEUP_STATUS_LABEL).join(' ').toLowerCase()).not.toContain('oficial');
  });

  it('valida uma lineup e recusa dados incompletos', () => {
    const base = {
      id: 'l',
      title: 'T',
      mapId: 'm',
      agentUuid: 'a',
      abilitySlot: 'Ability1',
      start: { x: 0, y: 0 },
      aim: { x: 0, y: 0 },
      impact: { x: 0, y: 0 },
      images: [],
      notes: '',
      gameVersion: '13.09',
      status: 'unverified',
      createdAt: 1,
      updatedAt: 1,
    };
    expect(parseLineup(base)).not.toBeNull();
    expect(parseLineup({ ...base, impact: undefined })).toBeNull();
    expect(parseLineup({ ...base, status: 'official' })).toBeNull();
    expect(parseLineup({ ...base, images: ['1', '2', '3', '4', '5'] })).toBeNull();
  });
});

describe('edições de rota e keyframes', () => {
  it('em t = 0 o agente muda a posição inicial', () => {
    expect(placeAgentAt(agent(), { x: 0.5, y: 0.5 }, 0, FRAME)).toMatchObject({ position: { x: 0.5, y: 0.5 }, route: null });
  });

  it('depois de t = 0, arrastar cria um keyframe naquele instante', () => {
    const next = placeAgentAt(agent(), { x: 0.5, y: 0.5 }, 4000, FRAME);
    expect(next.position).toEqual({ x: 0, y: 0 });
    expect(next.route!.waypoints[0]).toMatchObject({ point: { x: 0.5, y: 0.5 }, arriveAtMs: 4000 });
  });

  it('arrastar de novo no mesmo instante atualiza o keyframe, sem duplicar', () => {
    let next = placeAgentAt(agent(), { x: 0.5, y: 0.5 }, 4000, FRAME);
    next = placeAgentAt(next, { x: 0.6, y: 0.6 }, 4000, FRAME);
    expect(next.route!.waypoints).toHaveLength(1);
    expect(next.route!.waypoints[0]!.point).toEqual({ x: 0.6, y: 0.6 });
  });

  it('um keyframe entre dois pontos é inserido na ordem certa', () => {
    let next = placeAgentAt(agent(), { x: 0.1, y: 0 }, 2000, FRAME);
    next = placeAgentAt(next, { x: 0.3, y: 0 }, 6000, FRAME);
    next = placeAgentAt(next, { x: 0.2, y: 0 }, 4000, FRAME);
    expect(next.route!.waypoints.map((w) => w.arriveAtMs)).toEqual([2000, 4000, 6000]);
  });

  it('arrastar a rota na timeline leva os keyframes junto', () => {
    const base = agent({
      route: { startMs: 1000, speedMps: 5, waypoints: [createWaypoint({ x: 0.1, y: 0 }, { arriveAtMs: 3000 })] },
    });
    const moved = shiftRoute(base, 2500);
    expect(moved.route!.startMs).toBe(2500);
    expect(moved.route!.waypoints[0]!.arriveAtMs).toBe(4500);
    expect(compileRoute(moved, FRAME).arrivals[moved.route!.waypoints[0]!.id]).toBe(4500);
  });

  it('o início da rota não fica negativo', () => {
    const base = agent({ route: { startMs: 1000, speedMps: 5, waypoints: [] } });
    expect(shiftRoute(base, -500).route!.startMs).toBe(0);
  });

  it('remover o último ponto apaga a rota', () => {
    const withPoint = appendWaypoint(agent(), { x: 0.1, y: 0.1 }, 0);
    expect(removeWaypoint(withPoint, withPoint.route!.waypoints[0]!.id).route).toBeNull();
  });

  it('a direção em t = 0 vai para o agente; depois, para o último ponto alcançado', () => {
    expect(faceAgentAt(agent(), 1, 0, FRAME).facing).toBe(1);
    const routed = appendWaypoint(agent(), { x: 0.1, y: 0 }, 0);
    const turned = faceAgentAt(routed, 2, 60000, FRAME);
    expect(turned.route!.waypoints[0]!.facing).toBe(2);
    expect(turned.facing).toBe(0);
  });

  it('deslocar objetos preserva a forma', () => {
    const moved = translateAgent(appendWaypoint(agent(), { x: 0.2, y: 0.2 }, 0), 0.1, 0.1);
    expect(moved.position).toEqual({ x: 0.1, y: 0.1 });
    expect(moved.route!.waypoints[0]!.point.x).toBeCloseTo(0.3);

    const line = translateDrawing({ id: 'l', type: 'line', points: [{ x: 0, y: 0 }, { x: 0.1, y: 0 }], color: '#ffffff', width: 2, arrow: false, dashed: false }, 0.1, 0);
    expect(line.type === 'line' && line.points[1]!.x).toBeCloseTo(0.2);

    const smoke = createUtility({ agentUuid: 'x', slot: 'Ability2', ownerTokenId: null, timeMs: 0, shape: { type: 'circle', center: { x: 0, y: 0 }, radiusM: 3 } });
    const movedSmoke = translateUtility(smoke, 0.5, 0.5);
    expect(movedSmoke.shape.type === 'circle' && movedSmoke.shape.center).toEqual({ x: 0.5, y: 0.5 });
  });

  it('as formas padrão usam a escala do mapa', () => {
    const wall = defaultShapeFor('wall', 'wall', { x: 0.5, y: 0.5 }, FRAME);
    expect(wall.type === 'wall' && wall.points[1]!.x - wall.points[0]!.x).toBeCloseTo(0.12);
    expect(defaultShapeFor('marker', 'trap', { x: 0.5, y: 0.5 }, FRAME)).toEqual({ type: 'marker', point: { x: 0.5, y: 0.5 }, facing: null });
  });
});

describe('controlador de ferramentas (compartilhado por 2D e 3D)', () => {
  const OMEN = '8e253930-4c05-31dd-1b6c-968525494517';

  beforeEach(() => {
    editorStore.setState({ ...initialEditorState(), frame: FRAME });
    docActions.load(emptyDoc());
    playbackActions.reset();
  });

  const doc = () => docStore.getState().doc!;
  const click = (x: number, y: number) => {
    interaction.down({ x, y }, null);
    interaction.up({ x, y });
  };

  it('posiciona um agente armado e volta para a seleção', () => {
    armAgent(OMEN, 'attack');
    click(0.4, 0.6);
    const [token] = Object.values(doc().agents);
    expect(token).toMatchObject({ agentUuid: OMEN, team: 'attack', position: { x: 0.4, y: 0.6 } });
    expect(editorStore.getState().tool).toBe('select');
    expect(editorStore.getState().selection).toEqual([{ c: 'agents', id: token!.id }]);
  });

  it('impede o sexto agente da mesma equipe, mas aceita na outra', () => {
    for (let i = 0; i < 5; i++) {
      armAgent(OMEN, 'attack');
      click(0.1 * i, 0.1);
    }
    armAgent(OMEN, 'attack');
    expect(editorStore.getState().tool).toBe('select');
    expect(Object.keys(doc().agents)).toHaveLength(5);
    armAgent(OMEN, 'defense');
    click(0.5, 0.5);
    expect(Object.keys(doc().agents)).toHaveLength(6);
  });

  it('arrastar um agente vira um único passo de desfazer', () => {
    armAgent(OMEN, 'attack');
    click(0.2, 0.2);
    const id = Object.keys(doc().agents)[0]!;
    interaction.down({ x: 0.2, y: 0.2 }, { kind: 'entity', ref: { c: 'agents', id } });
    for (let i = 1; i <= 10; i++) interaction.move({ x: 0.2 + i / 100, y: 0.2 });
    interaction.up({ x: 0.3, y: 0.2 });
    expect(doc().agents[id]!.position.x).toBeCloseTo(0.3);
    docActions.undo();
    expect(doc().agents[id]!.position.x).toBeCloseTo(0.2);
  });

  it('não deixa arrastar para fora do mapa', () => {
    armAgent(OMEN, 'attack');
    click(0.5, 0.5);
    const id = Object.keys(doc().agents)[0]!;
    interaction.down({ x: 0.5, y: 0.5 }, { kind: 'entity', ref: { c: 'agents', id } });
    interaction.move({ x: 3, y: -3 });
    interaction.up(null);
    expect(doc().agents[id]!.position).toEqual({ x: 1, y: 0 });
  });

  it('desenha seta com arrasto e ignora clique sem movimento', () => {
    setTool('arrow');
    interaction.down({ x: 0.1, y: 0.1 }, null);
    interaction.move({ x: 0.4, y: 0.4 });
    interaction.up({ x: 0.4, y: 0.4 });
    const [line] = Object.values(doc().drawings);
    expect(line).toMatchObject({ type: 'line', arrow: true });

    setTool('line');
    click(0.5, 0.5);
    expect(Object.keys(doc().drawings)).toHaveLength(1);
  });

  it('mão livre reduz pontos muito próximos', () => {
    setTool('freehand');
    interaction.down({ x: 0.1, y: 0.1 }, null);
    for (let i = 0; i < 50; i++) interaction.move({ x: 0.1 + i * 0.0001, y: 0.1 });
    interaction.move({ x: 0.2, y: 0.1 });
    interaction.up({ x: 0.2, y: 0.1 });
    const [line] = Object.values(doc().drawings);
    expect(line!.type === 'line' && line!.points.length).toBeLessThan(10);
  });

  it('cria texto, marcação e área', () => {
    setTool('text');
    click(0.2, 0.2);
    setTool('marker');
    click(0.3, 0.3);
    setTool('area');
    interaction.down({ x: 0.5, y: 0.5 }, null);
    interaction.move({ x: 0.6, y: 0.5 });
    interaction.up({ x: 0.6, y: 0.5 });
    const types = Object.values(doc().drawings).map((d) => d.type).sort();
    expect(types).toEqual(['area', 'marker', 'text']);
    const area = Object.values(doc().drawings).find((d) => d.type === 'area');
    expect(area!.type === 'area' && area!.radiusM).toBeCloseTo(10);
  });

  it('cria rota clicando em pontos e conclui', () => {
    armAgent(OMEN, 'attack');
    click(0.2, 0.2);
    const id = Object.keys(doc().agents)[0]!;
    setTool('route');
    click(0.3, 0.3);
    click(0.4, 0.4);
    interaction.finish();
    expect(doc().agents[id]!.route!.waypoints).toHaveLength(2);
    expect(editorStore.getState().tool).toBe('select');
  });

  it('a rota sem agente selecionado avisa e não cria nada', () => {
    setTool('route');
    click(0.3, 0.3);
    expect(editorStore.getState().tool).toBe('select');
  });

  it('posiciona smoke (círculo) no instante atual, com raio padrão editável', () => {
    playbackActions.seek(3000, 30000);
    armUtility(OMEN, 'Ability2', null);
    click(0.5, 0.5);
    const [utility] = Object.values(doc().utilities);
    expect(utility).toMatchObject({ category: 'smoke', timeMs: 3000, shape: { type: 'circle' } });
    expect(utility!.shape.type === 'circle' && utility!.shape.radiusM).toBeGreaterThan(0);
  });

  it('arrastar define o raio do círculo', () => {
    armUtility(OMEN, 'Ability2', null);
    interaction.down({ x: 0.5, y: 0.5 }, null);
    interaction.move({ x: 0.55, y: 0.5 });
    interaction.up({ x: 0.55, y: 0.5 });
    const [utility] = Object.values(doc().utilities);
    expect(utility!.shape.type === 'circle' && utility!.shape.radiusM).toBeCloseTo(5);
  });

  it('trajetória parte do agente dono e termina em Concluir', () => {
    armAgent(OMEN, 'attack');
    click(0.2, 0.2);
    const id = Object.keys(doc().agents)[0]!;
    armUtility(OMEN, 'Grenade', id);
    click(0.3, 0.3);
    click(0.4, 0.4);
    interaction.finish();
    const [utility] = Object.values(doc().utilities);
    expect(utility!.shape.type === 'path' && utility!.shape.points).toEqual([{ x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }, { x: 0.4, y: 0.4 }]);
  });

  it('parede com arrasto usa os dois pontos', () => {
    const viper = '707eab51-4836-f488-046a-cda6bf494859';
    armUtility(viper, 'Ability2', null);
    interaction.down({ x: 0.1, y: 0.1 }, null);
    interaction.move({ x: 0.5, y: 0.1 });
    interaction.up({ x: 0.5, y: 0.1 });
    const [utility] = Object.values(doc().utilities);
    expect(utility!.shape.type === 'wall' && utility!.shape.points).toEqual([{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }]);
  });

  it('marcador com arrasto define a direção', () => {
    const killjoy = '1e58de9c-4950-5125-93e9-a0aee9f98746';
    armUtility(killjoy, 'Ability2', null);
    interaction.down({ x: 0.5, y: 0.5 }, null);
    interaction.move({ x: 0.5, y: 0.7 });
    interaction.up({ x: 0.5, y: 0.7 });
    const [utility] = Object.values(doc().utilities);
    expect(utility!.shape.type === 'marker' && utility!.shape.facing).toBeCloseTo(Math.PI / 2);
  });

  it('seleciona com Shift, duplica e exclui vários', () => {
    armAgent(OMEN, 'attack');
    click(0.2, 0.2);
    setTool('marker');
    click(0.3, 0.3);
    const agentId = Object.keys(doc().agents)[0]!;
    const markerId = Object.keys(doc().drawings)[0]!;
    setTool('select');
    interaction.down({ x: 0, y: 0 }, { kind: 'entity', ref: { c: 'agents', id: agentId } });
    interaction.up(null);
    interaction.down({ x: 0, y: 0 }, { kind: 'entity', ref: { c: 'drawings', id: markerId } }, { shift: true });
    interaction.up(null);
    expect(editorStore.getState().selection).toHaveLength(2);

    duplicateSelection();
    expect(Object.keys(doc().agents)).toHaveLength(2);
    expect(Object.keys(doc().drawings)).toHaveLength(2);
    expect(editorStore.getState().selection).toHaveLength(2);

    deleteSelection();
    expect(Object.keys(doc().agents)).toHaveLength(1);
    expect(Object.keys(doc().drawings)).toHaveLength(1);
  });

  it('excluir um agente mantém as habilidades dele, sem dono', () => {
    armAgent(OMEN, 'attack');
    click(0.2, 0.2);
    const id = Object.keys(doc().agents)[0]!;
    armUtility(OMEN, 'Ability2', id);
    click(0.3, 0.3);
    editorStore.setState({ selection: [{ c: 'agents', id }] });
    deleteSelection();
    const [utility] = Object.values(doc().utilities);
    expect(utility!.ownerTokenId).toBeNull();
  });

  it('modo somente leitura permite selecionar, mas não alterar', () => {
    docActions.load(emptyDoc({ agents: { a1: agent({ position: { x: 0.2, y: 0.2 } }) } }), { readOnly: true });
    interaction.down({ x: 0.2, y: 0.2 }, { kind: 'entity', ref: { c: 'agents', id: 'a1' } });
    interaction.move({ x: 0.8, y: 0.8 });
    interaction.up({ x: 0.8, y: 0.8 });
    expect(doc().agents.a1!.position.x).toBe(0.2);
    expect(editorStore.getState().selection).toEqual([{ c: 'agents', id: 'a1' }]);
  });

  it('clicar no vazio limpa a seleção; arrastar (navegar) não', () => {
    editorStore.setState({ selection: [{ c: 'agents', id: 'x' }] });
    interaction.down({ x: 0.5, y: 0.5 }, null);
    interaction.up({ x: 0.8, y: 0.8 });
    expect(editorStore.getState().selection).toHaveLength(1);
    interaction.down({ x: 0.5, y: 0.5 }, null);
    interaction.up({ x: 0.5, y: 0.5 });
    expect(editorStore.getState().selection).toHaveLength(0);
  });
});

describe('timeline', () => {
  beforeEach(() => playbackActions.reset());

  it('a lista de eventos sai em ordem e com nomes legíveis', () => {
    const catalog = buildCatalog([], [{ uuid: 'omen', displayName: 'Omen', abilities: [{ slot: 'Ability2', displayName: 'Encobrir' }] }], null, 'api');
    const doc = emptyDoc({
      agents: {
        a1: agent({ agentUuid: 'omen', route: { startMs: 1000, speedMps: 5, waypoints: [createWaypoint({ x: 0.1, y: 0 })] } }),
      },
      utilities: {
        u1: createUtility({ agentUuid: 'omen', slot: 'Ability2', ownerTokenId: 'a1', timeMs: 500, shape: { type: 'circle', center: { x: 0, y: 0 }, radiusM: 3 } }),
      },
      notes: { n1: { id: 'n1', timeMs: 2000, text: 'Entrar' } },
    });
    doc.utilities.u1!.id = 'u1';
    const events = buildEvents(doc, catalog, FRAME);
    expect(events.map((e) => [e.timeMs, e.label])).toEqual([
      [500, 'Omen usa Encobrir'],
      [1000, 'Omen começa a se mover'],
      [2000, 'Entrar'],
      [3000, 'Omen chega ao destino'],
    ]);
  });

  it('a duração efetiva nunca corta conteúdo', () => {
    const short = emptyDoc({ durationMs: 1000, notes: { n: { id: 'n', timeMs: 5000, text: '' } } });
    expect(effectiveDuration(short, FRAME)).toBe(5000);
    expect(effectiveDuration(emptyDoc({ durationMs: 30000 }), FRAME)).toBe(30000);
  });

  it('o relógio respeita velocidade e para no fim', () => {
    playbackActions.play();
    playbackActions.setRate(2);
    expect(playbackActions.advance(100, 1000)).toBe(true);
    expect(playbackStore.getState().timeMs).toBe(200);
    expect(playbackActions.advance(1000, 1000)).toBe(false);
    expect(playbackStore.getState()).toMatchObject({ timeMs: 1000, playing: false });
  });

  it('dar play no fim recomeça do início', () => {
    playbackActions.seek(1000, 1000);
    playbackActions.toggle(1000);
    expect(playbackStore.getState()).toMatchObject({ timeMs: 0, playing: true });
  });

  it('avançar e retroceder ficam dentro dos limites e pausam', () => {
    playbackActions.play();
    playbackActions.step(-500, 1000);
    expect(playbackStore.getState()).toMatchObject({ timeMs: 0, playing: false });
    playbackActions.step(5000, 1000);
    expect(playbackStore.getState().timeMs).toBe(1000);
  });
});

describe('segredos', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });

  it('o código do site não usa a chave de serviço do Supabase', () => {
    const offenders = walk(join(process.cwd(), 'src')).filter((file) => /service_role|SERVICE_ROLE/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('o .env fica fora do repositório', () => {
    expect(readFileSync(join(process.cwd(), '.gitignore'), 'utf8')).toMatch(/^\.env$/m);
  });
});
