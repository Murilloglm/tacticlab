// Mapas com layout tático. Cada um fica em um pedaço próprio do build, baixado só ao abrir o mapa.
// Para expandir: crie o arquivo do mapa nesta pasta e registre o UUID aqui. Os demais mapas continuam
// usando só a geometria gerada, sem nenhuma alteração.
import type { TacticalLayout } from './types';

const LAYOUTS: Partial<Record<string, () => Promise<TacticalLayout>>> = {
  // Ascent: mapa piloto.
  '7eaecc1b-4337-bbf6-6ab9-04b8f06b3319': () => import('./ascent').then((module) => module.ASCENT_LAYOUT),
  // Bind e Haven: mesmo padrão do piloto.
  '2c9d57ec-4431-9c5e-2939-8f9ef6dd5cba': () => import('./bind').then((module) => module.BIND_LAYOUT),
  '2bee0dc9-4ffe-519b-1cbd-7fbe763a6047': () => import('./haven').then((module) => module.HAVEN_LAYOUT),
};

export const hasTacticalLayout = (mapId: string): boolean => mapId in LAYOUTS;

export function loadTacticalLayout(mapId: string): Promise<TacticalLayout | null> {
  return LAYOUTS[mapId]?.() ?? Promise.resolve(null);
}
