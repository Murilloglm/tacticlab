import { Component, useEffect, useRef, type ButtonHTMLAttributes, type ErrorInfo, type ReactNode } from 'react';
import { Icon } from './Icon';
import { dismissToast, useToasts } from './toastStore';

type Variant = 'primary' | 'ghost' | 'quiet' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: string;
}

const VARIANT: Record<Variant, string> = {
  primary: 'bg-signal text-white hover:bg-[#ff5560] active:bg-signal-deep cut',
  ghost: 'bg-steel text-bone hover:bg-iron cut',
  quiet: 'text-ash hover:text-bone hover:bg-steel/60 rounded-sm',
  danger: 'bg-transparent text-signal hover:bg-signal/15 rounded-sm',
};

export function Button({ variant = 'ghost', icon, className = '', children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 font-medium transition-colors disabled:opacity-40 ${VARIANT[variant]} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  label: string;
  active?: boolean;
  /** Alternâncias de painel ficam discretas; o vermelho é reservado à ferramenta ou ação principal. */
  quietActive?: boolean;
  size?: number;
}

export function IconButton({ icon, label, active = false, quietActive = false, size = 18, className = '', type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      aria-pressed={active || undefined}
      title={label}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center transition-colors disabled:opacity-30 ${
        active ? (quietActive ? 'bg-steel text-bone rounded-sm' : 'bg-signal text-white cut') : 'text-ash hover:bg-steel hover:text-bone rounded-sm'
      } ${className}`}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

export function Modal({ title, onClose, children, wide = false }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>('input, select, textarea, button');
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-6"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`rise scroll-thin flex max-h-[92dvh] w-full flex-col overflow-y-auto border border-steel bg-carbon ${wide ? 'sm:max-w-3xl' : 'sm:max-w-md'}`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-steel bg-carbon px-4 py-3">
          <h2 className="display text-xl">{title}</h2>
          <IconButton icon="close" label="Fechar" onClick={onClose} />
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function ToastHost() {
  const toasts = useToasts();
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-14 z-[60] flex flex-col items-center gap-2 px-4"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismissToast(toast.id)}
          data-testid={`toast-${toast.kind}`}
          className={`rise pointer-events-auto cut max-w-lg px-4 py-2 text-left text-sm shadow-lg ${
            toast.kind === 'error' ? 'bg-signal text-white' : toast.kind === 'success' ? 'bg-bone text-ink' : 'bg-steel text-bone'
          }`}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}

interface BoundaryProps {
  children: ReactNode;
  /** Trocar esta chave limpa o erro (ao mudar de página ou de modo). */
  resetKey?: string;
  fallback?: (error: Error, retry: () => void) => ReactNode;
}

export class ErrorBoundary extends Component<BoundaryProps, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erro na interface:', error, info.componentStack);
  }

  override componentDidUpdate(previous: BoundaryProps) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const retry = () => this.setState({ error: null });
    if (this.props.fallback) return this.props.fallback(error, retry);
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <h2 className="display text-2xl">Esta tela encontrou um erro</h2>
        <p className="max-w-md text-ash">{error.message}</p>
        <p className="max-w-md text-sm text-ash">Suas estratégias continuam salvas no navegador.</p>
        <Button variant="primary" onClick={retry}>
          Tentar novamente
        </Button>
      </div>
    );
  }
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center gap-3 p-8 text-ash" role="status">
      <span className="h-3 w-3 animate-spin border-2 border-signal border-t-transparent" />
      {label}
    </div>
  );
}

export function TeamBadge({ team }: { team: 'attack' | 'defense' }) {
  return (
    <span
      className={`inline-block px-2 text-sm font-medium ${
        team === 'attack' ? 'bg-attack/15 text-attack' : 'bg-defense/15 text-defense'
      }`}
    >
      {team === 'attack' ? 'Ataque' : 'Defesa'}
    </span>
  );
}
