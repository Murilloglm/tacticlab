import { lazy, Suspense, useEffect } from 'react';
import { loadCatalog, useCatalog } from '../modules/catalog/catalogStore';
import { Button, ErrorBoundary, Spinner, ToastHost } from '../ui/kit';
import { HomePage } from './HomePage';
import { Shell } from './Shell';
import { navigate, useRoute } from './router';

// Módulos pesados só carregam quando usados.
const EditorPage = lazy(() => import('../modules/editor/EditorPage').then((m) => ({ default: m.EditorPage })));
const StrategiesPage = lazy(() => import('../modules/persistence/StrategiesPage').then((m) => ({ default: m.StrategiesPage })));
const LibraryPage = lazy(() => import('../modules/library/LibraryPage').then((m) => ({ default: m.LibraryPage })));
const AccountPage = lazy(() => import('../modules/services/AccountPage').then((m) => ({ default: m.AccountPage })));
const RoomPage = lazy(() => import('../modules/multiplayer/RoomPage').then((m) => ({ default: m.RoomPage })));
const SharePage = lazy(() => import('../modules/persistence/SharePage').then((m) => ({ default: m.SharePage })));

function CatalogGate({ children }: { children: React.ReactNode }) {
  const status = useCatalog((s) => s.status);
  const error = useCatalog((s) => s.error);
  const catalog = useCatalog((s) => s.catalog);

  if (catalog) return <>{children}</>;
  if (status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <h1 className="display text-3xl">Mapas e agentes não carregaram</h1>
        <p className="max-w-md text-ash">{error}</p>
        <p className="max-w-md text-sm text-ash">Verifique sua conexão e tente de novo.</p>
        <Button variant="primary" onClick={() => void loadCatalog(true)}>
          Tentar novamente
        </Button>
      </div>
    );
  }
  return <Spinner label="Carregando mapas e agentes…" />;
}

export function App() {
  const route = useRoute();

  useEffect(() => {
    void loadCatalog();
  }, []);

  const key = route.name === 'editor' ? `editor:${route.id}` : route.name === 'room' ? `room:${route.code}` : route.name;

  return (
    <>
      <ErrorBoundary resetKey={key}>
        <CatalogGate>
          <Suspense fallback={<Spinner label="Abrindo…" />}>
            {route.name === 'editor' && <EditorPage key={route.id} strategyId={route.id} />}
            {route.name === 'room' && <RoomPage key={route.code} code={route.code} />}
            {route.name === 'home' && (
              <Shell>
                <HomePage />
              </Shell>
            )}
            {route.name === 'strategies' && (
              <Shell>
                <StrategiesPage />
              </Shell>
            )}
            {route.name === 'library' && (
              <Shell>
                <LibraryPage />
              </Shell>
            )}
            {route.name === 'account' && (
              <Shell>
                <AccountPage />
              </Shell>
            )}
            {route.name === 'share' && (
              <Shell>
                <SharePage data={route.data} />
              </Shell>
            )}
            {route.name === 'notFound' && (
              <Shell>
                <div className="flex flex-col items-start gap-3 p-8">
                  <h1 className="display text-3xl">Esta página não existe</h1>
                  <Button variant="primary" onClick={() => navigate('/')}>
                    Ver os mapas
                  </Button>
                </div>
              </Shell>
            )}
          </Suspense>
        </CatalogGate>
      </ErrorBoundary>
      <ToastHost />
    </>
  );
}
