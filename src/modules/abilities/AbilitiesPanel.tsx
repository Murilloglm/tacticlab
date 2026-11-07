import { useMemo, useState } from 'react';
import { findAgent, useCatalog } from '../catalog/catalogStore';
import type { AgentInfo } from '../catalog/types';
import { SLOT_KEY, SLOT_ORDER, stripTags, TEAM_COLOR } from '../editor/sceneStyle';
import { setEditor, useEditor } from '../editor/editorStore';
import { armUtility } from '../editor/interaction';
import { useDoc } from '../strategy/docStore';
import type { AbilityCategory } from '../strategy/schema';
import { CATEGORY_COLOR, CATEGORY_LABEL, classifyAbility, isPlaceableSlot } from './taxonomy';

function CategoryChip({ category, ultimate, classified }: { category: AbilityCategory; ultimate: boolean; classified: boolean }) {
  return (
    <span className="flex flex-wrap gap-1 text-xs">
      {classified ? (
        <span className="px-1.5" style={{ backgroundColor: `${CATEGORY_COLOR[category]}26`, color: CATEGORY_COLOR[category] }}>
          {CATEGORY_LABEL[category]}
        </span>
      ) : (
        <span className="bg-steel px-1.5 text-ash">Não classificada</span>
      )}
      {ultimate && <span className="bg-bone/15 px-1.5 text-bone">Ultimate</span>}
    </span>
  );
}

function AbilityList({ agent, ownerTokenId }: { agent: AgentInfo; ownerTokenId: string | null }) {
  const pending = useEditor((s) => s.pendingUtility);
  const readOnly = useDoc((s) => s.readOnly);
  const sorted = [...agent.abilities].sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));

  return (
    <ul className="flex flex-col gap-1.5">
      {sorted.map((ability) => {
        const info = classifyAbility(agent.uuid, ability.slot);
        const placeable = isPlaceableSlot(ability.slot);
        const armed = pending?.slot === ability.slot && pending.agentUuid === agent.uuid;
        const body = (
          <>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-ink">
              {ability.displayIcon && <img src={ability.displayIcon} alt="" crossOrigin="anonymous" loading="lazy" className="h-7 w-7" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="tnum text-xs text-ash">{SLOT_KEY[ability.slot] ?? ability.slot}</span>
                <span className="truncate">{ability.displayName}</span>
              </span>
              {placeable && <CategoryChip category={info.category} ultimate={info.isUltimate} classified={info.classified} />}
              {ability.description && <span className="mt-1 block text-xs text-ash">{stripTags(ability.description)}</span>}
            </span>
          </>
        );
        return (
          <li key={ability.slot}>
            {placeable ? (
              <button
                type="button"
                disabled={readOnly}
                aria-pressed={armed}
                data-testid={`ability-${ability.slot}`}
                onClick={() => armUtility(agent.uuid, ability.slot, ownerTokenId)}
                className={`flex w-full gap-2 border p-1.5 text-left transition-colors disabled:opacity-50 ${armed ? 'border-signal bg-signal/15' : 'border-steel hover:border-iron'}`}
              >
                {body}
              </button>
            ) : (
              <div className="flex gap-2 border border-steel/50 p-1.5 opacity-70">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function AbilitiesPanel() {
  const catalog = useCatalog((s) => s.catalog);
  const selection = useEditor((s) => s.selection);
  const agents = useDoc((s) => s.doc?.agents);
  const placed = useMemo(() => Object.values(agents ?? {}), [agents]);
  const [manualAgent, setManualAgent] = useState<string | null>(null);

  const selectedToken = selection.find((item) => item.c === 'agents');
  const token = selectedToken ? agents?.[selectedToken.id] : undefined;
  const agentUuid = token?.agentUuid ?? manualAgent;
  const agent = agentUuid ? findAgent(catalog, agentUuid) : undefined;

  return (
    <div className="flex flex-col gap-3">
      {placed.length > 0 && (
        <div>
          <p className="field-label">Agentes na estratégia</p>
          <div className="flex flex-wrap gap-1">
            {placed.map((item) => {
              const info = findAgent(catalog, item.agentUuid);
              const active = token?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  title={info?.displayName}
                  data-testid={`token-tab-${info?.displayName}`}
                  onClick={() => setEditor({ selection: [{ c: 'agents', id: item.id }] })}
                  className={`h-10 w-10 overflow-hidden border-2 ${active ? '' : 'opacity-70 hover:opacity-100'}`}
                  style={{ borderColor: active ? '#ffffff' : TEAM_COLOR[item.team] }}
                >
                  {info?.displayIcon && <img src={info.displayIcon} alt={info.displayName} crossOrigin="anonymous" className="h-full w-full object-cover" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <label>
        <span className="field-label">{placed.length > 0 ? 'Ou planeje a habilidade de outro agente' : 'Agente'}</span>
        <select
          className="field"
          data-testid="ability-agent-select"
          value={token ? '' : (manualAgent ?? '')}
          onChange={(event) => {
            setManualAgent(event.target.value || null);
            setEditor({ selection: [] });
          }}
        >
          <option value="">Escolha um agente</option>
          {catalog?.agents.map((item) => (
            <option key={item.uuid} value={item.uuid}>
              {item.displayName}
            </option>
          ))}
        </select>
      </label>

      {agent ? (
        <>
          <AbilityList agent={agent} ownerTokenId={token?.id ?? null} />
          <p className="text-xs text-ash">Nome, descrição e ícone vêm da Valorant-API. A categoria é uma classificação do TacticLab.</p>
        </>
      ) : (
        <p className="text-sm text-ash">Selecione um agente no mapa ou escolha um na lista para ver as habilidades.</p>
      )}
    </div>
  );
}
