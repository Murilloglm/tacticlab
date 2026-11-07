import { useEffect, useState } from 'react';

type Entry = { image: HTMLImageElement; status: 'loading' | 'ready' | 'error'; listeners: Set<() => void> };

const cache = new Map<string, Entry>();

function getEntry(url: string): Entry {
  let entry = cache.get(url);
  if (entry) return entry;
  const image = new Image();
  // CORS é necessário para exportar PNG sem contaminar o canvas.
  image.crossOrigin = 'anonymous';
  const created: Entry = { image, status: 'loading', listeners: new Set() };
  image.onload = () => {
    created.status = 'ready';
    created.listeners.forEach((listener) => listener());
  };
  image.onerror = () => {
    created.status = 'error';
    created.listeners.forEach((listener) => listener());
  };
  image.src = url;
  cache.set(url, created);
  entry = created;
  return entry;
}

export function useImage(url: string | null | undefined): { image: HTMLImageElement | null; status: Entry['status'] | 'none' } {
  const [, force] = useState(0);
  useEffect(() => {
    if (!url) return;
    const entry = getEntry(url);
    if (entry.status !== 'loading') {
      force((n) => n + 1);
      return;
    }
    const listener = () => force((n) => n + 1);
    entry.listeners.add(listener);
    return () => {
      entry.listeners.delete(listener);
    };
  }, [url]);

  if (!url) return { image: null, status: 'none' };
  const entry = getEntry(url);
  return { image: entry.status === 'ready' ? entry.image : null, status: entry.status };
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  const entry = getEntry(url);
  if (entry.status === 'ready') return Promise.resolve(entry.image);
  if (entry.status === 'error') return Promise.reject(new Error(`Imagem indisponível: ${url}`));
  return new Promise((resolve, reject) => {
    const listener = () => {
      entry.listeners.delete(listener);
      if (entry.status === 'ready') resolve(entry.image);
      else reject(new Error(`Imagem indisponível: ${url}`));
    };
    entry.listeners.add(listener);
  });
}
