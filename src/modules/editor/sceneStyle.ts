// Regras visuais compartilhadas entre 2D e 3D, para os dois modos mostrarem o mesmo significado.
import { CATEGORY_COLOR } from '../abilities/taxonomy';
import type { AbilityCategory, Team } from '../strategy/schema';
import type { UtilityState } from '../timeline/simulate';

export const TEAM_COLOR: Record<Team, string> = {
  attack: '#ef3b48',
  defense: '#2fc4d6',
};

export const categoryColor = (category: AbilityCategory): string => CATEGORY_COLOR[category];

/**
 * Parado, tudo fica visível para planejar, com o que ainda não aconteceu em tom apagado.
 * Reproduzindo, só aparece o que está ativo naquele instante.
 */
export function utilityOpacity(state: UtilityState | undefined, playing: boolean): number {
  if (!state) return 1;
  if (state.active) return 1;
  return playing ? 0 : 0.25;
}

export const stripTags = (text: string | null | undefined): string =>
  (text ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

export const SLOT_KEY: Record<string, string> = {
  Grenade: 'C',
  Ability1: 'Q',
  Ability2: 'E',
  Ultimate: 'X',
  Passive: 'Passiva',
};

export const SLOT_ORDER = ['Grenade', 'Ability1', 'Ability2', 'Ultimate', 'Passive'];

export const initials = (name: string): string => name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase();
