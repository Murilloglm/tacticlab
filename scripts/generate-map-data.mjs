#!/usr/bin/env node
// Gera os dados estáticos do site a partir da Valorant-API:
//   public/data/catalog.json          catálogo de reserva, usado quando a API está fora do ar
//   public/data/maps/<uuid>.json      geometria esquemática de cada mapa
// Uso: npm run maps:generate
// Rode novamente quando surgir mapa ou agente novo e confira o resultado no modo 3D.
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { processMap } from './lib/map-processor.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'data');
const overridesDir = join(root, 'scripts', 'map-overrides');
const API = 'https://valorant-api.com/v1';

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} respondeu ${response.status}`);
  return (await response.json()).data;
}

async function getPng(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} respondeu ${response.status}`);
  return PNG.sync.read(Buffer.from(await response.arrayBuffer()));
}

async function loadOverrides() {
  const overrides = new Map();
  let files;
  try {
    files = await readdir(overridesDir);
  } catch {
    return overrides;
  }
  for (const file of files.filter((f) => f.endsWith('.json'))) {
    const data = JSON.parse(await readFile(join(overridesDir, file), 'utf8'));
    overrides.set(file.replace('.json', ''), data);
  }
  return overrides;
}

const slug = (name) => name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-');

async function main() {
  const [mapsPt, mapsEn, agentsPt, version] = await Promise.all([
    getJson(`${API}/maps?language=pt-BR`),
    getJson(`${API}/maps`),
    getJson(`${API}/agents?isPlayableCharacter=true&language=pt-BR`),
    getJson(`${API}/version`),
  ]);
  const enById = new Map(mapsEn.map((m) => [m.uuid, m]));
  const overrides = await loadOverrides();
  await mkdir(join(outDir, 'maps'), { recursive: true });

  const catalogMaps = [];
  const report = [];
  for (const map of mapsPt.filter((m) => m.displayIcon)) {
    const en = enById.get(map.uuid);
    const png = await getPng(map.displayIcon);
    const geometry = processMap({
      rgba: png.data,
      w: png.width,
      h: png.height,
      override: overrides.get(slug(en.displayName)) ?? {},
      meta: {
        uuid: map.uuid,
        displayName: map.displayName,
        xMultiplier: map.xMultiplier,
        yMultiplier: map.yMultiplier,
        xScalarToAdd: map.xScalarToAdd,
        yScalarToAdd: map.yScalarToAdd,
        calloutsEn: en.callouts ?? [],
        calloutsPt: map.callouts ?? [],
      },
    });
    geometry.gameVersion = version.version;
    await writeFile(join(outDir, 'maps', `${map.uuid}.json`), JSON.stringify(geometry));
    catalogMaps.push({
      uuid: map.uuid,
      displayName: map.displayName,
      tacticalDescription: map.tacticalDescription ?? null,
      coordinates: map.coordinates ?? null,
      displayIcon: map.displayIcon,
      listViewIcon: map.listViewIcon ?? null,
      splash: map.splash ?? null,
      worldMeters: geometry.frame.worldMeters,
      scaleKnown: geometry.frame.scaleKnown,
    });
    report.push({
      mapa: en.displayName,
      metros: geometry.frame.worldMeters,
      paredes: geometry.walls.length,
      caixas: geometry.boxes.length,
      sites: geometry.sites.map((s) => s.label).join('/') || '-',
      'altura(m)': geometry.heightSpanMeters,
      ancoras: geometry.heightAnchors,
      alinhamento: `${geometry.alignment.source}(${geometry.alignment.dx},${geometry.alignment.dy})`,
      callouts: `${geometry.calloutFloorRatio}${geometry.calloutsReliable ? '' : ' !'}`,
    });
  }

  const seen = new Set();
  const catalogAgents = agentsPt
    .filter((a) => !seen.has(a.uuid) && seen.add(a.uuid))
    .map((a) => ({
      uuid: a.uuid,
      displayName: a.displayName,
      role: a.role ? { uuid: a.role.uuid, displayName: a.role.displayName } : null,
      displayIcon: a.displayIcon,
      displayIconSmall: a.displayIconSmall ?? a.displayIcon,
      fullPortrait: a.fullPortrait ?? null,
      backgroundGradientColors: a.backgroundGradientColors ?? [],
      // Descrições longas ficam fora do catálogo de reserva e vêm da API em tempo de execução.
      abilities: a.abilities.map((b) => ({
        slot: b.slot,
        displayName: b.displayName,
        displayIcon: b.displayIcon ?? null,
      })),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'));

  await writeFile(
    join(outDir, 'catalog.json'),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      gameVersion: version.version,
      maps: catalogMaps,
      agents: catalogAgents,
    }),
  );
  console.table(report);
  console.log(`${catalogMaps.length} mapas e ${catalogAgents.length} agentes gerados (jogo ${version.version}).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
