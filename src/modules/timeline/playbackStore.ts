// Relógio da simulação. Guarda só o tempo: tudo que aparece na tela é derivado dele.
import { createStore, useStore } from 'zustand';
import type { MapFrame } from '../coordinates';
import type { StrategyDoc } from '../strategy/schema';
import { contentEndMs } from './simulate';

export const PLAYBACK_RATES = [0.25, 0.5, 1, 1.5, 2];

export interface PlaybackState {
  timeMs: number;
  playing: boolean;
  rate: number;
}

export const playbackStore = createStore<PlaybackState>(() => ({ timeMs: 0, playing: false, rate: 1 }));

export const usePlayback = <T,>(selector: (state: PlaybackState) => T): T => useStore(playbackStore, selector);

/** A timeline nunca corta conteúdo: cresce quando há eventos depois da duração definida. */
export function effectiveDuration(doc: StrategyDoc, frame: MapFrame): number {
  return Math.max(doc.durationMs, contentEndMs(doc, frame));
}

export const playbackActions = {
  play() {
    playbackStore.setState({ playing: true });
  },
  pause() {
    playbackStore.setState({ playing: false });
  },
  toggle(durationMs: number) {
    const { playing, timeMs } = playbackStore.getState();
    // Reproduzir depois do fim recomeça do início.
    if (!playing && timeMs >= durationMs) playbackStore.setState({ timeMs: 0, playing: true });
    else playbackStore.setState({ playing: !playing });
  },
  restart() {
    playbackStore.setState({ timeMs: 0, playing: false });
  },
  seek(timeMs: number, durationMs: number) {
    playbackStore.setState({ timeMs: Math.max(0, Math.min(durationMs, timeMs)) });
  },
  step(deltaMs: number, durationMs: number) {
    const { timeMs } = playbackStore.getState();
    playbackStore.setState({ timeMs: Math.max(0, Math.min(durationMs, timeMs + deltaMs)), playing: false });
  },
  setRate(rate: number) {
    playbackStore.setState({ rate });
  },
  /** Avança o relógio. Retorna falso ao chegar no fim. */
  advance(elapsedMs: number, durationMs: number): boolean {
    const { timeMs, rate } = playbackStore.getState();
    const next = timeMs + elapsedMs * rate;
    if (next >= durationMs) {
      playbackStore.setState({ timeMs: durationMs, playing: false });
      return false;
    }
    playbackStore.setState({ timeMs: next });
    return true;
  },
  reset() {
    playbackStore.setState({ timeMs: 0, playing: false, rate: 1 });
  },
};
