// Conjunto próprio de ícones em SVG, para não trazer uma biblioteca inteira.
const PATHS: Record<string, string> = {
  cursor: 'M5 3l14 8-6 2-2 6z',
  hand: 'M8 11V5.5a1.5 1.5 0 013 0V10m0-5a1.5 1.5 0 013 0v5m0-3.5a1.5 1.5 0 013 0V14a6 6 0 01-6 6h-1a6 6 0 01-5-2.7L3.5 14a1.5 1.5 0 012.5-1.6L8 15',
  route: 'M6 19a2 2 0 100-4 2 2 0 000 4zm12-10a2 2 0 100-4 2 2 0 000 4zM8 17h7a3 3 0 000-6H9a3 3 0 010-6h7',
  line: 'M5 19L19 5',
  arrow: 'M5 19L19 5m-9 0h9v9',
  pen: 'M4 20c3-1 4-3 6-6s4-8 7-8c2 0 3 2 2 4-1.500 3-6 4-8 8',
  pin: 'M12 21s7-6.100 7-11.500A7 7 0 005 9.500C5 14.900 12 21 12 21zm0-9a2.500 2.500 0 100-5 2.500 2.500 0 000 5z',
  text: 'M5 6V4h14v2M12 4v16m-3 0h6',
  circle: 'M12 21a9 9 0 100-18 9 9 0 000 18z',
  undo: 'M9 7L4 12l5 5M4 12h11a5 5 0 010 10h-3',
  redo: 'M15 7l5 5-5 5m5-5H9a5 5 0 000 10h3',
  trash: 'M4 7h16M9 7V4h6v3m-8 0l1 13h8l1-13',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  save: 'M5 3h11l4 4v14H4V3zm3 0v6h7V3M7 21v-8h10v8',
  share: 'M16 8a3 3 0 100-6 3 3 0 000 6zM6 15a3 3 0 100-6 3 3 0 000 6zm10 7a3 3 0 100-6 3 3 0 000 6zM8.600 13.500l4.800 3m0-9l-4.800 3',
  download: 'M12 3v12m-5-5l5 5 5-5M4 21h16',
  upload: 'M12 16V4m-5 5l5-5 5 5M4 21h16',
  history: 'M3 12a9 9 0 109-9 9 9 0 00-7 3.300M3 4v4h4m5-1v5l3 2',
  users: 'M9 11a4 4 0 100-8 4 4 0 000 8zm-6 10a6 6 0 0112 0m2-10a3 3 0 100-6m1 16h3a5 5 0 00-4-5',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h4v16H7zm6 0h4v16h-4z',
  restart: 'M5 4v16M19 5L8 12l11 7z',
  stepBack: 'M6 5v14m13-13l-9 6 9 6z',
  stepForward: 'M18 5v14M5 6l9 6-9 6z',
  key: 'M12 3l5 9-5 9-5-9z',
  note: 'M5 4h14v12l-4 4H5zm10 16v-4h4',
  panel: 'M3 4h18v16H3zm12 0v16',
  timeline: 'M3 6h18M3 12h12M3 18h7',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
  chevronDown: 'M5 9l7 7 7-7',
  chevronUp: 'M5 15l7-7 7 7',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  folder: 'M3 6h7l2 2h9v11H3z',
  pencil: 'M4 20l1-5L16 4l4 4L9 19zm9-13l4 4',
  map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zm6-3v15m6-12v15',
  target: 'M12 21a9 9 0 100-18 9 9 0 000 18zm0-5a4 4 0 100-8 4 4 0 000 8zm0-13v4m0 10v4M3 12h4m10 0h4',
  camera: 'M3 8h4l2-3h6l2 3h4v11H3zm9 8a3.500 3.500 0 100-7 3.500 3.500 0 000 7z',
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zm10 3a3 3 0 100-6 3 3 0 000 6z',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  link: 'M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1m2 5a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1',
  image: 'M3 5h18v14H3zm0 11l5-5 4 4 3-3 6 6M15 10a1.500 1.500 0 100-3 1.500 1.500 0 000 3z',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zm0-10v5m0-8.500V8',
  user: 'M12 11a4 4 0 100-8 4 4 0 000 8zm-7 10a7 7 0 0114 0',
  cloud: 'M7 18a4.500 4.500 0 01-.5-9A6 6 0 0118 10a4 4 0 010 8z',
  crosshair: 'M12 3v6m0 6v6M3 12h6m6 0h6',
  arrowUp: 'M12 20V5m-6 6l6-6 6 6',
  arrowDown: 'M12 4v15m-6-6l6 6 6-6',
  bolt: 'M13 2L5 14h6l-1 8 8-12h-6z',
  logout: 'M15 4h5v16h-5m-1-8H4m4-4l-4 4 4 4',
};

interface IconProps {
  name: string;
  size?: number;
  className?: string;
  filled?: boolean;
}

export function Icon({ name, size = 18, className, filled = false }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}
