// Mapas com layout tático. Cada um fica em um pedaço próprio do build, baixado só ao abrir o mapa.
// Para expandir: crie o arquivo do mapa nesta pasta e registre o UUID aqui. Os demais mapas continuam
// usando só a geometria gerada, sem nenhuma alteração.
import type { TacticalLayout } from './types';

const LAYOUTS: Partial<Record<string, () => Promise<TacticalLayout>>> = {
  // Ascent: mapa piloto.
  '7eaecc1b-4337-bbf6-6ab9-04b8f06b3319': () => import('./ascent').then((module) => module.ASCENT_LAYOUT),
};

export const hasTacticalLayout = (mapId: string): boolean => mapId in LAYOUTS;

export function loadTacticalLayout(mapId: string): Promise<TacticalLayout | null> {
  return LAYOUTS[mapId]?.() ?? Promise.resolve(null);
}
