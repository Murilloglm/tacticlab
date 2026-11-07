import { useEffect, useState, type FormEvent } from 'react';
import { useCatalog } from '../modules/catalog/catalogStore';
import type { MapInfo } from '../modules/catalog/types';
import { listStrategies, saveStrategy } from '../modules/persistence/strategyRepo';
import { createStrategy } from '../modules/strategy/factory';
import type { StrategyDoc, Team } from '../modules/strategy/schema';
import { Button, Modal, TeamBadge } from '../ui/kit';
import { toast } from '../ui/toastStore';
import { navigate } from './router';

export function NewStrategyDialog({ map, onClose }: { map: MapInfo; onClose: () => void }) {
  const [name, setName] = useState(`Execução em ${map.displayName}`);
  const [side, setSide] = useState<Team>('attack');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const doc = createStrategy({ name: name.trim() || map.displayName, mapId: map.uuid, side });
    try {
      await saveStrategy(doc);
      navigate(`/editor/${doc.id}`);
    } catch (error) {
      toast.error(`Não foi possível criar a estratégia: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
    }
  };

  return (
    <Modal title={`Nova estratégia em ${map.displayName}`} onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <label>
          <span className="field-label">Nome</span>
          <input className="field" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} data-testid="new-strategy-name" />
        </label>
        <fieldset>
          <legend className="field-label">Lado</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['attack', 'defense'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={side === value}
                onClick={() => setSide(value)}
                className={`cut px-3 py-2 font-medium ${side === value ? (value === 'attack' ? 'bg-attack text-white' : 'bg-defense text-ink') : 'bg-steel text-ash hover:text-bone'}`}
              >
                {value === 'attack' ? 'Ataque' : 'Defesa'}
              </button>
            ))}
          </div>
        </fieldset>
        <Button variant="primary" type="submit" data-testid="create-strategy">
          Abrir a prancheta
        </Button>
      </form>
    </Modal>
  );
}

export function MapPlate({ map, onClick }: { map: MapInfo; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`map-${map.displayName}`}
      className="map-plate group relative block aspect-square overflow-hidden border border-steel bg-carbon text-left transition-colors hover:border-signal focus-visible:border-bone"
    >
      <img src={map.displayIcon} alt="" loading="lazy" crossOrigin="anonymous" className="absolute inset-0 h-full w-full object-contain p-3" />
      <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-carbon via-carbon/80 to-transparent p-3 pt-10">
        <span className="display text-2xl">{map.displayName}</span>
        {map.sitesLabel && <span className="shrink-0 text-sm text-ash">{map.sitesLabel.replace(' Sites', '')}</span>}
      </span>
    </button>
  );
}

export function HomePage() {
  const catalog = useCatalog((s) => s.catalog);
  const [recent, setRecent] = useState<StrategyDoc[]>([]);
  const [choosing, setChoosing] = useState<MapInfo | null>(null);

  useEffect(() => {
    listStrategies()
      .then(({ strategies }) => setRecent(strategies.slice(0, 4)))
      .catch(() => setRecent([]));
  }, []);

  const tactical = catalog?.maps.filter((m) => m.kind === 'tactical') ?? [];
  const others = catalog?.maps.filter((m) => m.kind !== 'tactical') ?? [];
  const nameOf = (id: string) => catalog?.maps.find((m) => m.uuid === id)?.displayName ?? 'Mapa';

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <h1 className="display text-4xl sm:text-5xl">Escolha o mapa e monte a jogada</h1>
      <p className="mt-2 max-w-2xl text-ash">
        Posicione agentes e habilidades, sincronize a execução na timeline e percorra o mapa em 3D com a câmera fantasma.
        Tudo fica salvo no seu navegador, sem precisar de conta.
      </p>

      {recent.length > 0 && (
        <section className="mt-8" aria-labelledby="recent-title">
          <h2 id="recent-title" className="display mb-3 text-2xl">
            Continue de onde parou
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {recent.map((doc) => (
              <li key={doc.id}>
                <a href={`#/editor/${doc.id}`} className="block border border-steel bg-carbon p-3 transition-colors hover:border-signal">
                  <span className="block truncate font-medium">{doc.name}</span>
                  <span className="mt-1 flex items-center gap-2 text-sm text-ash">
                    {nameOf(doc.mapId)}
                    <TeamBadge team={doc.side} />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8" aria-labelledby="tactical-title">
        <h2 id="tactical-title" className="display mb-3 text-2xl">
          Mapas de plant
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {tactical.map((map) => (
            <MapPlate key={map.uuid} map={map} onClick={() => setChoosing(map)} />
          ))}
        </div>
      </section>

      {others.length > 0 && (
        <section className="mt-8" aria-labelledby="others-title">
          <h2 id="others-title" className="display text-2xl">
            Outros mapas
          </h2>
          <p className="mb-3 mt-1 text-sm text-ash">A API não publica a escala destes mapas, então as medidas em metros são estimadas.</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {others.map((map) => (
              <MapPlate key={map.uuid} map={map} onClick={() => setChoosing(map)} />
            ))}
          </div>
        </section>
      )}

      {choosing && <NewStrategyDialog map={choosing} onClose={() => setChoosing(null)} />}
    </div>
  );
}
