import { useEffect, useState } from 'react';
import { findMap, useCatalog } from '../catalog/catalogStore';
import type { StrategyDoc } from '../strategy/schema';
import { navigate } from '../../app/router';
import { Button, Spinner, TeamBadge } from '../../ui/kit';
import { toast } from '../../ui/toastStore';
import { saveStrategy } from './strategyRepo';
import { decodeShare } from './transfer';

export function SharePage({ data }: { data: string }) {
  const catalog = useCatalog((s) => s.catalog);
  const [doc, setDoc] = useState<StrategyDoc | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void decodeShare(data).then((result) => {
      if (cancelled) return;
      if (result.ok) setDoc(result.doc);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [data]);

  if (error) {
    return (
      <div className="flex flex-col items-start gap-3 p-8">
        <h1 className="display text-3xl">Este link não abriu</h1>
        <p className="text-ash">{error}</p>
        <Button variant="primary" onClick={() => navigate('/')}>
          Ver os mapas
        </Button>
      </div>
    );
  }
  if (!doc) return <Spinner label="Lendo a estratégia compartilhada…" />;

  const save = async () => {
    try {
      await saveStrategy(doc);
      navigate(`/editor/${doc.id}`);
    } catch (reason) {
      toast.error(`Não foi possível salvar a cópia: ${reason instanceof Error ? reason.message : 'erro desconhecido'}`);
    }
  };

  const map = findMap(catalog, doc.mapId);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-4 p-8" data-testid="share-page">
      <h1 className="display text-4xl">{doc.name}</h1>
      <p className="flex items-center gap-2 text-ash">
        {map?.displayName ?? 'Mapa desconhecido'} <TeamBadge team={doc.side} />
      </p>
      <p className="text-ash">
        {Object.keys(doc.agents).length} agentes, {Object.keys(doc.utilities).length} habilidades e {Object.keys(doc.drawings).length} desenhos.
      </p>
      <Button variant="primary" data-testid="share-open" onClick={() => void save()}>
        Abrir uma cópia na prancheta
      </Button>
    </div>
  );
}
