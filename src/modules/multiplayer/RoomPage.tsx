import { useEffect, useRef, useState } from 'react';
import { EditorWorkspace, useEditorSession } from '../editor/EditorPage';
import { editorStore, initialEditorState } from '../editor/editorStore';
import { docActions, useDoc } from '../strategy/docStore';
import { playbackActions } from '../timeline/playbackStore';
import { navigate } from '../../app/router';
import { Button, Spinner } from '../../ui/kit';
import { enterRoom, getDisplayName, isLocalCode, leaveRoom, setDisplayName, getSession } from './roomService';
import { isSupabaseConfigured } from '../services/supabase';
import { useRoom } from './roomStore';

type Stage = 'name' | 'joining' | 'ready' | 'error';

export function RoomPage({ code }: { code: string }) {
  const [stage, setStage] = useState<Stage>('joining');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const doc = useDoc((s) => s.doc);
  const active = useRoom((s) => s.active);
  const started = useRef(false);

  const join = async (displayName: string) => {
    setStage('joining');
    editorStore.setState(initialEditorState());
    playbackActions.reset();
    try {
      await enterRoom(code, displayName);
      setStage('ready');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível entrar na sala.');
      setStage('error');
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void getDisplayName().then((saved) => {
      // Quem criou a sala já informou o nome. Quem chega por convite escolhe aqui.
      if (saved || getSession()) {
        setName(saved);
        void join(saved);
      } else {
        setStage('name');
      }
    });
    return () => {
      // Em StrictMode o efeito roda duas vezes no dev; a saída real acontece no desmonte abaixo.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      leaveRoom();
      docActions.clear();
    },
    [],
  );

  useEditorSession(stage === 'ready' ? doc : null);

  if (stage === 'name') {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <form
          className="flex w-full max-w-sm flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void setDisplayName(name).catch(() => undefined);
            void join(name);
          }}
        >
          <h1 className="display text-3xl">Entrar na sala</h1>
          <label>
            <span className="field-label">Seu nome</span>
            <input className="field" maxLength={40} autoFocus value={name} data-testid="join-name" onChange={(event) => setName(event.target.value)} />
          </label>
          <Button variant="primary" type="submit" data-testid="join-submit">
            Entrar
          </Button>
        </form>
      </div>
    );
  }

  if (stage === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center" data-testid="room-error">
        <h1 className="display text-3xl">Não foi possível entrar na sala</h1>
        <p className="max-w-md text-ash">{error}</p>
        {!isLocalCode(code) && !isSupabaseConfigured && <p className="max-w-md text-sm text-ash">Este site não tem salas online configuradas.</p>}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => void join(name)}>
            Tentar novamente
          </Button>
          <Button variant="primary" onClick={() => navigate('/')}>
            Ver os mapas
          </Button>
        </div>
      </div>
    );
  }

  if (stage === 'joining' || !doc || !active) return <Spinner label="Entrando na sala…" />;

  return <EditorWorkspace />;
}
