// Diário de emergência para o último ajuste antes de a página fechar.
//
// O navegador aborta transações do IndexedDB em andamento quando a página é descarregada, então
// gravar nele ao sair não é confiável. O localStorage é síncrono: o que for escrito no pagehide
// fica guardado. Na próxima abertura, a entrada mais nova que a salva é aplicada e removida.
import { parseStrategy, type StrategyDoc } from '../strategy/schema';

const PREFIX = 'tacticlab:journal:';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Alguns modos privados bloqueiam até o acesso à propriedade.
    return null;
  }
}

export function writeJournal(doc: StrategyDoc): void {
  try {
    storage()?.setItem(PREFIX + doc.id, JSON.stringify(doc));
  } catch {
    // Cota cheia: resta a tentativa normal de gravar no IndexedDB.
  }
}

export function clearJournal(id: string): void {
  try {
    storage()?.removeItem(PREFIX + id);
  } catch {
    // Nada a fazer: a entrada será ignorada por ser mais antiga que a salva.
  }
}

/** Entradas válidas do diário. As corrompidas são descartadas. */
export function readJournals(): StrategyDoc[] {
  const store = storage();
  if (!store) return [];
  const docs: StrategyDoc[] = [];
  for (let i = store.length - 1; i >= 0; i--) {
    const key = store.key(i);
    if (!key?.startsWith(PREFIX)) continue;
    try {
      const parsed = parseStrategy(JSON.parse(store.getItem(key) ?? 'null'));
      if (parsed.ok) docs.push(parsed.doc);
      else store.removeItem(key);
    } catch {
      store.removeItem(key);
    }
  }
  return docs;
}
