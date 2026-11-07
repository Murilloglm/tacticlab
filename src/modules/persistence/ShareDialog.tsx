import { useEffect, useState } from 'react';
import { captureView } from '../editor/exportRegistry';
import { useEditor } from '../editor/editorStore';
import { docStore } from '../strategy/docStore';
import { Button, Modal } from '../../ui/kit';
import { toast } from '../../ui/toastStore';
import { buildShareUrl, downloadText, encodeShare, exportStrategyJson, safeFilename, SHARE_URL_SAFE_LENGTH, triggerDownload } from './transfer';

export function ShareDialog({ onClose }: { onClose: () => void }) {
  const [link, setLink] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const viewMode = useEditor((s) => s.viewMode);

  useEffect(() => {
    const doc = docStore.getState().doc;
    if (!doc) return;
    encodeShare(doc)
      .then((encoded) => setLink(buildShareUrl(encoded)))
      .catch((error: unknown) => setLinkError(error instanceof Error ? error.message : 'erro desconhecido'));
  }, []);

  const exportJson = () => {
    const doc = docStore.getState().doc;
    if (doc) downloadText(`${safeFilename(doc.name)}.json`, exportStrategyJson(doc));
  };

  const exportPng = async () => {
    const doc = docStore.getState().doc;
    if (!doc) return;
    try {
      triggerDownload(`${safeFilename(doc.name)}.png`, await captureView());
      toast.success('Imagem exportada.');
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'erro desconhecido';
      // Canvas contaminado costuma indicar imagem sem CORS.
      toast.error(`Não foi possível gerar o PNG: ${reason}`);
    }
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copiado.');
    } catch {
      toast.error('O navegador bloqueou a cópia. Selecione o link e copie manualmente.');
    }
  };

  return (
    <Modal title="Exportar e compartilhar" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <section>
          <h3 className="font-semibold">Link da estratégia</h3>
          <p className="mb-2 text-sm text-ash">
            O link carrega uma cópia da estratégia como está agora. Quem abrir recebe a própria cópia; alterações não voltam para você.
          </p>
          {linkError && <p className="text-sm text-signal">Não foi possível gerar o link: {linkError}</p>}
          {link && (
            <>
              <input className="field text-sm" readOnly value={link} aria-label="Link de compartilhamento" data-testid="share-link" onFocus={(event) => event.target.select()} />
              {link.length > SHARE_URL_SAFE_LENGTH && (
                <p className="mt-1 text-sm text-signal" data-testid="share-long-warning">
                  Este link tem {link.length} caracteres e alguns aplicativos podem cortá-lo. Para estratégias grandes, prefira enviar o arquivo JSON.
                </p>
              )}
              <Button variant="primary" className="mt-2" icon="link" data-testid="copy-link" onClick={() => void copyLink()}>
                Copiar link
              </Button>
            </>
          )}
        </section>
        <section className="grid grid-cols-2 gap-2 border-t border-steel pt-4">
          <Button variant="ghost" icon="download" data-testid="export-json" onClick={exportJson}>
            Exportar JSON
          </Button>
          <Button variant="ghost" icon="image" data-testid="export-png" onClick={() => void exportPng()}>
            Exportar PNG {viewMode === '3d' ? '(vista 3D)' : '(mapa inteiro)'}
          </Button>
        </section>
      </div>
    </Modal>
  );
}
