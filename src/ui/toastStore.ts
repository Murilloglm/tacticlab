import { createStore, useStore } from 'zustand';

export interface Toast {
  id: number;
  kind: 'info' | 'error' | 'success';
  message: string;
}

const store = createStore<{ toasts: Toast[] }>(() => ({ toasts: [] }));
let counter = 0;

function push(kind: Toast['kind'], message: string): void {
  const id = ++counter;
  store.setState((state) => ({ toasts: [...state.toasts.slice(-3), { id, kind, message }] }));
  const lifetime = kind === 'error' ? 7000 : 3500;
  setTimeout(() => dismissToast(id), lifetime);
}

export const dismissToast = (id: number): void =>
  store.setState((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));

export const toast = {
  info: (message: string) => push('info', message),
  error: (message: string) => push('error', message),
  success: (message: string) => push('success', message),
};

export const useToasts = (): Toast[] => useStore(store, (state) => state.toasts);
