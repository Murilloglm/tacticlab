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
  /** Escada aparece em degraus; rampa, em faixas. A altura do piso é a mesma nos dois casos. */
  kind?: 'ramp' | 'stairs';
}

export interface TacticalZone {
  ring: number[];
  color: string;
  strength: number;
}

/** Entrada de bombsite: trecho no piso por onde se chega ao site, lido do minimapa. */
export interface TacticalEntrance {
  site: string;
  from: MapPoint;
  to: MapPoint;
}

export interface TacticalLayout {
  mapId: string;
  name: string;
  wallHeightM: number;
  solids: TacticalSolid[];
  ramps: TacticalRamp[];
  zones: TacticalZone[];
  entrances: TacticalEntrance[];
  /**
   * Áreas em que a parede gerada não existe no jogo, como a linha do caminho do teleportador que o
   * gerador leu como contorno no Bind.
   */
  wallExclusions?: number[][];
}
