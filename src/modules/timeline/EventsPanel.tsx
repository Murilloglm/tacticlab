import { useMemo } from 'react';
import { useCatalog } from '../catalog/catalogStore';
import { setEditor, useEditor } from '../editor/editorStore';
import { docActions, useDoc } from '../strategy/docStore';
import { newId } from '../strategy/factory';
import { Button, IconButton } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { buildEvents } from './events';
import { effectiveDuration, playbackActions, usePlayback } from './playbackStore';
import { formatTime } from './simulate';

const KIND_ICON = { 'route-start': 'route', arrival: 'pin', utility: 'bolt', note: 'note' } as const;

export function EventsPanel() {
  const doc = useDoc((s) => s.doc);
  const readOnly = useDoc((s) => s.readOnly);
  const catalog = useCatalog((s) => s.catalog);
  const frame = useEditor((s) => s.frame);
  const timeMs = usePlayback((s) => s.timeMs);

  const events = useMemo(() => (doc ? buildEvents(doc, catalog, frame) : []), [doc, catalog, frame]);
  if (!doc) return null;
  const duration = effectiveDuration(doc, frame);

  const addNote = () => {
    const id = newId();
    docActions.change([{ c: 'notes', id, after: { id, timeMs, text: 'Nova nota' } }]);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="display text-xl">Execução</h3>
        <Button variant="ghost" icon="note" disabled={readOnly} data-testid="add-note" onClick={addNote}>
          Nota em {formatTime(timeMs)}
        </Button>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-ash">Crie rotas, posicione habilidades ou adicione notas. Tudo aparece aqui em ordem de tempo.</p>
      ) : (
        <ol className="flex flex-col" data-testid="events-list">
          {events.map((event) => {
            const note = event.ref.c === 'notes' ? doc.notes[event.ref.id] : null;
            return (
              <li key={event.key} className="flex items-start gap-2 border-b border-steel/60 py-1.5">
                <button
                  type="button"
                  className="tnum shrink-0 pt-0.5 text-sm text-ash underline-offset-2 hover:text-bone hover:underline"
                  title="Ir para este instante"
                  onClick={() => playbackActions.seek(event.timeMs, duration)}
                >
                  {formatTime(event.timeMs)}
                </button>
                <Icon name={KIND_ICON[event.kind]} size={15} className="mt-1 shrink-0 text-ash" />
                {note ? (
                  <>
                    <input
                      aria-label="Texto da nota"
                      className="min-w-0 flex-1 border-b border-transparent bg-transparent text-sm focus:border-bone focus:outline-none"
                      maxLength={280}
                      disabled={readOnly}
                      value={note.text}
                      onChange={(e) => docActions.change([{ c: 'notes', id: note.id, after: { ...note, text: e.target.value } }], { coalesce: `note:${note.id}` })}
                      onBlur={() => docActions.endGesture()}
                    />
                    <IconButton icon="close" label="Excluir nota" size={14} className="h-6 w-6" disabled={readOnly} onClick={() => docActions.change([{ c: 'notes', id: note.id, after: null }])} />
                  </>
                ) : (
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left text-sm hover:text-signal"
                    onClick={() => {
                      playbackActions.seek(event.timeMs, duration);
                      setEditor({ selection: [{ c: event.ref.c, id: event.ref.id }] });
                    }}
                  >
                    {event.label}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
