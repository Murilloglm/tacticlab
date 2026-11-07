import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCatalog } from '../catalog/catalogStore';
import type { StrategyDoc, Team } from '../strategy/schema';
import { navigate } from '../../app/router';
import { Button, IconButton, Modal, Spinner, TeamBadge } from '../../ui/kit';
import { toast } from '../../ui/toastStore';
import {
  createFolder,
  deleteFolder,
  deleteStrategy,
  duplicateStrategy,
  listFolders,
  listStrategies,
  moveStrategy,
  renameFolder,
  renameStrategy,
  saveStrategy,
  type Folder,
} from './strategyRepo';
import { downloadText, exportStrategyJson, importStrategyJson, safeFilename } from './transfer';

const errorText = (error: unknown) => (error instanceof Error ? error.message : 'erro desconhecido');

function PromptDialog({ title, label, initial, action, onSubmit, onClose }: { title: string; label: string; initial: string; action: string; onSubmit: (value: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(initial);
  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) onSubmit(value.trim());
        }}
      >
        <label>
          <span className="field-label">{label}</span>
          <input className="field" value={value} maxLength={120} data-testid="prompt-input" onChange={(e) => setValue(e.target.value)} />
        </label>
        <Button variant="primary" type="submit" disabled={!value.trim()} data-testid="prompt-submit">
          {action}
        </Button>
      </form>
    </Modal>
  );
}

function ConfirmDialog({ title, body, action, onConfirm, onClose }: { title: string; body: string; action: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="mb-4 text-ash">{body}</p>
      <div className="flex justify-end gap-2">
        <Button variant="quiet" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" data-testid="confirm-action" onClick={onConfirm}>
          {action}
        </Button>
      </div>
    </Modal>
  );
}

type Dialog =
  | { type: 'rename'; doc: StrategyDoc }
  | { type: 'delete'; doc: StrategyDoc }
  | { type: 'new-folder' }
  | { type: 'rename-folder'; folder: Folder }
  | { type: 'delete-folder'; folder: Folder };

export function StrategiesPage() {
  const catalog = useCatalog((s) => s.catalog);
  const [strategies, setStrategies] = useState<StrategyDoc[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [corrupted, setCorrupted] = useState(0);
  const [mapFilter, setMapFilter] = useState('');
  const [sideFilter, setSideFilter] = useState<Team | ''>('');
  const [folderFilter, setFolderFilter] = useState<string | null | 'all'>('all');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [{ strategies: list, corrupted: broken }, folderList] = await Promise.all([listStrategies(), listFolders()]);
    setStrategies(list);
    setCorrupted(broken);
    setFolders(folderList);
  }, []);

  useEffect(() => {
    refresh().catch((error: unknown) => {
      toast.error(`Não foi possível ler as estratégias: ${errorText(error)}`);
      setStrategies([]);
    });
  }, [refresh]);

  const run = async (task: () => Promise<unknown>, success?: string) => {
    try {
      await task();
      await refresh();
      if (success) toast.success(success);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setDialog(null);
    }
  };

  const mapName = useCallback((id: string) => catalog?.maps.find((m) => m.uuid === id)?.displayName ?? 'Mapa desconhecido', [catalog]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (strategies ?? []).filter(
      (doc) =>
        (!mapFilter || doc.mapId === mapFilter) &&
        (!sideFilter || doc.side === sideFilter) &&
        (folderFilter === 'all' || doc.folderId === folderFilter) &&
        (!term || doc.name.toLowerCase().includes(term)),
    );
  }, [strategies, mapFilter, sideFilter, folderFilter, query]);

  const groups = useMemo(() => {
    const byMap = new Map<string, StrategyDoc[]>();
    for (const doc of visible) {
      const key = mapName(doc.mapId);
      byMap.set(key, [...(byMap.get(key) ?? []), doc]);
    }
    return [...byMap.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  }, [visible, mapName]);

  const importFile = async (file: File) => {
    const result = importStrategyJson(await file.text());
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    await run(() => saveStrategy(result.doc), `"${result.doc.name}" importada.`);
  };

  if (strategies === null) return <Spinner label="Carregando estratégias…" />;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-4xl">Estratégias</h1>
        <div className="flex gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            data-testid="import-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile(file);
              event.target.value = '';
            }}
          />
          <Button variant="ghost" icon="upload" data-testid="import-json" onClick={() => fileInput.current?.click()}>
            Importar JSON
          </Button>
          <Button variant="primary" icon="plus" onClick={() => navigate('/')}>
            Nova estratégia
          </Button>
        </div>
      </div>

      {corrupted > 0 && (
        <p className="mt-3 border-l-2 border-signal pl-2 text-sm" data-testid="corrupted-warning">
          {corrupted === 1 ? 'Uma estratégia salva está corrompida e foi ignorada.' : `${corrupted} estratégias salvas estão corrompidas e foram ignoradas.`}
        </p>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside aria-label="Pastas">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Pastas</h2>
            <IconButton icon="plus" label="Criar pasta" data-testid="new-folder" onClick={() => setDialog({ type: 'new-folder' })} />
          </div>
          <ul className="flex flex-row flex-wrap gap-1 md:flex-col" data-testid="folders">
            {[
              { id: 'all' as const, name: 'Todas' },
              { id: null, name: 'Sem pasta' },
            ].map((item) => (
              <li key={String(item.id)}>
                <button type="button" aria-pressed={folderFilter === item.id} onClick={() => setFolderFilter(item.id)} className={`w-full px-2 py-1 text-left ${folderFilter === item.id ? 'bg-steel' : 'text-ash hover:text-bone'}`}>
                  {item.name}
                </button>
              </li>
            ))}
            {folders.map((folder) => (
              <li key={folder.id} className={`flex items-center ${folderFilter === folder.id ? 'bg-steel' : ''}`}>
                <button type="button" aria-pressed={folderFilter === folder.id} onClick={() => setFolderFilter(folder.id)} className={`min-w-0 flex-1 truncate px-2 py-1 text-left ${folderFilter === folder.id ? '' : 'text-ash hover:text-bone'}`}>
                  {folder.name}
                </button>
                <IconButton icon="pencil" label={`Renomear pasta ${folder.name}`} size={14} className="h-7 w-7" onClick={() => setDialog({ type: 'rename-folder', folder })} />
                <IconButton icon="trash" label={`Excluir pasta ${folder.name}`} size={14} className="h-7 w-7" onClick={() => setDialog({ type: 'delete-folder', folder })} />
              </li>
            ))}
          </ul>
        </aside>

        <div className="min-w-0">
          <div className="mb-4 grid gap-2 sm:grid-cols-3">
            <input className="field" type="search" placeholder="Buscar por nome" aria-label="Buscar por nome" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className="field" aria-label="Filtrar por mapa" data-testid="filter-map" value={mapFilter} onChange={(e) => setMapFilter(e.target.value)}>
              <option value="">Todos os mapas</option>
              {catalog?.maps.map((map) => (
                <option key={map.uuid} value={map.uuid}>
                  {map.displayName}
                </option>
              ))}
            </select>
            <select className="field" aria-label="Filtrar por lado" data-testid="filter-side" value={sideFilter} onChange={(e) => setSideFilter(e.target.value as Team | '')}>
              <option value="">Ataque e defesa</option>
              <option value="attack">Ataque</option>
              <option value="defense">Defesa</option>
            </select>
          </div>

          {strategies.length === 0 && (
            <div className="flex flex-col items-start gap-3 py-8" data-testid="strategies-empty">
              <p className="text-ash">Você ainda não criou nenhuma estratégia. Escolha um mapa para começar.</p>
              <Button variant="primary" onClick={() => navigate('/')}>
                Escolher mapa
              </Button>
            </div>
          )}
          {strategies.length > 0 && visible.length === 0 && <p className="py-8 text-ash">Nenhuma estratégia com esses filtros.</p>}

          {groups.map(([group, docs]) => (
            <section key={group} className="mb-6">
              <h2 className="display mb-2 text-2xl">{group}</h2>
              <ul className="flex flex-col gap-1.5">
                {docs.map((doc) => (
                  <li key={doc.id} className="flex flex-wrap items-center gap-2 border border-steel bg-carbon p-2" data-testid="strategy-row">
                    <a href={`#/editor/${doc.id}`} className="min-w-0 flex-1 basis-48">
                      <span className="block truncate font-medium hover:text-signal">{doc.name}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-sm text-ash">
                        <TeamBadge team={doc.side} />
                        {new Date(doc.updatedAt).toLocaleDateString('pt-BR')}
                      </span>
                    </a>
                    <select
                      className="field w-32 py-1 text-sm"
                      aria-label={`Pasta de ${doc.name}`}
                      value={doc.folderId ?? ''}
                      onChange={(e) => void run(() => moveStrategy(doc.id, e.target.value || null))}
                    >
                      <option value="">Sem pasta</option>
                      {folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex">
                      <IconButton icon="pencil" label={`Renomear ${doc.name}`} data-testid="rename-strategy" onClick={() => setDialog({ type: 'rename', doc })} />
                      <IconButton icon="copy" label={`Duplicar ${doc.name}`} data-testid="duplicate-strategy" onClick={() => void run(() => duplicateStrategy(doc.id), 'Estratégia duplicada.')} />
                      <IconButton icon="download" label={`Exportar ${doc.name}`} onClick={() => downloadText(`${safeFilename(doc.name)}.json`, exportStrategyJson(doc))} />
                      <IconButton icon="trash" label={`Excluir ${doc.name}`} data-testid="delete-strategy" onClick={() => setDialog({ type: 'delete', doc })} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>

      {dialog?.type === 'rename' && (
        <PromptDialog title="Renomear estratégia" label="Nome" initial={dialog.doc.name} action="Renomear" onClose={() => setDialog(null)} onSubmit={(value) => void run(() => renameStrategy(dialog.doc.id, value))} />
      )}
      {dialog?.type === 'delete' && (
        <ConfirmDialog
          title="Excluir estratégia"
          body={`"${dialog.doc.name}" e o histórico dela serão apagados deste navegador. Isso não pode ser desfeito.`}
          action="Excluir"
          onClose={() => setDialog(null)}
          onConfirm={() => void run(() => deleteStrategy(dialog.doc.id), 'Estratégia excluída.')}
        />
      )}
      {dialog?.type === 'new-folder' && (
        <PromptDialog title="Nova pasta" label="Nome da pasta" initial="" action="Criar pasta" onClose={() => setDialog(null)} onSubmit={(value) => void run(() => createFolder(value))} />
      )}
      {dialog?.type === 'rename-folder' && (
        <PromptDialog title="Renomear pasta" label="Nome da pasta" initial={dialog.folder.name} action="Renomear" onClose={() => setDialog(null)} onSubmit={(value) => void run(() => renameFolder(dialog.folder, value))} />
      )}
      {dialog?.type === 'delete-folder' && (
        <ConfirmDialog
          title="Excluir pasta"
          body={`A pasta "${dialog.folder.name}" será removida. As estratégias dela continuam salvas, em "Sem pasta".`}
          action="Excluir pasta"
          onClose={() => setDialog(null)}
          onConfirm={() =>
            void run(async () => {
              await deleteFolder(dialog.folder.id);
              if (folderFilter === dialog.folder.id) setFolderFilter('all');
            })
          }
        />
      )}
    </div>
  );
}
