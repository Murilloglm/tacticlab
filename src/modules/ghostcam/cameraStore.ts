// Ponte entre a cena 3D e a interface: velocidade, trava do mouse, posição exibida e comandos.
import { createStore, useStore } from 'zustand';
import { GHOST_LIMITS, NO_INPUT, type GhostInput } from './ghostCamera';

export type CameraCommand =
  | { type: 'reset'; nonce: number }
  | { type: 'focus'; tokenId: string; nonce: number };

export interface CameraState {
  speed: number;
  pointerLocked: boolean;
  /** Posição e orientação mostradas na interface. */
  hud: { x: number; y: number; z: number; yaw: number; pitch: number };
  command: CameraCommand | null;
}

export const cameraStore = createStore<CameraState>(() => ({
  speed: GHOST_LIMITS.defaultSpeed,
  pointerLocked: false,
  hud: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 },
  command: null,
}));

export const useCamera = <T,>(selector: (state: CameraState) => T): T => useStore(cameraStore, selector);

let nonce = 0;

export const cameraActions = {
  setSpeed(speed: number) {
    cameraStore.setState({ speed: Math.max(GHOST_LIMITS.minSpeed, Math.min(GHOST_LIMITS.maxSpeed, speed)) });
  },
  reset() {
    cameraStore.setState({ command: { type: 'reset', nonce: ++nonce } });
  },
  focus(tokenId: string) {
    cameraStore.setState({ command: { type: 'focus', tokenId, nonce: ++nonce } });
  },
};

/** Comandos de toque. Fica fora do React porque muda a cada movimento do dedo. */
export const touchControls = {
  input: { ...NO_INPUT } as GhostInput,
  lookX: 0,
  lookY: 0,
};
