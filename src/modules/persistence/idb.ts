// Camada fina sobre IndexedDB. Sem IndexedDB (modo privado restrito, por exemplo), cai para
// memória e avisa: o app continua utilizável, mas os dados não sobrevivem ao recarregamento.
const DB_NAME = 'tacticlab';
const DB_VERSION = 1;

export type StoreName = 'strategies' | 'folders' | 'versions' | 'lineups' | 'kv';

const KEY_PATHS: Record<StoreName, string> = {
  strategies: 'id',
  folders: 'id',
  versions: 'id',
  lineups: 'id',
  kv: 'key',
};

let dbPromise: Promise<IDBDatabase> | null = null;
let memoryFallback = false;
const memory = new Map<StoreName, Map<string, unknown>>();

export const isPersistent = (): boolean => !memoryFallback;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [name, keyPath] of Object.entries(KEY_PATHS)) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath });
          if (name === 'versions') store.createIndex('strategyId', 'strategyId');
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falha ao abrir IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB bloqueado por outra aba'));
  });
  return dbPromise;
}

async function withStore<T>(
  name: StoreName,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const request = run(tx.objectStore(name));
    let result: T;
    request.onsuccess = () => {
      result = request.result;
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error('Falha na transação'));
    tx.onabort = () => reject(tx.error ?? new Error('Transação abortada'));
  });
}

function memStore(name: StoreName): Map<string, unknown> {
  let store = memory.get(name);
  if (!store) {
    store = new Map();
    memory.set(name, store);
  }
  return store;
}

async function guarded<T>(idb: () => Promise<T>, fallback: () => T): Promise<T> {
  if (memoryFallback) return fallback();
  try {
    return await idb();
  } catch (error) {
    // Cota excedida é erro de uso real e precisa chegar à interface.
    if (error instanceof DOMException && error.name === 'QuotaExceededError') throw error;
    memoryFallback = true;
    return fallback();
  }
}

export function dbPut<T extends object>(name: StoreName, value: T): Promise<void> {
  return guarded(
    () => withStore(name, 'readwrite', (store) => store.put(value)).then(() => undefined),
    () => {
      memStore(name).set(String((value as Record<string, unknown>)[KEY_PATHS[name]]), value);
    },
  );
}

export function dbGet<T>(name: StoreName, key: string): Promise<T | undefined> {
  return guarded(
    () => withStore<T | undefined>(name, 'readonly', (store) => store.get(key) as IDBRequest<T | undefined>),
    () => memStore(name).get(key) as T | undefined,
  );
}

export function dbGetAll<T>(name: StoreName): Promise<T[]> {
  return guarded(
    () => withStore<T[]>(name, 'readonly', (store) => store.getAll() as IDBRequest<T[]>),
    () => [...memStore(name).values()] as T[],
  );
}

export function dbDelete(name: StoreName, key: string): Promise<void> {
  return guarded(
    () => withStore(name, 'readwrite', (store) => store.delete(key)).then(() => undefined),
    () => {
      memStore(name).delete(key);
    },
  );
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const row = await dbGet<{ key: string; value: T }>('kv', key);
  return row?.value;
}

export function kvSet<T>(key: string, value: T): Promise<void> {
  return dbPut('kv', { key, value });
}

/** Só para testes: fecha a conexão e reinicia o estado do módulo. */
export function resetDbForTests(): void {
  dbPromise?.then((db) => db.close()).catch(() => undefined);
  dbPromise = null;
  memoryFallback = false;
  memory.clear();
}
