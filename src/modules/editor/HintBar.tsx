import { abilityDefinition } from '../abilities/definitions';
import { SHAPE_HINT } from '../abilities/taxonomy';

/** Dica específica para habilidades que se prendem a parede ou saem do agente. */
function anchorHint(agentUuid: string, slot: string): string | null {
  const definition = abilityDefinition(agentUuid, slot);
  if (definition.anchor === 'wall') return 'Clique junto a uma parede: a carga atravessa e o efeito sai do outro lado. Arraste para mirar.';
  if (definition.anchor === 'surface') return 'Clique junto a uma parede para prender o dispositivo nela.';
  if (definition.anchor === 'link') return 'Clique na passagem e arraste na direção do fio: ele vai de parede a parede.';
  if (definition.render.kind === 'directional-area') return 'Clique na direção da habilidade: a faixa sai do agente.';
  return null;
}
import { findAgent, useCatalog } from '../catalog/catalogStore';
import { docActions, useDoc } from '../strategy/docStore';
import { Button } from '../../ui/kit';
import { useEditor } from './editorStore';
import { interaction } from './interaction';

/** Diz o que fazer a seguir e oferece Concluir e Cancelar, que no celular não têm atalho. */
export function HintBar() {
  const tool = useEditor((s) => s.tool);
  const pendingAgent = useEditor((s) => s.pendingAgent);
  const pendingUtility = useEditor((s) => s.pendingUtility);
  const draft = useEditor((s) => s.draft);
  const catalog = useCatalog((s) => s.catalog);
  const readOnly = useDoc((s) => s.readOnly);

  if (readOnly) {
    return (
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 bg-carbon/95 px-3 py-1.5 text-sm text-ash" data-testid="read-only-hint">
        Você é espectador nesta sala e pode só visualizar.
      </div>
    );
  }

  let message: string | null = null;
  let canFinish = false;

  switch (tool) {
    case 'agent':
      if (pendingAgent) {
        message = `Clique no mapa para posicionar ${findAgent(catalog, pendingAgent.agentUuid)?.displayName ?? 'o agente'}.`;
      }
      break;
    case 'route':
      message = 'Clique no mapa para adicionar pontos à rota do agente.';
      canFinish = true;
      break;
    case 'line':
    case 'arrow':
      message = 'Arraste para desenhar.';
      break;
    case 'freehand':
      message = 'Arraste para desenhar à mão livre.';
      break;
    case 'marker':
      message = 'Clique para marcar uma posição.';
      break;
    case 'text':
      message = 'Clique onde o texto deve ficar.';
      break;
    case 'area':
      message = 'Arraste do centro até a borda da área.';
      break;
    case 'utility':
      if (pendingUtility) {
        message = anchorHint(pendingUtility.agentUuid, pendingUtility.slot) ?? SHAPE_HINT[pendingUtility.shape];
        canFinish = pendingUtility.shape === 'path' && (draft?.points.length ?? 0) >= 2;
      }
      break;
    default:
      break;
  }

  if (!message) return null;

  return (
    <div className="absolute bottom-3 left-1/2 z-20 flex max-w-[92%] -translate-x-1/2 items-center gap-2 bg-carbon/95 px-3 py-1.5 text-sm" data-testid="hint-bar">
      <span>{message}</span>
      {canFinish && (
        <Button variant="primary" className="shrink-0 py-0.5 text-sm" data-testid="hint-finish" onClick={() => interaction.finish()}>
          Concluir
        </Button>
      )}
      <Button
        variant="quiet"
        className="shrink-0 py-0.5 text-sm"
        data-testid="hint-cancel"
        onClick={() => {
          interaction.cancel();
          docActions.endGesture();
        }}
      >
        Cancelar
      </Button>
    </div>
  );
}
