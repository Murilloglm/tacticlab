// Biblioteca de lineups do usuário. Não existe status "oficial": o máximo que o app afirma
// é que a própria pessoa testou a lineup, e em qual versão do jogo.
import { z } from 'zod';
import { dbDelete, dbGetAll, dbPut, kvGet, kvSet } from '../persistence/idb';
import { newId } from '../strategy/factory';
import { pointSchema } from '../strategy/schema';

export const LINEUP_TOMBSTONES_KEY = 'tombstones:lineups';
export const MAX_LINEUP_IMAGES = 4;

export const lineupStatusSchema = z.enum(['unverified', 'self-tested']);

export const lineupSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
  mapId: z.string().min(1),
  agentUuid: z.string().min(1),
  abilitySlot: z.string().min(1),
  start: pointSchema,
  aim: pointSchema,
  impact: pointSchema,
  images: z.array(z.string()).max(MAX_LINEUP_IMAGES),
  notes: z.string().max(2000),
  gameVersion: z.string().max(60),
  status: lineupStatusSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type Lineup = z.infer<typeof lineupSchema>;
export type LineupStatus = z.infer<typeof lineupStatusSchema>;

export const LINEUP_STATUS_LABEL: Record<LineupStatus, string> = {
  unverified: 'Não verificada',
  'self-tested': 'Testada por você',
};

export function parseLineup(input: unknown): Lineup | null {
  const parsed = lineupSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export async function listLineups(): Promise<Lineup[]> {
  const rows = await dbGetAll<unknown>('lineups');
  return rows
    .map(parseLineup)
    .filter((item): item is Lineup => item !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export type LineupDraft = Omit<Lineup, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: number };

export async function saveLineup(draft: LineupDraft): Promise<Lineup> {
  const now = Date.now();
  const lineup = lineupSchema.parse({ ...draft, id: draft.id ?? newId(), createdAt: draft.createdAt ?? now, updatedAt: now });
  await dbPut('lineups', lineup);
  return lineup;
}

export async function deleteLineupLocal(id: string): Promise<void> {
  await dbDelete('lineups', id);
  const tombstones = (await kvGet<Record<string, number>>(LINEUP_TOMBSTONES_KEY)) ?? {};
  await kvSet(LINEUP_TOMBSTONES_KEY, { ...tombstones, [id]: Date.now() });
}

const MAX_IMAGE_SIDE = 1280;

/** Reduz a imagem antes de guardar: IndexedDB aceita muito, mas fotos cheias pesam à toa. */
export async function fileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error(`"${file.name}" não é uma imagem.`);
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}
