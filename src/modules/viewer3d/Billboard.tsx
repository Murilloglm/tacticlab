// Sprite que sempre encara a câmera e mantém um tamanho legível a qualquer distância.
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import type { Sprite, Texture } from 'three';
import { mapToWorld, type MapPoint } from '../coordinates';
import { useEditor } from '../editor/editorStore';

interface BillboardProps {
  point: MapPoint;
  /** Altura acima do piso, em metros. */
  lift: number;
  /** Altura do sprite em metros quando visto de perto. */
  size: number;
  texture: Texture | { texture: Texture; aspect: number };
  opacity?: number;
  /** O sprite passa a crescer com a distância a partir deste valor. */
  growFrom?: number;
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
  renderOrder?: number;
  /** Âncora vertical do sprite. Acima de 1, ele fica abaixo do ponto e acompanha a escala. */
  anchorY?: number;
}

const noRaycast = () => null;

export function Billboard({ point, lift, size, texture, opacity = 1, growFrom = 26, onPointerDown, renderOrder = 10, anchorY = 0.5 }: BillboardProps) {
  const sprite = useRef<Sprite>(null);
  const map = useEditor((s) => s.map);
  const frame = useEditor((s) => s.frame);
  const ground = map?.heights.heightAt(point) ?? 0;
  const position = mapToWorld(point, frame, ground + lift);
  const resolved = 'aspect' in texture ? texture : { texture, aspect: 1 };
  const aspect = resolved.aspect;

  useFrame(({ camera }) => {
    const current = sprite.current;
    if (!current) return;
    const distance = camera.position.distanceTo(current.position);
    const scale = size * Math.max(1, distance / growFrom);
    current.scale.set(scale * aspect, scale, 1);
  });

  return (
    <sprite
      ref={sprite}
      position={position}
      scale={[size * aspect, size, 1]}
      renderOrder={renderOrder}
      center={[0.5, anchorY]}
      {...(onPointerDown ? { onPointerDown } : { raycast: noRaycast })}
    >
      <spriteMaterial map={resolved.texture} transparent opacity={opacity} depthTest={false} depthWrite={false} sizeAttenuation />
    </sprite>
  );
}
