import { lazy, Suspense, useEffect, useState } from 'react';
import { findMap, useCatalog } from '../catalog/catalogStore';
import { loadMapGeometry } from '../maps/geometry';
import { getStrategy } from '../persistence/strategyRepo';
import { useAutosave } from '../persistence/useAutosave';
import { docActions, useDoc } from '../strategy/docStore';
import type { StrategyDoc } from '../strategy/schema';
import { playbackActions } from '../timeline/playbackStore';
import { navigate } from '../../app/router';
import { Button, ErrorBoundary, Spinner } from '../../ui/kit';
import { editorStore, initialEditorState, setEditor, useEditor } from './editorStore';
import { HintBar } from './HintBar';
import { SidePanel } from './SidePanel';
import { ToolRail } from './ToolRail';
import { TopBar } from './TopBar';
import { usePlaybackLoop, useShortcuts } from './useEditorEffects';
import { TimelineBar } from '../timeline/TimelineBar';

const Board2D = lazy(() => import('../editor2d/Board2D'));
const Viewer3D = lazy(() => import('../viewer3d/Viewer3D'));

/** Prepara a sessão de edição de um documento já carregado. */
export function useEditorSession(doc: StrategyDoc | null): void {
  const catalog = useCatalog((s) => s.catalog);
  const mapId = doc?.mapId;

  useEffect(() => {
    if (!mapId) return;
    const info = findMap(catalog, mapId);
    if (info) setEditor({ frame: { worldMeters: info.worldMeters, scaleKnown: info.scaleKnown } });
    let cancelled = false;
    loadMapGeometry(mapId)
      .then((map) => {
        if (!cancelled) setEditor({ map, frame: map.frame, mapError: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setEditor({ map: null, mapError: error instanceof Error ? error.message : 'Falha ao carregar a geometria.' });
      });
    return () => {
      cancelled = true;
    };
  }, [mapId, catalog]);
}

export function EditorWorkspace() {
  const viewMode = useEditor((s) => s.viewMode);
  const timelineOpen = useEditor((s) => s.timelineOpen);

  usePlaybackLoop();
  useShortcuts();

  // Carrega a outra visão em segundo plano para a troca de modo ser imediata.
  useEffect(() => {
    const idle = window.setTimeout(() => {
      void import('../editor2d/Board2D');
      void import('../viewer3d/Viewer3D');
    }, 800);
    return () => window.clearTimeout(idle);
  }, []);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ink" data-testid="editor">
      <TopBar />
      <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
        <ToolRail />
        <div className="relative min-h-0 min-w-0 flex-1" data-testid="stage" data-view={viewMode}>
          <ErrorBoundary
            resetKey={viewMode}
            fallback={(error, retry) => (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                <h2 className="display text-2xl">A visualização parou</h2>
                <p className="max-w-md text-ash">{error.message}</p>
                <p className="max-w-md text-sm text-ash">Sua estratégia não foi afetada.</p>
                <Button
                  variant="primary"
                  onClick={() => {
                    setEditor({ viewMode: '2d' });
                    retry();
                  }}
                >
                  Voltar ao modo 2D
                </Button>
              </div>
            )}
          >
            <Suspense fallback={<Spinner label={viewMode === '3d' ? 'Montando o cenário 3D…' : 'Abrindo a prancheta…'} />}>
              {viewMode === '2d' ? <Board2D /> : <Viewer3D />}
            </Suspense>
          </ErrorBoundary>
          <HintBar />
        </div>
        <SidePanel />
      </div>
      {timelineOpen && <TimelineBar />}
    </div>
  );
}

export function EditorPage({ strategyId }: { strategyId: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const doc = useDoc((s) => s.doc);

  // Efeitos são desfeitos na ordem em que foram declarados. O autosave vem primeiro para gravar
  // a última alteração antes de o documento ser limpo ao sair da página.
  useAutosave(state === 'ready');

  useEffect(() => {
    let cancelled = false;
    editorStore.setState(initialEditorState());
    playbackActions.reset();
    setState('loading');
    getStrategy(strategyId)
      .then((loaded) => {
        if (cancelled) return;
        if (!loaded) {
          setState('missing');
          return;
        }
        docActions.load(loaded);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMessage(error instanceof Error ? error.message : 'erro desconhecido');
        setState('error');
      });
    return () => {
      cancelled = true;
      docActions.clear();
    };
  }, [strategyId]);

  useEditorSession(state === 'ready' ? doc : null);

  if (state === 'loading') return <Spinner label="Abrindo a estratégia…" />;
  if (state !== 'ready' || !doc) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <h1 className="display text-3xl">{state === 'missing' ? 'Estratégia não encontrada neste navegador' : 'A estratégia não abriu'}</h1>
        <p className="max-w-md text-ash">
          {state === 'missing'
            ? 'As estratégias ficam salvas no navegador em que foram criadas. Para abrir em outro lugar, use um link de compartilhamento ou exporte o JSON.'
            : message}
        </p>
        <Button variant="primary" onClick={() => navigate('/estrategias')}>
          Ver minhas estratégias
        </Button>
      </div>
    );
  }
  return <EditorWorkspace />;
}
