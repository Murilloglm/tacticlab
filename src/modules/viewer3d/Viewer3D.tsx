import { useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Vector2, Raycaster, Vector3 } from 'three';
import { Line } from '@react-three/drei';
import { docStore, useDoc } from '../strategy/docStore';
import { editorStore, setEditor, useEditor } from '../editor/editorStore';
import { registerCapture } from '../editor/exportRegistry';
import { interaction, type Hit } from '../editor/interaction';
import { playbackStore, usePlayback } from '../timeline/playbackStore';
import { agentPoseAt, simulate } from '../timeline/simulate';
import { CameraRig, syncOrbitEnabled } from '../ghostcam/CameraRig';
import { TouchControls } from '../ghostcam/TouchControls';
import { useRoom } from '../multiplayer/roomStore';
import { distanceMeters, mapToWorld, type MapPoint } from '../coordinates';
import { isTextEntry } from '../../ui/dom';
import { Button } from '../../ui/kit';
import { MapModel } from './MapModel';
import { AgentModel3D } from './agents/AgentModel3D';
import { Utility3D } from './abilities/Utility3D';
import { Draft3D, Drawing3D, Route3D } from './entities3d';
import { SceneManifestBridge, SceneManifestSummary } from './sceneManifest';
import { rayToMapPoint } from './mapMeshes';
import { CameraHud } from './CameraHud';

/** Traduz o ponteiro para ponto de mapa durante arrastos e pré-visualizações. */
function PointerBridge() {
  const { camera, gl } = useThree();
  const raycaster = useMemo(() => new Raycaster(), []);

  useEffect(() => {
    const canvas = gl.domElement;
    const pointer = new Vector2();
    const center = new Vector2(0, 0);
    const locked = () => document.pointerLockElement === canvas;
    const cast = (ndc: Vector2) => {
      raycaster.setFromCamera(ndc, camera);
      const { frame, map } = editorStore.getState();
      return rayToMapPoint(raycaster.ray.origin, raycaster.ray.direction, frame, map?.heights ?? null);
    };
    // Com o mouse capturado, o cursor das ferramentas é a mira no centro da tela.
    const toPoint = (event: MouseEvent) => {
      if (locked()) return cast(center);
      const rect = canvas.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -(((event.clientY - rect.top) / rect.height) * 2 - 1));
      return cast(pointer);
    };
    const onMove = (event: PointerEvent) => {
      const point = toPoint(event);
      if (point) interaction.move(point);
    };
    const onUp = (event: PointerEvent) => {
      interaction.up(toPoint(event));
      syncOrbitEnabled();
    };
    const onCrosshairDown = (event: MouseEvent) => {
      if (!locked() || event.button !== 0) return;
      const point = cast(center);
      if (!point) return;
      interaction.down(point, pickAgent(point));
    };
    const onDouble = () => interaction.finish();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    canvas.addEventListener('mousedown', onCrosshairDown);
    canvas.addEventListener('dblclick', onDouble);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('mousedown', onCrosshairDown);
      canvas.removeEventListener('dblclick', onDouble);
    };
  }, [camera, gl, raycaster]);

  return null;
}

/** Agente perto do ponto da mira, para selecionar e mover na câmera fantasma. */
function pickAgent(point: MapPoint): Hit | null {
  const doc = docStore.getState().doc;
  const { frame, tool } = editorStore.getState();
  if (!doc || tool !== 'select') return null;
  const timeMs = playbackStore.getState().timeMs;
  for (const agent of Object.values(doc.agents)) {
    if (distanceMeters(agentPoseAt(agent, timeMs, frame).point, point, frame) <= 2) {
      return { kind: 'entity', ref: { c: 'agents', id: agent.id } };
    }
  }
  return null;
}

function CaptureBridge() {
  const { gl, scene, camera } = useThree();
  useEffect(
    () =>
      registerCapture(() => {
        gl.render(scene, camera);
        return gl.domElement.toDataURL('image/png');
      }),
    [gl, scene, camera],
  );
  return null;
}

function RemoteCursors3D() {
  const peers = useRoom((s) => s.peers);
  const selfId = useRoom((s) => s.clientId);
  const map = useEditor((s) => s.map);
  const frame = useEditor((s) => s.frame);
  return (
    <>
      {peers
        .filter((peer) => peer.clientId !== selfId && peer.cursor)
        .map((peer) => {
          const ground = map?.heights.heightAt(peer.cursor!) ?? 0;
          const base = mapToWorld(peer.cursor!, frame, ground + 0.1);
          return <Line key={peer.clientId} points={[base, [base[0], ground + 3, base[2]]]} color={peer.color} lineWidth={3} raycast={() => null} />;
        })}
    </>
  );
}

function Objects() {
  const doc = useDoc((s) => s.doc);
  const timeMs = usePlayback((s) => s.timeMs);
  const playing = usePlayback((s) => s.playing);
  const frame = useEditor((s) => s.frame);
  const selection = useEditor((s) => s.selection);
  const draft = useEditor((s) => s.draft);
  const drawColor = useEditor((s) => s.drawColor);

  const simulation = useMemo(() => (doc ? simulate(doc, timeMs, frame) : null), [doc, timeMs, frame]);
  if (!doc || !simulation) return null;
  const isSelected = (c: string, id: string) => selection.some((s) => s.c === c && s.id === id);

  return (
    <>
      {Object.values(doc.drawings).map((drawing) => (
        <Drawing3D key={drawing.id} drawing={drawing} selected={isSelected('drawings', drawing.id)} />
      ))}
      {Object.values(doc.utilities).map((utility) => (
        <Utility3D key={utility.id} utility={utility} state={simulation.utilities[utility.id]} playing={playing} selected={isSelected('utilities', utility.id)} />
      ))}
      {Object.values(doc.agents).map((agent) => (
        <Route3D key={agent.id} agent={agent} selected={isSelected('agents', agent.id)} />
      ))}
      {Object.values(doc.agents).map((agent) => {
        const pose = simulation.agents[agent.id];
        return pose ? <AgentModel3D key={agent.id} agent={agent} pose={pose} selected={isSelected('agents', agent.id)} /> : null;
      })}
      {draft && <Draft3D draft={draft} color={drawColor} />}
      <RemoteCursors3D />
      <SceneManifestBridge />
    </>
  );
}

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false);

export default function Viewer3D() {
  const cameraMode = useEditor((s) => s.cameraMode);
  const playing = usePlayback((s) => s.playing);
  const frame = useEditor((s) => s.frame);
  const map = useEditor((s) => s.map);
  const mapError = useEditor((s) => s.mapError);
  const [supported] = useState(webglAvailable);
  const [touch] = useState(isTouchDevice);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTextEntry(event.target)) return;
      if (event.code === 'KeyV' && !event.ctrlKey && !event.metaKey) {
        setEditor({ cameraMode: editorStore.getState().cameraMode === 'ghost' ? 'aerial' : 'ghost' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A fantasma não deve continuar ativa ao sair do 3D.
  useEffect(() => () => setEditor({ cameraMode: 'aerial' }), []);

  if (!supported) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center" data-testid="webgl-missing">
        <h2 className="display text-2xl">O modo 3D precisa de WebGL</h2>
        <p className="max-w-md text-ash">Este navegador ou dispositivo não ofereceu WebGL. A prancheta 2D continua funcionando com os mesmos dados.</p>
        <Button variant="primary" onClick={() => setEditor({ viewMode: '2d' })}>
          Voltar ao modo 2D
        </Button>
      </div>
    );
  }
  if (mapError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center" data-testid="geometry-error">
        <h2 className="display text-2xl">Este mapa ainda não tem cenário 3D</h2>
        <p className="max-w-md text-ash">{mapError}</p>
        <Button variant="primary" onClick={() => setEditor({ viewMode: '2d' })}>
          Voltar ao modo 2D
        </Button>
      </div>
    );
  }

  const initial = new Vector3(0, frame.worldMeters * 0.86, frame.worldMeters * 0.46);

  return (
    <div className="absolute inset-0" data-testid="viewer-3d" data-map-ready={Boolean(map)}>
      <Canvas
        frameloop={cameraMode === 'ghost' || playing ? 'always' : 'demand'}
        dpr={[1, 2]}
        camera={{ fov: 55, near: 0.2, far: frame.worldMeters * 6, position: initial.toArray() }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        style={{ touchAction: 'none' }}
      >
        <color attach="background" args={['#0c0d10']} />
        <hemisphereLight args={['#f4f6fb', '#5a606a', 1.6]} />
        <directionalLight position={[60, 120, 40]} intensity={1.7} />
        <directionalLight position={[-70, 60, -50]} intensity={0.55} />
        <MapModel />
        <Objects />
        <CameraRig />
        <PointerBridge />
        <CaptureBridge />
      </Canvas>
      <CameraHud />
      <SceneManifestSummary />
      {cameraMode === 'ghost' && touch && <TouchControls />}
    </div>
  );
}
