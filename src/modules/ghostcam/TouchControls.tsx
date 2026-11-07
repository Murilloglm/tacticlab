// Controles de toque da câmera fantasma: joystick para andar, área livre para olhar, botões de altura.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from '../../ui/Icon';
import { touchControls } from './cameraStore';

const RADIUS = 52;

function Joystick() {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const origin = useRef<{ id: number; x: number; y: number } | null>(null);

  const apply = (dx: number, dy: number) => {
    const length = Math.hypot(dx, dy);
    const limit = Math.min(1, RADIUS / (length || 1));
    const x = dx * limit;
    const y = dy * limit;
    setKnob({ x, y });
    touchControls.input.strafe = x / RADIUS;
    touchControls.input.forward = -y / RADIUS;
  };

  const release = () => {
    origin.current = null;
    setKnob({ x: 0, y: 0 });
    touchControls.input.strafe = 0;
    touchControls.input.forward = 0;
  };

  return (
    <div
      data-testid="ghost-joystick"
      role="application"
      aria-label="Joystick de movimento"
      className="touch-none-all relative rounded-full border-2 border-bone/40 bg-black/40"
      style={{ width: RADIUS * 2 + 28, height: RADIUS * 2 + 28 }}
      onPointerDown={(event: ReactPointerEvent) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        const rect = event.currentTarget.getBoundingClientRect();
        const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        origin.current = { id: event.pointerId, ...center };
        apply(event.clientX - center.x, event.clientY - center.y);
      }}
      onPointerMove={(event: ReactPointerEvent) => {
        if (origin.current?.id === event.pointerId) apply(event.clientX - origin.current.x, event.clientY - origin.current.y);
      }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div
        className="absolute left-1/2 top-1/2 h-12 w-12 rounded-full bg-bone/80"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}

function HoldButton({ icon, label, onChange, testId }: { icon: string; label: string; onChange: (held: boolean) => void; testId: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      className="touch-none-all flex h-14 w-14 items-center justify-center rounded-full border-2 border-bone/40 bg-black/50 text-bone active:bg-signal"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onChange(true);
      }}
      onPointerUp={() => onChange(false)}
      onPointerCancel={() => onChange(false)}
    >
      <Icon name={icon} size={24} />
    </button>
  );
}

export function TouchControls() {
  const look = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(
    () => () => {
      touchControls.input.forward = 0;
      touchControls.input.strafe = 0;
      touchControls.input.vertical = 0;
      touchControls.input.boost = false;
    },
    [],
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-10" data-testid="ghost-touch">
      {/* Área de olhar: metade direita da tela, abaixo dos botões. */}
      <div
        data-testid="ghost-look-pad"
        className="touch-none-all pointer-events-auto absolute inset-y-14 right-0 w-1/2"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          look.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        }}
        onPointerMove={(event) => {
          if (look.current?.id !== event.pointerId) return;
          touchControls.lookX += (event.clientX - look.current.x) * 2;
          touchControls.lookY += (event.clientY - look.current.y) * 2;
          look.current = { ...look.current, x: event.clientX, y: event.clientY };
        }}
        onPointerUp={() => (look.current = null)}
        onPointerCancel={() => (look.current = null)}
      />
      <div className="pointer-events-auto absolute bottom-4 left-4">
        <Joystick />
      </div>
      <div className="pointer-events-auto absolute bottom-4 right-4 flex flex-col items-center gap-2">
        <HoldButton icon="arrowUp" label="Subir" testId="ghost-up" onChange={(held) => (touchControls.input.vertical = held ? 1 : 0)} />
        <HoldButton icon="bolt" label="Acelerar" testId="ghost-boost" onChange={(held) => (touchControls.input.boost = held)} />
        <HoldButton icon="arrowDown" label="Descer" testId="ghost-down" onChange={(held) => (touchControls.input.vertical = held ? -1 : 0)} />
      </div>
    </div>
  );
}
