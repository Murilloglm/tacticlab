// Controles e leitura da câmera no modo 3D.
import { useState } from 'react';
import { findAgent, useCatalog } from '../catalog/catalogStore';
import { setEditor, useEditor } from '../editor/editorStore';
import { cameraActions, useCamera } from '../ghostcam/cameraStore';
import { GHOST_LIMITS } from '../ghostcam/ghostCamera';
import { useDoc } from '../strategy/docStore';
import { Button, IconButton } from '../../ui/kit';

function Accuracy() {
  const map = useEditor((s) => s.map);
  const [open, setOpen] = useState(false);
  if (!map) return null;
  const g = map.geometry;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="approximate-badge"
        className="bg-bone px-2 py-0.5 text-sm font-semibold text-ink"
      >
        Geometria aproximada
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-20 w-72 border border-steel bg-carbon p-3 text-sm sm:w-80" data-testid="approximate-details">
          <p>
            Reconstrução esquemática feita a partir do minimapa e dos callouts da Valorant-API. Não é o modelo do jogo: medidas, alturas e
            coberturas são estimativas e não servem para validar lineups.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-ash">
            <li>{g.frame.scaleKnown ? `Escala publicada pela API: ${g.frame.worldMeters} m de largura de imagem.` : 'A API não publica escala para este mapa: as medidas em metros são estimadas.'}</li>
            <li>
              {g.heightAnchors > 0
                ? `Alturas estimadas pelo tom do minimapa e por ${g.heightAnchors} pontos de callout.`
                : 'Alturas estimadas só pelo tom do minimapa.'}
            </li>
            {map.layout ? (
              <li data-testid="tactical-layout-note">Cenário tático revisado: coberturas, portas e rampas posicionadas a partir do minimapa, com alturas estimadas.</li>
            ) : (
              <li>Paredes, caixas e muretas têm altura padrão, não medida.</li>
            )}
            {!g.calloutsReliable && g.frame.scaleKnown && <li>Os nomes de locais deste mapa não coincidem bem com a imagem e podem estar deslocados.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

export function CameraHud() {
  const mode = useEditor((s) => s.cameraMode);
  const showCallouts = useEditor((s) => s.showCallouts);
  const xray = useEditor((s) => s.xrayWalls);
  const minimap = useEditor((s) => s.minimapOnFloor);
  const speed = useCamera((s) => s.speed);
  const locked = useCamera((s) => s.pointerLocked);
  const hud = useCamera((s) => s.hud);
  const agents = useDoc((s) => s.doc?.agents);
  const catalog = useCatalog((s) => s.catalog);

  return (
    <>
      <div className="pointer-events-none absolute left-2 right-2 top-2 z-20 flex flex-wrap items-start gap-2">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <Accuracy />
          <div className="flex bg-carbon/90" role="group" aria-label="Tipo de câmera">
            <button
              type="button"
              data-testid="camera-aerial"
              aria-pressed={mode === 'aerial'}
              onClick={() => setEditor({ cameraMode: 'aerial' })}
              className={`px-3 py-1 text-sm ${mode === 'aerial' ? 'bg-bone text-ink' : 'text-ash hover:text-bone'}`}
            >
              Aérea
            </button>
            <button
              type="button"
              data-testid="camera-ghost"
              aria-pressed={mode === 'ghost'}
              onClick={() => setEditor({ cameraMode: 'ghost' })}
              className={`px-3 py-1 text-sm ${mode === 'ghost' ? 'bg-bone text-ink' : 'text-ash hover:text-bone'}`}
            >
              Fantasma
            </button>
          </div>
          <Button variant="ghost" className="py-1 text-sm" data-testid="camera-reset" onClick={() => cameraActions.reset()}>
            Visão padrão
          </Button>
          {agents && Object.keys(agents).length > 0 && (
            <label className="flex items-center gap-1 bg-carbon/90 px-2 py-0.5 text-sm text-ash">
              <span>Focar em</span>
              <select
                className="bg-carbon text-bone"
                data-testid="camera-focus"
                value=""
                onChange={(event) => {
                  if (event.target.value) cameraActions.focus(event.target.value);
                  event.target.blur();
                }}
              >
                <option value="">agente…</option>
                {Object.values(agents).map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {findAgent(catalog, agent.agentUuid)?.displayName ?? 'Agente'} ({agent.team === 'attack' ? 'ataque' : 'defesa'})
                  </option>
                ))}
              </select>
            </label>
          )}
          <IconButton icon="pin" label={showCallouts ? 'Ocultar nomes de locais' : 'Mostrar nomes de locais'} active={showCallouts} quietActive onClick={() => setEditor({ showCallouts: !showCallouts })} className="bg-carbon/90" />
          <IconButton icon="eye" label={xray ? 'Paredes sólidas' : 'Paredes translúcidas'} active={xray} quietActive onClick={() => setEditor({ xrayWalls: !xray })} data-testid="toggle-xray" className="bg-carbon/90" />
          <IconButton icon="image" label={minimap ? 'Piso por altura' : 'Minimapa no piso'} active={minimap} quietActive onClick={() => setEditor({ minimapOnFloor: !minimap })} className="bg-carbon/90" />
        </div>
      </div>

      {mode === 'ghost' && (
        <>
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-bone/80" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path d="M9 2v5M9 11v5M2 9h5M11 9h5" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
          <div className="absolute left-1/2 top-24 z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-col items-center gap-1 md:bottom-2 md:top-auto">
            <label className="flex items-center gap-2 bg-carbon/90 px-3 py-1 text-sm">
              <span className="text-ash">Velocidade</span>
              <input
                type="range"
                data-testid="ghost-speed"
                min={GHOST_LIMITS.minSpeed}
                max={GHOST_LIMITS.maxSpeed}
                step={1}
                value={speed}
                onChange={(event) => cameraActions.setSpeed(Number(event.target.value))}
                className="w-28 accent-signal"
              />
              <span className="tnum w-14 text-right">{Math.round(speed)} m/s</span>
            </label>
            <span className="hidden whitespace-nowrap bg-carbon/90 px-3 py-1 text-xs text-ash md:block" data-testid="ghost-status" data-locked={locked}>
              {locked ? 'WASD anda, Espaço sobe, Ctrl ou C desce, Shift acelera, Esc solta o mouse, V troca de câmera' : 'Clique na cena para capturar o mouse'}
            </span>
          </div>
        </>
      )}

      <div
        className="tnum pointer-events-none absolute bottom-2 right-2 z-10 hidden bg-carbon/80 px-2 py-0.5 text-xs text-ash sm:block"
        data-testid="camera-position"
        data-x={hud.x.toFixed(2)}
        data-y={hud.y.toFixed(2)}
        data-z={hud.z.toFixed(2)}
        data-yaw={hud.yaw.toFixed(3)}
      >
        X {hud.x.toFixed(1)} Y {hud.y.toFixed(1)} Z {hud.z.toFixed(1)}
      </div>
    </>
  );
}
