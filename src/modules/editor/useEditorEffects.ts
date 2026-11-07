import { useEffect } from 'react';
import { isTextEntry } from '../../ui/dom';
import { docActions, docStore } from '../strategy/docStore';
import { effectiveDuration, playbackActions, playbackStore } from '../timeline/playbackStore';
import { editorStore, setEditor } from './editorStore';
import { deleteSelection, duplicateSelection, interaction, setTool } from './interaction';

const duration = (): number => {
  const doc = docStore.getState().doc;
  return doc ? effectiveDuration(doc, editorStore.getState().frame) : 0;
};

/** Relógio da reprodução. Só avança o tempo; todo o resto deriva dele. */
export function usePlaybackLoop(): void {
  useEffect(() => {
    let frameId = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min(now - previous, 100);
      previous = now;
      if (playbackStore.getState().playing) playbackActions.advance(elapsed, duration());
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, []);
}

const TOOL_KEYS: Record<string, Parameters<typeof setTool>[0]> = {
  Digit1: 'select',
  Digit2: 'pan',
  Digit3: 'route',
  Digit4: 'line',
  Digit5: 'arrow',
  Digit6: 'freehand',
  Digit7: 'marker',
  Digit8: 'text',
  Digit9: 'area',
};

export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTextEntry(event.target)) return;

      const mod = event.ctrlKey || event.metaKey;
      const ghost = editorStore.getState().viewMode === '3d' && editorStore.getState().cameraMode === 'ghost';

      if (mod && event.code === 'KeyZ') {
        event.preventDefault();
        if (event.shiftKey) docActions.redo();
        else docActions.undo();
        return;
      }
      if (mod && event.code === 'KeyY') {
        event.preventDefault();
        docActions.redo();
        return;
      }
      if (mod && event.code === 'KeyD') {
        event.preventDefault();
        duplicateSelection();
        return;
      }
      if (event.code === 'Delete' || event.code === 'Backspace') {
        event.preventDefault();
        deleteSelection();
        return;
      }
      if (event.code === 'Enter') {
        interaction.finish();
        return;
      }
      if (event.code === 'Escape') {
        interaction.cancel();
        setEditor({ selection: [] });
        return;
      }
      // Na câmera fantasma, Espaço sobe. Fora dela, reproduz ou pausa.
      if (event.code === 'Space' && !ghost) {
        event.preventDefault();
        playbackActions.toggle(duration());
        return;
      }
      if (!mod && !ghost && TOOL_KEYS[event.code]) setTool(TOOL_KEYS[event.code]!);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
