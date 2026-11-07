// Layout tático: camada revisada à mão sobre a geometria gerada de um mapa. Reúne o que influencia
// posicionamento e linha de visão, como coberturas, portas e rampas. Coordenadas em frações do minimapa.
import type { MapPoint } from '../../coordinates';

export type SolidKind = 'crate' | 'cover' | 'barrier' | 'pillar' | 'structure' | 'door';

export interface TacticalSolid {
  kind: SolidKind;
  /** Contorno plano: x, y, x, y... */
  ring: number[];
  /** Altura estimada acima do piso, em metros. */
  heightM: number;
}

/** Rampa lida do minimapa. As alturas vêm do próprio campo de alturas nos pontos `from` e `to`. */
export interface TacticalRamp {
  ring: number[];
  from: MapPoint;
  to: MapPoint;
}

export interface TacticalZone {
  ring: number[];
  color: string;
  strength: number;
}

export interface TacticalLayout {
  mapId: string;
  name: string;
  wallHeightM: number;
  solids: TacticalSolid[];
  ramps: TacticalRamp[];
  zones: TacticalZone[];
}
