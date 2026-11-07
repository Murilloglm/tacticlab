// Roteamento por hash: funciona em hospedagem estática como o GitHub Pages,
// onde o servidor não sabe redirecionar caminhos internos para o index.html.
import { useSyncExternalStore } from 'react';

export type AppRoute =
  | { name: 'home' }
  | { name: 'strategies' }
  | { name: 'library' }
  | { name: 'account' }
  | { name: 'editor'; id: string }
  | { name: 'room'; code: string }
  | { name: 'share'; data: string }
  | { name: 'notFound' };

export function parseHash(hash: string): AppRoute {
  const path = hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  const [head, ...rest] = path.split('/').filter(Boolean);
  const tail = rest.join('/');
  switch (head) {
    case undefined:
      return { name: 'home' };
    case 'estrategias':
      return { name: 'strategies' };
    case 'lineups':
      return { name: 'library' };
    case 'conta':
      return { name: 'account' };
    case 'editor':
      return tail ? { name: 'editor', id: decodeURIComponent(tail) } : { name: 'notFound' };
    case 'sala':
      return tail ? { name: 'room', code: decodeURIComponent(tail) } : { name: 'notFound' };
    case 's':
      return tail ? { name: 'share', data: tail } : { name: 'notFound' };
    default:
      return { name: 'notFound' };
  }
}

export function navigate(path: string): void {
  location.hash = path.startsWith('/') ? path : `/${path}`;
}

const subscribe = (callback: () => void) => {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
};

export function useRoute(): AppRoute {
  const hash = useSyncExternalStore(subscribe, () => location.hash, () => '');
  // parseHash é barato; o resultado é um objeto novo, mas só é lido por valor.
  return parseHash(hash);
}
