// Sincronização opcional com a conta: junta os dados do navegador e do servidor pelo mais recente.
// A regra de comparação é pura e testada em tests/services.test.ts.
import type { SupabaseClient } from '@supabase/supabase-js';
import { dbGetAll, dbPut, kvGet, kvSet } from '../persistence/idb';
import { listStrategies, saveStrategy, TOMBSTONES_KEY } from '../persistence/strategyRepo';
import { LINEUP_TOMBSTONES_KEY, type Lineup, parseLineup } from '../library/lineupRepo';
import { parseStrategy, type StrategyDoc } from '../strategy/schema';
import { getSupabase } from './supabase';

export interface SyncPlan<T> {
  upload: T[];
  download: T[];
  deleteRemote: string[];
}

interface Stamped {
  id: string;
  updatedAt: number;
}

/**
 * Compara os dois lados. O registro mais recente vence, e exclusões locais têm efeito no servidor.
 * Nada some em silêncio: um item remoto só é apagado aqui se foi apagado neste navegador antes.
 */
export function planSync<T extends Stamped>(local: T[], remote: T[], tombstones: Record<string, number>): SyncPlan<T> {
  const plan: SyncPlan<T> = { upload: [], download: [], deleteRemote: [] };
  const remoteById = new Map(remote.map((item) => [item.id, item]));
  const localById = new Map(local.map((item) => [item.id, item]));
  for (const item of local) {
    const other = remoteById.get(item.id);
    if (!other || item.updatedAt > other.updatedAt) plan.upload.push(item);
  }
  for (const item of remote) {
    const deletedAt = tombstones[item.id];
    if (deletedAt !== undefined && deletedAt >= item.updatedAt) {
      plan.deleteRemote.push(item.id);
      continue;
    }
    const other = localById.get(item.id);
    if (!other || item.updatedAt > other.updatedAt) plan.download.push(item);
  }
  return plan;
}

const requireClient = (): SupabaseClient => {
  const client = getSupabase();
  if (!client) throw new Error('A conta online não está configurada neste site.');
  return client;
};

export interface SyncReport {
  uploaded: number;
  downloaded: number;
  deleted: number;
  invalid: number;
}

export async function syncStrategies(userId: string): Promise<SyncReport> {
  const client = requireClient();
  const { data, error } = await client.from('strategies').select('doc');
  if (error) throw new Error(`Não foi possível ler as estratégias da conta: ${error.message}`);
  let invalid = 0;
  const remote: StrategyDoc[] = [];
  for (const row of (data ?? []) as Array<{ doc: unknown }>) {
    const parsed = parseStrategy(row.doc);
    if (parsed.ok) remote.push(parsed.doc);
    else invalid++;
  }
  const { strategies: local } = await listStrategies();
  const tombstones = (await kvGet<Record<string, number>>(TOMBSTONES_KEY)) ?? {};
  const plan = planSync(local, remote, tombstones);

  if (plan.upload.length) {
    const rows = plan.upload.map((doc) => ({
      owner: userId,
      id: doc.id,
      name: doc.name,
      map_id: doc.mapId,
      side: doc.side,
      doc,
      updated_at: new Date(doc.updatedAt).toISOString(),
    }));
    const { error: upsertError } = await client.from('strategies').upsert(rows);
    if (upsertError) throw new Error(`Não foi possível enviar as estratégias: ${upsertError.message}`);
  }
  for (const doc of plan.download) await saveStrategy(doc);
  if (plan.deleteRemote.length) {
    const { error: deleteError } = await client.from('strategies').delete().in('id', plan.deleteRemote);
    if (deleteError) throw new Error(`Não foi possível apagar as estratégias da conta: ${deleteError.message}`);
  }
  await kvSet(TOMBSTONES_KEY, {});
  return { uploaded: plan.upload.length, downloaded: plan.download.length, deleted: plan.deleteRemote.length, invalid };
}

/** Imagens ficam neste navegador, para não estourar o espaço gratuito do banco. */
const withoutImages = (lineup: Lineup): Lineup => ({ ...lineup, images: [] });

export async function syncLineups(userId: string): Promise<SyncReport> {
  const client = requireClient();
  const { data, error } = await client.from('lineups').select('doc');
  if (error) throw new Error(`Não foi possível ler as lineups da conta: ${error.message}`);
  let invalid = 0;
  const remote: Lineup[] = [];
  for (const row of (data ?? []) as Array<{ doc: unknown }>) {
    const parsed = parseLineup(row.doc);
    if (parsed) remote.push(parsed);
    else invalid++;
  }
  const local = (await dbGetAll<unknown>('lineups')).map(parseLineup).filter((item): item is Lineup => item !== null);
  const tombstones = (await kvGet<Record<string, number>>(LINEUP_TOMBSTONES_KEY)) ?? {};
  const plan = planSync(local, remote, tombstones);
  const localById = new Map(local.map((item) => [item.id, item]));

  if (plan.upload.length) {
    const rows = plan.upload.map((lineup) => ({
      owner: userId,
      id: lineup.id,
      map_id: lineup.mapId,
      doc: withoutImages(lineup),
      updated_at: new Date(lineup.updatedAt).toISOString(),
    }));
    const { error: upsertError } = await client.from('lineups').upsert(rows);
    if (upsertError) throw new Error(`Não foi possível enviar as lineups: ${upsertError.message}`);
  }
  for (const lineup of plan.download) {
    await dbPut('lineups', { ...lineup, images: localById.get(lineup.id)?.images ?? [] });
  }
  if (plan.deleteRemote.length) {
    const { error: deleteError } = await client.from('lineups').delete().in('id', plan.deleteRemote);
    if (deleteError) throw new Error(`Não foi possível apagar as lineups da conta: ${deleteError.message}`);
  }
  await kvSet(LINEUP_TOMBSTONES_KEY, {});
  return { uploaded: plan.upload.length, downloaded: plan.download.length, deleted: plan.deleteRemote.length, invalid };
}

