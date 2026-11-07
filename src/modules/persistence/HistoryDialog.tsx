import { useEffect, useState } from 'react';
import { docActions, docStore } from '../strategy/docStore';
import { parseStrategy } from '../strategy/schema';
import { Button, Modal } from '../../ui/kit';
import { toast } from '../../ui/toastStore';
import { addVersion, listVersions, type StrategyVersion } from './strategyRepo';

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const summary = (version: StrategyVersion) => {
  const { agents, utilities, drawings } = version.doc;
  return `${Object.keys(agents).length} agentes, ${Object.keys(utilities).length} habilidades, ${Object.keys(drawings).length} desenhos`;
};

export function HistoryDialog({ onClose }: { onClose: () => void }) {
  const [versions, setVersions] = useState<StrategyVersion[] | null>(null);

  useEffect(() => {
    const doc = docStore.getState().doc;
    if (!doc) return;
    listVersions(doc.id)
      .then(setVersions)
      .catch((error: unknown) => {
        toast.error(`Não foi possível ler o histórico: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
        setVersions([]);
      });
  }, []);

  const restore = async (version: StrategyVersion) => {
    const current = docStore.getState().doc;
    if (!current) return;
    const parsed = parseStrategy(version.doc);
    if (!parsed.ok) {
      toast.error(`Esta versão está corrompida. ${parsed.error}`);
      return;
    }
    // Guarda o estado atual antes, para a restauração também poder ser revertida.
    await addVersion(current, 'Antes de restaurar');
    docActions.replace({ ...parsed.doc, id: current.id, updatedAt: Date.now() });
    toast.success('Versão restaurada.');
    onClose();
  };

  return (
    <Modal title="Histórico de alterações" onClose={onClose}>
      {versions === null && <p className="text-ash">Carregando…</p>}
      {versions?.length === 0 && (
        <p className="text-ash" data-testid="history-empty">
          Nenhuma versão ainda. Use o botão de salvar para registrar uma; o app também guarda uma a cada 5 minutos de edição.
        </p>
      )}
      <ul className="flex flex-col gap-2" data-testid="history-list">
        {versions?.map((version) => (
          <li key={version.id} className="flex items-center justify-between gap-3 border border-steel p-2">
            <span className="min-w-0">
              <span className="block font-medium">{version.label}</span>
              <span className="block text-sm text-ash">
                {formatDate(version.createdAt)}, {summary(version)}
              </span>
            </span>
            <Button variant="ghost" className="shrink-0" data-testid="history-restore" onClick={() => void restore(version)}>
              Restaurar
            </Button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
