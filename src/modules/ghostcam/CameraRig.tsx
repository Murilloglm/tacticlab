import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Vector3 } from 'three';
import { isTextEntry } from '../../ui/dom';
import { mapToWorld, worldToMap } from '../coordinates';
import { docStore } from '../strategy/docStore';
import { editorStore, setEditor, useEditor } from '../editor/editorStore';
import { interaction } from '../editor/interaction';
import { playbackStore } from '../timeline/playbackStore';
import { agentPoseAt } from '../timeline/simulate';
import { cameraActions, cameraStore, touchControls } from './cameraStore';
import {
  applyKeyCode,
  createGhost,
  emptyKeys,
  focusGhost,
  ghostForward,
  keysToInput,
  lookGhost,
  mergeInputs,
  stepGhost,
  type GhostState,
} from './ghostCamera';

/** Referência para a visão desativar a órbita enquanto o usuário arrasta um objeto. */
export const orbitRef: { current: OrbitControlsImpl | null } = { current: null };

/**
 * Na fantasma com mouse, o primeiro clique captura o ponteiro e os seguintes usam a mira.
 * A posição do ponteiro fica congelada, então a cena não pode tratar esses cliques.
 * No toque não há captura: tocar no cenário continua valendo.
 */
export function ignoreSceneEvent(pointerType: string): boolean {
  return pointerType === 'mouse' && editorStore.getState().cameraMode === 'ghost';
}

export function syncOrbitEnabled(): void {
  const { tool, cameraMode } = editorStore.getState();
  if (orbitRef.current && cameraMode === 'aerial') {
    orbitRef.current.enabled = (tool === 'select' || tool === 'pan') && !interaction.isBusy();
  }
}

function tokenWorld(tokenId: string): Vector3 | null {
  const { doc } = docStore.getState();
  const { frame, map } = editorStore.getState();
  const token = doc?.agents[tokenId];
  if (!token) return null;
  const point = agentPoseAt(token, playbackStore.getState().timeMs, frame).point;
  const [x, y, z] = mapToWorld(point, frame, map?.heights.heightAt(point) ?? 0);
  return new Vector3(x, y, z);
}

/**
 * Foca no agente a partir de um ângulo com a câmera sobre o piso e sem parede no caminho.
 * Atrás do agente pode haver uma massa construída, e de dentro dela não se veria nada.
 */
function focusFromOpenFloor(state: GhostState, target: Vector3): GhostState {
  const { frame, map } = editorStore.getState();
  const destination = { x: target.x, y: target.y, z: target.z };
  const first = focusGhost(state, destination);
  if (!map) return first;
  const size = map.heights.size;
  const clearView = (candidate: GhostState) => {
    const samples = 8;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const x = candidate.position.x + (target.x - candidate.position.x) * t;
      const z = candidate.position.z + (target.z - candidate.position.z) * t;
      const point = worldToMap(x, z, frame);
      if (!map.heights.isFloorCell(Math.floor(point.x * size), Math.floor(point.y * size))) return false;
    }
    return true;
  };
  for (let step = 0; step < 8; step++) {
    const candidate = focusGhost({ ...state, yaw: state.yaw + (step * Math.PI) / 4 }, destination);
    if (clearView(candidate)) return candidate;
  }
  return first;
}

function publishHud(position: { x: number; y: number; z: number }, yaw: number, pitch: number): void {
  cameraStore.setState({ hud: { x: position.x, y: position.y, z: position.z, yaw, pitch } });
}

function GhostController() {
  const { camera, gl } = useThree();
  const state = useRef<GhostState>(null!);
  const keys = useRef(emptyKeys());
  const hudTimer = useRef(0);

  if (!state.current) {
    const forward = camera.getWorldDirection(new Vector3());
    state.current = createGhost(
      { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      Math.atan2(forward.z, forward.x),
      Math.asin(Math.max(-1, Math.min(1, forward.y))),
    );
  }

  useEffect(() => {
    const canvas = gl.domElement;
    const pressed = keys.current;
    // O botão que ativou a câmera não pode continuar em foco: Espaço o acionaria em vez de subir.
    if (document.activeElement instanceof HTMLElement && !isTextEntry(document.activeElement)) document.activeElement.blur();
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextEntry(event.target)) return;
      if (applyKeyCode(pressed, event.code, true)) event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      // Soltar sempre vale, mesmo com foco em um campo, para nenhuma tecla ficar presa.
      if (applyKeyCode(pressed, event.code, false) && !isTextEntry(event.target)) event.preventDefault();
    };
    const onBlur = () => {
      Object.assign(pressed, emptyKeys());
    };
    const onLockChange = () => {
      const locked = document.pointerLockElement === canvas;
      cameraStore.setState({ pointerLocked: locked });
      if (!locked) onBlur();
    };
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement === canvas) {
        state.current = lookGhost(state.current, event.movementX, event.movementY);
      }
    };
    let dragging: { id: number; x: number; y: number } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button === 0 && document.pointerLockElement !== canvas) {
        // A trava pode ser recusada (iframe, permissões); nesse caso, arrastar continua girando a visão.
        Promise.resolve(canvas.requestPointerLock?.()).catch(() => undefined);
      }
      if (document.pointerLockElement !== canvas) dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging || event.pointerId !== dragging.id) return;
      if (document.pointerLockElement === canvas) {
        dragging = null;
        return;
      }
      state.current = lookGhost(state.current, event.clientX - dragging.x, event.clientY - dragging.y);
      dragging = { ...dragging, x: event.clientX, y: event.clientY };
    };
    const onPointerUp = () => {
      dragging = null;
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      cameraActions.setSpeed(cameraStore.getState().speed * Math.exp(-event.deltaY * 0.001));
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      cameraStore.setState({ pointerLocked: false });
    };
  }, [gl]);

  useEffect(
    () =>
      cameraStore.subscribe((current, previous) => {
        const command = current.command;
        if (!command || command === previous.command || command.type !== 'focus') return;
        const target = tokenWorld(command.tokenId);
        if (target) state.current = focusFromOpenFloor(state.current, target);
      }),
    [],
  );

  useFrame((_, dt) => {
    if (touchControls.lookX || touchControls.lookY) {
      state.current = lookGhost(state.current, touchControls.lookX, touchControls.lookY);
      touchControls.lookX = 0;
      touchControls.lookY = 0;
    }
    const input = mergeInputs(keysToInput(keys.current), touchControls.input);
    state.current = stepGhost(state.current, input, cameraStore.getState().speed, dt);
    const { position, yaw, pitch } = state.current;
    const forward = ghostForward(yaw, pitch);
    camera.position.set(position.x, position.y, position.z);
    camera.lookAt(position.x + forward.x, position.y + forward.y, position.z + forward.z);
    hudTimer.current += dt;
    if (hudTimer.current > 0.1) {
      hudTimer.current = 0;
      publishHud(position, yaw, pitch);
    }
  });

  return null;
}

function defaultAerial(worldMeters: number) {
  return { position: new Vector3(0, worldMeters * 0.86, worldMeters * 0.46), target: new Vector3(0, 0, 0) };
}

function AerialController() {
  const { camera, invalidate } = useThree();
  const frame = useEditor((s) => s.frame);
  const controls = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    orbitRef.current = controls.current;
    syncOrbitEnabled();
    const stopEditor = editorStore.subscribe((current, previous) => {
      if (current.tool !== previous.tool) syncOrbitEnabled();
    });
    return () => {
      orbitRef.current = null;
      stopEditor();
    };
  }, []);

  // Ao voltar da câmera fantasma, a órbita gira em torno do ponto para onde se estava olhando.
  useEffect(() => {
    const orbit = controls.current;
    if (!orbit) return;
    const forward = camera.getWorldDirection(new Vector3());
    const distance = forward.y < -0.05 ? Math.min(frame.worldMeters, camera.position.y / -forward.y) : 20;
    orbit.target.copy(camera.position).addScaledVector(forward, distance);
    orbit.update();
    invalidate();
  }, [camera, frame.worldMeters, invalidate]);

  useEffect(
    () =>
      cameraStore.subscribe((current, previous) => {
        const command = current.command;
        const orbit = controls.current;
        if (!command || command === previous.command || !orbit) return;
        if (command.type === 'reset') {
          const view = defaultAerial(frame.worldMeters);
          camera.position.copy(view.position);
          orbit.target.copy(view.target);
        } else {
          const target = tokenWorld(command.tokenId);
          if (!target) return;
          const offset = camera.position.clone().sub(orbit.target).setLength(26);
          orbit.target.copy(target);
          camera.position.copy(target).add(offset);
        }
        orbit.update();
        invalidate();
      }),
    [camera, frame.worldMeters, invalidate],
  );

  const hudTimer = useRef(0);
  useFrame((_, dt) => {
    hudTimer.current += dt;
    if (hudTimer.current > 0.2) {
      hudTimer.current = 0;
      publishHud(camera.position, 0, 0);
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping={false}
      maxPolarAngle={Math.PI / 2 - 0.03}
      minDistance={6}
      maxDistance={frame.worldMeters * 2.2}
      screenSpacePanning={false}
    />
  );
}

export function CameraRig() {
  const mode = useEditor((s) => s.cameraMode);
  const frame = useEditor((s) => s.frame);
  const { camera, invalidate } = useThree();

  // Enquadra o mapa ao abrir o 3D. O alcance de visão acompanha o tamanho do mapa.
  const framed = useRef(false);
  useEffect(() => {
    if (framed.current) return;
    framed.current = true;
    const view = defaultAerial(frame.worldMeters);
    camera.position.copy(view.position);
    camera.lookAt(view.target);
    invalidate();
  }, [camera, frame.worldMeters, invalidate]);

  // "Visão padrão" sempre leva de volta à câmera aérea enquadrada.
  useEffect(
    () =>
      cameraStore.subscribe((current, previous) => {
        if (current.command?.type === 'reset' && current.command !== previous.command && editorStore.getState().cameraMode === 'ghost') {
          const view = defaultAerial(frame.worldMeters);
          camera.position.copy(view.position);
          camera.lookAt(view.target);
          setEditor({ cameraMode: 'aerial' });
        }
      }),
    [camera, frame.worldMeters],
  );

  return mode === 'ghost' ? <GhostController key="ghost" /> : <AerialController key="aerial" />;
}
