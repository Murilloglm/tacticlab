// Modelo puro da câmera fantasma: sem gravidade, sem colisão, com movimento suavizado.
// Fica separado do React e do Three.js para ser testável e usado por teclado e toque.

export interface GhostVector {
  x: number;
  y: number;
  z: number;
}

export interface GhostState {
  position: GhostVector;
  velocity: GhostVector;
  /** Rotação horizontal em radianos. 0 olha para +x; cresce no sentido horário visto de cima. */
  yaw: number;
  /** Rotação vertical em radianos. Positivo olha para cima. */
  pitch: number;
}

export interface GhostInput {
  /** -1 a 1: W/S ou joystick. */
  forward: number;
  /** -1 a 1: D/A ou joystick. */
  strafe: number;
  /** -1 a 1: Espaço/Ctrl. */
  vertical: number;
  boost: boolean;
}

export const NO_INPUT: GhostInput = { forward: 0, strafe: 0, vertical: 0, boost: false };

export const GHOST_LIMITS = {
  minSpeed: 2,
  maxSpeed: 60,
  defaultSpeed: 12,
  boostFactor: 2.5,
  /** Quanto maior, mais rápido a velocidade alcança o comando. */
  smoothing: 10,
  maxPitch: Math.PI / 2 - 0.02,
};

export function createGhost(position: GhostVector, yaw = 0, pitch = 0): GhostState {
  return { position: { ...position }, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch };
}

export function ghostForward(yaw: number, pitch: number): GhostVector {
  const c = Math.cos(pitch);
  return { x: Math.cos(yaw) * c, y: Math.sin(pitch), z: Math.sin(yaw) * c };
}

export function ghostRight(yaw: number): GhostVector {
  return { x: -Math.sin(yaw), y: 0, z: Math.cos(yaw) };
}

export function stepGhost(state: GhostState, input: GhostInput, speed: number, dt: number): GhostState {
  const step = Math.min(dt, 0.1);
  const forward = ghostForward(state.yaw, state.pitch);
  const right = ghostRight(state.yaw);

  let dx = forward.x * input.forward + right.x * input.strafe;
  let dy = forward.y * input.forward + input.vertical;
  let dz = forward.z * input.forward + right.z * input.strafe;
  const length = Math.hypot(dx, dy, dz);
  if (length > 1) {
    dx /= length;
    dy /= length;
    dz /= length;
  }

  const target = speed * (input.boost ? GHOST_LIMITS.boostFactor : 1);
  // Amortecimento exponencial: o resultado independe da taxa de quadros.
  const blend = 1 - Math.exp(-GHOST_LIMITS.smoothing * step);
  const velocity = {
    x: state.velocity.x + (dx * target - state.velocity.x) * blend,
    y: state.velocity.y + (dy * target - state.velocity.y) * blend,
    z: state.velocity.z + (dz * target - state.velocity.z) * blend,
  };
  return {
    ...state,
    velocity,
    position: {
      x: state.position.x + velocity.x * step,
      y: state.position.y + velocity.y * step,
      z: state.position.z + velocity.z * step,
    },
  };
}

export function lookGhost(state: GhostState, deltaX: number, deltaY: number, sensitivity = 0.0022): GhostState {
  const pitch = Math.max(-GHOST_LIMITS.maxPitch, Math.min(GHOST_LIMITS.maxPitch, state.pitch - deltaY * sensitivity));
  return { ...state, yaw: state.yaw + deltaX * sensitivity, pitch };
}

/** Posiciona a câmera olhando para um alvo, mantendo uma distância em metros. */
export function focusGhost(state: GhostState, target: GhostVector, distance = 8, height = 4): GhostState {
  const horizontal = Math.hypot(Math.cos(state.yaw), Math.sin(state.yaw)) || 1;
  const position = {
    x: target.x - (Math.cos(state.yaw) / horizontal) * distance,
    y: target.y + height,
    z: target.z - (Math.sin(state.yaw) / horizontal) * distance,
  };
  const dx = target.x - position.x;
  const dy = target.y - position.y;
  const dz = target.z - position.z;
  return {
    position,
    velocity: { x: 0, y: 0, z: 0 },
    yaw: Math.atan2(dz, dx),
    pitch: Math.atan2(dy, Math.hypot(dx, dz)),
  };
}

const KEY_BINDINGS: Record<string, keyof KeyState> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'up',
  ControlLeft: 'down',
  ControlRight: 'down',
  // Alternativa: Ctrl+W fecha a aba e o navegador não permite bloquear esse atalho.
  KeyC: 'down',
  ShiftLeft: 'boost',
  ShiftRight: 'boost',
};

export interface KeyState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  boost: boolean;
}

export const emptyKeys = (): KeyState => ({
  forward: false,
  back: false,
  left: false,
  right: false,
  up: false,
  down: false,
  boost: false,
});

/** Atualiza o estado de teclas. Retorna falso se o código não pertence à câmera. */
export function applyKeyCode(keys: KeyState, code: string, pressed: boolean): boolean {
  const binding = KEY_BINDINGS[code];
  if (!binding) return false;
  keys[binding] = pressed;
  return true;
}

export function keysToInput(keys: KeyState): GhostInput {
  return {
    forward: (keys.forward ? 1 : 0) - (keys.back ? 1 : 0),
    strafe: (keys.right ? 1 : 0) - (keys.left ? 1 : 0),
    vertical: (keys.up ? 1 : 0) - (keys.down ? 1 : 0),
    boost: keys.boost,
  };
}

/** Une teclado e joystick. O maior valor absoluto vence em cada eixo. */
export function mergeInputs(a: GhostInput, b: GhostInput): GhostInput {
  const pick = (x: number, y: number) => (Math.abs(x) >= Math.abs(y) ? x : y);
  return {
    forward: pick(a.forward, b.forward),
    strafe: pick(a.strafe, b.strafe),
    vertical: pick(a.vertical, b.vertical),
    boost: a.boost || b.boost,
  };
}
