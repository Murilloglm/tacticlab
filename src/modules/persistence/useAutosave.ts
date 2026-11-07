// Salvamento automático no navegador, com versões periódicas no histórico.
import { useEffect } from 'react';
import { createStore, useStore } from 'zustand';
import { docStore } from '../strategy/docStore';
import { clearJournal, writeJournal } from './journal';
import { addVersion, saveStrategy } from './strategyRepo';

type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

const statusStore = createStore<{ status: SaveStatus }>(() => ({ status: 'saved' }));
export const useSaveStatus = (): SaveStatus => useStore(statusStore, (s) => s.status);

const DEBOUNCE_MS = 500;
const AUTO_VERSION_MS = 5 * 60 * 1000;

let lastSavedRevision = 0;

async function persist(): Promise<void> {
  const { doc, revision } = docStore.getState();
  if (!doc) return;
  statusStore.setState({ status: 'saving' });
  try {
    await saveStrategy(doc);
    lastSavedRevision = revision;
    clearJournal(doc.id);
    if (docStore.getState().revision === revision) statusStore.setState({ status: 'saved' });
  } catch (error) {
    statusStore.setState({ status: 'error' });
    throw error;
  }
}

/** Salva agora e registra uma versão no histórico. */
export async function saveNow(label: string): Promise<void> {
  await persist();
  const { doc } = docStore.getState();
  if (doc) await addVersion(doc, label);
}

export function useAutosave(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastVersionAt = Date.now();
    lastSavedRevision = docStore.getState().revision;
    statusStore.setState({ status: 'saved' });

    const flush = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      const { doc, revision } = docStore.getState();
      if (!doc || revision === lastSavedRevision) return;
      // Grava primeiro no diário síncrono: o IndexedDB pode ser abortado com a página fechando.
      writeJournal(doc);
      void persist().catch(() => undefined);
    };

    const stop = docStore.subscribe((state, previous) => {
      if (state.revision === previous.revision || !state.doc) return;
      statusStore.setState({ status: 'dirty' });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void persist()
          .then(() => {
            if (Date.now() - lastVersionAt >= AUTO_VERSION_MS) {
              lastVersionAt = Date.now();
              const { doc } = docStore.getState();
              if (doc) void addVersion(doc, 'Salvamento automático').catch(() => undefined);
            }
          })
          .catch(() => undefined);
      }, DEBOUNCE_MS);
    });

    // Fechar a aba, recarregar ou trocar de aplicativo não pode perder o último ajuste.
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', flush);

    return () => {
      flush();
      stop();
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', flush);
    };
  }, [enabled]);
}
