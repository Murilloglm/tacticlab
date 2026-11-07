import { useDoc } from '../strategy/docStore';
import { IconButton } from '../../ui/kit';
import { setEditor, useEditor, type Tool } from './editorStore';
import { deleteSelection, duplicateSelection, setTool } from './interaction';

const TOOLS: Array<{ tool: Tool; icon: string; label: string }> = [
  { tool: 'select', icon: 'cursor', label: 'Selecionar e mover (1)' },
  { tool: 'pan', icon: 'hand', label: 'Mover a visão (2)' },
  { tool: 'route', icon: 'route', label: 'Criar rota do agente selecionado (3)' },
  { tool: 'line', icon: 'line', label: 'Linha (4)' },
  { tool: 'arrow', icon: 'arrow', label: 'Seta (5)' },
  { tool: 'freehand', icon: 'pen', label: 'Mão livre (6)' },
  { tool: 'marker', icon: 'pin', label: 'Marcar posição (7)' },
  { tool: 'text', icon: 'text', label: 'Texto (8)' },
  { tool: 'area', icon: 'circle', label: 'Área (9)' },
];

const COLORS = ['#ffffff', '#ef3b48', '#2fc4d6', '#f6e27a', '#6fe0c0', '#c792ff'];

export function ToolRail() {
  const tool = useEditor((s) => s.tool);
  const selection = useEditor((s) => s.selection);
  const drawColor = useEditor((s) => s.drawColor);
  const viewMode = useEditor((s) => s.viewMode);
  const readOnly = useDoc((s) => s.readOnly);
  const hasAgentSelected = selection.some((item) => item.c === 'agents');

  return (
    <div
      data-testid="tool-rail"
      className="scroll-thin order-last flex shrink-0 items-center gap-0.5 overflow-x-auto border-t border-steel bg-carbon px-1 py-1 md:order-none md:w-11 md:flex-col md:overflow-y-auto md:overflow-x-hidden md:border-r md:border-t-0"
      role="toolbar"
      aria-label="Ferramentas"
    >
      {TOOLS.map((item) => {
        const disabled = readOnly && item.tool !== 'select' && item.tool !== 'pan';
        const needsAgent = item.tool === 'route' && !hasAgentSelected;
        return (
          <IconButton
            key={item.tool}
            icon={item.icon}
            label={needsAgent ? 'Criar rota: selecione um agente primeiro' : item.label}
            active={tool === item.tool}
            disabled={disabled || needsAgent}
            data-testid={`tool-${item.tool}`}
            onClick={() => setTool(item.tool)}
          />
        );
      })}

      <div className="mx-1 h-6 w-px shrink-0 bg-steel md:mx-0 md:my-1 md:h-px md:w-6" />

      <div className="flex shrink-0 gap-1 md:flex-col md:items-center md:gap-1" role="group" aria-label="Cor do desenho">
        {COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Cor ${color}`}
            aria-pressed={drawColor === color}
            onClick={() => setEditor({ drawColor: color })}
            className={`h-5 w-5 shrink-0 rounded-full border-2 ${drawColor === color ? 'border-bone' : 'border-transparent'}`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      <div className="mx-1 h-6 w-px shrink-0 bg-steel md:mx-0 md:my-1 md:h-px md:w-6" />

      <IconButton icon="copy" label="Duplicar seleção (Ctrl+D)" disabled={readOnly || selection.length === 0} data-testid="tool-duplicate" onClick={duplicateSelection} />
      <IconButton icon="trash" label="Excluir seleção (Delete)" disabled={readOnly || selection.length === 0} data-testid="tool-delete" onClick={deleteSelection} />
      <span className="sr-only" data-testid="active-view">
        {viewMode}
      </span>
    </div>
  );
}
