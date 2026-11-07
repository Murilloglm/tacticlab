import { z } from 'zod';

export const abilityInfoSchema = z.object({
  slot: z.string(),
  displayName: z.string(),
  description: z.string().nullish(),
  displayIcon: z.string().nullish(),
});

export const agentInfoSchema = z.object({
  uuid: z.string(),
  displayName: z.string(),
  description: z.string().nullish(),
  role: z.object({ uuid: z.string(), displayName: z.string() }).nullish(),
  displayIcon: z.string().nullish(),
  displayIconSmall: z.string().nullish(),
  fullPortrait: z.string().nullish(),
  backgroundGradientColors: z.array(z.string()).nullish(),
  abilities: z.array(abilityInfoSchema),
});

export const mapInfoSchema = z.object({
  uuid: z.string(),
  displayName: z.string(),
  tacticalDescription: z.string().nullish(),
  coordinates: z.string().nullish(),
  displayIcon: z.string().nullish(),
  listViewIcon: z.string().nullish(),
  splash: z.string().nullish(),
  xMultiplier: z.number().nullish(),
  worldMeters: z.number().nullish(),
  scaleKnown: z.boolean().nullish(),
});

export type RawAgent = z.infer<typeof agentInfoSchema>;
export type RawMap = z.infer<typeof mapInfoSchema>;

export interface AbilityInfo {
  slot: string;
  displayName: string;
  description: string | null;
  displayIcon: string | null;
}

export interface AgentInfo {
  uuid: string;
  displayName: string;
  description: string | null;
  role: string | null;
  displayIcon: string | null;
  fullPortrait: string | null;
  /** Cor de identificação vinda da API. */
  color: string;
  abilities: AbilityInfo[];
}

export interface MapInfo {
  uuid: string;
  displayName: string;
  kind: 'tactical' | 'other';
  sitesLabel: string | null;
  coordinates: string | null;
  displayIcon: string;
  listViewIcon: string | null;
  splash: string | null;
  worldMeters: number;
  scaleKnown: boolean;
}

export type CatalogSource = 'api' | 'cache' | 'snapshot';

export interface Catalog {
  maps: MapInfo[];
  agents: AgentInfo[];
  gameVersion: string | null;
  source: CatalogSource;
  fetchedAt: number;
}
