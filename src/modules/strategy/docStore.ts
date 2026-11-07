// Documento aberto no editor. Toda alteração vira um conjunto de `Change`s, o que dá
// desfazer/refazer, autosave e sincronização multiplayer pelo mesmo caminho.
import { createStore, useStore } from 'zustand';
import type { CollectionName, Entity, MetaKey, StrategyDoc } from './schema';

export type Change =
  | { c: CollectionName; id: string; before: Entity | null; after: Entity | null }
  | { c: 'meta'; key: MetaKey; before: unknown; after: unknown };

export type ChangeInput =
  | { c: CollectionName; id: string; after: Entity | null }
  | { c: 'meta'; key: MetaKey; after: unknown };

export type ChangeOrigin = 'local' | 'undo' | 'redo' | 'remote';

export interface DocState {
  doc: StrategyDoc | null;
  readOnly: boolean;
  /** Muda a cada alteração; o autosave observa este contador. */
  revision: number;
  past: Change[][];
  future: Change[][];
}

const MAX_HISTORY = 200;

export const docStore = createStore<DocState>(() => ({
  doc: null,
  readOnly: false,
  revision: 0,
  past: [],
  future: [],
}));

export const useDoc = <T,>(selector: (state: DocState) => T): T => useStore(docStore, selector);

type ChangeListener = (changes: Change[], origin: ChangeOrigin) => void;
const listeners = new Set<ChangeListener>();

export function subscribeChanges(listener: ChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let coalesceKey: string | null = null;

function applyToDoc(doc: StrategyDoc, changes: Change[]): StrategyDoc {
  const next: StrategyDoc = { ...doc, updatedAt: Date.now() };
  const touched = new Set<CollectionName>();
  for (const change of changes) {
    if (change.c === 'meta') {
      (next as unknown as Record<string, unknown>)[change.key] = change.after;
      continue;
    }
    if (!touched.has(change.c)) {
      (next as unknown as Record<string, unknown>)[change.c] = { ...next[change.c] };
      touched.add(change.c);
    }
    const collection = next[change.c] as Record<string, Entity>;
    if (change.after === null) delete collection[change.id];
    else collection[change.id] = change.after;
  }
  return next;
}

function resolve(doc: StrategyDoc, input: ChangeInput): Change {
  if (input.c === 'meta') return { c: 'meta', key: input.key, before: doc[input.key], after: input.after };
  const current = (doc[input.c] as Record<string, Entity>)[input.id] ?? null;
  return { c: input.c, id: input.id, before: current, after: input.after };
}

const invert = (change: Change): Change =>
  change.c === 'meta'
    ? { ...change, before: change.after, after: change.before }
    : { ...change, before: change.after, after: change.before };

const sameTarget = (a: Change, b: Change): boolean =>
  a.c === 'meta' ? b.c === 'meta' && a.key === b.key : b.c !== 'meta' && a.c === b.c && a.id === b.id;

export const docActions = {
  load(doc: StrategyDoc, options: { readOnly?: boolean } = {}) {
    coalesceKey = null;
    docStore.setState({ doc, readOnly: options.readOnly ?? false, revision: 0, past: [], future: [] });
  },

  clear() {
    coalesceKey = null;
    docStore.setState({ doc: null, readOnly: false, revision: 0, past: [], future: [] });
  },

  setReadOnly(readOnly: boolean) {
    docStore.setState({ readOnly });
  },

  /**
   * Aplica alterações locais. `coalesce` junta atualizações contínuas (arrastar um agente)
   * em um único passo de desfazer, até `endGesture` ou uma chave diferente.
   */
  change(inputs: ChangeInput[], options: { coalesce?: string } = {}): boolean {
    const state = docStore.getState();
    if (!state.doc || state.readOnly || inputs.length === 0) return false;
    const changes = inputs.map((input) => resolve(state.doc!, input));
    const doc = applyToDoc(state.doc, changes);
    let past = state.past;
    const key = options.coalesce ?? null;
    if (key && key === coalesceKey && past.length > 0) {
      const last = past[past.length - 1]!;
      const merged = [...last];
      for (const change of changes) {
        const index = merged.findIndex((m) => sameTarget(m, change));
        if (index >= 0) merged[index] = { ...change, before: merged[index]!.before } as Change;
        else merged.push(change);
      }
      past = [...past.slice(0, -1), merged];
    } else {
      past = [...past, changes].slice(-MAX_HISTORY);
    }
    coalesceKey = key;
    docStore.setState({ doc, past, future: [], revision: state.revision + 1 });
    listeners.forEach((listener) => listener(changes, 'local'));
    return true;
  },

  endGesture() {
    coalesceKey = null;
  },

  undo() {
    const state = docStore.getState();
    const last = state.past[state.past.length - 1];
    if (!state.doc || state.readOnly || !last) return;
    coalesceKey = null;
    const changes = [...last].reverse().map(invert);
    docStore.setState({
      doc: applyToDoc(state.doc, changes),
      past: state.past.slice(0, -1),
      future: [...state.future, last],
      revision: state.revision + 1,
    });
    listeners.forEach((listener) => listener(changes, 'undo'));
  },

  redo() {
    const state = docStore.getState();
    const next = state.future[state.future.length - 1];
    if (!state.doc || state.readOnly || !next) return;
    coalesceKey = null;
    docStore.setState({
      doc: applyToDoc(state.doc, next),
      past: [...state.past, next],
      future: state.future.slice(0, -1),
      revision: state.revision + 1,
    });
    listeners.forEach((listener) => listener(next, 'redo'));
  },

  /** Alterações vindas de outro participante. Não entram no histórico de desfazer. */
  applyRemote(inputs: ChangeInput[]) {
    const state = docStore.getState();
    if (!state.doc || inputs.length === 0) return;
    const changes = inputs.map((input) => resolve(state.doc!, input));
    docStore.setState({ doc: applyToDoc(state.doc, changes), revision: state.revision + 1 });
    listeners.forEach((listener) => listener(changes, 'remote'));
  },

  /** Substitui o documento inteiro (restauração de versão ou estado recebido da sala). */
  replace(doc: StrategyDoc, options: { keepHistory?: boolean } = {}) {
    const state = docStore.getState();
    coalesceKey = null;
    docStore.setState({
      doc,
      revision: state.revision + 1,
      past: options.keepHistory ? state.past : [],
      future: options.keepHistory ? state.future : [],
    });
  },
};
