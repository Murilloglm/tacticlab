import { useMemo, useState } from 'react';
import { useCatalog } from '../catalog/catalogStore';
import { MAX_AGENTS_PER_TEAM, type Team } from '../strategy/schema';
import { useDoc } from '../strategy/docStore';
import { TEAM_COLOR, initials } from './sceneStyle';
import { setEditor, useEditor } from './editorStore';
import { armAgent } from './interaction';

export function AgentsPanel() {
  const catalog = useCatalog((s) => s.catalog);
  const team = useEditor((s) => s.activeTeam);
  const pending = useEditor((s) => s.pendingAgent);
  const agents = useDoc((s) => s.doc?.agents);
  const readOnly = useDoc((s) => s.readOnly);
  const [role, setRole] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const placed = useMemo(() => Object.values(agents ?? {}), [agents]);
  const count = (value: Team) => placed.filter((agent) => agent.team === value).length;
  const roles = useMemo(
    () => [...new Set((catalog?.agents ?? []).map((agent) => agent.role).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [catalog],
  );

  const visible = (catalog?.agents ?? []).filter(
    (agent) =>
      (!role || agent.role === role) && (!query || agent.displayName.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-1" role="group" aria-label="Equipe">
        {(['attack', 'defense'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={team === value}
            data-testid={`team-${value}`}
            onClick={() => setEditor({ activeTeam: value })}
            className="cut px-2 py-1.5 text-sm font-medium"
            style={
              team === value
                ? { backgroundColor: TEAM_COLOR[value], color: value === 'attack' ? '#fff' : '#0c0d10' }
                : { backgroundColor: 'var(--color-steel)', color: 'var(--color-ash)' }
            }
          >
            {value === 'attack' ? 'Atacantes' : 'Defensores'} {count(value)}/{MAX_AGENTS_PER_TEAM}
          </button>
        ))}
      </div>

      <input className="field" type="search" placeholder="Buscar agente" aria-label="Buscar agente" value={query} onChange={(event) => setQuery(event.target.value)} />

      <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por função">
        <button type="button" aria-pressed={role === null} onClick={() => setRole(null)} className={`px-2 py-0.5 text-sm ${role === null ? 'bg-bone text-ink' : 'bg-steel text-ash hover:text-bone'}`}>
          Todos
        </button>
        {roles.map((value) => (
          <button key={value} type="button" aria-pressed={role === value} onClick={() => setRole(value)} className={`px-2 py-0.5 text-sm ${role === value ? 'bg-bone text-ink' : 'bg-steel text-ash hover:text-bone'}`}>
            {value}
          </button>
        ))}
      </div>

      {visible.length === 0 && <p className="text-sm text-ash">Nenhum agente encontrado com esse filtro.</p>}

      <div className="grid grid-cols-4 gap-1.5">
        {visible.map((agent) => {
          const armed = pending?.agentUuid === agent.uuid;
          const onTeam = placed.filter((token) => token.agentUuid === agent.uuid && token.team === team).length;
          return (
            <button
              key={agent.uuid}
              type="button"
              disabled={readOnly || count(team) >= MAX_AGENTS_PER_TEAM}
              aria-pressed={armed}
              data-testid={`agent-${agent.displayName}`}
              title={agent.role ? `${agent.displayName}, ${agent.role}` : agent.displayName}
              onClick={() => armAgent(agent.uuid, team)}
              className={`group relative flex flex-col items-center border p-1 transition-colors disabled:opacity-40 ${armed ? 'border-signal bg-signal/15' : 'border-steel hover:border-iron'}`}
            >
              <span className="relative block h-12 w-12 overflow-hidden" style={{ backgroundColor: `${agent.color}33` }}>
                {agent.displayIcon ? (
                  <img src={agent.displayIcon} alt="" crossOrigin="anonymous" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center font-bold">{initials(agent.displayName)}</span>
                )}
                {onTeam > 0 && <span className="absolute right-0 top-0 h-2 w-2" style={{ backgroundColor: TEAM_COLOR[team] }} />}
              </span>
              <span className="mt-0.5 w-full truncate text-center text-xs">{agent.displayName}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
