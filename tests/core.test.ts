import { describe, expect, it, beforeEach } from 'vitest';
import { utilityDefinition } from '@/modules/abilities/definitions';
import { utilityTravelMs } from '@/modules/abilities/timeline';
import {
  boardToMap,
  distanceMeters,
  headingToWorld,
  lerpAngle,
  mapToBoard,
  mapToWorld,
  pointAlongPolyline,
  smoothPolyline,
  worldToMap,
  type MapPoint,
} from '@/modules/coordinates';
import { docActions, docStore, subscribeChanges, type Change } from '@/modules/strategy/docStore';
import { parseStrategy } from '@/modules/strategy/schema';
import { agentPoseAt, compileRoute, contentEndMs, formatTime, simulate, utilityPathPoint, utilityStateAt } from '@/modules/timeline/simulate';
import {
  applyKeyCode,
  createGhost,
  emptyKeys,
  focusGhost,
  GHOST_LIMITS,
  keysToInput,
  lookGhost,
  mergeInputs,
  NO_INPUT,
  stepGhost,
} from '@/modules/ghostcam/ghostCamera';
import { agent, emptyDoc, FRAME } from './helpers';

const waypoint = (id: string, point: MapPoint, extra: object = {}) => ({
  id,
  point,
  pauseMs: 0,
  facing: null,
  speedMps: null,
  arriveAtMs: null,
  ...extra,
});

describe('sistema de coordenadas', () => {
  const samples: MapPoint[] = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 0.25, y: 0.75 },
    { x: 0.123, y: 0.987 },
  ];

  it('ida e volta entre mapa e prancha 2D não altera o ponto', () => {
    for (const p of samples) {
      const back = boardToMap(mapToBoard(p));
      expect(back.x).toBeCloseTo(p.x, 10);
      expect(back.y).toBeCloseTo(p.y, 10);
    }
  });

  it('ida e volta entre mapa e mundo 3D não altera o ponto', () => {
    for (const p of samples) {
      const [x, , z] = mapToWorld(p, FRAME, 3);
      const back = worldToMap(x, z, FRAME);
      expect(back.x).toBeCloseTo(p.x, 10);
      expect(back.y).toBeCloseTo(p.y, 10);
    }
  });

  it('o centro do mapa é a origem do mundo e a altura é preservada', () => {
    expect(mapToWorld({ x: 0.5, y: 0.5 }, FRAME, 2)).toEqual([0, 2, 0]);
  });

  it('2D e 3D mantêm a mesma orientação (direita e baixo do minimapa)', () => {
    const [x1, , z1] = mapToWorld({ x: 0.2, y: 0.2 }, FRAME);
    const [x2, , z2] = mapToWorld({ x: 0.8, y: 0.8 }, FRAME);
    expect(x2).toBeGreaterThan(x1);
    expect(z2).toBeGreaterThan(z1);
    const [dx, , dz] = headingToWorld(Math.PI / 2);
    expect(dx).toBeCloseTo(0);
    expect(dz).toBeCloseTo(1);
  });

  it('calcula distância em metros usando a escala do mapa', () => {
    expect(distanceMeters({ x: 0, y: 0 }, { x: 0.5, y: 0 }, FRAME)).toBe(50);
  });

  it('interpola ângulos pelo menor arco', () => {
    expect(Math.abs(lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5))).toBeCloseTo(Math.PI);
  });

  it('percorre polilinhas por fração do comprimento', () => {
    const line = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
    expect(pointAlongPolyline(line, 0.5)).toEqual({ x: 1, y: 0 });
    expect(pointAlongPolyline(line, 1)).toEqual({ x: 1, y: 1 });
  });

  it('a curva suavizada passa pelos pontos de controle', () => {
    const line = [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 0 }];
    const curve = smoothPolyline(line);
    expect(curve[0]).toEqual(line[0]);
    expect(curve[curve.length - 1]).toEqual(line[2]);
    expect(curve.some((p) => Math.abs(p.x - 0.5) < 1e-9 && Math.abs(p.y - 0.5) < 1e-9)).toBe(true);
  });
});

describe('simulação determinística', () => {
  // 10 m a 5 m/s levam 2 s (mapa de 100 m).
  const runner = agent({
    position: { x: 0, y: 0 },
    route: { startMs: 1000, speedMps: 5, waypoints: [waypoint('w1', { x: 0.1, y: 0 })] },
  });

  it('o agente espera o início da rota, anda e permanece no destino', () => {
    expect(agentPoseAt(runner, 0, FRAME).point).toEqual({ x: 0, y: 0 });
    expect(agentPoseAt(runner, 999, FRAME).moving).toBe(false);
    const middle = agentPoseAt(runner, 2000, FRAME);
    expect(middle.point.x).toBeCloseTo(0.05);
    expect(middle.moving).toBe(true);
    expect(agentPoseAt(runner, 3000, FRAME).point.x).toBeCloseTo(0.1);
    expect(agentPoseAt(runner, 60000, FRAME).point).toEqual({ x: 0.1, y: 0 });
  });

  it('pular para qualquer instante dá o mesmo resultado em qualquer ordem', () => {
    const doc = emptyDoc({ agents: { a1: runner } });
    const times = [0, 1500, 2750, 500, 2000, 3000, 1000, 2750];
    const forward = times.map((t) => simulate(doc, t, FRAME));
    const reversed = [...times].reverse().map((t) => simulate(doc, t, FRAME)).reverse();
    expect(reversed).toEqual(forward);
  });

  it('respeita pausas nos pontos intermediários', () => {
    const paused = agent({
      route: {
        startMs: 0,
        speedMps: 5,
        waypoints: [waypoint('w1', { x: 0.1, y: 0 }, { pauseMs: 1000 }), waypoint('w2', { x: 0.2, y: 0 })],
      },
    });
    expect(agentPoseAt(paused, 2500, FRAME)).toMatchObject({ point: { x: 0.1, y: 0 }, moving: false });
    expect(agentPoseAt(paused, 4000, FRAME).point.x).toBeCloseTo(0.15);
    expect(compileRoute(paused, FRAME).endMs).toBe(5000);
  });

  it('a velocidade de um trecho sobrepõe a da rota', () => {
    const dash = agent({
      route: { startMs: 0, speedMps: 5, waypoints: [waypoint('w1', { x: 0.1, y: 0 }, { speedMps: 20 })] },
    });
    expect(compileRoute(dash, FRAME).endMs).toBe(500);
  });

  it('um keyframe fixa o instante de chegada e ignora a velocidade', () => {
    const keyed = agent({
      route: { startMs: 0, speedMps: 5, waypoints: [waypoint('w1', { x: 0.1, y: 0 }, { arriveAtMs: 8000 })] },
    });
    expect(agentPoseAt(keyed, 4000, FRAME).point.x).toBeCloseTo(0.05);
    expect(compileRoute(keyed, FRAME).arrivals.w1).toBe(8000);
  });

  it('keyframe anterior ao trecho vira movimento instantâneo, sem tempo negativo', () => {
    const keyed = agent({
      route: {
        startMs: 5000,
        speedMps: 5,
        waypoints: [waypoint('w1', { x: 0.1, y: 0 }, { arriveAtMs: 1000 })],
      },
    });
    const compiled = compileRoute(keyed, FRAME);
    expect(compiled.endMs).toBe(5000);
    expect(agentPoseAt(keyed, 5000, FRAME).point.x).toBeCloseTo(0.1);
  });

  it('o agente vira para a direção do movimento e para a direção definida na chegada', () => {
    const turning = agent({
      facing: 0,
      route: {
        startMs: 0,
        speedMps: 5,
        waypoints: [waypoint('w1', { x: 0, y: 0.1 }, { facing: Math.PI, pauseMs: 2000 })],
      },
    });
    expect(agentPoseAt(turning, 1000, FRAME).facing).toBeCloseTo(Math.PI / 2);
    expect(Math.abs(agentPoseAt(turning, 3000, FRAME).facing)).toBeCloseTo(Math.PI);
  });

  it('agente sem rota permanece parado na posição inicial', () => {
    const still = agent({ position: { x: 0.3, y: 0.4 }, facing: 1 });
    expect(agentPoseAt(still, 5000, FRAME)).toEqual({ point: { x: 0.3, y: 0.4 }, facing: 1, moving: false });
  });

  it('utilidades respeitam início, duração e percurso do preset', () => {
    const base = { id: 'u1', ownerTokenId: null, timeMs: 3000, note: '' };
    const smoke = { ...base, agentUuid: '8e253930-4c05-31dd-1b6c-968525494517', abilitySlot: 'Ability2', shape: { type: 'circle' as const, center: { x: 0.5, y: 0.5 } } };
    const { durationMs } = utilityDefinition(smoke).timing;
    expect(utilityStateAt(smoke, 2999, FRAME)).toEqual({ started: false, active: false, progress: 0, elapsedMs: 0, travelMs: 0 });
    expect(utilityStateAt(smoke, 3500, FRAME)).toEqual({ started: true, active: true, progress: 1, elapsedMs: 500, travelMs: 0 });
    expect(utilityStateAt(smoke, 3000 + durationMs! + 1, FRAME).active).toBe(false);

    const bolt = { ...base, agentUuid: '320b2a48-4d9b-a075-30f1-1f93a9b638fa', abilitySlot: 'Ability2', shape: { type: 'path' as const, curved: false, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] } };
    const travelMs = utilityTravelMs(bolt, FRAME);
    expect(travelMs).toBeGreaterThan(0);
    expect(utilityStateAt(bolt, 3000 + travelMs / 2, FRAME).progress).toBeCloseTo(0.5);
    expect(utilityPathPoint(bolt, 0.5)).toEqual({ x: 0.5, y: 0 });

    const turret = { ...base, agentUuid: '1e58de9c-4950-5125-93e9-a0aee9f98746', abilitySlot: 'Ability2', shape: { type: 'marker' as const, point: { x: 0.5, y: 0.5 }, facing: null } };
    expect(utilityStateAt(turret, 999999, FRAME).active).toBe(true);
  });

  it('calcula o fim do conteúdo e formata o tempo', () => {
    expect(contentEndMs(emptyDoc({ agents: { a1: runner } }), FRAME)).toBe(3000);
    expect(formatTime(0)).toBe('00:00.0');
    expect(formatTime(63450)).toBe('01:03.4');
  });
});

describe('documento e desfazer/refazer', () => {
  beforeEach(() => docActions.load(emptyDoc()));

  it('adiciona e desfaz e refaz uma entidade', () => {
    docActions.change([{ c: 'agents', id: 'a1', after: agent() }]);
    expect(docStore.getState().doc!.agents.a1).toBeDefined();
    docActions.undo();
    expect(docStore.getState().doc!.agents.a1).toBeUndefined();
    docActions.redo();
    expect(docStore.getState().doc!.agents.a1).toBeDefined();
  });

  it('um arrasto contínuo vira um único passo de desfazer', () => {
    docActions.change([{ c: 'agents', id: 'a1', after: agent() }]);
    for (let i = 1; i <= 20; i++) {
      docActions.change([{ c: 'agents', id: 'a1', after: agent({ position: { x: i / 100, y: 0 } }) }], { coalesce: 'drag:a1' });
    }
    docActions.endGesture();
    expect(docStore.getState().doc!.agents.a1!.position.x).toBe(0.2);
    docActions.undo();
    expect(docStore.getState().doc!.agents.a1!.position.x).toBe(0);
    docActions.undo();
    expect(docStore.getState().doc!.agents.a1).toBeUndefined();
  });

  it('uma ação nova apaga o que podia ser refeito', () => {
    docActions.change([{ c: 'agents', id: 'a1', after: agent() }]);
    docActions.undo();
    docActions.change([{ c: 'agents', id: 'a2', after: agent({ id: 'a2' }) }]);
    docActions.redo();
    expect(docStore.getState().doc!.agents.a1).toBeUndefined();
  });

  it('desfaz alterações de metadados', () => {
    docActions.change([{ c: 'meta', key: 'name', after: 'Novo' }]);
    expect(docStore.getState().doc!.name).toBe('Novo');
    docActions.undo();
    expect(docStore.getState().doc!.name).toBe('Teste');
  });

  it('modo somente leitura bloqueia alterações locais, mas não as remotas', () => {
    docActions.setReadOnly(true);
    expect(docActions.change([{ c: 'agents', id: 'a1', after: agent() }])).toBe(false);
    expect(docStore.getState().doc!.agents.a1).toBeUndefined();
    docActions.applyRemote([{ c: 'agents', id: 'a1', after: agent() }]);
    expect(docStore.getState().doc!.agents.a1).toBeDefined();
  });

  it('alterações remotas não entram no histórico de desfazer', () => {
    docActions.applyRemote([{ c: 'agents', id: 'a1', after: agent() }]);
    expect(docStore.getState().past).toHaveLength(0);
  });

  it('notifica ouvintes com a origem correta', () => {
    const seen: Array<[Change[], string]> = [];
    const stop = subscribeChanges((changes, origin) => seen.push([changes, origin]));
    docActions.change([{ c: 'agents', id: 'a1', after: agent() }]);
    docActions.undo();
    stop();
    expect(seen.map(([, origin]) => origin)).toEqual(['local', 'undo']);
    expect(seen[1]![0][0]).toMatchObject({ c: 'agents', id: 'a1', after: null });
  });

  it('não altera o documento anterior (imutabilidade)', () => {
    const before = docStore.getState().doc!;
    docActions.change([{ c: 'agents', id: 'a1', after: agent() }]);
    expect(before.agents.a1).toBeUndefined();
  });
});

describe('validação de estratégia', () => {
  it('aceita um documento válido', () => {
    expect(parseStrategy(emptyDoc()).ok).toBe(true);
  });

  it('rejeita JSON malformado com mensagem clara', () => {
    const result = parseStrategy({ ...emptyDoc(), name: 42 });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain('name');
  });

  it('rejeita coordenadas não finitas', () => {
    const bad = emptyDoc({ agents: { a1: agent({ position: { x: Number.NaN, y: 0 } }) } });
    expect(parseStrategy(bad).ok).toBe(false);
  });

  it('rejeita mais de cinco agentes por equipe', () => {
    const agents = Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [`a${i}`, agent({ id: `a${i}` })]),
    );
    const result = parseStrategy(emptyDoc({ agents }));
    expect(result.ok).toBe(false);
  });

  it('aceita cinco atacantes e cinco defensores', () => {
    const agents = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`a${i}`, agent({ id: `a${i}`, team: i < 5 ? 'attack' : 'defense' })]),
    );
    expect(parseStrategy(emptyDoc({ agents })).ok).toBe(true);
  });
});

describe('câmera fantasma', () => {
  const start = () => createGhost({ x: 0, y: 5, z: 0 }, 0, 0);
  const run = (input = NO_INPUT, seconds = 1, speed = GHOST_LIMITS.defaultSpeed) => {
    let state = start();
    for (let i = 0; i < seconds * 60; i++) state = stepGhost(state, input, speed, 1 / 60);
    return state;
  };

  it('W avança na direção da visão e S recua', () => {
    expect(run({ ...NO_INPUT, forward: 1 }).position.x).toBeGreaterThan(5);
    expect(run({ ...NO_INPUT, forward: -1 }).position.x).toBeLessThan(-5);
  });

  it('D e A deslocam para os lados sem mudar a altura', () => {
    const right = run({ ...NO_INPUT, strafe: 1 });
    expect(right.position.z).toBeGreaterThan(5);
    expect(right.position.y).toBeCloseTo(5);
    expect(run({ ...NO_INPUT, strafe: -1 }).position.z).toBeLessThan(-5);
  });

  it('Espaço sobe e Ctrl desce; não há gravidade', () => {
    expect(run({ ...NO_INPUT, vertical: 1 }).position.y).toBeGreaterThan(10);
    expect(run({ ...NO_INPUT, vertical: -1 }).position.y).toBeLessThan(0);
    expect(run().position.y).toBe(5);
  });

  it('Shift acelera', () => {
    const normal = run({ ...NO_INPUT, forward: 1 }).position.x;
    const fast = run({ ...NO_INPUT, forward: 1, boost: true }).position.x;
    expect(fast).toBeGreaterThan(normal * 2);
  });

  it('atravessa qualquer ponto: não existe colisão no modelo', () => {
    const far = run({ ...NO_INPUT, forward: 1 }, 10);
    expect(far.position.x).toBeGreaterThan(100);
  });

  it('movimento diagonal não é mais rápido que o reto', () => {
    const diagonal = run({ ...NO_INPUT, forward: 1, strafe: 1 });
    const straight = run({ ...NO_INPUT, forward: 1 });
    expect(Math.hypot(diagonal.position.x, diagonal.position.z)).toBeCloseTo(straight.position.x, 1);
  });

  it('a velocidade é suavizada ao começar e parar', () => {
    const first = stepGhost(start(), { ...NO_INPUT, forward: 1 }, 10, 1 / 60);
    expect(first.velocity.x).toBeGreaterThan(0);
    expect(first.velocity.x).toBeLessThan(10);
    let state = run({ ...NO_INPUT, forward: 1 });
    const coast = stepGhost(state, NO_INPUT, 10, 1 / 60);
    expect(coast.velocity.x).toBeLessThan(state.velocity.x);
    for (let i = 0; i < 120; i++) state = stepGhost(state, NO_INPUT, 10, 1 / 60);
    expect(Math.abs(state.velocity.x)).toBeLessThan(0.01);
  });

  it('o resultado independe da taxa de quadros (aproximadamente)', () => {
    let at30 = start();
    let at120 = start();
    for (let i = 0; i < 60; i++) at30 = stepGhost(at30, { ...NO_INPUT, forward: 1 }, 10, 1 / 30);
    for (let i = 0; i < 240; i++) at120 = stepGhost(at120, { ...NO_INPUT, forward: 1 }, 10, 1 / 120);
    expect(Math.abs(at30.position.x - at120.position.x)).toBeLessThan(0.6);
  });

  it('o olhar gira e a inclinação é limitada para não virar de cabeça para baixo', () => {
    const turned = lookGhost(start(), 100, 0);
    expect(turned.yaw).toBeGreaterThan(0);
    const up = lookGhost(start(), 0, -100000);
    expect(up.pitch).toBeCloseTo(GHOST_LIMITS.maxPitch);
    const down = lookGhost(start(), 0, 100000);
    expect(down.pitch).toBeCloseTo(-GHOST_LIMITS.maxPitch);
  });

  it('focar em um agente aponta a câmera para ele', () => {
    const focused = focusGhost(start(), { x: 10, y: 0, z: 10 });
    const dx = 10 - focused.position.x;
    const dz = 10 - focused.position.z;
    expect(focused.yaw).toBeCloseTo(Math.atan2(dz, dx));
    expect(focused.pitch).toBeLessThan(0);
    expect(focused.velocity).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('mapeia as teclas pedidas', () => {
    const keys = emptyKeys();
    for (const code of ['KeyW', 'KeyD', 'Space', 'ShiftLeft']) expect(applyKeyCode(keys, code, true)).toBe(true);
    expect(keysToInput(keys)).toEqual({ forward: 1, strafe: 1, vertical: 1, boost: true });
    applyKeyCode(keys, 'KeyW', false);
    applyKeyCode(keys, 'Space', false);
    applyKeyCode(keys, 'ControlLeft', true);
    expect(keysToInput(keys)).toMatchObject({ forward: 0, vertical: -1 });
    expect(applyKeyCode(keys, 'KeyV', true)).toBe(false);
  });

  it('une teclado e joystick', () => {
    const merged = mergeInputs(NO_INPUT, { forward: 0.5, strafe: -0.2, vertical: 0, boost: true });
    expect(merged).toEqual({ forward: 0.5, strafe: -0.2, vertical: 0, boost: true });
  });
});
