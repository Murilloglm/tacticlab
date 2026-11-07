import { useEffect, useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { Button } from '../../ui/kit';
import { toast } from '../../ui/toastStore';
import { syncLineups, syncStrategies } from './cloudSync';
import { getSupabase, isSupabaseConfigured } from './supabase';

function NotConfigured() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6" data-testid="account-not-configured">
      <h1 className="display text-4xl">Conta</h1>
      <p className="mt-3 text-ash">
        Este site ainda não tem contas online configuradas, mas tudo funciona sem elas. Suas estratégias e lineups ficam salvas neste navegador. Para levá-las
        a outro dispositivo, exporte o JSON ou envie um link de compartilhamento.
      </p>
      <p className="mt-3 text-sm text-ash">
        Quem administra o site pode ativar contas, sincronização e salas online conectando um projeto gratuito do Supabase. O passo a passo está no README do
        projeto.
      </p>
    </div>
  );
}

export function AccountPage() {
  const supabase = getSupabase();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  if (!isSupabaseConfigured || !supabase) return <NotConfigured />;
  if (loading) return <p className="p-8 text-ash">Verificando a sessão…</p>;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}${location.pathname}#/conta` } });
        if (error) throw error;
        if (!data.session) toast.info('Confirme o e-mail que enviamos para concluir a conta.');
      }
      setPassword('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const strategies = await syncStrategies(user.id);
      const lineups = await syncLineups(user.id);
      const parts = [
        `${strategies.uploaded + lineups.uploaded} enviadas`,
        `${strategies.downloaded + lineups.downloaded} recebidas`,
        `${strategies.deleted + lineups.deleted} removidas`,
      ];
      toast.success(`Sincronização concluída: ${parts.join(', ')}.`);
      const invalid = strategies.invalid + lineups.invalid;
      if (invalid > 0) toast.error(`${invalid} registros da conta estão inválidos e foram ignorados.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'A sincronização falhou.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-8 sm:px-6">
      <h1 className="display text-4xl">Conta</h1>
      {user && !user.is_anonymous ? (
        <div className="mt-4 flex flex-col gap-3">
          <p>
            Conectado como <strong>{user.email}</strong>.
          </p>
          <p className="text-sm text-ash">
            A sincronização junta o que está neste navegador com o que está na conta, mantendo a versão mais recente de cada item. Imagens de lineups continuam só
            neste navegador.
          </p>
          <Button variant="primary" icon="cloud" disabled={busy} onClick={() => void sync()}>
            Sincronizar agora
          </Button>
          <Button variant="quiet" icon="logout" onClick={() => void supabase.auth.signOut()}>
            Sair da conta
          </Button>
        </div>
      ) : (
        <form className="mt-4 flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
          <p className="text-ash">A conta é opcional e serve para levar suas estratégias a outros dispositivos.</p>
          <label>
            <span className="field-label">E-mail</span>
            <input className="field" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            <span className="field-label">Senha</span>
            <input
              className="field"
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <Button variant="primary" type="submit" disabled={busy}>
            {mode === 'signin' ? 'Entrar' : 'Criar conta'}
          </Button>
          <Button variant="quiet" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
            {mode === 'signin' ? 'Ainda não tenho conta' : 'Já tenho conta'}
          </Button>
        </form>
      )}
    </div>
  );
}
