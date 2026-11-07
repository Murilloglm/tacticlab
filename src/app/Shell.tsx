import type { ReactNode } from 'react';
import { useCatalog } from '../modules/catalog/catalogStore';
import { Icon } from '../ui/Icon';
import { navigate, useRoute } from './router';

const LINKS = [
  { name: 'home', path: '/', label: 'Mapas', icon: 'map' },
  { name: 'strategies', path: '/estrategias', label: 'Estratégias', icon: 'layers' },
  { name: 'library', path: '/lineups', label: 'Lineups', icon: 'target' },
  { name: 'account', path: '/conta', label: 'Conta', icon: 'user' },
] as const;

export function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-2" aria-label="TacticLab, voltar ao início">
      <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
        <path fill="#2b2f36" d="M0 0h24l8 8v24H8l-8-8z" />
        <path fill="#ef3b48" d="M7 8h18v5h-6.500v12h-5V13H7z" />
      </svg>
      <span className="display hidden text-xl sm:inline">TacticLab</span>
    </button>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const route = useRoute();
  const catalog = useCatalog((s) => s.catalog);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-steel bg-carbon px-4 py-2 sm:gap-6">
        <Logo onClick={() => navigate('/')} />
        <nav aria-label="Principal" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {LINKS.map((link) => (
            <a
              key={link.name}
              href={`#${link.path}`}
              aria-current={route.name === link.name ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-1.5 px-3 py-1.5 transition-colors ${
                route.name === link.name ? 'bg-steel text-bone cut' : 'text-ash hover:text-bone'
              }`}
            >
              <Icon name={link.icon} size={16} />
              {link.label}
            </a>
          ))}
        </nav>
        {catalog?.source === 'snapshot' && (
          <span className="hidden text-sm text-ash md:inline" title="A Valorant-API não respondeu. Os dados vêm da cópia publicada com o site.">
            Dados offline
          </span>
        )}
      </header>
      <main className="scroll-thin min-h-0 flex-1 overflow-y-auto">{children}</main>
      <footer className="border-t border-steel px-4 py-2 text-xs text-ash">
        Projeto de fãs, sem vínculo com a Riot Games. VALORANT e seus recursos pertencem à Riot Games. Dados de{' '}
        <a className="underline hover:text-bone" href="https://valorant-api.com" target="_blank" rel="noreferrer">
          Valorant-API
        </a>
        .
      </footer>
    </div>
  );
}
