// Inventário do que está de fato na cena 3D, lido do grafo de objetos e não do documento.
// Os testes conferem por aqui que há bonecos e volumes, e leitores de tela recebem um resumo.
import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { createStore, useStore } from 'zustand';

export interface SceneItem {
  type: 'agent' | 'ability' | 'scenario';
  id?: string;
  /** Posição no mundo, em metros. */
  x: number;
  z: number;
  /** Rotação em torno do eixo vertical. */
  yaw: number;
  [key: string]: unknown;
}

const manifestStore = createStore<{ items: SceneItem[] }>(() => ({ items: [] }));

const position = new Vector3();
const round = (value: number) => Number(value.toFixed(3));

/**
 * Publica o inventário depois das mudanças, no máximo a cada 80 ms. O temporizador não é reiniciado
 * a cada mudança: reproduzindo, elas vêm a cada quadro e ele nunca chegaria a disparar.
 */
export function SceneManifestBridge() {
  const scene = useThree((s) => s.scene);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Sem dependências de propósito: roda a cada renderização de Objects, que é quando a cena muda.
  useEffect(() => {
    if (pending.current !== null) return;
    pending.current = setTimeout(() => {
      pending.current = null;
      const items: SceneItem[] = [];
      scene.traverse((object) => {
        const tactical = object.userData.tactical as Partial<SceneItem> | undefined;
        if (!tactical) return;
        object.getWorldPosition(position);
        items.push({ ...tactical, type: tactical.type!, x: round(position.x), z: round(position.z), yaw: round(object.rotation.y) });
      });
      manifestStore.setState({ items });
    }, 80);
  });
  useEffect(
    () => () => {
      if (pending.current !== null) clearTimeout(pending.current);
      pending.current = null;
      manifestStore.setState({ items: [] });
    },
    [],
  );
  return null;
}

export function SceneManifestSummary() {
  const items = useStore(manifestStore, (s) => s.items);
  const agents = items.filter((item) => item.type === 'agent');
  const abilities = items.filter((item) => item.type === 'ability');
  return (
    <p className="sr-only" data-testid="scene-manifest" data-items={JSON.stringify(items)}>
      Cena 3D com {agents.length} {agents.length === 1 ? 'agente' : 'agentes'} e {abilities.length} {abilities.length === 1 ? 'habilidade' : 'habilidades'}.
    </p>
  );
}
