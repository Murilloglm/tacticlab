// Agente no 3D: boneco com posição e direção vindas da mesma simulação usada pelo 2D.
import { useMemo } from 'react';
import { DoubleSide, MeshLambertMaterial, RingGeometry, ShapeGeometry, Shape, type CanvasTexture } from 'three';
import { headingToWorld, mapToWorld, metersToMapUnits } from '../../coordinates';
import { findAgent, useCatalog } from '../../catalog/catalogStore';
import { initials, TEAM_COLOR } from '../../editor/sceneStyle';
import type { AgentToken } from '../../strategy/schema';
import type { AgentPose } from '../../timeline/simulate';
import { useImage } from '../../../ui/useImage';
import { labelTexture, tokenTexture } from '../labels';
import { Handle3D, makeDown, noRaycast, useDisposed, useGround, useScaledGroup } from '../sceneHelpers';
import { agentGeometry, agentModelFor } from './agentModels';

// Compartilhados entre os agentes e entre trocas de modo: nunca descartados.
const BODY_MATERIAL = new MeshLambertMaterial({ vertexColors: true });
const SELECTED_MATERIAL = new MeshLambertMaterial({ vertexColors: true, emissive: '#ffffff', emissiveIntensity: 0.28 });
const BASE_RING = new RingGeometry(0.46, 0.58, 24).rotateX(-Math.PI / 2);
const SELECTED_RING = new RingGeometry(0.68, 0.8, 24).rotateX(-Math.PI / 2);
const FACING_WEDGE = (() => {
  const shape = new Shape();
  shape.moveTo(0.62, -0.22);
  shape.lineTo(1.2, 0);
  shape.lineTo(0.62, 0.22);
  shape.closePath();
  return new ShapeGeometry(shape).rotateX(-Math.PI / 2);
})();

/** Distância da alça de rotação: fica fora do boneco mesmo na visão aérea. */
const ROTATE_HANDLE_M = 7;

export function AgentModel3D({ agent, pose, selected }: { agent: AgentToken; pose: AgentPose; selected: boolean }) {
  const catalog = useCatalog((s) => s.catalog);
  const info = findAgent(catalog, agent.agentUuid);
  const { image } = useImage(info?.displayIcon);
  const { frame, heights } = useGround();
  const scaled = useScaledGroup();
  const color = TEAM_COLOR[agent.team];
  const model = agentModelFor(agent.agentUuid);
  const name = info?.displayName ?? 'Agente';

  const portrait = useDisposed(
    useMemo<CanvasTexture>(() => tokenTexture({ image, ring: color, fallback: initials(name), selected }), [image, color, name, selected]),
  );
  const label = labelTexture(name, { color: '#ffffff', weight: 600 });

  const ground = heights?.heightAt(pose.point) ?? 0;
  const [fx, , fz] = headingToWorld(pose.facing);
  const hit = makeDown({ kind: 'entity', ref: { c: 'agents', id: agent.id } });

  return (
    <>
      <group
      position={mapToWorld(pose.point, frame, ground)}
      rotation={[0, -pose.facing, 0]}
      userData={{ tactical: { type: 'agent', id: agent.id, name, team: agent.team, model: model.id, selected } }}
    >
      <group ref={scaled}>
        <mesh geometry={agentGeometry(model, agent.team)} material={selected ? SELECTED_MATERIAL : BODY_MATERIAL} rotation={[0, 0, pose.moving ? -0.14 : 0]} name="agent-body" onPointerDown={hit} />
        {/* Alvo maior que o corpo: o boneco é fino demais para clicar com precisão. */}
        <mesh position={[0, 0.95, 0]} visible={false} onPointerDown={hit}>
          <cylinderGeometry args={[0.75, 0.75, 1.9, 6]} />
        </mesh>
        <mesh geometry={BASE_RING} position={[0, 0.07, 0]} raycast={noRaycast}>
          <meshBasicMaterial color={color} side={DoubleSide} />
        </mesh>
        <mesh geometry={FACING_WEDGE} position={[0, 0.07, 0]} raycast={noRaycast}>
          <meshBasicMaterial color={color} side={DoubleSide} />
        </mesh>
        {selected && (
          <mesh geometry={SELECTED_RING} position={[0, 0.09, 0]} raycast={noRaycast} name="agent-selection">
            <meshBasicMaterial color="#ffffff" side={DoubleSide} />
          </mesh>
        )}
        <sprite position={[0, model.heightM + 0.42, 0]} scale={[0.55, 0.55, 1]} renderOrder={20} raycast={noRaycast}>
          <spriteMaterial map={portrait} transparent depthTest={false} depthWrite={false} />
        </sprite>
        <sprite position={[0, model.heightM + 0.03, 0]} scale={[0.26 * label.aspect, 0.26, 1]} renderOrder={21} raycast={noRaycast}>
          <spriteMaterial map={label.texture} transparent depthTest={false} depthWrite={false} />
        </sprite>
        </group>
      </group>
      {selected && (
        <Handle3D
          point={{ x: pose.point.x + metersToMapUnits(fx * ROTATE_HANDLE_M, frame), y: pose.point.y + metersToMapUnits(fz * ROTATE_HANDLE_M, frame) }}
          hit={{ kind: 'rotate', ref: { c: 'agents', id: agent.id } }}
        />
      )}
    </>
  );
}
