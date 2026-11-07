// Peças compartilhadas pelos renderizadores de objetos da cena 3D.
import { useEffect, useRef, type RefObject } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Vector3, type Group, type Object3D } from 'three';
import type { MapPoint } from '../coordinates';
import { editorStore, useEditor } from '../editor/editorStore';
import { interaction, type Hit } from '../editor/interaction';
import { ignoreSceneEvent, syncOrbitEnabled } from '../ghostcam/CameraRig';
import { Billboard } from './Billboard';
import { dotTexture } from './labels';

/** Distância a partir da qual o objeto cresce para manter um tamanho legível na tela. */
export const SCREEN_SCALE = 40;

/** Objetos pequenos crescem mais cedo: um boneco de 1,8 m some na visão aérea. */
const MODEL_SCREEN_SCALE = 24;

export function useGround() {
  const map = useEditor((s) => s.map);
  const frame = useEditor((s) => s.frame);
  return { heights: map?.heights ?? null, frame };
}

/** Dispara o controlador único com o objeto atingido, travando a órbita durante o arrasto. */
export function makeDown(hit: Hit) {
  return (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 || ignoreSceneEvent(event.nativeEvent.pointerType)) return;
    event.stopPropagation();
    const { frame } = editorStore.getState();
    const point = { x: event.point.x / frame.worldMeters + 0.5, y: event.point.z / frame.worldMeters + 0.5 };
    interaction.down(point, hit, { shift: event.shiftKey });
    syncOrbitEnabled();
  };
}

export function useDisposed<T extends { dispose: () => void }>(value: T): T {
  useEffect(() => () => value.dispose(), [value]);
  return value;
}

export function Handle3D({ point, hit, color = '#ffffff' }: { point: MapPoint; hit: Hit; color?: string }) {
  return <Billboard point={point} lift={0.6} size={0.85} growFrom={SCREEN_SCALE} texture={dotTexture(color)} onPointerDown={makeDown(hit)} renderOrder={30} />;
}

const worldPosition = new Vector3();

/**
 * Mantém legível na visão aérea um objeto pequeno: em tamanho real de perto (câmera fantasma),
 * crescendo com a distância a partir de MODEL_SCREEN_SCALE.
 */
export function useScreenScale(ref: RefObject<Object3D | null>): void {
  useFrame(({ camera }) => {
    const object = ref.current;
    if (!object) return;
    object.getWorldPosition(worldPosition);
    object.scale.setScalar(Math.max(1, camera.position.distanceTo(worldPosition) / MODEL_SCREEN_SCALE));
  });
}

export function useScaledGroup() {
  const ref = useRef<Group>(null);
  useScreenScale(ref);
  return ref;
}

export const noRaycast = () => null;
