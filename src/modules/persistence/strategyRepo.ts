// Estratégias, pastas e histórico de versões salvos no navegador.
// Todo registro lido é revalidado: um item corrompido é ignorado sem derrubar a lista.
import { newId } from '../strategy/factory';
import { parseStrategy, type StrategyDoc } from '../strategy/schema';
import { dbDelete, dbGet, dbGetAll, dbPut, kvGet, kvSet } from './idb';
import { clearJournal, readJournals } from './journal';

export const TOMBSTONES_KEY = 'tombstones:strategies';

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

export interface StrategyVersion {
  id: string;
  strategyId: string;
  label: string;
  createdAt: number;
  doc: StrategyDoc;
}

const MAX_VERSIONS = 30;

/** Aplica o que ficou no diário quando a página fechou antes de terminar de salvar. */
async function recoverJournals(): Promise<void> {
  for (const doc of readJournals()) {
    const row = await dbGet<unknown>('strategies', doc.id);
    const parsed = row ? parseStrategy(row) : null;
    if (!parsed?.ok || doc.updatedAt > parsed.doc.updatedAt) await dbPut('strategies', doc);
    clearJournal(doc.id);
  }
}

export async function listStrategies(): Promise<{ strategies: StrategyDoc[]; corrupted: number }> {
  await recoverJournals();
  const rows = await dbGetAll<unknown>('strategies');
  const strategies: StrategyDoc[] = [];
  let corrupted = 0;
  for (const row of rows) {
    const parsed = parseStrategy(row);
    if (parsed.ok) strategies.push(parsed.doc);
    else corrupted++;
  }
  strategies.sort((a, b) => b.updatedAt - a.updatedAt);
  return { strategies, corrupted };
}

export async function getStrategy(id: string): Promise<StrategyDoc | null> {
  await recoverJournals();
  const row = await dbGet<unknown>('strategies', id);
  if (!row) return null;
  const parsed = parseStrategy(row);
  return parsed.ok ? parsed.doc : null;
}

export const saveStrategy = (doc: StrategyDoc): Promise<void> => dbPut('strategies', doc);

export async function deleteStrategyLocal(id: string): Promise<void> {
  clearJournal(id);
  const versions = await listVersions(id);
  await Promise.all(versions.map((version) => dbDelete('versions', version.id)));
  await dbDelete('strategies', id);
}

/** Exclui e registra a exclusão, para que a sincronização também remova da conta. */
export async function deleteStrategy(id: string): Promise<void> {
  await deleteStrategyLocal(id);
  const tombstones = (await kvGet<Record<string, number>>(TOMBSTONES_KEY)) ?? {};
  await kvSet(TOMBSTONES_KEY, { ...tombstones, [id]: Date.now() });
}

export async function renameStrategy(id: string, name: string): Promise<void> {
  const doc = await getStrategy(id);
  if (doc) await saveStrategy({ ...doc, name, updatedAt: Date.now() });
}

export async function moveStrategy(id: string, folderId: string | null): Promise<void> {
  const doc = await getStrategy(id);
  if (doc) await saveStrategy({ ...doc, folderId, updatedAt: Date.now() });
}

export async function duplicateStrategy(id: string): Promise<StrategyDoc | null> {
  const doc = await getStrategy(id);
  if (!doc) return null;
  const now = Date.now();
  const copy: StrategyDoc = { ...doc, id: newId(), name: `${doc.name} (cópia)`, createdAt: now, updatedAt: now };
  await saveStrategy(copy);
  return copy;
}

export const listFolders = async (): Promise<Folder[]> =>
  (await dbGetAll<Folder>('folders')).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

export async function createFolder(name: string): Promise<Folder> {
  const folder: Folder = { id: newId(), name, createdAt: Date.now() };
  await dbPut('folders', folder);
  return folder;
}

export const renameFolder = (folder: Folder, name: string): Promise<void> => dbPut('folders', { ...folder, name });

/** Excluir uma pasta não exclui estratégias: elas voltam para "Sem pasta". */
export async function deleteFolder(id: string): Promise<void> {
  const { strategies } = await listStrategies();
  await Promise.all(
    strategies.filter((doc) => doc.folderId === id).map((doc) => saveStrategy({ ...doc, folderId: null })),
  );
  await dbDelete('folders', id);
}

export async function listVersions(strategyId: string): Promise<StrategyVersion[]> {
  const rows = await dbGetAll<StrategyVersion>('versions');
  return rows.filter((row) => row.strategyId === strategyId).sort((a, b) => b.createdAt - a.createdAt);
}

export async function addVersion(doc: StrategyDoc, label: string): Promise<StrategyVersion> {
  const version: StrategyVersion = { id: newId(), strategyId: doc.id, label, createdAt: Date.now(), doc };
  await dbPut('versions', version);
  const existing = await listVersions(doc.id);
  await Promise.all(existing.slice(MAX_VERSIONS).map((old) => dbDelete('versions', old.id)));
  return version;
}
