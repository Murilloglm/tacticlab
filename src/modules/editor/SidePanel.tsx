import { setEditor, useEditor, type PanelTab } from './editorStore';
import { AbilitiesPanel } from '../abilities/AbilitiesPanel';
import { AgentsPanel } from './AgentsPanel';
import { ObjectPanel } from './ObjectPanel';
import { EventsPanel } from '../timeline/EventsPanel';
import { IconButton } from '../../ui/kit';

const TABS: Array<{ tab: PanelTab; label: string }> = [
  { tab: 'agents', label: 'Agentes' },
  { tab: 'abilities', label: 'Habilidades' },
  { tab: 'object', label: 'Objeto' },
  { tab: 'events', label: 'Eventos' },
];

export function SidePanel() {
  const open = useEditor((s) => s.panelOpen);
  const tab = useEditor((s) => s.panelTab);

  if (!open) return null;

  return (
    <aside
      data-testid="side-panel"
      className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[340px] flex-col border-l border-steel bg-carbon md:static md:w-80 md:shrink-0"
    >
      <div className="flex items-center border-b border-steel">
        <div className="flex min-w-0 flex-1" role="tablist" aria-label="Painéis">
          {TABS.map((item) => (
            <button
              key={item.tab}
              type="button"
              role="tab"
              aria-selected={tab === item.tab}
              data-testid={`tab-${item.tab}`}
              onClick={() => setEditor({ panelTab: item.tab })}
              className={`min-w-0 flex-1 border-b-2 px-1 py-2 text-sm transition-colors ${
                tab === item.tab ? 'border-signal text-bone' : 'border-transparent text-ash hover:text-bone'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <IconButton icon="close" label="Recolher painel" className="md:hidden" onClick={() => setEditor({ panelOpen: false })} />
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3 pb-16 md:pb-3" role="tabpanel">
        {tab === 'agents' && <AgentsPanel />}
        {tab === 'abilities' && <AbilitiesPanel />}
        {tab === 'object' && <ObjectPanel />}
        {tab === 'events' && <EventsPanel />}
      </div>
    </aside>
  );
}
